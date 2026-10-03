"""
Video Processor
---------------
Processes an uploaded video file to identify people in it.

Pipeline:
  1. Open video with OpenCV
  2. Sample frames (1 per second — no need to process every frame)
  3. For each sampled frame, detect + identify all faces
  4. Aggregate results across frames (voting — most consistent match wins)
  5. Return a report: who appeared, when, with what confidence

Why 1 frame per second?
A person's identity doesn't change between consecutive frames.
Processing every frame at 30fps would take 30x longer for no accuracy gain.
1fps gives you enough data points to be statistically confident while
keeping processing time reasonable on a CPU-only machine.

Rough timing on a Dell Latitude (no GPU):
  - 1 minute video at 30fps = 1800 frames total
  - At 1fps sampling = 60 frames to process
  - ~1 second per frame (ArcFace buffalo_l on CPU)
  - Total: ~60 seconds processing time for a 1-minute video
  - This is acceptable for an "upload and wait" workflow
"""

import cv2
import numpy as np
from collections import defaultdict


# How many frames to skip between samples.
# SAMPLE_EVERY_N_FRAMES = 30 means 1 sample per second at 30fps.
# Lower = more accurate but slower. Higher = faster but might miss brief appearances.
SAMPLE_EVERY_N_FRAMES = 30

# Minimum number of frames a person must appear in to be included in the report.
# Filters out false positives from a single bad frame.
MIN_FRAME_APPEARANCES = 2

# Minimum average similarity score across all frames to be reported.
MIN_AVERAGE_SCORE = 0.35


def extract_frames(video_path: str, sample_every_n: int = SAMPLE_EVERY_N_FRAMES) -> list[dict]:
    """
    Extract sampled frames from a video file.

    Args:
        video_path: Path to the video file on disk.
        sample_every_n: Extract one frame every N frames.

    Returns:
        List of dicts with:
          - 'frame_number': int
          - 'timestamp_seconds': float
          - 'frame': np.ndarray (OpenCV BGR image)
    """
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_seconds = total_frames / fps if fps > 0 else 0

    frames = []
    frame_number = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_number % sample_every_n == 0:
            timestamp = frame_number / fps if fps > 0 else 0
            frames.append({
                "frame_number": frame_number,
                "timestamp_seconds": round(timestamp, 2),
                "frame": frame,
            })

        frame_number += 1

    cap.release()

    return frames, {
        "fps": round(fps, 2),
        "total_frames": total_frames,
        "duration_seconds": round(duration_seconds, 2),
        "frames_sampled": len(frames),
    }


def process_video(
    video_path: str,
    candidates: list[dict],
    embedder_fn,
    matcher_fn,
    preprocessor_fn,
    progress_callback=None,
) -> dict:
    """
    Full video processing pipeline.

    Args:
        video_path: Path to the video file on disk.
        candidates: List of student embeddings from the database.
        embedder_fn: get_embedding_from_image from embedder.py
        matcher_fn: find_top_matches from matcher.py
        preprocessor_fn: preprocess from preprocessor.py
        progress_callback: Optional function(current, total) for progress updates.

    Returns:
        A report dict with identified people, timestamps, and confidence.
    """
    # Step 1: Extract frames
    frames, video_info = extract_frames(video_path)
    total_frames = len(frames)

    if total_frames == 0:
        return {
            "video_info": video_info,
            "people_identified": [],
            "total_faces_detected": 0,
            "message": "No frames could be extracted from the video.",
        }

    # Step 2: Process each frame
    # Structure: { student_id -> list of {score, timestamp, frame_number} }
    student_appearances = defaultdict(list)
    total_faces_detected = 0
    frames_with_faces = 0

    for i, frame_data in enumerate(frames):
        if progress_callback:
            progress_callback(i + 1, total_frames)

        frame = frame_data["frame"]
        timestamp = frame_data["timestamp_seconds"]
        frame_number = frame_data["frame_number"]

        # Preprocess the frame (skip quality check for video frames —
        # video frames naturally vary in brightness/blur between frames
        # and we don't want to skip too many)
        processed, _ = preprocessor_fn(frame, skip_quality_check=True)
        if processed is None:
            processed = frame  # use raw frame if preprocessing fails

        # Detect + embed faces
        detected_faces = embedder_fn(processed)

        if not detected_faces:
            continue

        frames_with_faces += 1
        total_faces_detected += len(detected_faces)

        # Match each face against the database
        for face in detected_faces:
            if not candidates:
                continue

            matches = matcher_fn(face["embedding"], candidates, top_k=1)

            if matches:
                best_match = matches[0]
                student_id = best_match["student_id"]
                student_appearances[student_id].append({
                    "similarity_score": best_match["similarity_score"],
                    "timestamp_seconds": timestamp,
                    "frame_number": frame_number,
                    "detection_confidence": face["confidence"],
                })

    # Step 3: Aggregate results
    # For each student, compute:
    #   - How many frames they appeared in
    #   - Their average and best similarity score
    #   - First and last seen timestamps
    people_identified = []

    for student_id, appearances in student_appearances.items():
        if len(appearances) < MIN_FRAME_APPEARANCES:
            # Appeared in too few frames — likely a false positive
            continue

        scores = [a["similarity_score"] for a in appearances]
        avg_score = sum(scores) / len(scores)

        if avg_score < MIN_AVERAGE_SCORE:
            continue

        timestamps = [a["timestamp_seconds"] for a in appearances]

        # Get student name from the first appearance's match
        # (we need to pull it from candidates)
        student_name = next(
            (c["student_name"] for c in candidates if c["student_id"] == student_id),
            "Unknown"
        )
        department = next(
            (c.get("department", "") for c in candidates if c["student_id"] == student_id),
            ""
        )

        people_identified.append({
            "student_id": student_id,
            "student_name": student_name,
            "department": department,
            "frames_appeared": len(appearances),
            "first_seen_seconds": round(min(timestamps), 2),
            "last_seen_seconds": round(max(timestamps), 2),
            "best_similarity_score": round(max(scores), 4),
            "average_similarity_score": round(avg_score, 4),
            "confidence_label": _score_to_label(avg_score),
        })

    # Sort by first appearance time
    people_identified.sort(key=lambda x: x["first_seen_seconds"])

    return {
        "video_info": video_info,
        "people_identified": people_identified,
        "total_faces_detected": total_faces_detected,
        "frames_with_faces": frames_with_faces,
        "message": f"Found {len(people_identified)} identified person(s) in video.",
    }


def _score_to_label(score: float) -> str:
    if score >= 0.6:
        return "High"
    elif score >= 0.4:
        return "Medium"
    elif score >= 0.35:
        return "Low"
    else:
        return "No Match"


def format_timestamp(seconds: float) -> str:
    """Convert seconds to MM:SS format for readability."""
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes:02d}:{secs:02d}"
