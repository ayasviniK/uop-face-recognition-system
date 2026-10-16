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
import gc

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass
import base64
import argparse
import threading
import concurrent.futures
import requests
from requests.adapters import HTTPAdapter
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

from utils.embedder import get_embedding_from_image, get_analyzer
from utils.augmentor import (
    generate_augmented_embeddings,
    generate_crop_augmented_embeddings,
    generate_profile_crop_augmented_embeddings,
)
from utils.aligner import align_face
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
USE_MOCK_DB          = os.environ.get("USE_MOCK_DB", "false").lower() in ("1", "true", "yes")
ENABLE_PROFILE_PHOTOS = os.environ.get("ENABLE_PROFILE_PHOTOS", "false").lower() in ("1", "true", "yes")
SYNC_MAX_WORKERS      = int(os.environ.get("SYNC_MAX_WORKERS", "5"))
PHOTO_FETCH_TIMEOUT   = int(os.environ.get("PHOTO_FETCH_TIMEOUT", "7"))

_http_session = None

def get_session() -> requests.Session:
    """Return shared requests Session with connection pooling for maximum throughput."""
    global _http_session
    if _http_session is None:
        _http_session = requests.Session()
        adapter = HTTPAdapter(pool_connections=20, pool_maxsize=30, max_retries=2)
        _http_session.mount("http://", adapter)
        _http_session.mount("https://", adapter)
    return _http_session

CSV_PATH          = os.path.join(os.path.dirname(__file__), "sample_data", "students.csv")
CSV_REG_NO_COLUMN = "Reg_No"

SYNC_SCHEDULE = [
    (1,  1),
    (6,  1),
    (12, 31),
]

FACULTY_MAP = {
    "A":                   "Arts",
    "ART":                 "Arts",
    "ARTS":                "Arts",
    "AG":                  "Agriculture",
    "AGR":                 "Agriculture",
    "AGRI":                "Agriculture",
    "AGRICULTURE":         "Agriculture",
    "AHS":                 "Allied Health Sciences",
    "AH":                  "Allied Health Sciences",
    "ALLIED":              "Allied Health Sciences",
    "ALLIED HEALTH":       "Allied Health Sciences",
    "E":                   "Engineering",
    "ENG":                 "Engineering",
    "ENGINEERING":         "Engineering",
    "M":                   "Medicine",
    "MED":                 "Medicine",
    "MEDICINE":            "Medicine",
    "S":                   "Science",
    "SCI":                 "Science",
    "SCIENCE":             "Science",
    "VS":                  "Veterinary Medicine",
    "VM":                  "Veterinary Medicine",
    "VET":                 "Veterinary Medicine",
    "VETERINARY":          "Veterinary Medicine",
    "D":                   "Dentistry",
    "DT":                  "Dentistry",
    "DEN":                 "Dentistry",
    "DENT":                "Dentistry",
    "DENTAL":              "Dentistry",
    "DENTISTRY":           "Dentistry",
    "MG":                  "Management",
    "MGT":                 "Management",
    "MANAGEMENT":          "Management",
}

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def parse_faculty(reg_no: str) -> str:
    if not reg_no:
        return "Unknown"
    clean = str(reg_no).strip().upper()
    if clean in FACULTY_MAP:
        return FACULTY_MAP[clean]
    if "ALLIED" in clean or "AHS" in clean:
        return "Allied Health Sciences"
    if "AGRICULTURE" in clean or "AGRI" in clean:
        return "Agriculture"
    if "MANAGEMENT" in clean:
        return "Management"
    if "VETERINARY" in clean:
        return "Veterinary Medicine"
    if "DENTISTRY" in clean or "DENTAL" in clean:
        return "Dentistry"
    if "ENGINEERING" in clean:
        return "Engineering"
    if "MEDICINE" in clean:
        return "Medicine"
    if "SCIENCE" in clean:
        return "Science"

    import re
    tokens = re.split(r'[/_\-\.\s]+', clean)
    for t in tokens:
        if len(t) > 1 and t in FACULTY_MAP:
            return FACULTY_MAP[t]
    if tokens and len(tokens[0]) == 1 and tokens[0] in FACULTY_MAP:
        return FACULTY_MAP[tokens[0]]
    for t in tokens:
        if len(t) == 1 and t in FACULTY_MAP:
            return FACULTY_MAP[t]

    m = re.match(r'^([A-Z]+)', clean)
    if m and m.group(1) in FACULTY_MAP:
        return FACULTY_MAP[m.group(1)]

    print(f"    Unknown faculty prefix for: '{reg_no}'")
    return "Unknown"


def parse_year(reg_no: str) -> int | None:
    """
    Extracts the admission/batch year from a UOP student registration/index number.
    e.g. 'A/16/AI/877' -> 2016
         'AHS/14/RAD/FQ/002' -> 2014
         'AG/23/AI/903' -> 2023
         'E/17/063' -> 2017
         '19/ENG/045' -> 2019
    """
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
        r = get_session().get(url, headers=auth_headers(), timeout=PHOTO_FETCH_TIMEOUT)

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
    ids = set()
    try:
        r = get_session().get(
            f"{SPRING_BOOT_URL}/internal/students/ids",
            headers={"X-Internal-API-Key": INTERNAL_API_KEY},
            timeout=15,
        )
        if r.ok:
            res_data = r.json()
            if isinstance(res_data, list):
                ids.update(res_data)
            elif isinstance(res_data, dict):
                ids.update(res_data.get("studentIds", []))
    except Exception:
        pass

    if USE_MOCK_DB:
        try:
            from utils.mock_db import _load
            db_data = _load()
            for sid, s in db_data.get("staff", {}).items():
                if s.get("embeddings") and len(s.get("embeddings")) > 0:
                    ids.add(sid)
        except Exception:
            pass

    return ids


def save_to_db(reg_no: str, faculty: str, embeddings: list[dict], year: int = None, image_b64: str = None) -> bool:
    """
    Save embeddings to Spring Boot/MySQL. Local mock storage is optional.
    Supports up to 10 embedding slots.
    """
    local_saved = False
    if USE_MOCK_DB:
        try:
            from utils.mock_db import register_student
            register_student(
                student_id=reg_no,
                full_name=f"Student ({reg_no})",
                department=faculty,
                year=year,
                embeddings=embeddings,
                image=image_b64,
            )
            local_saved = True
        except Exception as e:
            print(f"    Local mock_db save notice: {e}")

    # 2. Also register in Spring Boot MySQL backend if available
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
    if year:
        payload["year"] = year

    for emb in embeddings:
        field = aug_to_field.get(emb["augmentation"])
        if field:
            payload[field] = emb["embedding"]

    try:
        r = get_session().post(
            f"{SPRING_BOOT_URL}/internal/students/embeddings",
            json=payload,
            headers={
                "Content-Type":      "application/json",
                "X-Internal-API-Key": INTERNAL_API_KEY,
            },
            timeout=10,
        )
        if r.ok:
            return True
        else:
            print(f" (DB save HTTP {r.status_code}: {r.text[:100].strip()})", end="")
    except Exception as e:
        print(f" (DB save error: {e})", end="")

    return local_saved if USE_MOCK_DB else False


def log_sync(added: int, skipped: int, failed: int, replaced: int, duration: float):
    try:
        get_session().post(
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
    seen = set()
    reg_numbers = []
    total_raw = 0
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames or []
        reg_column = next(
            (field for field in fields if field.strip().lower() in {
                "reg_no", "regno", "registration_no", "registrationno", "index", "index_no"
            }),
            CSV_REG_NO_COLUMN,
        )
        for row in reader:
            reg_no = row.get(reg_column, "").strip()
            if reg_no:
                total_raw += 1
                norm = reg_no.upper()
                if norm not in seen:
                    seen.add(norm)
                    reg_numbers.append(reg_no)
    if len(seen) < total_raw:
        print(f"  Note: CSV contains {total_raw} rows ({len(reg_numbers)} unique students, {total_raw - len(reg_numbers)} duplicates automatically deduplicated)")
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

def generate_all_embeddings(reg_no: str) -> tuple[list[dict], str | None]:
    """
    Fetch all available photos for a student and generate embeddings.

    Phase 1: Only front photo available
    Phase 2: Front + Left (_L) + Right (_R) photos available

    Returns tuple of (list of embedding dicts with augmentation names, front_photo_b64).
    Up to 10 total — 6 from front + 2 from left + 2 from right.
    """
    all_embeddings = []

    # Front photo — always required
    front_img = fetch_photo(reg_no)
    if front_img is None:
        return [], None

    front_b64 = None
    try:
        _, buf = cv2.imencode('.jpg', front_img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        front_b64 = f"data:image/jpeg;base64,{base64.b64encode(buf).decode('utf-8')}"
    except Exception:
        pass

    front_processed, _ = preprocess(front_img)
    if front_processed is None:
        front_processed = front_img

    # Fast single-pass face detection + alignment + direct ArcFace augmentation
    analyzer = get_analyzer()
    faces = analyzer.get(front_processed)
    if not faces:
        print(f"    No face detected in front photo for {reg_no}")
        return [], None

    best_face = max(faces, key=lambda f: f.det_score)
    aligned = align_face(front_processed, best_face.kps)
    rec_model = analyzer.models.get("recognition")

    if aligned is not None and rec_model is not None:
        front_embeddings = generate_crop_augmented_embeddings(aligned, rec_model)
    else:
        front_embeddings = generate_augmented_embeddings(front_processed, get_embedding_from_image)

    if not front_embeddings:
        print(f"    No face detected in front photo for {reg_no}")
        return [], None

    all_embeddings.extend(front_embeddings)

    # Profile photos — only if enabled in config (bypasses failed network calls when server only has front photos)
    if ENABLE_PROFILE_PHOTOS:
        # Left profile — optional
        left_img = fetch_photo(reg_no, suffix="_L")
        if left_img is not None:
            left_processed, _ = preprocess(left_img)
            if left_processed is None:
                left_processed = left_img
            left_faces = analyzer.get(left_processed)
            if left_faces:
                best_l = max(left_faces, key=lambda f: f.det_score)
                aligned_l = align_face(left_processed, best_l.kps)
                if aligned_l is not None and rec_model is not None:
                    all_embeddings.extend(generate_profile_crop_augmented_embeddings(aligned_l, rec_model, "left"))
                else:
                    all_embeddings.append({
                        "augmentation": "left_1",
                        "embedding": best_l.normed_embedding.tolist()
                    })

        # Right profile — optional
        right_img = fetch_photo(reg_no, suffix="_R")
        if right_img is not None:
            right_processed, _ = preprocess(right_img)
            if right_processed is None:
                right_processed = right_img
            right_faces = analyzer.get(right_processed)
            if right_faces:
                best_r = max(right_faces, key=lambda f: f.det_score)
                aligned_r = align_face(right_processed, best_r.kps)
                if aligned_r is not None and rec_model is not None:
                    all_embeddings.extend(generate_profile_crop_augmented_embeddings(aligned_r, rec_model, "right"))
                else:
                    all_embeddings.append({
                        "augmentation": "right_1",
                        "embedding": best_r.normed_embedding.tolist()
                    })

    return all_embeddings, front_b64


def sync_one(reg_no: str, existing_ids: set, replace: bool = False) -> str:
    """
    Sync one student.
    Returns: "added", "replaced", "skipped", "failed", "no_face"
    """
    is_duplicate = reg_no in existing_ids

    if is_duplicate and not replace:
        return "skipped"

    faculty = parse_faculty(reg_no)
    year = parse_year(reg_no)
    embeddings, image_b64 = generate_all_embeddings(reg_no)

    if not embeddings:
        return "no_face"

    saved = save_to_db(reg_no, faculty, embeddings, year=year, image_b64=image_b64)
    if not saved:
        return "failed"

    try:
        from utils.audit_logger import log_registration
        log_registration(reg_no, success=True)
    except Exception:
        pass

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
    lock = threading.Lock()
    processed_count = 0

    max_workers = SYNC_MAX_WORKERS

    # Fast skip for duplicates if replace=False
    to_process = []
    for i, reg_no in enumerate(reg_numbers):
        if reg_no in existing_ids and not replace:
            skipped += 1
            print(f"  [{i+1:04d}/{total}] {reg_no} → — skipped (already in DB)")
        else:
            to_process.append((i, reg_no))

    if to_process:
        def process_item(item):
            nonlocal added, replaced, failed, no_face, skipped, processed_count
            idx, reg_no = item
            res = sync_one(reg_no, existing_ids, replace=replace)
            with lock:
                existing_ids.add(reg_no)
                processed_count += 1
                elapsed = time.time() - start
                avg = elapsed / max(1, processed_count)
                eta = f"  ETA: {(avg * (len(to_process) - processed_count)) / 60:.1f}m"

                if res == "added":
                    added += 1
                    status_text = "✓ added"
                elif res == "replaced":
                    replaced += 1
                    status_text = "↻ replaced"
                elif res == "skipped":
                    skipped += 1
                    status_text = "— skipped (already in DB)"
                elif res == "no_face":
                    no_face += 1
                    status_text = "⚠ no face detected (default/placeholder image)"
                else:
                    failed += 1
                    status_text = "✗ failed"

                print(f"  [{idx+1:04d}/{total}] {reg_no}{eta} → {status_text}")
                sys.stdout.flush()

                if processed_count % 15 == 0:
                    gc.collect()

            return res

        workers = min(max_workers, len(to_process))
        if workers > 1:
            print(f"  🚀 Processing {len(to_process)} records with {workers} parallel worker threads...")
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
                list(executor.map(process_item, to_process))
        else:
            for item in to_process:
                process_item(item)

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

    return {
        "total": total,
        "added": added,
        "replaced": replaced,
        "skipped": skipped,
        "noFace": no_face,
        "failed": failed,
        "durationSeconds": round(duration, 2),
    }


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
        print(f"  Spring Boot: running [OK]\n")
    except Exception:
        print(f"  Note: Spring Boot not reachable at {SPRING_BOOT_URL}\n")

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