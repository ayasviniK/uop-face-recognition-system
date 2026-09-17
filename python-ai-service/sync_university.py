"""
University Sync Script
-----------------------
Reads student registration numbers from a CSV file,
fetches student info from the University Index API,
fetches passport photos from the University Photo DB API,
generates ArcFace embeddings + 6 augmentations,
and saves them to YOUR database via Spring Boot.

After a match is found during identification, Spring Boot
uses the matched student index to call the university APIs
again and fetch name, photo, faculty for the dashboard.
Flask only stores: index + faculty + embeddings. Nothing else.

Usage:
    python sync_university.py              # sync all from CSV
    python sync_university.py --limit 50   # sync first 50 only
    python sync_university.py --reg A/16/AI/877  # sync one student
    python sync_university.py --schedule   # run on schedule (3x per year)
    python sync_university.py --force      # re-sync even if already in DB

Configuration:
    Fill in the CONFIG section below when you get API access from admins.
"""

import os
import sys
import csv
import time
import argparse
import requests
import cv2
import numpy as np
from datetime import datetime, timezone

from utils.embedder import get_embedding_from_image
from utils.augmentor import generate_augmented_embeddings
from utils.preprocessor import preprocess

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG — UPDATE THESE when you get access from admins
# ─────────────────────────────────────────────────────────────────────────────

# University Index API — returns student info (index, faculty etc.)
# Call format: UNIVERSITY_INDEX_URL/{reg_no}
# e.g. https://api.university.lk/students/A/16/AI/877
UNIVERSITY_INDEX_URL = "https://stud.pdn.ac.lk/view.php?regno=Ag/15/002"

# University Photo DB — returns the student's passport photo
# Call format: PHOTO_DB_URL/{student_index}
# e.g. https://photodb.university.lk/photos/A/16/AI/877
PHOTO_DB_URL = "https://stud.pdn.ac.lk/student_image_view.php?regno=A/22/786"

# API credentials — fill in when admins give you access
API_USERNAME = ""   # username if basic auth
API_PASSWORD = ""   # password if basic auth
API_KEY      = ""   # API key if they use key-based auth

# Spring Boot — where YOUR embeddings are saved
SPRING_BOOT_URL  = "http://localhost:8080"
INTERNAL_API_KEY = "sentinel_internal_key_2026"  # must match .env file

# CSV file path
CSV_PATH           = os.path.join(os.path.dirname(__file__), "sample_data", "students.csv")
CSV_REG_NO_COLUMN  = "Reg_No"  # column name in your CSV

# API field names — UPDATE when you see the real API response
# e.g. if API returns {"registration": "A/16/AI/877"} change FIELD_INDEX to "registration"
FIELD_INDEX   = "index"      # field name for student index in API response
FIELD_FACULTY = "faculty_id" # field name for faculty in API response

# Scheduled sync dates (month, day) — runs 3 times per year
SYNC_SCHEDULE = [
    (1,  1),   # January 1   — start of year / new intake
    (6,  1),   # June 1      — mid year
    (12, 31),  # December 31 — end of year
]

# ─────────────────────────────────────────────────────────────────────────────
# Faculty prefix map — parse faculty from reg number
# UPDATE: add all prefixes once confirmed with university
# ─────────────────────────────────────────────────────────────────────────────

FACULTY_MAP = {
    "A":   "Arts",
    "AG":  "Agriculture",
    "AHS": "Allied Health Sciences",
    "E":   "Engineering",
    "M":   "Medicine",
    "S":   "Science",
    "MG":  "Management",
    "VM":  "Veterinary Medicine",
    "DT":  "Dental Technology",
}


def get_faculty(student_index: str, faculty_from_api: str = "") -> str:
    """Get faculty from API response or parse from index prefix."""
    if faculty_from_api:
        return faculty_from_api
    prefix = student_index.split("/")[0].upper()
    return FACULTY_MAP.get(prefix, f"Unknown ({prefix})")


# ─────────────────────────────────────────────────────────────────────────────
# API helpers
# ─────────────────────────────────────────────────────────────────────────────

def auth_headers() -> dict:
    """Build auth headers based on what credentials you have."""
    if API_KEY:
        return {"Authorization": f"Bearer {API_KEY}", "X-API-Key": API_KEY}
    if API_USERNAME and API_PASSWORD:
        import base64
        creds = base64.b64encode(f"{API_USERNAME}:{API_PASSWORD}".encode()).decode()
        return {"Authorization": f"Basic {creds}"}
    return {}


def fetch_student_info(reg_no: str) -> dict | None:
    """
    Call University Index API → get student info.

    Returns dict with at minimum FIELD_INDEX and FIELD_FACULTY,
    or None if not found or API error.

    UPDATE: Check actual field names from API response and update
    FIELD_INDEX and FIELD_FACULTY in CONFIG above.
    """
    try:
        r = requests.get(
            f"{UNIVERSITY_INDEX_URL}/{reg_no}",
            headers=auth_headers(),
            timeout=15,
        )
        if r.status_code == 404:
            return None
        if r.status_code == 401:
            print("  AUTH ERROR — check API credentials in CONFIG")
            return None
        if not r.ok:
            print(f"  API ERROR {r.status_code} for {reg_no}")
            return None
        return r.json()

    except requests.exceptions.ConnectionError:
        print(f"  CONNECTION ERROR — cannot reach university API")
        print(f"  Check you are connected to the university network")
        return None
    except Exception as e:
        print(f"  ERROR: {e}")
        return None


def fetch_photo(student_index: str) -> np.ndarray | None:
    """
    Call University Photo DB → get student passport photo as OpenCV image.

    The API likely returns raw image bytes directly.
    If it returns JSON with a photo URL instead, uncomment Option 2 below.
    """
    try:
        r = requests.get(
            f"{PHOTO_DB_URL}/{student_index}",
            headers=auth_headers(),
            timeout=30,
        )
        if not r.ok:
            return None

        # Option 1: API returns raw image bytes (most common)
        img_array = np.frombuffer(r.content, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        return img

        # Option 2: API returns JSON with a photo URL
        # Uncomment this block if Option 1 doesn't work:
        # data = r.json()
        # photo_url = data.get("photo_url") or data.get("image_url") or data.get("photo")
        # if not photo_url:
        #     return None
        # r2 = requests.get(photo_url, headers=auth_headers(), timeout=30)
        # img_array = np.frombuffer(r2.content, np.uint8)
        # return cv2.imdecode(img_array, cv2.IMREAD_COLOR)

    except Exception as e:
        print(f"  Photo fetch error: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Spring Boot helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_existing_ids() -> set:
    """Get student IDs already in YOUR database — to skip re-syncing."""
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
    """
    Save student index + faculty + embeddings to YOUR database.

    Spring Boot stores this. Later when a face is matched,
    Spring Boot uses the returned student_index to call the
    university APIs and fetch name, photo, faculty for the dashboard.

    We never store name or photo here — only the math (embeddings)
    and the key (student_index + faculty) needed to look them up.
    """
    # Build payload — one field per augmentation
    payload = {
        "studentId": student_index,
        "faculty":   faculty,
        "tier":      1,
    }

    aug_to_field = {
        "original":      "embeddingOriginal",
        "flipped":       "embeddingFlipped",
        "brighter":      "embeddingBrighter",
        "darker":        "embeddingDarker",
        "rotated_plus":  "embeddingRotatedPlus",
        "rotated_minus": "embeddingRotatedMinus",
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
                "Content-Type":  "application/json",
                "X-Internal-Key": INTERNAL_API_KEY,
            },
            timeout=30,
        )
        return r.ok
    except Exception as e:
        print(f"  DB save error: {e}")
        return False


def log_sync(added: int, skipped: int, failed: int, duration: float) -> None:
    """Log sync run to Spring Boot's sync_log table."""
    try:
        requests.post(
            f"{SPRING_BOOT_URL}/internal/sync/log",
            json={
                "studentsAdded":      added,
                "studentsUpdated":    0,
                "studentsTieredDown": 0,
                "status":             "success" if failed == 0 else "partial",
                "notes":              f"Added {added}, skipped {skipped}, failed {failed}. Took {duration/60:.1f} min.",
            },
            headers={"X-Internal-Key": INTERNAL_API_KEY},
            timeout=10,
        )
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# Core sync logic
# ─────────────────────────────────────────────────────────────────────────────

def sync_one(reg_no: str, existing_ids: set, force: bool = False) -> str:
    """
    Sync one student. Returns "added", "skipped", or "failed".

    Full flow:
    1. Skip if already in DB (unless --force)
    2. Fetch student info from University Index API
    3. Fetch photo from University Photo DB API
    4. Preprocess photo
    5. Generate 6 augmented embeddings
    6. Save index + faculty + embeddings to YOUR DB via Spring Boot
    """
    # Step 1: Skip if already synced
    if reg_no in existing_ids and not force:
        return "skipped"

    # Step 2: Fetch student info
    info = fetch_student_info(reg_no)
    if not info:
        return "failed"

    student_index = info.get(FIELD_INDEX, reg_no)
    faculty       = get_faculty(student_index, info.get(FIELD_FACULTY, ""))

    # Step 3: Fetch photo
    img = fetch_photo(student_index)
    if img is None:
        print(f"    No photo for {student_index}")
        return "failed"

    # Step 4: Preprocess
    processed, reason = preprocess(img)
    if processed is None:
        # Use raw image if quality check fails — some passport photos
        # are low quality but still have a detectable face
        processed = img

    # Step 5: Generate 6 augmented embeddings
    embeddings = generate_augmented_embeddings(processed, get_embedding_from_image)
    if not embeddings:
        print(f"    No face detected for {student_index}")
        return "failed"

    # Step 6: Save to YOUR DB
    saved = save_to_db(student_index, faculty, embeddings)
    return "added" if saved else "failed"


def read_csv(path: str) -> list[str]:
    """Read registration numbers from CSV."""
    reg_numbers = []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            reg_no = row.get(CSV_REG_NO_COLUMN, "").strip()
            if reg_no:
                reg_numbers.append(reg_no)
    return reg_numbers


# ─────────────────────────────────────────────────────────────────────────────
# Scheduler — runs sync 3 times per year
# ─────────────────────────────────────────────────────────────────────────────

def should_sync_today() -> bool:
    """Check if today is a scheduled sync date."""
    today = datetime.now()
    return (today.month, today.day) in SYNC_SCHEDULE


def run_scheduled():
    """
    Run sync on a schedule — check every 12 hours if today is a sync date.

    Scheduled dates (edit SYNC_SCHEDULE in CONFIG):
      - January 1   — new year / new intake
      - June 1      — mid year
      - December 31 — end of year

    Run this as a background process:
      python sync_university.py --schedule

    Or set it up as a Windows scheduled task to start on boot.
    """
    print("Scheduler started. Checks every 12 hours.")
    print(f"Sync dates: {SYNC_SCHEDULE}")
    print("Press Ctrl+C to stop.\n")

    last_sync_date = None

    while True:
        today = datetime.now().date()

        if should_sync_today() and last_sync_date != today:
            print(f"\n[{datetime.now()}] Scheduled sync triggered!")
            run_sync()
            last_sync_date = today
        else:
            next_check = datetime.now().strftime("%Y-%m-%d %H:%M")
            print(f"[{next_check}] No sync needed today. Next check in 12 hours.")

        # Sleep 12 hours
        time.sleep(12 * 60 * 60)


# ─────────────────────────────────────────────────────────────────────────────
# Main sync runner
# ─────────────────────────────────────────────────────────────────────────────

def run_sync(limit: int = None, force: bool = False, csv_path: str = None):
    """Run the full sync from CSV → APIs → DB."""

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

    print(f"\n  Students in CSV:    {total}")
    print(f"  Already in DB:      {len(existing_ids)}")
    print(f"  Will process:       {total}\n")

    added = skipped = failed = 0
    start = time.time()

    for i, reg_no in enumerate(reg_numbers):
        elapsed = time.time() - start
        eta = f"  ETA: {((elapsed / (i+1)) * (total - i - 1)) / 60:.1f}m" if i > 0 else ""

        print(f"  [{i+1:04d}/{total}] {reg_no}{eta}", end=" → ")
        sys.stdout.flush()

        result = sync_one(reg_no, existing_ids, force=force)

        if result == "added":
            added += 1
            print("✓ added")
        elif result == "skipped":
            skipped += 1
            print("— already synced")
        else:
            failed += 1
            print("✗ failed")

        # Update existing_ids so we don't re-process in same run
        existing_ids.add(reg_no)

    duration = time.time() - start
    log_sync(added, skipped, failed, duration)

    print(f"\n{'='*50}")
    print(f"  Sync Complete")
    print(f"{'='*50}")
    print(f"  Added:   {added}")
    print(f"  Skipped: {skipped}  (already in DB)")
    print(f"  Failed:  {failed}  (no photo / no face / API error)")
    print(f"  Time:    {duration/60:.1f} minutes")
    print(f"{'='*50}\n")


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Sync student embeddings from University APIs into Sentinel DB"
    )
    parser.add_argument("--limit", type=int, default=None,
                        help="Max students to sync")
    parser.add_argument("--reg", type=str, default=None,
                        help="Sync a single student by reg number")
    parser.add_argument("--force", action="store_true",
                        help="Re-sync even if already in DB")
    parser.add_argument("--schedule", action="store_true",
                        help="Run on schedule (3x per year)")
    parser.add_argument("--csv", type=str, default=CSV_PATH,
                        help="Path to CSV file")
    args = parser.parse_args()

    print("=" * 50)
    print("  UoP Sentinel — University Sync")
    print("=" * 50)

    # Check Spring Boot is running
    try:
        requests.get(f"{SPRING_BOOT_URL}/health", timeout=5)
        print(f"\n  Spring Boot: running ✓")
    except Exception:
        print(f"\n  ERROR: Spring Boot not reachable at {SPRING_BOOT_URL}")
        print(f"  Run: mvn spring-boot:run")
        sys.exit(1)

    # Scheduled mode
    if args.schedule:
        run_scheduled()
        return

    # Single student mode
    if args.reg:
        print(f"\n  Syncing: {args.reg}")
        existing = get_existing_ids()
        result = sync_one(args.reg, existing, force=args.force)
        print(f"  Result: {result}")
        return

    # Full sync from CSV
    run_sync(limit=args.limit, force=args.force, csv_path=args.csv)


if __name__ == "__main__":
    main()
