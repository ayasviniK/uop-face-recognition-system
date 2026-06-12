"""
Mock Database Service
---------------------
Simulates what PostgreSQL will do in production.
Stores staff records + embeddings in a local JSON file.

Each staff member stores multiple embeddings (one per augmentation).
During matching, all embeddings are passed to the matcher which
picks the best score across all of them.

Data structure:
{
    "staff": {
        "2021CS001": {
            "staff_id": "2021CS001",
            "full_name": "Zen Col",
            "department": "Computer Science",
            "image": "zen-col.jpg",
            "embeddings": [
                {"augmentation": "original", "embedding": [...]},
                {"augmentation": "flipped", "embedding": [...]}
            ],
            "registered_at": "2026-06-03T10:00:00",
            "photo_updated_at": "2026-06-03T10:00:00"
        }
    }
}
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
    if "staff" not in data and "students" in data:
        data["staff"] = data.pop("students")
    return data


def _save(data: dict) -> None:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with open(DB_PATH, "w") as f:
        json.dump(data, f, indent=2)


def register_student(
    staff_id: str,
    full_name: str,
    department: str,
    image: str | None,
    embeddings: list[dict],
) -> dict:
    """Save a staff record with augmented embeddings."""
    db = _load()
    now = datetime.now(timezone.utc).isoformat()
    existing = db["staff"].get(staff_id)

    db["staff"][staff_id] = {
        "staff_id": staff_id,
        "full_name": full_name,
        "department": department,
        "image": image,
        "embeddings": embeddings,
        "registered_at": existing["registered_at"] if existing else now,
        "photo_updated_at": now,
    }

    _save(db)
    return db["staff"][staff_id]


def get_all_embeddings() -> list[dict]:
    """Return all staff embeddings as flattened candidate entries."""
    db = _load()
    result = []
    for staff in db["staff"].values():
        for emb_entry in staff.get("embeddings", []):
            result.append({
                "staff_id": staff["staff_id"],
                "staff_name": staff["full_name"],
                "department": staff["department"],
                "image": staff.get("image"),
                "augmentation": emb_entry["augmentation"],
                "embedding": emb_entry["embedding"],
            })
    return result


def get_student(staff_id: str) -> dict | None:
    db = _load()
    return db["staff"].get(staff_id)


def get_all_students() -> list[dict]:
    db = _load()
    result = []
    for staff in db["staff"].values():
        result.append({
            "staff_id": staff["staff_id"],
            "full_name": staff["full_name"],
            "department": staff["department"],
            "image": staff.get("image"),
            "embeddings_count": len(staff.get("embeddings", [])),
            "registered_at": staff["registered_at"],
            "photo_updated_at": staff["photo_updated_at"],
        })
    return result


def delete_student(staff_id: str) -> bool:
    db = _load()
    if staff_id not in db["staff"]:
        return False
    del db["staff"][staff_id]
    _save(db)
    return True


def student_count() -> int:
    db = _load()
    return len(db["staff"])