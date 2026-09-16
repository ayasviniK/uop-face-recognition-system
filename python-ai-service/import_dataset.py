"""
Batch Dataset Importer
-----------------------
Downloads the Kaggle human faces dataset and batch-registers
fake students into the UoP face recognition system.

Usage:
    python import_dataset.py                  # register 100 students (default)
    python import_dataset.py --limit 50       # register 50 students
    python import_dataset.py --limit 500      # register 500 students
    python import_dataset.py --list-folders   # just inspect dataset structure
"""

import os
import sys
import json
import random
import argparse
import time
import requests
from pathlib import Path
from datetime import datetime, timezone

# ── Config ────────────────────────────────────────────────────────────────────

FLASK_BASE_URL = "http://127.0.0.1:5000"
REPORT_PATH    = os.path.join(os.path.dirname(__file__), "data", "import_report.json")

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

AI_FOLDER_KEYWORDS = [
    "ai", "artificial", "generated", "fake", "synthetic",
    "gan", "stylegan", "diffusion", "ai_generated", "ai-generated"
]

DEPARTMENTS = [
    "Computer Science",
    "Engineering Technology",
    "Mathematics",
    "Physics",
    "Statistics",
    "Information Technology",
]

FIRST_NAMES = [
    "Kasun", "Dilshan", "Nuwan", "Sachith", "Tharaka", "Ravindu",
    "Ishara", "Sithum", "Dineth", "Chamath", "Supun", "Lahiru",
    "Amali", "Dilini", "Nimesha", "Sanduni", "Thisari", "Kavindi",
    "Ruwani", "Nethmi", "Hansika", "Dewmini", "Piyumi", "Malsha",
    "Thilina", "Hiruni", "Senuri", "Dulani", "Praveen", "Asanka",
]

LAST_NAMES = [
    "Perera", "Silva", "Fernando", "Jayasinghe", "Wickramasinghe",
    "Bandara", "Rajapaksa", "Gunasekara", "Dissanayake", "Madushanka",
    "Kumara", "Senanayake", "Ranasinghe", "Herath", "Pathirana",
    "Weerasinghe", "Liyanage", "Karunaratne", "Mendis", "Siriwardena",
]

DEPT_CODES = {
    "Computer Science":       "CS",
    "Engineering Technology": "ET",
    "Mathematics":            "MA",
    "Physics":                "PH",
    "Statistics":             "ST",
    "Information Technology": "IT",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def is_ai_folder(name: str) -> bool:
    name_lower = name.lower().replace("-", "_").replace(" ", "_")
    return any(kw in name_lower for kw in AI_FOLDER_KEYWORDS)


def find_real_image_folders(dataset_path: str):
    root = Path(dataset_path)
    real = []
    skipped = []

    entries = sorted(root.iterdir())
    has_images_in_root = any(
        e.suffix.lower() in IMAGE_EXTENSIONS for e in entries if e.is_file()
    )

    if has_images_in_root:
        print(f"  Images found directly in root folder.")
        real.append(str(root))
        return real, skipped

    for item in entries:
        if not item.is_dir():
            continue
        if is_ai_folder(item.name):
            skipped.append(str(item))
            print(f"  Skipping (AI/generated): {item.name}/")
        else:
            real.append(str(item))
            print(f"  Real folder: {item.name}/")

    return real, skipped


def collect_images(real_folders: list, limit: int) -> list:
    all_images = []

    for folder in real_folders:
        folder_path = Path(folder)

        # Walk up to 3 levels deep, skipping AI folders at every level
        def walk(path, depth=0):
            if depth > 3:
                return
            for f in path.iterdir():
                if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS:
                    all_images.append(str(f))
                elif f.is_dir() and not is_ai_folder(f.name):
                    walk(f, depth + 1)

        walk(folder_path)

    all_images = list(set(all_images))
    random.shuffle(all_images)

    print(f"\n  Total real images found: {len(all_images)}")
    print(f"  Will register: {min(limit, len(all_images))} students\n")

    return all_images[:limit]


def generate_student_record(index: int) -> dict:
    department    = random.choice(DEPARTMENTS)
    dept_code     = DEPT_CODES[department]
    year_enrolled = random.choice([2021, 2022, 2023, 2024])
    student_num   = str(index + 1).zfill(3)
    student_id    = f"UOP{year_enrolled}{dept_code}{student_num}"
    first_name    = random.choice(FIRST_NAMES)
    last_name     = random.choice(LAST_NAMES)
    full_name     = f"{first_name} {last_name}"
    email         = f"{first_name.lower()}.{last_name.lower()}{student_num}@sci.pdn.ac.lk"
    year          = random.randint(1, 4)

    return {
        "student_id": student_id,
        "full_name":  full_name,
        "department": department,
        "year":       str(year),
        "email":      email,
    }


def check_flask_running(base_url: str) -> bool:
    try:
        resp = requests.get(f"{base_url}/health", timeout=5)
        data = resp.json()
        print(f"  Flask: {data.get('status')}  "
              f"({data.get('students_registered', 0)} students already registered)\n")
        return True
    except Exception:
        return False


def register_student(base_url: str, image_path: str, student: dict) -> dict:
    try:
        ext  = Path(image_path).suffix.lower()
        mime = "image/jpeg" if ext in {".jpg", ".jpeg"} else "image/png"

        with open(image_path, "rb") as img_file:
            response = requests.post(
                f"{base_url}/register",
                files={"image": (Path(image_path).name, img_file, mime)},
                data=student,
                timeout=60,
            )

        if response.status_code == 201:
            data = response.json()
            return {
                "success":             True,
                "student_id":          student["student_id"],
                "full_name":           student["full_name"],
                "embeddings_generated": data.get("embeddings_generated", 0),
                "detection_confidence": data.get("detection_confidence", 0),
            }
        else:
            error = response.json().get("error", "Unknown error")
            return {
                "success":    False,
                "student_id": student["student_id"],
                "full_name":  student["full_name"],
                "error":      error,
            }

    except Exception as e:
        return {
            "success":    False,
            "student_id": student["student_id"],
            "full_name":  student["full_name"],
            "error":      str(e),
        }


def save_report(results: list, dataset_path: str, duration: float):
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)

    successful = [r for r in results if r["success"]]
    failed     = [r for r in results if not r["success"]]

    report = {
        "import_timestamp":        datetime.now(timezone.utc).isoformat(),
        "dataset_path":            dataset_path,
        "total_attempted":         len(results),
        "successful":              len(successful),
        "failed":                  len(failed),
        "duration_seconds":        round(duration, 1),
        "avg_seconds_per_student": round(duration / len(results), 1) if results else 0,
        "registered_students":     successful,
        "failed_registrations":    failed,
    }

    with open(REPORT_PATH, "w") as f:
        json.dump(report, f, indent=2)

    return report


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    global FLASK_BASE_URL

    parser = argparse.ArgumentParser(
        description="Batch import Kaggle face dataset into UoP Face Recognition System"
    )
    parser.add_argument(
        "--limit", type=int, default=100,
        help="Max students to register (default: 100)"
    )
    parser.add_argument(
        "--list-folders", action="store_true",
        help="Just show dataset folder structure and exit"
    )
    parser.add_argument(
        "--flask-url", type=str, default=FLASK_BASE_URL,
        help=f"Flask service URL (default: {FLASK_BASE_URL})"
    )
    args = parser.parse_args()

    FLASK_BASE_URL = args.flask_url

    print("=" * 60)
    print("  UoP Face Recognition - Dataset Importer")
    print("=" * 60)

    # ── Step 1: Download ──────────────────────────────────────────
    print("\n[1/5] Downloading dataset from Kaggle...")
    print("      First run downloads ~1GB. After that it uses cache.\n")

    try:
        import kagglehub
        dataset_path = kagglehub.dataset_download("kaustubhdhote/human-faces-dataset")
        print(f"  Dataset ready at: {dataset_path}\n")
    except Exception as e:
        print(f"\n  ERROR: Could not download dataset.")
        print(f"  {e}")
        print("\n  Fix: make sure kaggle.json is at:")
        print(r"  C:\Users\kgang\.kaggle\kaggle.json")
        print('  Contents: {"username":"YOUR_USERNAME","key":"YOUR_KEY"}')
        sys.exit(1)

    # ── Step 2: Scan folders ──────────────────────────────────────
    print("[2/5] Scanning dataset folders...")
    real_folders, skipped_folders = find_real_image_folders(dataset_path)

    if not real_folders:
        print("\n  ERROR: No real image folders found.")
        print(f"  Everything was flagged as AI-generated: {skipped_folders}")
        sys.exit(1)

    if args.list_folders:
        print(f"\n  Real folders ({len(real_folders)}):")
        for f in real_folders:
            imgs = [x for x in Path(f).iterdir()
                    if x.is_file() and x.suffix.lower() in IMAGE_EXTENSIONS]
            print(f"    {f}  ({len(imgs)} images)")
        print(f"\n  Skipped AI folders ({len(skipped_folders)}):")
        for f in skipped_folders:
            print(f"    {f}")
        sys.exit(0)

    # ── Step 3: Collect images ────────────────────────────────────
    print(f"\n[3/5] Collecting real face images (limit: {args.limit})...")
    images = collect_images(real_folders, args.limit)

    if not images:
        print("  ERROR: No valid images found.")
        sys.exit(1)

    # ── Step 4: Check Flask ───────────────────────────────────────
    print("[4/5] Checking Flask service...")
    if not check_flask_running(FLASK_BASE_URL):
        print(f"  ERROR: Flask not reachable at {FLASK_BASE_URL}")
        print("  Make sure you ran: python app.py")
        sys.exit(1)

    # ── Step 5: Register ──────────────────────────────────────────
    total    = len(images)
    est_mins = round(total * 7 / 60, 1)
    print(f"[5/5] Registering {total} students...")
    print(f"      Estimated time: ~{est_mins} minutes on CPU\n")

    results    = []
    start_time = time.time()

    for i, image_path in enumerate(images):
        student = generate_student_record(i)
        result  = register_student(FLASK_BASE_URL, image_path, student)
        results.append(result)

        elapsed = time.time() - start_time
        if i > 0:
            eta = (elapsed / i) * (total - i)
            eta_str = f"  ETA: {eta/60:.1f} min"
        else:
            eta_str = ""

        if result["success"]:
            conf = result.get("detection_confidence", 0)
            embs = result.get("embeddings_generated", 0)
            print(f"  [{i+1:03d}/{total}] OK   {student['student_id']} - "
                  f"{student['full_name']}  "
                  f"conf:{conf:.2f} embs:{embs}{eta_str}")
        else:
            print(f"  [{i+1:03d}/{total}] FAIL {student['student_id']} - "
                  f"{student['full_name']}  "
                  f"reason: {result['error']}{eta_str}")

    # ── Summary ───────────────────────────────────────────────────
    duration   = time.time() - start_time
    report     = save_report(results, dataset_path, duration)
    successful = report["successful"]
    failed     = report["failed"]

    print("\n" + "=" * 60)
    print("  Import Complete")
    print("=" * 60)
    print(f"  Attempted:  {report['total_attempted']}")
    print(f"  Successful: {successful}")
    print(f"  Failed:     {failed}  (no face / blurry / too dark)")
    print(f"  Duration:   {duration/60:.1f} minutes")
    print(f"  Report:     {REPORT_PATH}")

    if failed > 0:
        print(f"\n  Note: {failed} failures is normal.")
        print("  Dataset photos vary in quality. Bad ones are skipped.")

    print(f"\n  System now has {successful} registered students.")
    print("  Test with POST /identify in Postman.")
    print("=" * 60)


if __name__ == "__main__":
    main()