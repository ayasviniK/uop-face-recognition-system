"""
Mock Database Service
---------------------
Simulates what PostgreSQL will do in production.
Stores student records + embeddings in a local JSON file.

When the real backend is ready, this entire file gets replaced by
HTTP calls to Spring Boot. Nothing else in the codebase changes.

Data structure stored in data/mock_db.json:
{
    "students": {
        "2021CS001": {
            "student_id": "2021CS001",
            "full_name": "Kasun Perera",
            "department": "Computer Science",
            "year": 2,
            "email": "kasun@sci.pdn.ac.lk",
            "embedding": [0.023, -0.114, ...],   # 512 floats
            "registered_at": "2026-06-03T10:00:00",
            "photo_updated_at": "2026-06-03T10:00:00"
        },
        ...
    }
}
"""

import json
import os
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "mock_db.json")


def _load() -> dict:
    """Load the JSON file. Return empty structure if it doesn't exist yet."""
    if not os.path.exists(DB_PATH):
        return {"students": {}}
    with open(DB_PATH, "r") as f:
        return json.load(f)


def _save(data: dict) -> None:
    """Write the updated data back to the JSON file."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with open(DB_PATH, "w") as f:
        json.dump(data, f, indent=2)


def register_student(
    student_id: str,
    full_name: str,
    department: str,
    year: int,
    email: str,
    embedding: list[float],
) -> dict:
    """
    Save a new student with their face embedding.
    If the student already exists, update their embedding and photo timestamp.

    Returns the saved student record.
    """
    db = _load()
    now = datetime.now(timezone.utc).isoformat()

    existing = db["students"].get(student_id)

    db["students"][student_id] = {
        "student_id": student_id,
        "full_name": full_name,
        "department": department,
        "year": year,
        "email": email,
        "embedding": embedding,
        "registered_at": existing["registered_at"] if existing else now,
        "photo_updated_at": now,
    }

    _save(db)
    return db["students"][student_id]


def get_all_embeddings() -> list[dict]:
    """
    Return all students with their embeddings.
    This is what gets passed to the matcher.

    In production, Spring Boot will call its own DB and pass
    this same structure to Flask via the /identify request body.
    """
    db = _load()
    result = []
    for student in db["students"].values():
        result.append({
            "student_id": student["student_id"],
            "student_name": student["full_name"],
            "department": student["department"],
            "embedding": student["embedding"],
        })
    return result


def get_student(student_id: str) -> dict | None:
    """Look up a single student by ID."""
    db = _load()
    return db["students"].get(student_id)


def get_all_students() -> list[dict]:
    """Return all students without embeddings (for listing/admin UI)."""
    db = _load()
    result = []
    for student in db["students"].values():
        result.append({
            "student_id": student["student_id"],
            "full_name": student["full_name"],
            "department": student["department"],
            "year": student["year"],
            "email": student["email"],
            "registered_at": student["registered_at"],
            "photo_updated_at": student["photo_updated_at"],
        })
    return result


def delete_student(student_id: str) -> bool:
    """Remove a student from the DB. Returns True if found and deleted."""
    db = _load()
    if student_id not in db["students"]:
        return False
    del db["students"][student_id]
    _save(db)
    return True


def student_count() -> int:
    db = _load()
    return len(db["students"])
