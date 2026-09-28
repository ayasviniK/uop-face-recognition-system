# Sentinel — UoP Face Recognition System

A three-tier face identification system for the University of Peradeniya campus security.

---

## System Architecture

```
React Frontend (Port 5173)
        ↓
Spring Boot Backend (Port 8080)
        ↓                    ↓
Flask AI Service      MySQL Database
   (Port 5000)          (Port 3306)
        ↓
University Index API (external)
```

---

## Project Structure

```
uop-face-recognition-system/
├── frontend/                    React UI
├── springboot-backend/backend/  Spring Boot REST API
└── python-ai-service/           Flask AI Service
    ├── app.py                   Main Flask application
    ├── sync_university.py       Syncs student embeddings from university index
    ├── import_dataset.py        Dev tool — imports Kaggle dataset for testing
    ├── requirements.txt
    └── utils/
        ├── aligner.py           5-point facial landmark alignment
        ├── augmentor.py         6 augmentation variants per photo
        ├── audit_logger.py      Request audit logging
        ├── embedder.py          InsightFace ArcFace buffalo_l model
        ├── matcher.py           Cosine similarity matching
        ├── mock_db.py           JSON mock DB (dev only)
        ├── preprocessor.py      Image quality checks + normalization
        └── video_processor.py   Video frame sampling + identification
```

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Python | 3.10+ | Flask AI service |
| Java | 21+ | Spring Boot backend |
| Maven | 3.8+ | Spring Boot build tool |
| Node.js | 18+ | React frontend |
| MySQL | 8.0+ | Database |

---

## Setup — Step by Step

### 1. MySQL Database

Open MySQL and run:

```sql
CREATE DATABASE uop_db;
```

Then run the schema file:

```bash
mysql -u root -p uop_db < springboot-backend/backend/src/main/resources/schema.sql
```

---

### 2. Spring Boot Backend

**Create the `.env` file:**

```bash
cd springboot-backend/backend
copy .env.example .env    # Windows
cp .env.example .env      # Mac/Linux
```

Edit `.env` with your actual values:

```env
DB_URL=jdbc:mysql://localhost:3306/uop_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
DB_USERNAME=root
DB_PASSWORD=your_mysql_password

JWT_SECRET=uop_sentinel_super_secret_key_2026_peradeniya
INTERNAL_API_KEY=sentinel_internal_key_2026

AI_SERVICE_URL=http://localhost:5000
CORS_ALLOWED_ORIGINS=http://localhost:5173

UNIVERSITY_INDEX_BASE_URL=https://your-university-api-url
UNIVERSITY_INDEX_API_KEY=your_api_key
```

**Run Spring Boot:**

```bash
cd springboot-backend/backend
mvn spring-boot:run
```

Spring Boot starts on `http://localhost:8080`

---

### 3. Flask AI Service

**Create virtual environment:**

```bash
cd python-ai-service
python -m venv .venv

# Activate — Windows:
.venv\Scripts\activate
# Activate — Mac/Linux:
source .venv/bin/activate
```

**Install dependencies:**

```bash
pip install flask numpy opencv-python pillow insightface onnxruntime requests
```

> **Note:** First run downloads the `buffalo_l` model (~160MB). Needs internet once.
> After that it's cached at `C:\Users\username\.insightface\models\buffalo_l\`

**Run Flask:**

```bash
python app.py
```

Flask starts on `http://localhost:5000`

Check it's working:
```
GET http://localhost:5000/health
→ { "status": "ok" }
```

---

### 4. React Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend starts on `http://localhost:5173`

---

### 5. Sync Student Data

Once all three services are running, populate the database:

**From university index (production):**
```bash
cd python-ai-service
python sync_university.py
```

**From local CSV + photos (testing):**
```bash
python sync_university.py --csv sample_data/students.csv --photos sample_data/photos/
```

**From Kaggle dataset (development only):**
```bash
python import_dataset.py --limit 100
```

---

## Running Order

Always start in this order:

```
1. MySQL         (runs as a background service)
2. Spring Boot   mvn spring-boot:run
3. Flask         python app.py
4. React         npm run dev
```

---

## API Endpoints

### Flask AI Service (Port 5000)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Service health check |
| POST | `/api/recognize` | Main identification — called by Spring Boot |
| POST | `/register` | Register one student (dev/testing) |
| POST | `/identify` | Identify faces in image (dev/testing) |
| POST | `/identify/video` | Identify faces in video |
| GET | `/students` | List all registered students |
| GET | `/stats` | System statistics |
| GET | `/logs` | Recent audit logs |

### Spring Boot Backend (Port 8080)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Admin login → JWT token |
| POST | `/api/identification/search` | Main identification endpoint |
| GET | `/api/students` | List all students |
| POST | `/api/students` | Register a student |
| GET | `/internal/students/embeddings` | Get embeddings for matching |
| POST | `/internal/students/embeddings` | Save embeddings |
| GET | `/internal/students/ids` | Get all student IDs |

---

## How Identification Works

```
1. Admin uploads photo → React
2. React → POST /api/identification/search (Spring Boot)
3. Spring Boot → POST /api/recognize (Flask)
4. Flask:
   - Preprocesses image (lighting, noise, sharpness)
   - Detects faces using SCRFD (InsightFace)
   - Aligns each face using 5-point landmarks
   - Generates 512-dim ArcFace embedding
   - Compares against stored embeddings (cosine similarity)
   - Returns top matches with confidence scores
5. Spring Boot calls university index with matched student ID
6. Spring Boot returns full result to React
7. React shows admin the match with name, photo, faculty
```

---

## Confidence Score Guide

| Score | Label | Recommended Action |
|---|---|---|
| ≥ 60% | High | Strong match — confirm |
| 40–59% | Medium | Likely correct — verify carefully |
| 35–39% | Low | Weak signal — manual review |
| < 35% | No match | Not in system |

---

## AI Model Details

- **Detection:** SCRFD (inside InsightFace buffalo_l)
- **Recognition:** ResNet-50 trained with ArcFace loss
- **Embedding size:** 512 dimensions, L2-normalized
- **Augmentations per student:** 6 (original, flipped, brighter, darker, rotated ±10°)
- **Matching:** Cosine similarity
- **Hardware:** CPU-only (no GPU required)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `No module named flask` | Activate venv: `.venv\Scripts\activate` |
| Flask slow on first request | Normal — model loading. Faster after. |
| `Connection refused` port 5000 | Run `python app.py` |
| `Connection refused` port 8080 | Run `mvn spring-boot:run` |
| Spring Boot can't connect to MySQL | Check `.env` credentials |
| `No faces found` | Photo too dark/blurry/small |
| Low similarity scores | Re-register — old model embeddings |
| `buffalo_l` missing | Needs internet on first run |

---

## Environment Files

| File | Committed? | Purpose |
|---|---|---|
| `springboot-backend/backend/.env` | No | DB credentials, API keys, URLs |
| `springboot-backend/backend/.env.example` | Yes | Template |
| `python-ai-service/data/mock_db.json` | No | Generated test data |
| `python-ai-service/logs/audit.jsonl` | No | Generated logs |

---

## Team

| Role | Responsibility |
|---|---|
| AI Service | Python, Flask, InsightFace, face detection, embedding, matching |
| Backend | Java, Spring Boot, MySQL, authentication, university API integration |
| Frontend | React, Vite, UI components, admin dashboard |