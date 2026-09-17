"""
Mock Database Service — DEV ONLY
----------------------------------
Used ONLY when Spring Boot / MySQL are not available locally.
In production, Flask calls Spring Boot's /internal/* endpoints.

What gets stored (mirrors the real DB schema):
  - student_id  : the university registration number (e.g. A/16/AI/877)
  - faculty     : parsed from reg number prefix or API response
  - embeddings  : 6 augmented ArcFace embeddings (512 floats each)

What does NOT get stored (fetched from university APIs after match):
  - name, photo, email, year — Spring Boot fetches these using the
    matched student_id after identification is complete

Data file: python-ai-service/data/mock_db.json
"""

import json
import os
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "mock_db.json")


def _load() -> dict:
    if not os.path.exists(DB_PATH):
        return {"students": {}}
    with open(DB_PATH, "r") as f:
        data = json.load(f)
    # Handle old "staff" key from previous version
    if "staff" in data and "students" not in data:
        data["students"] = data.pop("staff")
    elif "students" not in data:
        data["students"] = {}
    return data


def _save(data: dict) -> None:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with open(DB_PATH, "w") as f:
        json.dump(data, f, indent=2)


def register_student(
    student_id: str,
    faculty: str,
    embeddings: list[dict],
    # Legacy params kept for backward compat with /register endpoint
    full_name: str = "",
    department: str = "",
    year: int = 0,
    email: str = "",
    image: str | None = None,
) -> dict:
    """
    Save a student's index + faculty + embeddings.
    This is all we store — no personal info.
    """
    db  = _load()
    now = datetime.now(timezone.utc).isoformat()
    existing = db["students"].get(student_id)

    db["students"][student_id] = {
        "student_id":       student_id,
        "faculty":          faculty or department,
        "embeddings":       embeddings,
        "registered_at":    existing["registered_at"] if existing else now,
        "photo_updated_at": now,
    }

    _save(db)
    return db["students"][student_id]


def get_all_embeddings() -> list[dict]:
    """
    Return all embeddings as a flat list — one entry per augmentation.
    matcher.py uses this to run cosine similarity.
    """
    db = _load()
    result = []
    for student in db["students"].values():
        for emb_entry in student.get("embeddings", []):
            result.append({
                "student_id":   student["student_id"],
                "student_name": "",  # not stored — fetched from uni API after match
                "department":   student.get("faculty", ""),
                "augmentation": emb_entry["augmentation"],
                "embedding":    emb_entry["embedding"],
            })
    return result


def get_student(student_id: str) -> dict | None:
    db = _load()
    return db["students"].get(student_id)


def get_all_students() -> list[dict]:
    """List all students — returns index + faculty + embedding count only."""
    db = _load()
    result = []
    for student in db["students"].values():
        result.append({
            "student_id":       student["student_id"],
            "faculty":          student.get("faculty", ""),
            "embeddings_count": len(student.get("embeddings", [])),
            "registered_at":    student["registered_at"],
            "photo_updated_at": student["photo_updated_at"],
        })
    return result


def delete_student(student_id: str) -> bool:
    db = _load()
    if student_id not in db["students"]:
        return False
    del db["students"][student_id]
    _save(db)
    return True


def student_count() -> int:
    db = _load()
    return len(db["students"])