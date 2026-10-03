# University of Peradeniya — Sentinel Face Recognition Backend

Production Spring Boot backend for the University of Peradeniya Face Recognition System (Sentinel Architecture). Orchestrates face identification between the React frontend, the Flask ArcFace AI Service, local MySQL biometric metadata, and the University Student Information Index.

---

## 1. System Architecture

```text
React Frontend (Admin UI / Image Upload)
       ↓ HTTP (REST + Admin JWT)
Spring Boot Backend (Orchestration, Auth, DB)
       ↓ HTTP (Multipart POST /api/recognize)
Flask AI Service (ArcFace, SCRFD Detection, Cosine Similarity)
       ↓ HTTP (X-Internal-API-Key)
Spring Boot Internal APIs (/internal/*)
       ↓
MySQL Database (Students, 6x Embeddings, Sync Log, Admins)

Spring Boot Backend
       ↓ HTTP (University Index Client)
University Index API (Source of truth for Name, Faculty, Photo, Year)
```

### Responsibility Breakdown
- **React Frontend**: Admin authentication UI, student search image upload, displaying identification results. Communicates strictly with Spring Boot.
- **Spring Boot Backend**: Admin authentication (BCrypt + JWT), internal Flask integration APIs (`/internal/**`), MySQL persistence, student ID/faculty/tier tracking, face embedding storage, sync logging, orchestrating Flask AI service calls and University Index lookups.
- **Flask AI Service**: Computer vision processing: face detection (SCRFD), landmark alignment, 512-dimensional ArcFace embedding generation, six-image augmentation, cosine similarity matching. Does not store personal student data.
- **University Index**: Authoritative source of truth for student personal information (full name, year, faculty, official passport photo). Spring Boot never permanently stores personal names or passport photos in MySQL.

---

## 2. Database Model

### Tables

1. **`students`**: Tracks enrolled and alumni students along with their matching tier.
   - `student_id VARCHAR(50) PRIMARY KEY`: Unique university student identifier (e.g., `E/18/001`).
   - `faculty VARCHAR(100) NOT NULL`: Derived at sync time from the student ID prefix (`E` -> Engineering).
   - `tier TINYINT NOT NULL DEFAULT 1`: Search priority. `1` = Currently enrolled (fast path); `2` = Alumni / graduated / on leave (deep path). Inactive students are tiered down, never deleted.
   - `synced_at TIMESTAMP`: Initial synchronization timestamp.
   - `updated_at TIMESTAMP`: Last modification timestamp.

2. **`embeddings`**: Stores 6 augmented ArcFace face embeddings per student.
   - `student_id VARCHAR(50) PRIMARY KEY` (Foreign Key to `students(student_id)` ON DELETE CASCADE).
   - `embedding_original JSON NOT NULL`: 512 float values.
   - `embedding_flipped JSON NOT NULL`: 512 float values (horizontal mirror).
   - `embedding_brighter JSON NOT NULL`: 512 float values (+20 brightness).
   - `embedding_darker JSON NOT NULL`: 512 float values (-20 brightness).
   - `embedding_rotated_plus JSON NOT NULL`: 512 float values (+10° rotation).
   - `embedding_rotated_minus JSON NOT NULL`: 512 float values (-10° rotation).
   - `generated_at TIMESTAMP`: Generation timestamp.
   - `updated_at TIMESTAMP`: Update timestamp.

3. **`sync_log`**: Audit history of every synchronization run.
   - `id BIGINT AUTO_INCREMENT PRIMARY KEY`
   - `synced_at TIMESTAMP`
   - `students_added INT DEFAULT 0`
   - `students_updated INT DEFAULT 0`
   - `students_tiered_down INT DEFAULT 0`
   - `status VARCHAR(20)` (`success` / `failed`)
   - `notes TEXT`

4. **`admins`**: Administrator accounts for dashboard access.
   - `id BIGINT AUTO_INCREMENT PRIMARY KEY`
   - `username VARCHAR(100) UNIQUE NOT NULL`
   - `password VARCHAR(255) NOT NULL` (BCrypt hashed)

---

## 3. API Specification

### Internal Flask Integration Endpoints (`/internal/**`)
Protected via `X-Internal-API-Key`. Never called by the frontend.

| Method | Endpoint | Purpose | Request / Query | Response |
| ------ | -------- | ------- | --------------- | -------- |
| `GET` | `/internal/students/embeddings` | Candidate embeddings for cosine similarity | Optional: `?tier=1&facultyPrefix=E` | `[ { "studentId": "...", "tier": 1, "embeddingOriginal": [512 floats], ... } ]` |
| `POST` | `/internal/students/embeddings` | UPSERT student metadata and 6 embeddings | JSON with 6x 512-dim vectors, studentId, faculty, tier | `{"message": "Embeddings saved", "studentId": "E/18/001"}` |
| `GET` | `/internal/students/ids` | All local student IDs for sync diffing | None | `{"studentIds": ["E/18/001", "M/20/034", ...]}` |
| `PATCH` | `/internal/students/{studentId}/tier` | Move student between tier 1 and tier 2 | `{"tier": 2}` | `{"message": "Student E/18/001 moved to tier 2"}` |
| `POST` | `/internal/sync/log` | Record synchronization run result | Sync stats and notes | `{"id": 1, "status": "success", ...}` |

### Public & Administrator Endpoints
Protected by JWT `Bearer <token>` (except `/api/auth/**` and `/actuator/health`).

| Method | Endpoint | Purpose | Security |
| ------ | -------- | ------- | -------- |
| `POST` | `/api/auth/login` | Administrator authentication | Public |
| `POST` | `/api/identification/search` | Upload probe image for face recognition | `ROLE_ADMIN` (JWT) |
| `GET` | `/api/students` | List or search registered student metadata | `ROLE_ADMIN` (JWT) |
| `GET` | `/api/students/{studentId}` | View student metadata by ID | `ROLE_ADMIN` (JWT) |
| `PUT` | `/api/students/{studentId}` | Update student metadata | `ROLE_ADMIN` (JWT) |
| `DELETE` | `/api/students/{studentId}` | Remove student record | `ROLE_ADMIN` (JWT) |
| `GET` | `/actuator/health` | Service health probe | Public |

---

## 4. End-to-End Workflows

### 4.1 Identification Flow
1. Admin uploads a photo via the React frontend to `POST /api/identification/search`.
2. Spring Boot validates the image format (JPEG/PNG, <= 5MB) and forwards it to Flask (`POST /api/recognize`).
3. Flask runs SCRFD face detection, 5-point landmark alignment, generates a 512-dim ArcFace embedding, and queries Spring Boot for tier 1 candidates: `GET /internal/students/embeddings?tier=1`.
4. Flask computes cosine similarity against stored augmented vectors. If no confident match (score < 0.60), Flask queries tier 2 candidates (`?tier=2`).
5. Flask returns top matches to Spring Boot (`studentId` + `confidence`).
6. Spring Boot looks up the student's local record to retrieve their `faculty`.
7. Spring Boot calls the `UniversityIndexClient` with the faculty and student ID to fetch full details (name, year, photo URL).
8. Spring Boot computes the confidence label:
   - `>= 0.60`: **High**
   - `0.40 - 0.59`: **Medium**
   - `0.35 - 0.39`: **Low**
   - `< 0.35`: **No match**
9. Spring Boot returns the enriched `IdentificationResponse` to React:
```json
{
  "studentId": "E/18/001",
  "name": "Kasun Perera",
  "faculty": "Engineering",
  "year": 3,
  "photoUrl": "https://...",
  "confidence": 0.847,
  "confidenceLabel": "High"
}
```

### 4.2 Synchronization Flow
1. Flask sync script queries `GET /internal/students/ids` to obtain all existing local student IDs.
2. Flask queries the University Index for all currently enrolled students.
3. Compare lists:
   - **New in Index**: Download photo, generate 6 augmented embeddings, `POST /internal/students/embeddings` (tier 1).
   - **In DB but not Index**: `PATCH /internal/students/{studentId}/tier` with `{"tier": 2}`.
   - **In Both**: Skip (or update if modified).
4. Flask records sync metrics: `POST /internal/sync/log`.

---

## 5. Security Model

1. **Administrator JWT Authentication**:
   - Secret key configured via `JWT_SECRET`.
   - Admin credentials initialized securely on first startup with BCrypt password hashing.
   - Tokens expire after 24 hours (`JWT_EXPIRATION`).
2. **Internal API Security (`/internal/**`)**:
   - Guarded by `InternalApiKeyAuthFilter`.
   - Requires header: `X-Internal-API-Key: <secret>` configured via `INTERNAL_API_KEY`.
   - Missing or invalid keys are rejected with HTTP 401 Unauthorized.
   - API keys and 512-dimensional face vectors are strictly masked from application logs.
3. **CORS**:
   - Frontend origins configured via `CORS_ALLOWED_ORIGINS` (defaults to `http://localhost:3000`).
4. **Actuator**:
   - Only `/actuator/health` is public. All other management endpoints require authentication.

---

## 6. Configuration & Environment Variables

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `DB_URL` | MySQL JDBC Connection URL | `jdbc:mysql://localhost:3306/uop_db?...` |
| `DB_USERNAME` | Database username | `root` |
| `DB_PASSWORD` | Database password | `123Root` |
| `JWT_SECRET` | Secret key for HMAC-SHA256 JWT signing | `ThisIsASecretKeyForDevelopmentOnly...` |
| `INTERNAL_API_KEY` | Secret key for Flask internal endpoints | `development-internal-key` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of allowed origins | `http://localhost:3000` |
| `AI_SERVICE_URL` | Flask face recognition endpoint | `http://localhost:5000/api/recognize` |
| `ADMIN_USERNAME` | Seed administrator username | `admin` |
| `ADMIN_PASSWORD` | Seed administrator password | `adminpassword` |
| `UNIVERSITY_INDEX_BASE_URL` | Base URL for University Student Index | *(Pending official university spec)* |
| `UNIVERSITY_INDEX_TIMEOUT` | University Index request timeout (ms) | `5000` |
| `UNIVERSITY_INDEX_API_KEY` | University Index bearer token / API key | *(Pending official university spec)* |

---

## 7. Local Development & Testing

### Running Tests
```powershell
cd springboot-backend\backend
.\mvnw.cmd clean test
```

### Running Locally
Ensure MySQL is running on port 3306, then:
```powershell
.\mvnw.cmd spring-boot:run
```

### Running with Docker Compose
```powershell
docker compose up --build
```
This boots MySQL (`uop-mysql-db`) and the Spring Boot backend (`uop-spring-backend`) with matching credentials and healthcheck synchronization.
