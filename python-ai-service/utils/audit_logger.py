"""
Audit Logger
------------
Every identification attempt gets logged here.
Universities need this — you need to be able to answer:
  "Who was identified, when, by whom, with what confidence?"

Logs are written to logs/audit.jsonl (one JSON object per line).
JSONL format is better than a single JSON array for logs because:
  - You can append without reading the whole file
  - Easy to parse line by line
  - Won't corrupt the whole file if the process crashes mid-write
"""

import json
import os
from datetime import datetime, timezone

LOG_PATH = os.path.join(os.path.dirname(__file__), "..", "logs", "audit.jsonl")


def log_identification(
    image_filename: str,
    faces_detected: int,
    results: list[dict],
    requested_by: str = "unknown",
) -> None:
    """
    Log an identification attempt.

    Args:
        image_filename: Original filename of the uploaded image.
        faces_detected: How many faces were found.
        results: The match results returned to the caller.
        requested_by: Who made the request (Spring Boot will pass this later).
    """
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)

    # Summarize results for the log (don't store full embeddings)
    summary = []
    for r in results:
        top = r.get("top_matches", [])
        summary.append({
            "face_index": r["face_index"],
            "detection_confidence": r["detection_confidence"],
            "best_match": top[0] if top else None,
        })

    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": "identification",
        "image_filename": image_filename,
        "faces_detected": faces_detected,
        "requested_by": requested_by,
        "results_summary": summary,
    }

    with open(LOG_PATH, "a") as f:
        f.write(json.dumps(entry) + "\n")


def log_registration(staff_id: str, success: bool, reason: str = "") -> None:
    """Log a staff registration attempt."""
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)

    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": "registration",
        "staff_id": staff_id,
        "success": success,
        "reason": reason,
    }

    with open(LOG_PATH, "a") as f:
        f.write(json.dumps(entry) + "\n")


def get_recent_logs(limit: int = 50) -> list[dict]:
    """Return the most recent log entries (newest first)."""
    if not os.path.exists(LOG_PATH):
        return []

    with open(LOG_PATH, "r") as f:
        lines = f.readlines()

    entries = []
    for line in lines:
        line = line.strip()
        if line:
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    # Newest first
    entries.reverse()
    return entries[:limit]
