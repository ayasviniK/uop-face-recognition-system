# Sentinel — Backend Integration Guide
### For the Spring Boot Teammate

> This document explains how the AI service works, what database
> tables it needs, and exactly what API endpoints Spring Boot needs
> to expose so the three parts connect cleanly.

---

## 1. What Each Part Does

```
React Frontend
      ↓  (HTTP)
Spring Boot Backend        ← YOU
      ↓  (HTTP)
Flask AI Service           ← Ayaz
      ↓  (reads/writes via Spring Boot API)
Your MySQL Database        ← YOU own this
```

**Flask AI Service** does exactly one thing: given a photo, find which
student it belongs to. It handles all AI math — face detection,
alignment, embedding generation, cosine similarity matching.
It does NOT handle authentication, student management, or UI logic.

**Spring Boot** orchestrates everything:
- Authenticates admins
- Calls Flask when identification is needed
- Calls the University Index to get student details after a match
- Owns the MySQL database and exposes internal endpoints for Flask

**React Frontend** talks only to Spring Boot. Never directly to Flask.

---

## 2. The Two Data Sources

### University Index (existing — you access via API)
The university's existing student information system. Has everything:
student ID, name, faculty, year, photo, contact info etc.
You do NOT store personal data from here in your MySQL DB.
You only look things up here when needed (after a match is found).

### Your MySQL DB (you own this)
Stores ONLY what the AI needs for face matching. No names, no
photos, no contact info. Just student IDs and their face embeddings
(mathematical fingerprints).

```
University Index            Your MySQL DB
────────────────            ─────────────
E/18/001                →   E/18/001
Kasun Perera                embedding_original:      [512 numbers]
Engineering                 embedding_flipped:       [512 numbers]
Year 3                      embedding_brighter:      [512 numbers]
photo: https://...          embedding_darker:        [512 numbers]
email: ...                  embedding_rotated_plus:  [512 numbers]
                            embedding_rotated_minus: [512 numbers]
```

When Flask finds a match and returns `E/18/001`, Spring Boot takes
that ID and calls the University Index to get the student's name,
photo, faculty — everything needed to show the admin.

---

## 3. Faculty Detection From Student ID

The university index encodes faculty in the student ID itself.
The first character of the ID tells you the faculty:

```
E/18/001  →  Engineering
M/20/034  →  Medicine
S/19/012  →  Science
A/21/007  →  Arts
```

**Faculty IS stored as a column in your DB.** Even though it can be
parsed from the student ID, storing it explicitly serves two critical
purposes:

**Purpose 1 — Faster matching (optional filter)**
When an admin knows the faculty, Flask can filter before matching:
```sql
SELECT e.* FROM embeddings e
JOIN students s ON e.student_id = s.student_id
WHERE s.faculty = 'Engineering'
AND s.tier = 1
```
Searches ~500 students instead of 5000. Much faster.

If admin doesn't know the faculty (e.g. unknown CCTV footage),
no filter is applied and Flask searches everyone — still fast
at university scale (~5-10ms in numpy).

**Purpose 2 — Spring Boot knows where to look after a match**
After Flask returns a matched `student_id`, Spring Boot needs to
call the University Index to get the student's full details (name,
photo, year etc.). If the University Index organises its endpoints
by faculty (e.g. `/api/engineering/students/E/18/001`), Spring Boot
needs to know the faculty BEFORE making that call.

Without faculty in your DB:
```
Flask returns student_id "E/18/001"
Spring Boot doesn't know which faculty endpoint to hit
→ tries Engineering... not found
→ tries Medicine... not found
→ tries Science... found ✓   ← multiple wasted API calls
```

With faculty in your DB:
```
Flask returns student_id "E/18/001"
Spring Boot queries YOUR DB → gets faculty "Engineering" instantly
→ calls /api/engineering/students/E/18/001 directly ✓
```

**How to populate the faculty column (no extra API call needed):**
Parse it from the student ID at sync time:

```python
def get_faculty(student_id: str) -> str:
    prefix = student_id[0].upper()
    faculty_map = {
        "E": "Engineering",
        "M": "Medicine",
        "S": "Science",
        "A": "Arts",
        # add full list once confirmed with university
    }
    return faculty_map.get(prefix, "Unknown")
```

The faculty is derived from the ID itself — no extra API call,
no manual input. Just parse and store at sync time.

---

## 4. What Embeddings Are

When Flask processes a student's passport photo it runs it through
an AI model called ArcFace (ResNet-50). The model converts the face
into a list of 512 numbers — a mathematical fingerprint of that face.

Two photos of the same person produce very similar lists (cosine
similarity score close to 1.0). Two photos of different people
produce very different lists (score close to 0).

To improve accuracy with only one passport photo per student, Flask
generates 6 slightly varied versions of the photo:
- Original (as-is)
- Flipped (mirrored horizontally)
- Brighter (+20 brightness)
- Darker (-20 brightness)
- Rotated +10°
- Rotated -10°

It generates an embedding for each variant. This is called augmentation.
It gives the matching algorithm 6 chances to recognize a person instead
of 1, which significantly improves accuracy for real-world photos
(different lighting, slight head turns, etc.).

These 6 embeddings are what get stored in your database — one row
per student, six columns.

---

## 5. Database Tables to Create

```sql
-- Table 1: tracks which students have been synced and their search tier
CREATE TABLE students (
    student_id  VARCHAR(50) PRIMARY KEY,
    faculty     VARCHAR(100) NOT NULL,
    -- Faculty is parsed from the student ID prefix at sync time
    -- E/18/001 → "Engineering", M/20/034 → "Medicine" etc.
    -- Stored here so Spring Boot knows which University Index
    -- endpoint to call after a match, without scanning all faculties.
    -- Also used as an optional filter to speed up matching.

    tier        TINYINT DEFAULT 1,
    -- 1 = currently enrolled (search first — fast path)
    -- 2 = alumni / graduated / on leave (search only if tier 1 fails)

    synced_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP
);

-- Table 2: face embeddings — one row per student, 6 columns
-- Each JSON column holds an array of 512 floats (~2KB per column)
-- At 5000 active students, total table size ≈ 60MB — very manageable
CREATE TABLE embeddings (
    student_id              VARCHAR(50) PRIMARY KEY,
    embedding_original      JSON NOT NULL,
    embedding_flipped       JSON NOT NULL,
    embedding_brighter      JSON NOT NULL,
    embedding_darker        JSON NOT NULL,
    embedding_rotated_plus  JSON NOT NULL,
    embedding_rotated_minus JSON NOT NULL,
    generated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (student_id) REFERENCES students(student_id)
                ON DELETE CASCADE
);

-- Table 3: sync history — every sync run gets logged here
CREATE TABLE sync_log (
    id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
    synced_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    students_added       INT DEFAULT 0,
    students_updated     INT DEFAULT 0,
    students_tiered_down INT DEFAULT 0,  -- moved from tier 1 to tier 2
    status               VARCHAR(20) DEFAULT 'success',
    notes                TEXT
);
```

### Why 6 columns instead of 6 rows per student?

When Flask does identification it loads all embeddings for a faculty
(e.g. `WHERE student_id LIKE 'E/%'`) into memory and runs cosine
similarity. With 6 columns, one query returns one row per student —
already structured exactly how Flask needs it. With 6 rows per student
you'd get 6x as many rows plus joins, which is slower and more
complex for no benefit.

### Why store faculty as a column even though it's in the student ID?

Two reasons. First, for filtering — when admin knows the faculty,
Flask filters by it before matching, which is faster. Second and
more importantly, after Flask returns a matched student_id, Spring Boot
needs to call the University Index to get full student details. If the
Index is organised by faculty, Spring Boot needs to know the faculty
BEFORE making that call — without it, Spring Boot would have to try
every faculty endpoint until it finds the right one. Storing faculty
in your DB means Spring Boot can look it up instantly and make one
targeted call. The faculty value is parsed from the student ID at
sync time — no extra API call needed to populate it.

### Why two tiers instead of active/inactive?

The university index may not clearly flag who has graduated.
Using tiers avoids this problem — Flask searches tier 1 first
(current students), and only searches tier 2 (everyone else)
if no confident match is found. Nobody ever gets deleted from
the DB, they just get demoted to tier 2. This also handles edge
cases like a graduated student appearing on a security camera —
the system still finds them, just via the slower second pass.

---

## 6. Internal API Endpoints Flask Needs From Spring Boot

These endpoints are internal — the React frontend never calls them.
Flask calls them to read/write embeddings.

---

### `GET /internal/students/embeddings`

Flask calls this during identification to get candidates to match against.

**Query parameters:**
- `tier` (optional) — `1` for current students, `2` for alumni
  e.g. `?tier=1`
- `facultyPrefix` (optional) — first character of student ID
  e.g. `?facultyPrefix=E` returns only students where `student_id LIKE 'E/%'`
- If both omitted, returns all students

**Response:**
```json
[
  {
    "studentId": "E/18/001",
    "tier": 1,
    "embeddingOriginal":     [0.023, -0.114, 0.087, ...],
    "embeddingFlipped":      [0.019, -0.098, 0.091, ...],
    "embeddingBrighter":     [0.031, -0.121, 0.079, ...],
    "embeddingDarker":       [0.018, -0.109, 0.094, ...],
    "embeddingRotatedPlus":  [0.025, -0.117, 0.083, ...],
    "embeddingRotatedMinus": [0.021, -0.111, 0.089, ...]
  }
]
```

---

### `POST /internal/students/embeddings`

Flask calls this to save a new student's embeddings after generating them.
If student already exists, update their embeddings (UPSERT behaviour).

**Request body:**
```json
{
  "studentId": "E/18/001",
  "faculty": "Engineering",
  "tier": 1,
  "embeddingOriginal":     [0.023, -0.114, 0.087, ...],
  "embeddingFlipped":      [0.019, -0.098, 0.091, ...],
  "embeddingBrighter":     [0.031, -0.121, 0.079, ...],
  "embeddingDarker":       [0.018, -0.109, 0.094, ...],
  "embeddingRotatedPlus":  [0.025, -0.117, 0.083, ...],
  "embeddingRotatedMinus": [0.021, -0.111, 0.089, ...]
}
```

**Response:**
```json
{ "message": "Embeddings saved", "studentId": "E/18/001" }
```

---

### `GET /internal/students/ids`

Returns all student IDs currently in the DB.
Flask uses this during sync to find new students
(in university index but NOT in your DB yet).

**Response:**
```json
{
  "studentIds": ["E/18/001", "E/18/002", "M/20/034", ...]
}
```

---

### `PATCH /internal/students/{studentId}/tier`

Moves a student between tiers.
Flask calls this during sync when a student is no longer
in the active enrollment list — they get moved to tier 2,
not deleted.

**Request body:**
```json
{ "tier": 2 }
```

**Response:**
```json
{ "message": "Student E/18/001 moved to tier 2" }
```

---

### `POST /internal/sync/log`

Flask logs each sync run result here.

**Request body:**
```json
{
  "studentsAdded": 45,
  "studentsUpdated": 3,
  "studentsTieredDown": 12,
  "status": "success",
  "notes": "Semester 1 2026 batch synced"
}
```

---

## 7. The Identification Flow (End to End)

```
1. Admin uploads photo via React frontend

2. React → POST /api/identification/search  (Spring Boot)

3. Spring Boot → POST /api/recognize  (Flask)
   (forwards the image)

4. Flask runs the AI pipeline:
   a. Preprocess image (fix lighting, noise, blur)
   b. Detect face(s) — SCRFD detector
   c. Align each face — 5-point landmark warp to standard position
   d. Generate 512-dim ArcFace embedding for each face
   e. Call GET /internal/students/embeddings?tier=1  (Spring Boot)
      → gets all tier 1 (current student) embeddings
   f. Run cosine similarity vs every stored embedding
   g. Confident match found (score ≥ 0.6)?
        YES → skip to step h
        NO  → call GET /internal/students/embeddings?tier=2
              run cosine similarity vs tier 2 (alumni) embeddings
   h. Return top matches

5. Flask → returns to Spring Boot:
   {
     "matches": [
       { "studentId": "E/18/001", "confidence": 0.847 },
       { "studentId": "E/19/033", "confidence": 0.412 }
     ]
   }

6. Spring Boot takes studentId "E/18/001"
   → calls University Index API to get full student details
   → name, faculty, photo URL, year, etc.

7. Spring Boot → returns to React:
   {
     "studentId": "E/18/001",
     "name": "Kasun Perera",
     "faculty": "Engineering",
     "year": 3,
     "photoUrl": "https://...",
     "confidence": 0.847,
     "confidenceLabel": "High"
   }

8. React shows the result to the admin
```

---

## 8. The Sync Flow (How Embeddings Get Into the DB)

Runs nightly (scheduled) or manually triggered by admin.
This is what populates your DB from the university index.

```
1. Flask sync script calls GET /internal/students/ids (Spring Boot)
   → gets all student IDs already in your DB

2. Flask calls University Index API
   → gets all currently enrolled students

3. Compare the two lists:
   New in index, not in DB    → generate embeddings, save as tier 1
   In DB, not in index anymore → move to tier 2 (don't delete)
   In both                    → already synced, skip

4. For each NEW student:
   a. Get their photo URL from University Index
   b. Download the passport photo
   c. Run Flask AI pipeline → generates 6 augmented embeddings
   d. Call POST /internal/students/embeddings → saves to MySQL

5. For each student NO LONGER in index:
   a. Call PATCH /internal/students/{id}/tier with { "tier": 2 }
   b. They're now alumni — still searchable but lower priority

6. Call POST /internal/sync/log with the summary
```

---

## 9. Confidence Score Table

| Score | Label | What it means | Recommended action |
|---|---|---|---|
| ≥ 0.60 | High | Strong match, system is confident | Show to admin for quick confirm |
| 0.40–0.59 | Medium | Likely right, small uncertainty | Admin should verify carefully |
| 0.35–0.39 | Low | Weak signal | Flag for manual review |
| < 0.35 | No match | Not found in system | Show as unidentified |

---

## 10. Flask Endpoints Summary (What Spring Boot Calls)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/recognize` | Main identification — send image, get matches |
| GET | `/health` | Check Flask is running |

That's it for production. All other Flask endpoints
(`/register`, `/students`, `/stats` etc.) are for
development and testing only.

---

## 11. Current Dev State vs Production

Right now Flask uses a local JSON file (`mock_db.json`) as a fake
database. This is intentional — it lets the AI service be built
and tested without needing the real database ready.

When your MySQL DB and internal endpoints are ready, the only
change in Flask is swapping `mock_db.py` (reads/writes JSON)
for HTTP calls to your `/internal/*` endpoints.
The AI pipeline, matching logic, and `/api/recognize` endpoint
stay completely unchanged.

---

## 12. Questions to Resolve Before Integration

1. **Authentication for `/internal/*` endpoints** — API key? JWT?
   Flask needs credentials to call Spring Boot internally.

2. **University Index API spec** — what does the endpoint look like?
   How does Flask authenticate with it? What's the photo URL format?

3. **Student ID format** — confirm the faculty prefix convention.
   e.g. E = Engineering, M = Medicine, S = Science — full list?

4. **Who triggers sync?** — nightly scheduled job? Manual admin button?
   Or both?

5. **Photo availability** — are all student photos guaranteed to exist
   in the university index? What happens if a photo is missing or
   too low quality to generate embeddings?
