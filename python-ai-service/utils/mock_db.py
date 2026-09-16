"""
Mock Database Service
---------------------
Simulates what PostgreSQL will do in production.
Stores student/staff records + embeddings in a local JSON file.

Each person stores multiple embeddings (one per augmentation).
During matching, all embeddings are passed to the matcher which
picks the best score across all of them.
"""

import json
import os
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "mock_db.json")


def _load() -> dict:
    if not os.path.exists(DB_PATH):
        return {"staff": {}}
    with open(DB_PATH, "r") as f:
        data = json.load(f)
    # Handle both "staff" and legacy "students" key
    if "staff" not in data and "students" in data:
        data["staff"] = data.pop("students")
    elif "staff" not in data:
        data["staff"] = {}
    return data


def _save(data: dict) -> None:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with open(DB_PATH, "w") as f:
        json.dump(data, f, indent=2)


def register_student(
    student_id: str,
    full_name: str,
    department: str,
    year: int,
    email: str,
    embeddings: list[dict],
    image: str | None = None,
) -> dict:
    """
    Save a student/staff record with augmented embeddings.
    If the person already exists, updates their embeddings and photo timestamp.
    """
    db  = _load()
    now = datetime.now(timezone.utc).isoformat()
    existing = db["staff"].get(student_id)

    db["staff"][student_id] = {
        "staff_id":         student_id,
        "full_name":        full_name,
        "department":       department,
        "year":             year,
        "email":            email,
        "image":            image,
        "embeddings":       embeddings,
        "registered_at":    existing["registered_at"] if existing else now,
        "photo_updated_at": now,
    }

    _save(db)
    return db["staff"][student_id]


def get_all_embeddings() -> list[dict]:
    """
    Return all records with embeddings expanded — one entry per augmentation.
    The matcher compares against all of them and picks the best score per person.
    """
    db = _load()
    result = []
    for person in db["staff"].values():
        for emb_entry in person.get("embeddings", []):
            result.append({
                "student_id":   person["staff_id"],
                "student_name": person["full_name"],
                "department":   person["department"],
                "augmentation": emb_entry["augmentation"],
                "embedding":    emb_entry["embedding"],
            })
    return result


def get_student(student_id: str) -> dict | None:
    db = _load()
    return db["staff"].get(student_id)


def get_all_students() -> list[dict]:
    db = _load()
    result = []
    for person in db["staff"].values():
        result.append({
            "student_id":       person["staff_id"],
            "full_name":        person["full_name"],
            "department":       person["department"],
            "year":             person.get("year"),
            "email":            person.get("email"),
            "image":            person.get("image"),
            "embeddings_count": len(person.get("embeddings", [])),
            "registered_at":    person["registered_at"],
            "photo_updated_at": person["photo_updated_at"],
        })
    return result


def delete_student(student_id: str) -> bool:
    db = _load()
    if student_id not in db["staff"]:
        return False
    del db["staff"][student_id]
    _save(db)
    return True


def student_count() -> int:
    db = _load()
    return len(db["staff"])