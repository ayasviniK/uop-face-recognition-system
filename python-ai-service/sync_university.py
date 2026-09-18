"""
University Sync Script
-----------------------
Reads student registration numbers from a CSV file,
fetches student info from the University Index API,
fetches passport photos from the University Photo DB API,
generates ArcFace embeddings + 6 augmentations,
and saves them to YOUR database via Spring Boot.

All credentials and URLs are read from environment variables.
Set them in springboot-backend/backend/.env — never hardcode them.

Usage:
    python sync_university.py              # sync all from CSV
    python sync_university.py --limit 50   # sync first 50 only
    python sync_university.py --reg A/16/AI/877  # sync one student
    python sync_university.py --schedule   # run on schedule (3x per year)
    python sync_university.py --force      # re-sync even if already in DB
"""

import os
import sys
import csv
import time
import base64
import argparse
import requests
import cv2
import numpy as np
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# Load .env from springboot-backend/backend/.env
# This way credentials are in one place for the whole project
_env_path = Path(__file__).parent.parent / "springboot-backend" / "backend" / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    # Fallback: look for .env in python-ai-service/
    load_dotenv()

from utils.embedder import get_embedding_from_image
from utils.augmentor import generate_augmented_embeddings
from utils.preprocessor import preprocess

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG — all read from .env, never hardcoded
# ─────────────────────────────────────────────────────────────────────────────

UNIVERSITY_INDEX_URL = os.environ.get("UNIVERSITY_INDEX_URL", "")
PHOTO_DB_URL         = os.environ.get("PHOTO_DB_URL", "")
API_USERNAME         = os.environ.get("UNI_API_USERNAME", "")
API_PASSWORD         = os.environ.get("UNI_API_PASSWORD", "")
API_KEY              = os.environ.get("UNI_API_KEY", "")

SPRING_BOOT_URL      = os.environ.get("SPRING_BOOT_URL", "http://localhost:8080")
INTERNAL_API_KEY     = os.environ.get("INTERNAL_API_KEY", "sentinel_internal_key_2026")

CSV_PATH             = os.path.join(os.path.dirname(__file__), "sample_data", "students.csv")
CSV_REG_NO_COLUMN    = "Reg_No"

# API response field names — update when you see the real API response
FIELD_INDEX          = os.environ.get("UNI_FIELD_INDEX",   "index")
FIELD_FACULTY        = os.environ.get("UNI_FIELD_FACULTY", "faculty_id")

# Scheduled sync dates (month, day)
SYNC_SCHEDULE = [
    (1,  1),   # January 1
    (6,  1),   # June 1
    (12, 31),  # December 31
]

# Faculty prefix map — update as you discover more prefixes from the CSV
FACULTY_MAP = {
    "A":   "Agriculture",
    "AG":  "Agriculture",
    "AHS": "Allied Health Sciences",
    "E":   "Engineering",
    "M":   "Medicine",
    "S":   "Science",
    "AL":  "Arts",
    "VM":  "Veterinary Medicine",
    "DT":  "Dental Technology",
}


def check_config():
    """Warn if required env vars are missing."""
    missing = []
    if not UNIVERSITY_INDEX_URL:
        missing.append("UNIVERSITY_INDEX_URL")
    if not PHOTO_DB_URL:
        missing.append("PHOTO_DB_URL")
    if missing:
        print(f"\n  WARNING: Missing env vars: {', '.join(missing)}")
        print(f"  Add them to springboot-backend/backend/.env")
        print(f"  Script will fail when it tries to call the APIs.\n")


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_faculty(student_index: str, faculty_from_api: str = "") -> str:
    if faculty_from_api:
        return faculty_from_api
    prefix = student_index.split("/")[0].upper()
    return FACULTY_MAP.get(prefix, f"Unknown ({prefix})")


def auth_headers() -> dict:
    if API_KEY:
        return {"Authorization": f"Bearer {API_KEY}", "X-API-Key": API_KEY}
    if API_USERNAME and API_PASSWORD:
        creds = base64.b64encode(f"{API_USERNAME}:{API_PASSWORD}".encode()).decode()
        return {"Authorization": f"Basic {creds}"}
    return {}


def fetch_student_info(reg_no: str) -> dict | None:
    try:
        r = requests.get(
            f"{UNIVERSITY_INDEX_URL}/{reg_no}",
            headers=auth_headers(),
            timeout=15,
        )
        if r.status_code == 404:
            return None
        if r.status_code == 401:
            print("  AUTH ERROR — check UNI_API_USERNAME/PASSWORD in .env")
            return None
        if not r.ok:
            print(f"  API ERROR {r.status_code} for {reg_no}")
            return None
        return r.json()
    except requests.exceptions.ConnectionError:
        print(f"  CONNECTION ERROR — cannot reach {UNIVERSITY_INDEX_URL}")
        print(f"  Check university network connection")
        return None
    except Exception as e:
        print(f"  ERROR: {e}")
        return None


def fetch_photo(student_index: str) -> np.ndarray | None:
    try:
        r = requests.get(
            f"{PHOTO_DB_URL}/{student_index}",
            headers=auth_headers(),
            timeout=30,
        )
        if not r.ok:
            return None

        # Option 1: API returns raw image bytes
        img_array = np.frombuffer(r.content, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if img is not None:
            return img

        # Option 2: API returns JSON with a photo URL
        # Uncomment if Option 1 doesn't work:
        # data = r.json()
        # photo_url = data.get("photo_url") or data.get("image_url")
        # if photo_url:
        #     r2 = requests.get(photo_url, headers=auth_headers(), timeout=30)
        #     arr = np.frombuffer(r2.content, np.uint8)
        #     return cv2.imdecode(arr, cv2.IMREAD_COLOR)

        return None
    except Exception as e:
        print(f"  Photo error: {e}")
        return None


def get_existing_ids() -> set:
    try:
        r = requests.get(
            f"{SPRING_BOOT_URL}/internal/students/ids",
            headers={"X-Internal-Key": INTERNAL_API_KEY},
            timeout=10,
        )
        if r.ok:
            return set(r.json().get("studentIds", []))
    except Exception:
        pass
    return set()


def save_to_db(student_index: str, faculty: str, embeddings: list[dict]) -> bool:
    aug_to_field = {
        "original":      "embeddingOriginal",
        "flipped":       "embeddingFlipped",
        "brighter":      "embeddingBrighter",
        "darker":        "embeddingDarker",
        "rotated_plus":  "embeddingRotatedPlus",
        "rotated_minus": "embeddingRotatedMinus",
    }

    payload = {
        "studentId": student_index,
        "faculty":   faculty,
        "tier":      1,
    }
    for emb in embeddings:
        field = aug_to_field.get(emb["augmentation"])
        if field:
            payload[field] = emb["embedding"]

    try:
        r = requests.post(
            f"{SPRING_BOOT_URL}/internal/students/embeddings",
            json=payload,
            headers={
                "Content-Type":   "application/json",
                "X-Internal-Key": INTERNAL_API_KEY,
            },
            timeout=30,
        )
        return r.ok
    except Exception as e:
        print(f"  DB save error: {e}")
        return False


def log_sync(added: int, skipped: int, failed: int, duration: float):
    try:
        requests.post(
            f"{SPRING_BOOT_URL}/internal/sync/log",
            json={
                "studentsAdded":      added,
                "studentsUpdated":    0,
                "studentsTieredDown": 0,
                "status":             "success" if failed == 0 else "partial",
                "notes":              f"Added {added}, skipped {skipped}, failed {failed}. {duration/60:.1f} min.",
            },
            headers={"X-Internal-Key": INTERNAL_API_KEY},
            timeout=10,
        )
    except Exception:
        pass


def read_csv(path: str) -> list[str]:
    reg_numbers = []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            reg_no = row.get(CSV_REG_NO_COLUMN, "").strip()
            if reg_no:
                reg_numbers.append(reg_no)
    return reg_numbers


# ─────────────────────────────────────────────────────────────────────────────
# Core sync logic
# ─────────────────────────────────────────────────────────────────────────────

def sync_one(reg_no: str, existing_ids: set, force: bool = False) -> str:
    if reg_no in existing_ids and not force:
        return "skipped"

    info = fetch_student_info(reg_no)
    if not info:
        return "failed"

    student_index = info.get(FIELD_INDEX, reg_no)
    faculty       = get_faculty(student_index, info.get(FIELD_FACULTY, ""))

    img = fetch_photo(student_index)
    if img is None:
        print(f"    No photo for {student_index}")
        return "failed"

    processed, reason = preprocess(img)
    if processed is None:
        processed = img  # use raw if quality check fails

    embeddings = generate_augmented_embeddings(processed, get_embedding_from_image)
    if not embeddings:
        print(f"    No face detected for {student_index}")
        return "failed"

    saved = save_to_db(student_index, faculty, embeddings)
    return "added" if saved else "failed"


def run_sync(limit: int = None, force: bool = False, csv_path: str = None):
    csv_path = csv_path or CSV_PATH

    if not os.path.exists(csv_path):
        print(f"\n  ERROR: CSV not found at {csv_path}")
        print(f"  Place your CSV at: python-ai-service/sample_data/students.csv")
        sys.exit(1)

    reg_numbers = read_csv(csv_path)
    if limit:
        reg_numbers = reg_numbers[:limit]

    existing_ids = get_existing_ids()
    total = len(reg_numbers)

    print(f"\n  Students in CSV:  {total}")
    print(f"  Already in DB:    {len(existing_ids)}")
    print(f"  Will process:     {total}\n")

    added = skipped = failed = 0
    start = time.time()

    for i, reg_no in enumerate(reg_numbers):
        elapsed = time.time() - start
        eta = f"  ETA: {((elapsed/(i+1))*(total-i-1))/60:.1f}m" if i > 0 else ""
        print(f"  [{i+1:04d}/{total}] {reg_no}{eta}", end=" → ")
        sys.stdout.flush()

        result = sync_one(reg_no, existing_ids, force=force)
        existing_ids.add(reg_no)

        if result == "added":
            added += 1
            print("✓ added")
        elif result == "skipped":
            skipped += 1
            print("— already synced")
        else:
            failed += 1
            print("✗ failed")

    duration = time.time() - start
    log_sync(added, skipped, failed, duration)

    print(f"\n{'='*50}")
    print(f"  Sync Complete")
    print(f"{'='*50}")
    print(f"  Added:   {added}")
    print(f"  Skipped: {skipped}")
    print(f"  Failed:  {failed}")
    print(f"  Time:    {duration/60:.1f} minutes")
    print(f"{'='*50}\n")


# ─────────────────────────────────────────────────────────────────────────────
# Scheduler
# ─────────────────────────────────────────────────────────────────────────────

def run_scheduled():
    """Run sync automatically on scheduled dates. Checks every 12 hours."""
    print(f"Scheduler running. Sync dates: {SYNC_SCHEDULE}")
    print("Press Ctrl+C to stop.\n")

    last_sync_date = None
    while True:
        today = datetime.now().date()
        now   = datetime.now()
        if (now.month, now.day) in SYNC_SCHEDULE and last_sync_date != today:
            print(f"\n[{now}] Scheduled sync triggered!")
            run_sync()
            last_sync_date = today
        else:
            print(f"[{now.strftime('%Y-%m-%d %H:%M')}] No sync today. Next check in 12h.")
        time.sleep(12 * 60 * 60)


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Sync student embeddings from University APIs into Sentinel DB"
    )
    parser.add_argument("--limit",    type=int,  default=None, help="Max students to sync")
    parser.add_argument("--reg",      type=str,  default=None, help="Sync one student by reg number")
    parser.add_argument("--force",    action="store_true",     help="Re-sync even if already in DB")
    parser.add_argument("--schedule", action="store_true",     help="Run on schedule 3x per year")
    parser.add_argument("--csv",      type=str,  default=CSV_PATH, help="Path to CSV file")
    args = parser.parse_args()

    print("=" * 50)
    print("  UoP Sentinel — University Sync")
    print("=" * 50)

    check_config()

    # Check Spring Boot is running
    try:
        requests.get(f"{SPRING_BOOT_URL}/health", timeout=5)
        print(f"  Spring Boot: running ✓")
    except Exception:
        print(f"  ERROR: Spring Boot not reachable at {SPRING_BOOT_URL}")
        print(f"  Run: mvn spring-boot:run")
        sys.exit(1)

    if args.schedule:
        run_scheduled()
        return

    if args.reg:
        print(f"\n  Syncing: {args.reg}")
        result = sync_one(args.reg, get_existing_ids(), force=args.force)
        print(f"  Result: {result}")
        return

    run_sync(limit=args.limit, force=args.force, csv_path=args.csv)


if __name__ == "__main__":
    main()
