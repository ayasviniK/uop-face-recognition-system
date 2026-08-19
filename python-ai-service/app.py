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
import os
import tempfile

from utils.embedder import get_embedding_from_image
from utils.video_processor import process_video, format_timestamp
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
    Register a student with augmented embeddings.
    Generates 6 embedding variants from the single passport photo.
    """
    required_fields = ["student_id", "full_name", "department", "year", "email"]
    for field in required_fields:
        if field not in request.form:
            return jsonify({"error": f"Missing required field: {field}"}), 400

    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    student_id = request.form["student_id"].strip()
    full_name  = request.form["full_name"].strip()
    department = request.form["department"].strip()
    year       = int(request.form["year"])
    email      = request.form["email"].strip()

    img, err = decode_image(request.files["image"])
    if err:
        log_registration(student_id, success=False, reason="Image decode failed")
        return err

    # Preprocess
    processed, reason = preprocess(img)
    if processed is None:
        log_registration(student_id, success=False, reason=f"Quality check: {reason}")
        return jsonify({"error": f"Photo quality issue: {reason}"}), 422

    # Quick check: make sure there's exactly one face before augmenting
    faces = get_embedding_from_image(processed)
    if not faces:
        log_registration(student_id, success=False, reason="No face detected")
        return jsonify({
            "error": "No face detected. Please upload a clear, front-facing photo."
        }), 422

    if len(faces) > 1:
        log_registration(student_id, success=False, reason=f"{len(faces)} faces detected")
        return jsonify({
            "error": f"{len(faces)} faces detected. Please upload a photo with exactly one person."
        }), 422

    # Generate augmented embeddings from the single photo
    embeddings = generate_augmented_embeddings(processed, get_embedding_from_image)

    if not embeddings:
        log_registration(student_id, success=False, reason="Augmentation failed")
        return jsonify({"error": "Could not generate embeddings. Please try a different photo."}), 422

    # Save to DB
    register_student(
        student_id=student_id,
        full_name=full_name,
        department=department,
        year=year,
        email=email,
        embeddings=embeddings,
    )

    log_registration(student_id, success=True)

    return jsonify({
        "message": f"Student {full_name} registered successfully.",
        "student_id": student_id,
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
            "message": "No students registered yet.",
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
    student = get_student(student_id)
    if not student:
        return jsonify({"error": f"Student {student_id} not found"}), 404
    student_safe = {k: v for k, v in student.items() if k != "embeddings"}
    return jsonify(student_safe)


@app.route("/students/<student_id>", methods=["DELETE"])
def remove_student(student_id):
    if not delete_student(student_id):
        return jsonify({"error": f"Student {student_id} not found"}), 404
    return jsonify({"message": f"Student {student_id} removed successfully."})


# ---------------------------------------------------------------------------
# Identify from video
# ---------------------------------------------------------------------------

@app.route("/identify/video", methods=["POST"])
def identify_video():
    """
    Identify people in an uploaded video file.

    Form fields:
      - video        : video file (MP4, AVI, MOV, MKV)
      - requested_by : optional, for audit log

    Processing:
      - Samples 1 frame per second
      - Runs face detection + ArcFace on each sampled frame
      - Aggregates matches across frames (voting)
      - Returns a report of who appeared, when, with what confidence

    Note: Processing time ~ 1 second per second of video on CPU.
    A 2-minute video takes roughly 2 minutes to process.
    This is an "upload and wait" endpoint — not real-time.
    """
    if "video" not in request.files:
        return jsonify({"error": "No video uploaded"}), 400

    video_file   = request.files["video"]
    requested_by = request.form.get("requested_by", "unknown")
    filename     = video_file.filename or "unknown"

    # Validate file extension
    allowed_extensions = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
    ext = os.path.splitext(filename)[1].lower()
    if ext not in allowed_extensions:
        return jsonify({
            "error": f"Unsupported video format '{ext}'. Allowed: {', '.join(allowed_extensions)}"
        }), 400

    # Check if any students are registered
    candidates = get_all_embeddings()
    if not candidates:
        return jsonify({
            "error": "No students registered yet. Please register students before processing video."
        }), 400

    # Save video to a temp file — OpenCV needs a file path, not a stream
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp_path = tmp.name
        video_file.save(tmp_path)

    try:
        # Run the full video processing pipeline
        report = process_video(
            video_path=tmp_path,
            candidates=candidates,
            embedder_fn=get_embedding_from_image,
            matcher_fn=find_top_matches,
            preprocessor_fn=preprocess,
        )

        # Add formatted timestamps for readability
        for person in report["people_identified"]:
            person["first_seen"] = format_timestamp(person["first_seen_seconds"])
            person["last_seen"]  = format_timestamp(person["last_seen_seconds"])

        # Log the identification
        log_identification(
            image_filename=filename,
            faces_detected=report["total_faces_detected"],
            results=report["people_identified"],
            requested_by=requested_by,
        )

        return jsonify(report)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Video processing failed: {str(e)}"}), 500

    finally:
        # Always clean up the temp file
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


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
# Spring Boot adapter endpoint
# ---------------------------------------------------------------------------

@app.route("/api/recognize", methods=["POST"])
def api_recognize():
    """
    Adapter endpoint for Spring Boot integration.

    Spring Boot's AiClient sends:
      - multipart/form-data with field "file" (not "image")
      - expects back: { "matches": [{ "studentId": "...", "confidence": 0.87 }] }

    This endpoint translates between Spring Boot's format and our
    internal pipeline, without changing /identify at all.
    """
    # Spring Boot sends the image as "file" not "image"
    image_file = request.files.get("file") or request.files.get("image")
    if not image_file:
        return jsonify({"error": "No image provided", "matches": []}), 400

    image_bytes = np.frombuffer(image_file.read(), np.uint8)
    img = cv2.imdecode(image_bytes, cv2.IMREAD_COLOR)

    if img is None:
        return jsonify({"error": "Could not decode image", "matches": []}), 400

    # Preprocess
    processed, reason = preprocess(img, skip_quality_check=False)
    if processed is None:
        return jsonify({"error": reason, "matches": []}), 422

    # Detect + embed
    detected_faces = get_embedding_from_image(processed)
    if not detected_faces:
        return jsonify({"matches": []}), 200

    # Get candidates from mock DB (later: Spring Boot will pass these)
    candidates = get_all_embeddings()
    if not candidates:
        return jsonify({"matches": []}), 200

    # Match all faces, collect results
    all_matches = []
    for face in detected_faces:
        top = find_top_matches(face["embedding"], candidates, top_k=3)
        for match in top:
            all_matches.append({
                # Spring Boot expects camelCase keys
                "studentId":  match["student_id"],
                "confidence": match["similarity_score"],
                # Extra info for debugging — Spring Boot ignores these
                # thanks to @JsonIgnoreProperties(ignoreUnknown = true)
                "studentName":         match.get("student_name", ""),
                "department":          match.get("department", ""),
                "confidenceLabel":     match.get("confidence_label", ""),
                "matchedAugmentation": match.get("matched_augmentation", ""),
            })

    # Sort by confidence descending, deduplicate by studentId
    seen = set()
    deduped = []
    for m in sorted(all_matches, key=lambda x: x["confidence"], reverse=True):
        if m["studentId"] not in seen:
            seen.add(m["studentId"])
            deduped.append(m)

    log_identification(
        image_filename=image_file.filename or "api_recognize",
        faces_detected=len(detected_faces),
        results=[{"face_index": 0, "detection_confidence": 0, "top_matches": deduped}],
        requested_by="spring-boot",
    )

    return jsonify({"matches": deduped})


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