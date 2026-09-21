"""
University Sync Script
-----------------------
Phase 1 (current):
  - Reads reg numbers from CSV
  - Parses faculty from reg number prefix (A/ = Arts, E/ = Engineering etc.)
  - Calls Photo DB API with reg number to get passport photo
  - Generates ArcFace embeddings + 6 augmentations
  - Saves student_id + faculty + embeddings to DB via Spring Boot

Phase 2 (later — when university gives API access):
  - Also calls University Index API to get student info
  - No code changes needed — just fill in UNIVERSITY_INDEX_URL in .env

All credentials read from springboot-backend/backend/.env
NEVER hardcode URLs or passwords here.

Usage:
    python sync_university.py              # sync all from CSV
    python sync_university.py --limit 10   # test with 10 first
    python sync_university.py --reg A/16/AI/877  # sync one student
    python sync_university.py --schedule   # run on schedule 3x/year
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

# Load .env from springboot-backend/backend/.env
try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).parent.parent / "springboot-backend" / "backend" / ".env"
    if _env_path.exists():
        load_dotenv(_env_path)
        print(f"  Loaded .env from {_env_path}")
    else:
        load_dotenv()  # fallback: look in current directory
except ImportError:
    print("  WARNING: python-dotenv not installed. Run: pip install python-dotenv")
    print("  Reading from system environment variables only.")

from utils.embedder import get_embedding_from_image
from utils.augmentor import generate_augmented_embeddings
from utils.preprocessor import preprocess

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG — all from .env
# ─────────────────────────────────────────────────────────────────────────────

# Photo DB — call with reg number to get passport photo
# e.g. https://photodb.university.lk/photos/A/16/AI/877
PHOTO_DB_URL     = os.environ.get("PHOTO_DB_URL", "")

# University Index API — optional for now, used in Phase 2
UNIVERSITY_INDEX_URL = os.environ.get("UNIVERSITY_INDEX_URL", "")

# API credentials
API_USERNAME     = os.environ.get("UNI_API_USERNAME", "")
API_PASSWORD     = os.environ.get("UNI_API_PASSWORD", "")
API_KEY          = os.environ.get("UNI_API_KEY", "")

# Spring Boot
SPRING_BOOT_URL  = os.environ.get("SPRING_BOOT_URL", "http://localhost:8080")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "")

# CSV
CSV_PATH          = os.path.join(os.path.dirname(__file__), "sample_data", "students.csv")
CSV_REG_NO_COLUMN = "Reg_No"

# Scheduled sync dates (month, day) — 3 times per year
SYNC_SCHEDULE = [
    (1,  1),   # January 1
    (6,  1),   # June 1
    (12, 31),  # December 31
]

# Faculty prefix map
# First segment of reg number (before first /) = faculty code
# e.g. A/16/AI/877 → "A" → Arts
#      AHS/14/RAD/FQ/002 → "AHS" → Allied Health Sciences
#      AG/16/FQ/002 → "AG" → Agriculture
FACULTY_MAP = {
    "A":   "Arts",
    "AG":  "Agriculture",
    "AHS": "Allied Health Sciences",
    "E":   "Engineering",
    "M":   "Medicine",
    "S":   "Science",
    "VM":  "Veterinary Medicine",
    "DT":  "Dental Technology",
    "MGT": "Management",
    "DEN": "Dentistry",
    # Add more as you discover them from the CSV
}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def parse_faculty(reg_no: str) -> str:
    """
    Parse faculty from reg number prefix.
    A/16/AI/877     → first part = "A"  → Arts
    AHS/14/RAD/002  → first part = "AHS" → Allied Health Sciences
    AG/16/FQ/002    → first part = "AG"  → Agriculture
    """
    prefix = reg_no.split("/")[0].upper().strip()
    faculty = FACULTY_MAP.get(prefix)
    if not faculty:
        print(f"    Unknown faculty prefix: '{prefix}' in {reg_no} — storing as '{prefix}'")
        return prefix
    return faculty


def auth_headers() -> dict:
    """Build auth headers from .env credentials."""
    if API_KEY:
        return {
            "Authorization": f"Bearer {API_KEY}",
            "X-API-Key": API_KEY,
        }
    if API_USERNAME and API_PASSWORD:
        creds = base64.b64encode(
            f"{API_USERNAME}:{API_PASSWORD}".encode()
        ).decode()
        return {"Authorization": f"Basic {creds}"}
    return {}


def fetch_photo(reg_no: str) -> np.ndarray | None:
    """
    Call Photo DB API with reg number → get passport photo.

    Current assumption: API returns raw image bytes.
    If API returns JSON with a photo URL instead,
    uncomment Option 2 below.
    """
    if not PHOTO_DB_URL:
        print("  ERROR: PHOTO_DB_URL not set in .env")
        return None

    try:
        url = f"{PHOTO_DB_URL}{reg_no}"
        r = requests.get(url, headers=auth_headers(), timeout=30)

        if r.status_code == 404:
            print(f"    Photo not found for {reg_no}")
            return None
        if r.status_code == 401:
            print("    AUTH ERROR — check UNI_API_USERNAME/PASSWORD in .env")
            return None
        if not r.ok:
            print(f"    Photo DB error {r.status_code} for {reg_no}")
            return None

        # Option 1: API returns raw image bytes directly
        img_array = np.frombuffer(r.content, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if img is not None:
            return img

        # Option 2: API returns JSON with a photo URL
        # Uncomment this block if Option 1 doesn't work:
        # data = r.json()
        # photo_url = data.get("photo_url") or data.get("image_url") or data.get("photo")
        # if photo_url:
        #     r2 = requests.get(photo_url, headers=auth_headers(), timeout=30)
        #     arr = np.frombuffer(r2.content, np.uint8)
        #     return cv2.imdecode(arr, cv2.IMREAD_COLOR)

        print(f"    Could not decode image for {reg_no}")
        return None

    except requests.exceptions.ConnectionError:
        print(f"    CONNECTION ERROR — cannot reach photo DB")
        print(f"    Check university network connection")
        return None
    except Exception as e:
        print(f"    Photo fetch error: {e}")
        return None


def get_existing_ids() -> set:
    """Get student IDs already in DB — to skip re-syncing."""
    try:
        r = requests.get(
            f"{SPRING_BOOT_URL}/internal/students/ids",
            headers={"X-Internal-API-Key": INTERNAL_API_KEY},
            timeout=10,
        )
        if r.ok:
            return set(r.json().get("studentIds", []))
    except Exception:
        pass
    return set()


def save_to_db(reg_no: str, faculty: str, embeddings: list[dict]) -> bool:
    """Save reg_no + faculty + 6 embeddings to MySQL via Spring Boot."""
    aug_to_field = {
        "original":      "embeddingOriginal",
        "flipped":       "embeddingFlipped",
        "brighter":      "embeddingBrighter",
        "darker":        "embeddingDarker",
        "rotated_plus":  "embeddingRotatedPlus",
        "rotated_minus": "embeddingRotatedMinus",
    }

    payload = {
        "studentId": reg_no,
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
                "X-Internal-API-Key": INTERNAL_API_KEY,
            },
            timeout=30,
        )
        if not r.ok:
            print(f"    DB save failed: {r.status_code} — {r.text[:100]}")
        return r.ok
    except Exception as e:
        print(f"    DB save error: {e}")
        return False


def log_sync(added: int, skipped: int, failed: int, duration: float):
    """Log sync run to Spring Boot's sync_log table."""
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
            headers={"X-Internal-API-Key": INTERNAL_API_KEY},
            timeout=10,
        )
    except Exception:
        pass


def read_csv(path: str) -> list[str]:
    """Read Reg_No column from CSV."""
    reg_numbers = []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            reg_no = row.get(CSV_REG_NO_COLUMN, "").strip()
            if reg_no:
                reg_numbers.append(reg_no)
    return reg_numbers


def check_config():
    """Warn about missing required config."""
    issues = []
    if not PHOTO_DB_URL:
        issues.append("PHOTO_DB_URL not set — cannot fetch photos")
    if not INTERNAL_API_KEY:
        issues.append("INTERNAL_API_KEY not set — cannot save to DB")
    if issues:
        print("\n  CONFIG ISSUES:")
        for issue in issues:
            print(f"    ✗ {issue}")
        print("  Fix these in springboot-backend/backend/.env\n")
    else:
        print("  Config: OK ✓")


# ─────────────────────────────────────────────────────────────────────────────
# Core sync logic
# ─────────────────────────────────────────────────────────────────────────────

def sync_one(reg_no: str, existing_ids: set, force: bool = False) -> str:
    """
    Sync one student. Returns "added", "skipped", or "failed".

    Flow:
    1. Skip if already in DB (unless --force)
    2. Parse faculty from reg number prefix
    3. Fetch photo from Photo DB API
    4. Preprocess image
    5. Generate 6 augmented embeddings
    6. Save to DB via Spring Boot
    """
    # Step 1
    if reg_no in existing_ids and not force:
        return "skipped"

    # Step 2
    faculty = parse_faculty(reg_no)

    # Step 3
    img = fetch_photo(reg_no)
    if img is None:
        return "failed"

    # Step 4
    processed, reason = preprocess(img)
    if processed is None:
        # Use raw if quality check fails —
        # some passport scans are low quality but still have a detectable face
        processed = img

    # Step 5
    embeddings = generate_augmented_embeddings(processed, get_embedding_from_image)
    if not embeddings:
        print(f"    No face detected for {reg_no}")
        return "failed"

    # Step 6
    saved = save_to_db(reg_no, faculty, embeddings)
    return "added" if saved else "failed"


# ─────────────────────────────────────────────────────────────────────────────
# Sync runner
# ─────────────────────────────────────────────────────────────────────────────

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
        eta = ""
        if i > 0:
            avg = elapsed / i
            eta = f"  ETA: {(avg * (total - i)) / 60:.1f}m"

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
    """Run sync on schedule — checks every 12 hours."""
    print(f"Scheduler running. Sync dates: {SYNC_SCHEDULE}")
    print("Press Ctrl+C to stop.\n")
    last_sync_date = None
    while True:
        now   = datetime.now()
        today = now.date()
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
        description="Sync student embeddings from Photo DB into Sentinel"
    )
    parser.add_argument("--limit",    type=int,  default=None,
                        help="Max students to sync (default: all)")
    parser.add_argument("--reg",      type=str,  default=None,
                        help="Sync one student by reg number e.g. A/16/AI/877")
    parser.add_argument("--force",    action="store_true",
                        help="Re-sync even if already in DB")
    parser.add_argument("--schedule", action="store_true",
                        help="Run on schedule 3x per year")
    parser.add_argument("--csv",      type=str,  default=CSV_PATH,
                        help="Path to CSV file")
    args = parser.parse_args()

    print("=" * 50)
    print("  UoP Sentinel — University Sync")
    print("=" * 50)

    check_config()

    # Check Spring Boot is running
    try:
        requests.get(f"{SPRING_BOOT_URL}/health", timeout=5)
        print(f"  Spring Boot: running ✓\n")
    except Exception:
        print(f"  ERROR: Spring Boot not reachable at {SPRING_BOOT_URL}")
        print(f"  Run: cd springboot-backend/backend && mvn spring-boot:run")
        sys.exit(1)

    if args.schedule:
        run_scheduled()
        return

    if args.reg:
        print(f"  Syncing single student: {args.reg}")
        existing = get_existing_ids()
        result = sync_one(args.reg, existing, force=args.force)
        print(f"  Result: {result}")
        return

    run_sync(limit=args.limit, force=args.force, csv_path=args.csv)


if __name__ == "__main__":
    main()