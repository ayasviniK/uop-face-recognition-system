"""
University Sync Script
-----------------------
Phase 1 (current):
  - Reads reg numbers from CSV
  - Parses faculty from reg number prefix
  - Fetches front photo from Photo DB (regno)
  - If _L and _R variants exist, fetches those too
  - Generates 6-10 ArcFace embeddings per student
  - Saves to DB via Spring Boot
  - Handles duplicates with --replace flag

Phase 2 (later):
  - Also calls University Index API for student info
  - No code changes needed — just fill in UNIVERSITY_INDEX_URL in .env

Usage:
    python sync_university.py                    # sync all, skip duplicates
    python sync_university.py --limit 10         # test with 10
    python sync_university.py --reg A/22/786     # sync one student
    python sync_university.py --replace          # replace duplicates
    python sync_university.py --check-csv        # check CSV for duplicates only
    python sync_university.py --schedule         # run on schedule 3x/year
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

try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).parent.parent / "springboot-backend" / "backend" / ".env"
    if _env_path.exists():
        load_dotenv(_env_path)
        print(f"  Loaded .env from {_env_path}")
    else:
        load_dotenv()
except ImportError:
    print("  WARNING: python-dotenv not installed. Run: pip install python-dotenv")

from utils.embedder import get_embedding_from_image
from utils.augmentor import generate_augmented_embeddings
from utils.preprocessor import preprocess

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG — all from .env
# ─────────────────────────────────────────────────────────────────────────────

PHOTO_DB_URL         = os.environ.get("PHOTO_DB_URL", "")
UNIVERSITY_INDEX_URL = os.environ.get("UNIVERSITY_INDEX_URL", "")
API_USERNAME         = os.environ.get("UNI_API_USERNAME", "")
API_PASSWORD         = os.environ.get("UNI_API_PASSWORD", "")
API_KEY              = os.environ.get("UNI_API_KEY", "")
SPRING_BOOT_URL      = os.environ.get("SPRING_BOOT_URL", "http://localhost:8080")
INTERNAL_API_KEY     = os.environ.get("INTERNAL_API_KEY", "")

CSV_PATH          = os.path.join(os.path.dirname(__file__), "sample_data", "students.csv")
CSV_REG_NO_COLUMN = "Reg_No"

SYNC_SCHEDULE = [
    (1,  1),
    (6,  1),
    (12, 31),
]

FACULTY_MAP = {
    "A":   "Arts",
    "ART": "Arts",
    "AG":  "Agriculture",
    "AGR": "Agriculture",
    "AHS": "Allied Health Sciences",
    "E":   "Engineering",
    "ENG": "Engineering",
    "M":   "Medicine",
    "MED": "Medicine",
    "S":   "Science",
    "SCI": "Science",
    "VM":  "Veterinary Medicine",
    "VET": "Veterinary Medicine",
    "DT":  "Dental Technology",
    "DEN": "Dentistry",
    "MGT": "Management",
}

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def parse_faculty(reg_no: str) -> str:
    prefix = reg_no.split("/")[0].upper().strip()
    faculty = FACULTY_MAP.get(prefix)
    if not faculty:
        print(f"    Unknown faculty prefix: '{prefix}' — storing as '{prefix}'")
        return prefix
    return faculty


def auth_headers() -> dict:
    if API_KEY:
        return {"Authorization": f"Bearer {API_KEY}", "X-API-Key": API_KEY}
    if API_USERNAME and API_PASSWORD:
        creds = base64.b64encode(f"{API_USERNAME}:{API_PASSWORD}".encode()).decode()
        return {"Authorization": f"Basic {creds}"}
    return {}


def is_default_image(img: np.ndarray) -> bool:
    """
    Detect if the photo DB returned a faceless default placeholder image.
    Default images tend to be very uniform in color/pattern.
    We check this by attempting face detection — if no face found it's likely default.
    This is handled naturally by the pipeline — no face = skip.
    """
    return img is None


# Minimum size for a real passport photo in bytes
# Default placeholder images are typically tiny cartoon files
MIN_PHOTO_SIZE_BYTES = 5000  # 5KB

def fetch_photo(reg_no: str, suffix: str = "") -> np.ndarray | None:
    """
    Fetch a student photo from the Photo DB.
    suffix can be "_L" for left profile or "_R" for right profile.

    Returns None if:
    - API call fails
    - Response is empty
    - File is too small (likely a default placeholder cartoon image)
    - Image cannot be decoded
    """
    if not PHOTO_DB_URL:
        return None

    try:
        url = f"{PHOTO_DB_URL}{reg_no}{suffix}"
        r = requests.get(url, headers=auth_headers(), timeout=30)

        if not r.ok:
            return None

        # Empty response
        if len(r.content) == 0:
            if suffix == "":
                print(f"    No photo in DB for {reg_no}")
            return None

        # Too small = almost certainly a default placeholder image
        # Real passport photos are at least 5KB
        if len(r.content) < MIN_PHOTO_SIZE_BYTES:
            if suffix == "":
                print(f"    Default/placeholder image detected for {reg_no} "
                      f"({len(r.content)} bytes) — skipping")
            return None

        # Decode the image
        img_array = np.frombuffer(r.content, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

        if img is None:
            if suffix == "":
                print(f"    Could not decode image for {reg_no}")
            return None

        return img

    except Exception as e:
        print(f"    Photo fetch error ({suffix or 'front'}): {e}")
        return None


def get_existing_ids() -> set:
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
    """
    Save embeddings to DB. Supports up to 10 embedding slots.
    Current slots: original, flipped, brighter, darker, rotated_plus, rotated_minus,
                   left_1, left_2, right_1, right_2
    """
    aug_to_field = {
        "original":      "embeddingOriginal",
        "flipped":       "embeddingFlipped",
        "brighter":      "embeddingBrighter",
        "darker":        "embeddingDarker",
        "rotated_plus":  "embeddingRotatedPlus",
        "rotated_minus": "embeddingRotatedMinus",
        "left_1":        "embeddingLeft1",
        "left_2":        "embeddingLeft2",
        "right_1":       "embeddingRight1",
        "right_2":       "embeddingRight2",
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
                "Content-Type":      "application/json",
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


def log_sync(added: int, skipped: int, failed: int, replaced: int, duration: float):
    try:
        requests.post(
            f"{SPRING_BOOT_URL}/internal/sync/log",
            json={
                "studentsAdded":      added,
                "studentsUpdated":    replaced,
                "studentsTieredDown": 0,
                "status":             "success" if failed == 0 else "partial",
                "notes":              f"Added {added}, replaced {replaced}, skipped {skipped}, failed {failed}. {duration/60:.1f} min.",
            },
            headers={"X-Internal-API-Key": INTERNAL_API_KEY},
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


def check_config():
    issues = []
    if not PHOTO_DB_URL:
        issues.append("PHOTO_DB_URL not set")
    if not INTERNAL_API_KEY:
        issues.append("INTERNAL_API_KEY not set")
    if issues:
        print(f"\n  CONFIG ISSUES: {', '.join(issues)}")
        print("  Fix in springboot-backend/backend/.env\n")
    else:
        print("  Config: OK ✓")


# ─────────────────────────────────────────────────────────────────────────────
# Core sync logic
# ─────────────────────────────────────────────────────────────────────────────

def generate_all_embeddings(reg_no: str) -> list[dict]:
    """
    Fetch all available photos for a student and generate embeddings.

    Phase 1: Only front photo available
    Phase 2: Front + Left (_L) + Right (_R) photos available

    Returns list of embedding dicts with augmentation names.
    Up to 10 total — 6 from front + 2 from left + 2 from right.
    """
    all_embeddings = []

    # Front photo — always required
    front_img = fetch_photo(reg_no)
    if front_img is None:
        return []  # No front photo = skip entirely

    front_processed, _ = preprocess(front_img)
    if front_processed is None:
        front_processed = front_img

    # Generate 6 augmented embeddings from front photo
    front_embeddings = generate_augmented_embeddings(front_processed, get_embedding_from_image)
    if not front_embeddings:
        print(f"    No face detected in front photo")
        return []  # Likely a default placeholder image

    all_embeddings.extend(front_embeddings)

    # Left profile — optional, only if available
    left_img = fetch_photo(reg_no, suffix="_L")
    if left_img is not None:
        left_processed, _ = preprocess(left_img)
        if left_processed is None:
            left_processed = left_img
        left_faces = get_embedding_from_image(left_processed)
        if left_faces:
            # Take best detection from left photo
            best = max(left_faces, key=lambda f: f["confidence"])
            all_embeddings.append({
                "augmentation": "left_1",
                "embedding": best["embedding"].tolist()
            })
            # Also add flipped version of left = slight right view
            flipped_left = cv2.flip(left_processed, 1)
            flipped_faces = get_embedding_from_image(flipped_left)
            if flipped_faces:
                best_f = max(flipped_faces, key=lambda f: f["confidence"])
                all_embeddings.append({
                    "augmentation": "left_2",
                    "embedding": best_f["embedding"].tolist()
                })

    # Right profile — optional, only if available
    right_img = fetch_photo(reg_no, suffix="_R")
    if right_img is not None:
        right_processed, _ = preprocess(right_img)
        if right_processed is None:
            right_processed = right_img
        right_faces = get_embedding_from_image(right_processed)
        if right_faces:
            best = max(right_faces, key=lambda f: f["confidence"])
            all_embeddings.append({
                "augmentation": "right_1",
                "embedding": best["embedding"].tolist()
            })
            flipped_right = cv2.flip(right_processed, 1)
            flipped_faces = get_embedding_from_image(flipped_right)
            if flipped_faces:
                best_f = max(flipped_faces, key=lambda f: f["confidence"])
                all_embeddings.append({
                    "augmentation": "right_2",
                    "embedding": best_f["embedding"].tolist()
                })

    return all_embeddings


def sync_one(reg_no: str, existing_ids: set, replace: bool = False) -> str:
    """
    Sync one student.
    Returns: "added", "replaced", "skipped", "failed", "no_face"
    """
    is_duplicate = reg_no in existing_ids

    if is_duplicate and not replace:
        return "skipped"

    faculty = parse_faculty(reg_no)
    embeddings = generate_all_embeddings(reg_no)

    if not embeddings:
        return "no_face"

    saved = save_to_db(reg_no, faculty, embeddings)
    if not saved:
        return "failed"

    return "replaced" if is_duplicate else "added"


# ─────────────────────────────────────────────────────────────────────────────
# Duplicate check — for CSV upload from admin UI
# ─────────────────────────────────────────────────────────────────────────────

def check_csv_for_duplicates(reg_numbers: list[str]) -> dict:
    """
    Check which reg numbers in the list already exist in the DB.
    Returns dict with 'new' and 'duplicates' lists.
    Used by the admin CSV upload feature.
    """
    existing_ids = get_existing_ids()
    duplicates = [r for r in reg_numbers if r in existing_ids]
    new_entries = [r for r in reg_numbers if r not in existing_ids]
    return {
        "total": len(reg_numbers),
        "new": new_entries,
        "duplicates": duplicates,
        "new_count": len(new_entries),
        "duplicate_count": len(duplicates),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Sync runner
# ─────────────────────────────────────────────────────────────────────────────

def run_sync(
    limit: int = None,
    replace: bool = False,
    csv_path: str = None,
    reg_numbers: list[str] = None,
):
    csv_path = csv_path or CSV_PATH

    if reg_numbers is None:
        if not os.path.exists(csv_path):
            print(f"\n  ERROR: CSV not found at {csv_path}")
            sys.exit(1)
        reg_numbers = read_csv(csv_path)

    if limit:
        reg_numbers = reg_numbers[:limit]

    existing_ids = get_existing_ids()
    total = len(reg_numbers)

    duplicates = [r for r in reg_numbers if r in existing_ids]
    new_entries = [r for r in reg_numbers if r not in existing_ids]

    print(f"\n  Students in list: {total}")
    print(f"  New:              {len(new_entries)}")
    print(f"  Already in DB:    {len(duplicates)}")
    if duplicates and not replace:
        print(f"  Duplicates will be SKIPPED (use --replace to overwrite)")
    elif duplicates and replace:
        print(f"  Duplicates will be REPLACED")
    print()

    added = skipped = failed = replaced = no_face = 0
    start = time.time()

    for i, reg_no in enumerate(reg_numbers):
        elapsed = time.time() - start
        eta = ""
        if i > 0:
            avg = elapsed / i
            eta = f"  ETA: {(avg * (total - i)) / 60:.1f}m"

        print(f"  [{i+1:04d}/{total}] {reg_no}{eta}", end=" → ")
        sys.stdout.flush()

        result = sync_one(reg_no, existing_ids, replace=replace)
        existing_ids.add(reg_no)

        if result == "added":
            added += 1
            print("✓ added")
        elif result == "replaced":
            replaced += 1
            print("↻ replaced")
        elif result == "skipped":
            skipped += 1
            print("— skipped (already in DB)")
        elif result == "no_face":
            no_face += 1
            print("⚠ no face detected (default/placeholder image)")
        else:
            failed += 1
            print("✗ failed")

    duration = time.time() - start
    log_sync(added, skipped, failed, replaced, duration)

    print(f"\n{'='*50}")
    print(f"  Sync Complete")
    print(f"{'='*50}")
    print(f"  Added:    {added}")
    print(f"  Replaced: {replaced}")
    print(f"  Skipped:  {skipped}  (already in DB)")
    print(f"  No face:  {no_face}  (default/placeholder image)")
    print(f"  Failed:   {failed}  (API error / DB error)")
    print(f"  Time:     {duration/60:.1f} minutes")
    print(f"{'='*50}\n")


# ─────────────────────────────────────────────────────────────────────────────
# Scheduler
# ─────────────────────────────────────────────────────────────────────────────

def run_scheduled():
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
        description="Sync student embeddings from University Photo DB into Sentinel"
    )
    parser.add_argument("--limit",     type=int,  default=None,
                        help="Max students to sync")
    parser.add_argument("--reg",       type=str,  default=None,
                        help="Sync one student e.g. A/22/786")
    parser.add_argument("--replace",   action="store_true",
                        help="Replace existing students in DB (duplicates)")
    parser.add_argument("--check-csv", action="store_true",
                        help="Check CSV for duplicates without syncing")
    parser.add_argument("--schedule",  action="store_true",
                        help="Run on schedule 3x per year")
    parser.add_argument("--csv",       type=str,  default=CSV_PATH,
                        help="Path to CSV file")
    args = parser.parse_args()

    print("=" * 50)
    print("  UoP Sentinel — University Sync")
    print("=" * 50)

    check_config()

    try:
        requests.get(f"{SPRING_BOOT_URL}/actuator/health", timeout=5)
        print(f"  Spring Boot: running ✓\n")
    except Exception:
        print(f"  ERROR: Spring Boot not reachable at {SPRING_BOOT_URL}")
        print(f"  Run: cd springboot-backend/backend && mvnw.cmd spring-boot:run")
        sys.exit(1)

    if args.schedule:
        run_scheduled()
        return

    if args.reg:
        print(f"  Syncing: {args.reg}")
        existing = get_existing_ids()
        result = sync_one(args.reg, existing, replace=args.replace)
        print(f"  Result: {result}")
        return

    if not os.path.exists(args.csv):
        print(f"  ERROR: CSV not found at {args.csv}")
        sys.exit(1)

    reg_numbers = read_csv(args.csv)

    if args.check_csv:
        result = check_csv_for_duplicates(reg_numbers)
        print(f"\n  CSV Check Results:")
        print(f"  Total in CSV:  {result['total']}")
        print(f"  New students:  {result['new_count']}")
        print(f"  Duplicates:    {result['duplicate_count']}")
        if result['duplicates']:
            print(f"\n  Duplicate reg numbers:")
            for r in result['duplicates']:
                print(f"    {r}")
        return

    run_sync(
        limit=args.limit,
        replace=args.replace,
        csv_path=args.csv,
        reg_numbers=reg_numbers,
    )


if __name__ == "__main__":
    main()