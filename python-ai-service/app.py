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
import base64
import io
from PIL import Image, ImageOps

from utils.embedder import get_embedding_from_image
from utils.video_processor import process_video, format_timestamp
from utils.augmentor import generate_augmented_embeddings
from utils.matcher import find_top_matches
from utils.preprocessor import preprocess, get_image_info, check_image_quality
from utils.mock_db import (
    register_student,
    register_students_batch,
    get_all_embeddings,
    get_student,
    get_all_students,
    delete_student,
    student_count,
    parse_year,
)
from utils.audit_logger import log_identification, log_registration, get_recent_logs

app = Flask(__name__)

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, X-Internal-API-Key"
    return response

@app.route("/", defaults={"path": ""}, methods=["OPTIONS"])
@app.route("/<path:path>", methods=["OPTIONS"])
def handle_options(path):
    return "", 200


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def decode_image_bytes(raw_bytes: bytes) -> np.ndarray | None:
    if not raw_bytes:
        return None
    try:
        pil_img = Image.open(io.BytesIO(raw_bytes))
        pil_img = ImageOps.exif_transpose(pil_img)
        rgb = np.array(pil_img.convert("RGB"))
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    except Exception:
        buf = np.frombuffer(raw_bytes, np.uint8)
        return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def decode_image(file_storage):
    raw_bytes = file_storage.read()
    img = decode_image_bytes(raw_bytes)
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
    required_fields = ["student_id", "full_name"]
    for field in required_fields:
        if field not in request.form:
            return jsonify({"error": f"Missing required field: {field}"}), 400

    img_file = request.files.get("image") or request.files.get("file")
    if not img_file:
        return jsonify({"error": "No image uploaded. Please upload a student reference photo."}), 400

    student_id = (request.form.get("student_id") or request.form.get("regno") or request.form.get("id") or "").strip()
    full_name  = (request.form.get("full_name") or request.form.get("name") or "").strip()
    department = request.form.get("department", "").strip()

    if not student_id or not full_name:
        return jsonify({"error": "Missing student_id or full_name"}), 400

    year_val = request.form.get("year")
    if year_val:
        try:
            year = int(year_val)
        except ValueError:
            year = parse_year(student_id) or 1
    else:
        year = parse_year(student_id) or 1

    email = request.form.get("email", "").strip() or f"{student_id.replace('/', '_')}@pdn.ac.lk"

    img, err = decode_image(img_file)
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

    # Save reference face preview photo as base64 JPEG
    ref_b64 = None
    try:
        f_box = faces[0].get("box")
        if f_box:
            fx, fy, fw, fh = [int(v) for v in f_box]
            ih, iw = processed.shape[:2]
            mx = int(fw * 0.20)
            my = int(fh * 0.20)
            fx1 = max(0, fx - mx)
            fy1 = max(0, fy - my)
            fx2 = min(iw, fx + fw + mx)
            fy2 = min(ih, fy + fh + my)
            face_crop = processed[fy1:fy2, fx1:fx2]
            if face_crop.size > 0:
                face_resized = cv2.resize(face_crop, (240, 240))
                _, buf = cv2.imencode('.jpg', face_resized, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
                ref_b64 = f"data:image/jpeg;base64,{base64.b64encode(buf).decode('utf-8')}"
    except Exception as e:
        print("Warning encoding reference face crop:", e)

    if not ref_b64:
        try:
            hp, wp = processed.shape[:2]
            scale = 240 / max(hp, wp)
            small = cv2.resize(processed, (int(wp * scale), int(hp * scale)))
            _, buf = cv2.imencode('.jpg', small, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
            ref_b64 = f"data:image/jpeg;base64,{base64.b64encode(buf).decode('utf-8')}"
        except Exception:
            pass

    # Save to DB
    register_student(
        student_id=student_id,
        full_name=full_name,
        department=department,
        year=year,
        email=email,
        embeddings=embeddings,
        image=ref_b64,
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

    orig_h, orig_w = img.shape[:2]
    proc_h, proc_w = processed.shape[:2]
    scale_x = orig_w / proc_w
    scale_y = orig_h / proc_h

    results = []
    for i, face in enumerate(detected_faces):
        raw_box = face["box"]
        scaled_box = [
            int(raw_box[0] * scale_x),
            int(raw_box[1] * scale_y),
            int(raw_box[2] * scale_x),
            int(raw_box[3] * scale_y),
        ]
        top_matches = find_top_matches(face["embedding"], candidates, top_k=5)
        results.append({
            "face_index": i,
            "bounding_box": scaled_box,
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
@app.route("/api/students", methods=["GET"])
def list_students():
    enrolled_only = request.args.get("enrolled", "").lower() in ("true", "1", "yes")
    search_query  = request.args.get("q", "").strip().lower()
    limit         = request.args.get("limit", type=int)

    students = get_all_students()

    if enrolled_only:
        students = [s for s in students if s.get("embeddings_count", 0) > 0]

    if search_query:
        students = [
            s for s in students
            if search_query in s.get("student_id", "").lower()
            or search_query in s.get("full_name", "").lower()
        ]

    total = len(students)
    if limit and limit > 0:
        students = students[:limit]

    return jsonify({"total": total, "returned": len(students), "students": students})


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


@app.route("/api/students/check-duplicates", methods=["POST"])
def check_duplicates_endpoint():
    data = request.get_json(silent=True) or {}
    reg_numbers = data.get("regNumbers", [])
    all_students = get_all_students()
    all_registered_ids = set(s.get("student_id") for s in all_students)
    
    dupes = [r for r in reg_numbers if r in all_registered_ids]
    new_count = len(reg_numbers) - len(dupes)
    return jsonify({
        "total": len(reg_numbers),
        "duplicates": dupes,
        "duplicateCount": len(dupes),
        "newCount": new_count
    })


@app.route("/api/students/batch", methods=["POST"])
def batch_register_students():
    data = request.get_json(silent=True) or {}
    students_list = data.get("students", [])
    replace = data.get("replace", False)
    count = register_students_batch(students_list, replace=replace)
    return jsonify({
        "success": True,
        "message": f"Successfully registered {count} students in backend database",
        "total_registered": student_count()
    })


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
    all_students = get_all_students()
    enrolled_with_faces = sum(1 for s in all_students if s.get("embeddings_count", 0) > 0)
    candidates = get_all_embeddings()
    logs = get_recent_logs(limit=1000)
    return jsonify({
        "students_registered":     student_count(),
        "students_with_face_data": enrolled_with_faces,
        "total_face_embeddings":   len(candidates),
        "total_identifications":   sum(1 for l in logs if l["event"] == "identification"),
        "total_registrations":     enrolled_with_faces,
    })



# ---------------------------------------------------------------------------
# Spring Boot adapter endpoint
# ---------------------------------------------------------------------------

@app.route("/api/recognize", methods=["POST"])
def api_recognize():
    """
    Adapter endpoint for Spring Boot and Frontend UI integration.
    Detects faces, extracts ArcFace embeddings, returns real bounding boxes
    and matched student identities from the enrolled database.
    """
    image_file = request.files.get("file") or request.files.get("image")
    if not image_file:
        return jsonify({"error": "No image provided", "matches": [], "faces_detected": 0}), 400

    image_bytes = image_file.read()
    img = decode_image_bytes(image_bytes)

    if img is None:
        return jsonify({"error": "Could not decode image", "matches": [], "faces_detected": 0}), 400

    orig_h, orig_w = img.shape[:2]

    # Preprocess: allow incident/CCTV images without overly aggressive rejection
    processed, reason = preprocess(img, skip_quality_check=True)
    if processed is None:
        processed = img

    proc_h, proc_w = processed.shape[:2]
    scale_x = orig_w / proc_w
    scale_y = orig_h / proc_h

    # Detect + embed
    detected_faces = get_embedding_from_image(processed)
    if not detected_faces:
        # Fallback detection with raw image if preprocessing changed anything
        if processed is not img:
            detected_faces = get_embedding_from_image(img)
            scale_x = 1.0
            scale_y = 1.0

    if not detected_faces:
        return jsonify({
            "matches": [],
            "faces_detected": 0,
            "total_registered_embeddings": len(get_all_embeddings()),
            "message": "No faces detected in image. Please ensure faces are clearly visible."
        }), 200

    candidates = get_all_embeddings()

    face_results = []
    for idx, face in enumerate(detected_faces):
        raw_box = face.get("box", [50, 50, 100, 100])
        bx = int(raw_box[0] * scale_x)
        by = int(raw_box[1] * scale_y)
        bw = int(raw_box[2] * scale_x)
        bh = int(raw_box[3] * scale_y)
        box_int = [bx, by, bw, bh]
        det_conf = float(face.get("confidence", 0.95))

        top = find_top_matches(face["embedding"], candidates, top_k=3) if candidates else []
        best = top[0] if top else None
        # Real-world ArcFace similarity between different photos typically ranges 0.45 - 0.70.
        # >= 0.60 is High, 0.40 - 0.59 is Medium. Setting threshold to 0.25 avoids false negative rejections on ID cards.
        MATCH_THRESHOLD = 0.25
        is_confirmed = bool(best and best.get("similarity_score", 0) >= MATCH_THRESHOLD)

        sid = best["student_id"] if (best and is_confirmed) else None
        sname = best.get("student_name", "") if (best and is_confirmed) else ""
        sfac = (best.get("faculty") or (sid.split("/")[0].upper() if sid else "UNKNOWN")) if is_confirmed else "UNKNOWN"
        syear = (best.get("year") or parse_year(sid) or 1) if sid else 1
        conf_val = float(best.get("similarity_score", 0.0)) if best else 0.0

        # Crop detected face from incident image with slight margin
        margin_x = int(bw * 0.18)
        margin_y = int(bh * 0.18)
        cx1 = max(0, bx - margin_x)
        cy1 = max(0, by - margin_y)
        cx2 = min(orig_w, bx + bw + margin_x)
        cy2 = min(orig_h, by + bh + margin_y)
        crop_img = img[cy1:cy2, cx1:cx2]
        incident_crop_b64 = None
        if crop_img.size > 0:
            try:
                _, crop_buf = cv2.imencode('.jpg', crop_img, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
                incident_crop_b64 = f"data:image/jpeg;base64,{base64.b64encode(crop_buf).decode('utf-8')}"
            except Exception as e:
                print("Warning cropping incident face:", e)

        # Matched student reference photo from DB
        ref_photo_b64 = None
        if sid:
            matched_rec = get_student(sid)
            if matched_rec:
                ref_photo_b64 = matched_rec.get("image")

        face_results.append({
            "faceIndex": idx,
            "faceLabel": f"Face #{idx + 1}",
            "box": box_int,
            "detectionConfidence": det_conf,
            "studentId": sid,
            "confidence": conf_val,
            "studentName": sname,
            "faculty": sfac,
            "year": syear,
            "topCandidateId": best.get("student_id") if best else None,
            "topCandidateScore": conf_val,
            "candidatesCount": len(candidates),
            "incidentCropUrl": incident_crop_b64,
            "referencePhotoUrl": ref_photo_b64,
        })

    log_identification(
        image_filename=image_file.filename or "api_recognize",
        faces_detected=len(detected_faces),
        results=[{"face_index": r["faceIndex"], "detection_confidence": r["detectionConfidence"], "top_matches": []} for r in face_results],
        requested_by="frontend-ui",
    )

    return jsonify({
        "faces_detected": len(detected_faces),
        "total_registered_embeddings": len(candidates),
        "image_width": int(orig_w),
        "image_height": int(orig_h),
        "matches": face_results,
        "warning": None if len(candidates) > 0 else "Biometric index has 0 enrolled face templates. Please enroll students with photos in the database."
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
    app.run(host="0.0.0.0", port=5000, debug=True)