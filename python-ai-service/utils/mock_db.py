"""
Mock Database Service
---------------------
Simulates what MySQL will do in production.
Stores student/staff records + embeddings in a local JSON file.

Each person stores multiple embeddings (one per augmentation).
During matching, all embeddings are passed to the matcher which
picks the best score across all of them.
"""

import json
import os
import shutil
import threading
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "mock_db.json")
BAK_PATH = DB_PATH + ".bak"
_db_lock = threading.RLock()


def _try_repair_json(path: str) -> dict | None:
    """Attempt to recover corrupted JSON by scanning backwards for the last valid closing brace."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        for idx in range(len(lines) - 1, -1, -1):
            line = lines[idx].strip()
            if line == "}," or line == "}":
                repaired = "".join(lines[:idx + 1]).rstrip().rstrip(",") + "\n  }\n}\n"
                parsed = json.loads(repaired)
                if isinstance(parsed, dict) and "staff" in parsed:
                    # Write repaired copy back
                    with open(path, "w", encoding="utf-8") as out:
                        out.write(repaired)
                    logger.info("Successfully auto-repaired %s", path)
                    return parsed
    except Exception as e:
        logger.error("Auto-repair failed: %s", e)
    return None


def _load() -> dict:
    with _db_lock:
        if not os.path.exists(DB_PATH):
            return {"staff": {}}

        data = None
        try:
            with open(DB_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, ValueError, OSError) as err:
            logger.error("mock_db.json corrupted (%s). Attempting backup recovery...", err)
            if os.path.exists(BAK_PATH):
                try:
                    with open(BAK_PATH, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    logger.info("Recovered mock_db from backup file.")
                    shutil.copyfile(BAK_PATH, DB_PATH)
                except Exception:
                    data = None

            if data is None:
                data = _try_repair_json(DB_PATH)

        if not isinstance(data, dict):
            data = {"staff": {}}

        # Handle both "staff" and legacy "students" key
        if "staff" not in data and "students" in data:
            data["staff"] = data.pop("students")
        elif "staff" not in data:
            data["staff"] = {}
        return data


def _save(data: dict) -> None:
    with _db_lock:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        tmp_path = DB_PATH + ".tmp"
        
        # Write to temporary file first
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())

        # Update backup if current DB exists and is valid
        if os.path.exists(DB_PATH) and os.path.getsize(DB_PATH) > 0:
            try:
                shutil.copyfile(DB_PATH, BAK_PATH)
            except Exception:
                pass

        # Atomic replacement
        os.replace(tmp_path, DB_PATH)



def parse_year(reg_no: str) -> int | None:
    """Extract admission/batch year from index number (e.g. A/16/AI/877 -> 2016)."""
    import re
    clean = str(reg_no).strip()
    m = re.search(r'(?:^|[A-Za-z]+/)([0-9]{2,4})(?:/|$)', clean) or re.search(r'\b([0-9]{2,4})\b', clean)
    if m:
        val = int(m.group(1))
        if val < 50:
            return 2000 + val
        elif val < 100:
            return 1900 + val
        return val
    return None


def register_student(
    student_id: str,
    full_name: str,
    department: str = "",
    year: int | None = None,
    email: str = "",
    embeddings: list[dict] = None,
    image: str | None = None,
) -> dict:
    """
    Save a student/staff record with augmented embeddings.
    If the person already exists, updates their embeddings and photo timestamp.
    """
    db  = _load()
    now = datetime.now(timezone.utc).isoformat()
    existing = db["staff"].get(student_id)

    computed_year = year or parse_year(student_id) or 1

    db["staff"][student_id] = {
        "student_id":       student_id,
        "staff_id":         student_id,
        "full_name":        full_name,
        "department":       department or "",
        "faculty":          department or "",
        "year":             computed_year,
        "email":            email or f"{student_id.replace('/', '_')}@pdn.ac.lk",
        "image":            image if image else (existing.get("image") if existing else None),
        "embeddings":       embeddings if embeddings else (existing.get("embeddings", []) if existing else []),
        "registered_at":    existing["registered_at"] if existing else now,
        "photo_updated_at": now,
    }

    _save(db)
    return db["staff"][student_id]


def register_students_batch(students_list: list[dict], replace: bool = False) -> int:
    """
    Bulk save multiple student records into the database in a single disk write.
    """
    db = _load()
    if replace:
        db["staff"] = {}
    now = datetime.now(timezone.utc).isoformat()
    count = 0
    for s in students_list:
        sid = s.get("id") or s.get("regno") or s.get("student_id")
        if not sid:
            continue
        existing = db["staff"].get(sid)
        computed_year = s.get("year") or parse_year(sid) or 1
        photo_val = s.get("photoUrl")
        if photo_val and ("pdn.ac.lk" in str(photo_val) or "student_image_view" in str(photo_val)):
            photo_val = None
        dept = s.get("faculty") or s.get("department") or s.get("dept") or (existing.get("department", "") if existing else "")
        db["staff"][sid] = {
            "student_id":       sid,
            "staff_id":         sid,
            "full_name":        s.get("name") or (existing.get("full_name") if existing else f"Student ({sid})"),
            "department":       dept,
            "faculty":          dept,
            "year":             computed_year,
            "email":            s.get("email") or (existing.get("email") if existing else f"{sid.replace('/', '_')}@pdn.ac.lk"),
            "image":            photo_val if photo_val else (existing.get("image") if existing else None),
            "embeddings":       s.get("embeddings") if s.get("embeddings") else (existing.get("embeddings", []) if existing else []),
            "registered_at":    existing["registered_at"] if existing else now,
            "photo_updated_at": now,
        }
        count += 1
    _save(db)
    return count


def get_all_embeddings() -> list[dict]:
    """
    Return all records with embeddings expanded — one entry per augmentation.
    The matcher compares against all of them and picks the best score per person.
    """
    db = _load()
    result = []
    for person in db["staff"].values():
        sid = person.get("student_id") or person.get("staff_id")
        dept = person.get("faculty") or person.get("department", "")
        for emb_entry in person.get("embeddings", []):
            result.append({
                "student_id":   sid,
                "student_name": person["full_name"],
                "faculty":      dept,
                "department":   dept,
                "year":         person.get("year", 1),
                "augmentation": emb_entry["augmentation"],
                "embedding":    emb_entry["embedding"],
            })
    return result


def get_student(student_id: str) -> dict | None:
    db = _load()
    person = db["staff"].get(student_id)
    if person and "student_id" not in person:
        person["student_id"] = person.get("staff_id", student_id)
    return person


def get_all_students() -> list[dict]:
    db = _load()
    result = []
    for person in db["staff"].values():
        img = person.get("image")
        # Ensure protected university URLs are never leaked to client responses
        if img and ("pdn.ac.lk" in str(img) or "student_image_view" in str(img)):
            img = None
        sid = person.get("student_id") or person.get("staff_id")
        dept = person.get("faculty") or person.get("department", "")
        result.append({
            "student_id":       sid,
            "full_name":        person["full_name"],
            "department":       dept,
            "faculty":          dept,
            "year":             person.get("year"),
            "email":            person.get("email"),
            "image":            img,
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