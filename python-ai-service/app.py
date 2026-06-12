"""
UoP Face Recognition - Flask AI Service
----------------------------------------
Endpoints:
  GET    /health              - Service health check
  POST   /upload              - Image validation + diagnostics
  POST   /register            - Register a student's face
  POST   /identify            - Identify face(s) in an image
  GET    /students            - List all registered students
  GET    /students/<id>       - Get a single student
  DELETE /students/<id>       - Remove a student
  GET    /logs                - View recent audit logs
  GET    /stats               - System statistics
"""

from flask import Flask, request, jsonify
import cv2
import numpy as np
import traceback

from utils.embedder import get_embedding_from_image
from utils.augmentor import generate_augmented_embeddings
from utils.matcher import find_top_matches
from utils.preprocessor import preprocess, get_image_info, check_image_quality
from utils.mock_db import (
    register_student,
    get_all_embeddings,
    get_student,
    get_all_students,
    delete_student,
    student_count,
)
from utils.audit_logger import log_identification, log_registration, get_recent_logs

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def decode_image(file_storage):
    image_bytes = np.frombuffer(file_storage.read(), np.uint8)
    img = cv2.imdecode(image_bytes, cv2.IMREAD_COLOR)
    if img is None:
        return None, (jsonify({"error": "Could not decode image. Please upload a valid image file."}), 400)
    return img, None


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "service": "UoP Face Recognition AI Service",
        "students_registered": student_count(),
    })


# ---------------------------------------------------------------------------
# Upload — image diagnostics
# ---------------------------------------------------------------------------

@app.route("/upload", methods=["POST"])
def upload_image():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    img, err = decode_image(request.files["image"])
    if err:
        return err

    info = get_image_info(img)
    quality_ok, quality_reason = check_image_quality(img)

    return jsonify({
        "message": "Image received successfully",
        "image_info": info,
        "quality_check": {
            "passed": quality_ok,
            "reason": quality_reason,
        }
    })


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

@app.route("/register", methods=["POST"])
def register():
    """
    Register a staff member with augmented embeddings.
    Generates 6 embedding variants from the single passport photo.
    """
    required_fields = ["staff_id", "full_name", "department"]
    for field in required_fields:
        if field not in request.form:
            return jsonify({"error": f"Missing required field: {field}"}), 400

    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    staff_id = request.form["staff_id"].strip()
    full_name  = request.form["full_name"].strip()
    department = request.form["department"].strip()
    image_name = request.files["image"].filename or None

    img, err = decode_image(request.files["image"])
    if err:
        log_registration(staff_id, success=False, reason="Image decode failed")
        return err

    # Preprocess
    processed, reason = preprocess(img)
    if processed is None:
        log_registration(staff_id, success=False, reason=f"Quality check: {reason}")
        return jsonify({"error": f"Photo quality issue: {reason}"}), 422

    # Quick check: make sure there's exactly one face before augmenting
    faces = get_embedding_from_image(processed)
    if not faces:
        log_registration(staff_id, success=False, reason="No face detected")
        return jsonify({
            "error": "No face detected. Please upload a clear, front-facing photo."
        }), 422

    if len(faces) > 1:
        log_registration(staff_id, success=False, reason=f"{len(faces)} faces detected")
        return jsonify({
            "error": f"{len(faces)} faces detected. Please upload a photo with exactly one person."
        }), 422

    # Generate augmented embeddings from the single photo
    embeddings = generate_augmented_embeddings(processed, get_embedding_from_image)

    if not embeddings:
        log_registration(staff_id, success=False, reason="Augmentation failed")
        return jsonify({"error": "Could not generate embeddings. Please try a different photo."}), 422

    # Save to DB
    register_student(
        staff_id=staff_id,
        full_name=full_name,
        department=department,
        image=image_name,
        embeddings=embeddings,
    )

    log_registration(staff_id, success=True)

    return jsonify({
        "message": f"Staff member {full_name} registered successfully.",
        "staff_id": staff_id,
        "embeddings_generated": len(embeddings),
        "augmentations": [e["augmentation"] for e in embeddings],
        "detection_confidence": faces[0]["confidence"],
    }), 201


# ---------------------------------------------------------------------------
# Identify
# ---------------------------------------------------------------------------

@app.route("/identify", methods=["POST"])
def identify():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    image_file   = request.files["image"]
    requested_by = request.form.get("requested_by", "unknown")
    filename     = image_file.filename or "unknown"

    img, err = decode_image(image_file)
    if err:
        return err

    processed, reason = preprocess(img, skip_quality_check=False)
    if processed is None:
        return jsonify({"error": f"Photo quality issue: {reason}"}), 422

    detected_faces = get_embedding_from_image(processed)

    if not detected_faces:
        log_identification(filename, 0, [], requested_by)
        return jsonify({
            "faces_detected": 0,
            "results": [],
            "message": "No faces found in the image.",
        })

    candidates = get_all_embeddings()

    if not candidates:
        return jsonify({
            "faces_detected": len(detected_faces),
            "results": [],
            "message": "No staff registered yet.",
        })

    results = []
    for i, face in enumerate(detected_faces):
        top_matches = find_top_matches(face["embedding"], candidates, top_k=5)
        results.append({
            "face_index": i,
            "bounding_box": face["box"],
            "detection_confidence": face["confidence"],
            "top_matches": top_matches,
        })

    log_identification(filename, len(detected_faces), results, requested_by)

    return jsonify({
        "faces_detected": len(detected_faces),
        "results": results,
    })


# ---------------------------------------------------------------------------
# Student management
# ---------------------------------------------------------------------------

@app.route("/students", methods=["GET"])
def list_students():
    students = get_all_students()
    return jsonify({"total": len(students), "students": students})


@app.route("/students/<student_id>", methods=["GET"])
def get_student_by_id(student_id):
    staff = get_student(student_id)
    if not staff:
        return jsonify({"error": f"Staff member {student_id} not found"}), 404
    staff_safe = {k: v for k, v in staff.items() if k != "embeddings"}
    return jsonify(staff_safe)


@app.route("/students/<student_id>", methods=["DELETE"])
def remove_student(student_id):
    if not delete_student(student_id):
        return jsonify({"error": f"Staff member {student_id} not found"}), 404
    return jsonify({"message": f"Staff member {student_id} removed successfully."})


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

@app.route("/logs", methods=["GET"])
def audit_logs():
    limit = int(request.args.get("limit", 50))
    logs  = get_recent_logs(limit=limit)
    return jsonify({"total_returned": len(logs), "logs": logs})


@app.route("/stats", methods=["GET"])
def stats():
    logs = get_recent_logs(limit=1000)
    return jsonify({
        "students_registered":   student_count(),
        "total_identifications": sum(1 for l in logs if l["event"] == "identification"),
        "total_registrations":   sum(1 for l in logs if l["event"] == "registration"),
    })


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "Method not allowed"}), 405

@app.errorhandler(500)
def internal_error(e):
    traceback.print_exc()
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    app.run(debug=True)