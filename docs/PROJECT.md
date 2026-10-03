# Sentinel — Project Documentation

**AI-Assisted Student Face Identification System**
University of Peradeniya — IT Center
Developed: May 2026 – October 2026

---

## Overview

Sentinel is a three-tier face identification system built for campus security at the University of Peradeniya. Security personnel upload a photo of an unknown individual through the web dashboard. The system detects all faces in the photo, matches each one against the university student database using AI, and returns the matched student's details — name, faculty, registration number and photo — within seconds.

The system connects to the university's existing photo database to build its matching index. It stores only mathematical representations (embeddings) of student faces — no photos or personal data are held within the system itself.

---

## Architecture

```
Admin Browser
      ↓
React Frontend (port 5173)
      ↓
Spring Boot Backend (port 8080)
      ↓                    ↓
Flask AI Service      MySQL Database
   (port 5000)
      ↓
University Photo DB API
```

**Flask AI Service** — owns all face recognition logic. Receives photos, runs the AI pipeline, returns match results. Has no knowledge of student names or personal details.

**Spring Boot Backend** — orchestrates the system. Handles authentication, manages the database, calls Flask for AI work, and calls the university APIs to retrieve student details after a match is found.

**React Frontend** — the admin dashboard. Upload photos for identification, upload CSV files to sync student data, view results.

**MySQL Database** — stores student registration numbers, faculty codes and face embeddings only.

---

## How Identification Works

```
1. Admin uploads a photo
2. Flask detects all faces using SCRFD detector
3. Each face is aligned to a standard frontal position
   using 5-point landmark warping
4. ResNet-50 (ArcFace) generates a 512-dimensional
   embedding for each aligned face
5. Embeddings are compared against all stored student
   embeddings using cosine similarity
6. Top matches returned with confidence scores
7. Spring Boot calls university APIs with matched
   student ID to retrieve full student details
8. Result displayed to admin
```

---

## AI Pipeline Details

### Model
InsightFace `buffalo_l` model pack — ResNet-50 trained with ArcFace loss. Runs entirely on CPU, no GPU required.

### Preprocessing
Before any AI processing, each image goes through:
- Brightness and sharpness quality checks (rejects unusable images)
- CLAHE brightness normalisation (handles uneven lighting)
- Denoising (handles scanned passport photo quality)
- Unsharp mask sharpening

### Alignment
The ArcFace model was trained on faces aligned to a fixed 112×112 pixel layout. SCRFD detects 5 facial landmarks (eye centres, nose tip, mouth corners) and a geometric transform warps each face to match the standard layout before embedding — significantly improving accuracy for turned or tilted faces.

### Augmentation
Only one passport photo per student is available. To improve matching reliability, 6 synthetic variants are generated per photo:

| Slot | Variant |
|---|---|
| 1 | Original |
| 2 | Horizontally flipped |
| 3 | Brightness +20 |
| 4 | Brightness -20 |
| 5 | Rotated +10° |
| 6 | Rotated -10° |

Four additional slots (7–10) are reserved for future left and right profile photos when the university photo database makes them available.

### Confidence Thresholds

| Score | Label | Meaning |
|---|---|---|
| ≥ 60% | High | Strong match |
| 40–59% | Medium | Likely correct — verify |
| 25–39% | Low | Weak — manual review |
| < 25% | No match | Not in system |

---

## Database Design

The system database stores the minimum data needed for face matching:

```sql
students   — student_id, faculty, tier, synced_at
embeddings — student_id, embedding_original, embedding_flipped,
             embedding_brighter, embedding_darker,
             embedding_rotated_plus, embedding_rotated_minus,
             embedding_left_1, embedding_left_2,    -- future
             embedding_right_1, embedding_right_2   -- future
sync_log   — sync history and statistics
```

**No names, photos or contact details are stored.** After a match is found, Spring Boot calls the university index API with the matched student ID to retrieve personal details in real time.

### Student Tiers
- **Tier 1** — currently enrolled students (searched first)
- **Tier 2** — alumni / graduated (searched only if no Tier 1 match found)

### Faculty Parsing
Faculty is derived from the registration number prefix at sync time:

| Prefix | Faculty |
|---|---|
| A, AG | Agriculture |
| AHS | Allied Health Sciences |
| E | Engineering |
| M | Medicine |
| S | Science |
| AL | Arts |
| VM | Veterinary Medicine |
| DT | Dental Technology |

---

## Student Data Synchronisation

The sync script (`python-ai-service/sync_university.py`) populates the database from the university's photo database.

**Process:**
1. Reads registration numbers from `sample_data/students.csv`
2. Calls the university photo DB API for each student's passport photo
3. Detects default/placeholder images (under 5KB) and skips them
4. Runs the full AI pipeline — preprocess, detect, align, augment, embed
5. Saves embeddings to MySQL via Spring Boot's internal API
6. Logs the sync run to the `sync_log` table

**Scheduled runs:** 1 January, 1 June, 31 December (automatic)

**Manual run:**
```bash
cd python-ai-service
python sync_university.py --limit 10    # test with 10 first
python sync_university.py               # full sync
python sync_university.py --replace     # re-sync all students
python sync_university.py --check-csv   # preview duplicates
```

---

## Key Configuration

All credentials and URLs are stored in `springboot-backend/backend/.env` (never committed to GitHub). See `.env.example` for the full list of required variables.

Critical values to set when taking over:
- `PHOTO_DB_URL` — university photo database URL
- `UNIVERSITY_INDEX_BASE_URL` — university student info API
- `DB_PASSWORD` — MySQL password
- `INTERNAL_API_KEY` — key Flask uses to call Spring Boot internally

---

## API Endpoints

### Flask (port 5000)
| Endpoint | Purpose |
|---|---|
| `GET /health` | Health check |
| `POST /api/recognize` | Main identification (called by Spring Boot) |
| `POST /ai/sync/csv` | Start background CSV sync |
| `GET /ai/sync/status` | Poll sync progress |
| `POST /identify` | Direct identification (dev/testing) |
| `POST /register` | Direct registration (dev/testing) |
| `GET /students` | List all students |
| `GET /stats` | System statistics |

### Spring Boot (port 8080)
| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` | Admin login → JWT token |
| `POST /api/identification/search` | Upload photo → identification result |
| `GET /api/students` | List students |
| `GET /internal/students/ids` | All student IDs (used by Flask) |
| `POST /internal/students/embeddings` | Save embeddings (used by Flask) |
| `GET /internal/students/embeddings` | Get embeddings for matching (used by Flask) |

Internal Spring Boot endpoints require the `X-Internal-API-Key` header.

---

## What Was Completed

- ✅ Full Flask AI pipeline — detection, alignment, augmentation, embedding, matching
- ✅ Image preprocessing — CLAHE, denoising, sharpening, quality checks
- ✅ University photo database integration — live photo fetch with placeholder detection
- ✅ Student synchronisation script — CSV-driven, bulk sync, duplicate detection, scheduler
- ✅ 10-slot embedding architecture — 6 active, 4 reserved for profile photos
- ✅ Spring Boot adapter endpoint — bridges Flask ↔ Spring Boot API format
- ✅ MySQL database integration — real embeddings stored and queried
- ✅ Background CSV sync — non-blocking, with progress polling
- ✅ JWT authentication — admin login and protected routes
- ✅ React frontend integration — Vite proxy, real API calls, JWT auth flow
- ✅ Duplicate detection dialogue — skip or replace before CSV sync
- ✅ Audit logging — every identification and registration event recorded
- ✅ Video identification endpoint — 1fps frame sampling, multi-frame aggregation

---

## Pending / Future Development

### High Priority
**Background sync completion feedback**
The `/ai/sync/csv` endpoint now runs in a background thread and returns immediately. The frontend polls `/ai/sync/status` for progress. This needs to be fully wired into the frontend sync page to show a live progress bar.

**University Index API integration**
After a face match, Spring Boot calls the university index API to retrieve the student's name, faculty and photo. The `UniversityIndexClientImpl.java` is in place but the API URL and credentials need to be configured in `.env` when access is granted.

**Full bulk sync**
The student CSV contains hundreds of registration numbers. A full sync needs to be run once university network access and API credentials are confirmed working.

### Medium Priority
**Left and right profile photos**
The database schema already has columns `embedding_left_1`, `embedding_left_2`, `embedding_right_1`, `embedding_right_2`. When the university photo database adds `_L` and `_R` suffix photos, the sync script will automatically detect and use them — no code changes needed.

**Confidence threshold calibration**
Current thresholds (25% / 40% / 60%) are reasonable starting estimates. Proper calibration requires testing against a larger set of real student photos to find the scores that best separate true matches from false ones.

**Faculty-based search filtering**
When the admin knows the faculty of the person being identified, the system could filter embeddings by faculty before matching — reducing comparison count and improving speed. The `faculty` column in the database is already set up for this.

**Tier 2 (alumni) search**
The two-tier search (current students first, alumni second) is designed but not yet fully implemented in the identification flow.

### Low Priority
**Manual review queue**
Medium and Low confidence matches currently return directly to the admin. A dedicated review queue where flagged results can be confirmed or disputed by a supervisor would improve reliability.

**Performance monitoring**
Track identification response times, sync durations and match confidence distributions over time to detect model drift or data quality issues.

**Multi-admin support**
Currently only a single admin account is created by `DataInitializer.java`. A user management interface for creating and managing multiple admin accounts would be useful for a live deployment.

---

## Running the System

Start services in this order:

```
1. MySQL        (should be running as a background service)
2. Spring Boot  cd springboot-backend/backend && mvnw.cmd spring-boot:run
3. Flask        cd python-ai-service && .venv\Scripts\activate && python app.py
4. React        cd frontend && npm run dev
```

Access the dashboard at `http://localhost:5173`
Login: `admin` / `adminpassword`
