# Sentinel — AI-Assisted Student Face Identification System

A three-tier face identification system built for the University of Peradeniya campus security. Security personnel upload a photo of an unknown individual; the system identifies them against the university student database and returns their details within seconds.

---

## Architecture

```
React Frontend (port 5173)
        ↓
Spring Boot Backend (port 8080)
        ↓                    ↓
Flask AI Service       MySQL Database
   (port 5000)           (uop_db)
        ↓
University Photo DB API (external)
```

The Flask AI service handles all face detection, alignment, embedding generation and matching. Spring Boot handles authentication, student data management and orchestration. React provides the admin dashboard.

---

## Project Structure

```
uop-face-recognition-system/
├── frontend/                          React admin dashboard (Vite + React 19)
├── springboot-backend/backend/        Spring Boot REST API (Java 17+, Maven)
└── python-ai-service/                 Flask AI service (Python 3.10+)
    ├── app.py                         Flask routes and endpoints
    ├── sync_university.py             Syncs student embeddings from university photo DB
    ├── requirements.txt
    ├── sample_data/
    │   └── students.csv               Student registration numbers (Reg_No column)
    └── utils/
        ├── aligner.py                 5-point facial landmark alignment
        ├── augmentor.py               Embedding augmentation (6–10 variants per student)
        ├── audit_logger.py            JSONL audit logging
        ├── embedder.py                InsightFace buffalo_l model wrapper
        ├── matcher.py                 Cosine similarity matching
        ├── mock_db.py                 JSON mock database (development only)
        ├── preprocessor.py            Image quality checks and normalisation
        └── video_processor.py         Video frame sampling and identification
```

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Python | 3.10+ | Flask AI service |
| Java | 17+ | Spring Boot backend |
| Maven | 3.8+ | Spring Boot build tool |
| Node.js | 18+ | React frontend |
| MySQL | 8.0+ | Database |

---

## Setup

### 1. Database

MySQL creates the database and all tables automatically on first Spring Boot startup via `schema.sql`. Just make sure MySQL is running and the credentials in your `.env` file are correct.

If you need to create the database manually:
```sql
CREATE DATABASE uop_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

If you get an authentication error with MySQL 8:
```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'your_password';
FLUSH PRIVILEGES;
```

---

### 2. Environment Variables

Copy the example file and fill in your values:
```bash
cd springboot-backend/backend
cp .env.example .env
```

Edit `.env`:
```env
# Database
DB_URL=jdbc:mysql://localhost:3306/uop_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
DB_USERNAME=root
DB_PASSWORD=your_mysql_password

# Security
JWT_SECRET=uop_sentinel_super_secret_key_2026_peradeniya
INTERNAL_API_KEY=sentinel_internal_key_2026

# Service URLs
AI_SERVICE_URL=http://localhost:5000/api/recognize
SPRING_BOOT_URL=http://localhost:8080
CORS_ALLOWED_ORIGINS=http://localhost:5173

# University Photo DB (fill in when access is granted)
PHOTO_DB_URL=https://stud.pdn.ac.lk/student_image_view.php?regno=
UNI_API_USERNAME=
UNI_API_PASSWORD=
UNI_API_KEY=

# University Index API (fill in when access is granted)
UNIVERSITY_INDEX_BASE_URL=
UNIVERSITY_INDEX_API_KEY=

# API response field names (update when you see the real API response)
UNI_FIELD_INDEX=index
UNI_FIELD_FACULTY=faculty_id
```

> **Never commit `.env` to GitHub.** It is already in `.gitignore`.

---

### 3. Spring Boot Backend

```bash
cd springboot-backend/backend
./mvnw spring-boot:run        # Mac/Linux
mvnw.cmd spring-boot:run      # Windows
```

Spring Boot starts on `http://localhost:8080`. The database schema is created automatically on first run.

Default admin credentials (set by `DataInitializer.java`):
- Username: `admin`
- Password: `adminpassword`

---

### 4. Flask AI Service

```bash
cd python-ai-service

# Create virtual environment
python -m venv .venv

# Activate
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # Mac/Linux

# Install dependencies
pip install flask numpy opencv-python pillow insightface onnxruntime requests python-dotenv

# Run
python app.py
```

Flask starts on `http://localhost:5000`.

> **First run downloads the `buffalo_l` model (~160MB).** This requires internet access once. After that it's cached at `~/.insightface/models/buffalo_l/`. If deploying offline, copy this folder to the same path on the target machine.

---

### 5. React Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend starts on `http://localhost:5173`.

---

### 6. Sync Student Data

Place your CSV file at `python-ai-service/sample_data/students.csv`. The file must have a `Reg_No` column:

```csv
Reg_No
A/22/786
E/18/001
AHS/14/RAD/FQ/002
```

Then run the sync script:

```bash
cd python-ai-service
.venv\Scripts\activate

# Preview duplicates before syncing
python sync_university.py --check-csv

# Sync all students
python sync_university.py

# Sync first 10 (for testing)
python sync_university.py --limit 10

# Sync one student
python sync_university.py --reg A/22/786

# Re-sync existing students
python sync_university.py --replace

# Run on schedule (3x/year: Jan 1, Jun 1, Dec 31)
python sync_university.py --schedule
```

---

## Start Order

Always start services in this order:

```
1. MySQL        (background service — should already be running)
2. Spring Boot  mvnw.cmd spring-boot:run
3. Flask        python app.py
4. React        npm run dev
```

---

## API Reference

### Flask AI Service — `localhost:5000`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/recognize` | Main identification — called by Spring Boot |
| POST | `/register` | Register one student (dev/testing) |
| POST | `/identify` | Identify faces in image (dev/testing) |
| POST | `/identify/video` | Identify faces in video |
| GET | `/students` | List all registered students |
| GET | `/stats` | System statistics |
| GET | `/logs` | Recent audit log entries |

### Spring Boot Backend — `localhost:8080`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | None | Login → JWT token |
| POST | `/api/identification/search` | JWT | Upload photo → identification result |
| GET | `/api/students` | JWT | List students |
| GET | `/internal/students/ids` | Internal API key | All student IDs in DB |
| GET | `/internal/students/embeddings` | Internal API key | All embeddings for matching |
| POST | `/internal/students/embeddings` | Internal API key | Save/update embeddings |
| POST | `/internal/sync/log` | Internal API key | Log sync run |

Internal endpoints use the `X-Internal-API-Key` header with the value from `INTERNAL_API_KEY` in `.env`.

---

## How Identification Works

```
1. Admin uploads photo → React frontend
2. React → POST /api/identification/search (Spring Boot)
3. Spring Boot → POST /api/recognize (Flask)
4. Flask pipeline:
   a. Preprocess (CLAHE, denoise, sharpen)
   b. Detect faces — SCRFD detector
   c. Align each face — 5-point landmark warp to 112×112
   d. Generate 512-dim ArcFace embedding per face
   e. Compare against all stored embeddings (cosine similarity)
   f. Return top matches with confidence scores
5. Spring Boot calls university index API with matched student_id
6. Returns full result (name, faculty, photo) to React
7. React displays the match to the admin
```

---

## Confidence Score Guide

| Score | Label | Recommended Action |
|---|---|---|
| ≥ 60% | High | Strong match — confirm |
| 40–59% | Medium | Likely correct — verify carefully |
| 25–39% | Low | Weak signal — manual review |
| < 25% | No match | Not in system |

---

## AI Model Details

| Component | Details |
|---|---|
| Detection | SCRFD (inside InsightFace buffalo_l) |
| Recognition | ResNet-50 trained with ArcFace loss |
| Embedding size | 512 dimensions, L2-normalised |
| Augmentations | 6 from front photo (original, flipped, brighter, darker, rotated ±10°) |
| Profile slots | 4 reserved for future _L / _R profile photos (embedding_left_1/2, embedding_right_1/2) |
| Matching | Cosine similarity |
| Hardware | CPU-only — no GPU required |

---

## Database Schema

| Table | Purpose |
|---|---|
| `admins` | Admin login credentials |
| `students` | Student index, faculty, tier (1=active, 2=alumni) |
| `embeddings` | 10 ArcFace embedding slots per student (6 used now) |
| `sync_log` | Audit trail of every sync operation |

The database stores **only student index numbers, faculty and embeddings** — no names, photos or personal data. Personal details are fetched from the university API after a match is found.

---

## Faculty Prefix Map

Registration number prefixes map to faculties:

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

## Environment Files

| File | Committed | Purpose |
|---|---|---|
| `springboot-backend/backend/.env` | ❌ No | Real credentials — never commit |
| `springboot-backend/backend/.env.example` | ✅ Yes | Template with all required variables |
| `python-ai-service/data/mock_db.json` | ❌ No | Generated dev data |
| `python-ai-service/logs/audit.jsonl` | ❌ No | Generated logs |

---

## Testing

Open `python-ai-service/test.http` in VS Code with the REST Client extension (by Huachao Mao). Click **Send Request** above each block to test endpoints.

Tests cover: Flask health, Spring Boot health, admin login, internal student IDs, full-stack identification.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `No module named flask` | Activate venv: `.venv\Scripts\activate` |
| Flask slow on first request | Normal — buffalo_l model loading (~30s). Fast after. |
| `Connection refused` port 5000 | Run `python app.py` |
| `Connection refused` port 8080 | Run `mvnw.cmd spring-boot:run` |
| Spring Boot can't connect to MySQL | Check `.env` credentials and MySQL native password fix |
| `No faces found` | Photo too dark, blurry or small |
| All similarity scores very low | Run `--replace` to regenerate embeddings with latest model |
| buffalo_l model not found | Needs internet on first run to download from InsightFace |
| Internal API 401 Unauthorized | Check `X-Internal-API-Key` header matches `INTERNAL_API_KEY` in `.env` |

---

## Team

| Component | Tech |
|---|---|
| AI Service | Python, Flask, InsightFace, OpenCV, NumPy |
| Backend | Java, Spring Boot, MySQL, JWT |
| Frontend | React 19, Vite, Recharts |