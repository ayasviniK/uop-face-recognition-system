# UoP Face Recognition System — Technical Deep Dive (Personal Notes)

> **This file is for YOUR understanding only. Do NOT commit this to GitHub.**
> `NOTES.md` is already in `.gitignore` — it will never be pushed.

---

## 1. Big Picture Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐      ┌──────────────┐
│  React Frontend  │ ───▶ │  Spring Boot      │ ───▶ │  Flask AI        │ ───▶ │  PostgreSQL   │
│  (Teammate 3)    │ ◀─── │  Backend          │ ◀─── │  Service (YOU)   │      │  (via Spring) │
└─────────────────┘      │  (Teammate 2)     │      └─────────────────┘      └──────────────┘
                          └──────────────────┘
```

**Your responsibility (Flask AI Service):** everything related to "given an image or video, find faces and tell me who they belong to."

**You do NOT touch:** authentication, the real database, the UI. You expose clean HTTP endpoints and everyone else builds around them.

---

## 2. The Model — What Is Actually Running

### Short answer: It's ArcFace — but ArcFace is a *loss function*, not a network architecture. The network underneath IS based on ResNet. They're not competing things.

**ResNet-50** is the actual neural network — the stack of convolutional layers that takes an image and produces a 512-number vector. It's the "body."

**ArcFace (Additive Angular Margin Loss)** is the *loss function* used during training. It's the mathematical trick that trains the ResNet to produce embeddings that are good for face recognition specifically. It pushes embeddings of the SAME person closer together angularly, and embeddings of DIFFERENT people further apart.

So "we're using ArcFace" means: *"We're using a ResNet-50 that was trained using the ArcFace loss function on a huge face dataset."*

### Why ArcFace loss matters

Normal losses just optimize "get the right label." ArcFace optimizes "place this person's face at a specific region on a 512-dimensional sphere, tightly clustered with their other photos, angularly far from everyone else." This is WHY cosine similarity works — ArcFace was literally trained to maximize angular separation between identities.

### What you're running: `buffalo_l`

InsightFace ships model "packs." You use `buffalo_l`. What's actually inside it:

| Component | What it does | Architecture |
|---|---|---|
| **Detection model** | Finds faces + 5 landmarks | SCRFD (lightweight detector) |
| **Recognition model** | Generates 512-dim embedding | ResNet-50 trained with ArcFace loss |
| Gender/Age model | Estimates age + gender (unused by us) | Small CNN |

When you call `analyzer.get(img)`, InsightFace runs ALL of this: detects faces (SCRFD), extracts landmarks, aligns, then passes through ResNet-50/ArcFace to get the embedding.

### `buffalo_l` vs `buffalo_sc` (what you switched from)

| | buffalo_sc | buffalo_l |
|---|---|---|
| Recognition backbone | MobileFaceNet | ResNet-50 |
| Speed (CPU) | Faster | ~2-3x slower |
| Accuracy | Lower | Significantly higher cross-photo |
| Model size | ~16MB | ~160MB |

---

## 3. The Embedding — What Those 512 Numbers Are

A face embedding is a point in 512-dimensional space. In a simpler 2D analogy:

```
Person A, photo 1: (0.81, 0.59)
Person A, photo 2: (0.79, 0.61)   ← close together = same person

Person B, photo 1: (-0.3, 0.95)
Person B, photo 2: (-0.28, 0.96)  ← close together = same person

Person A vs Person B: far apart = different people
```

Your system does this in 512 dimensions. "Closeness" is measured by the ANGLE between vectors (cosine similarity) — because ArcFace was trained to optimize angular separation.

### Why L2-normalized?

`face.normed_embedding` returns a vector of length exactly 1. This means:
```
cosine_similarity(a, b) = dot_product(a, b)
```
Normalizing removes scale and leaves only DIRECTION — which encodes identity. This is why `matcher.py` can just do `np.dot(a, b)` instead of the full cosine formula.

---

## 4. Full Pipeline — What Happens on Each Request

### `POST /identify` (single image)

```
1. Image arrives as bytes
        ↓
2. decode_image()
   np.frombuffer + cv2.imdecode → OpenCV BGR NumPy array
        ↓
3. preprocess() — preprocessor.py
   ├── check_image_quality()
   │     brightness check (mean pixel 30–230)
   │     sharpness check (Laplacian variance > 50)
   │     size check (min 64x64px)
   │     → REJECTS bad images with clear error message
   ├── fix_orientation()    — corrects sideways photos
   ├── resize_to_standard() — longest side → 640px
   ├── denoise()            — fastNlMeansDenoisingColored (scan grain)
   ├── normalize_brightness() — CLAHE on Y channel (YCrCb)
   └── sharpen()            — unsharp mask
        ↓
4. get_embedding_from_image() — embedder.py → aligner.py
   ├── analyzer.get(img)    — SCRFD finds all faces + 5 landmarks
   ├── align_face()         — warp face to standard 112x112 using landmarks
   │     cv2.estimateAffinePartial2D: rotation+scale+translation
   │     cv2.warpAffine: applies transform
   └── Re-run analyzer.get() on aligned crop → final 512-dim embedding
        ↓
5. get_all_embeddings() — mock_db.py
   All students, all augmented embeddings (up to 6 per student)
   Flattened: [{student_id, embedding, augmentation_name}, ...]
        ↓
6. find_top_matches() — matcher.py
   Cosine similarity vs every candidate embedding
   Deduplicate: keep best score per student
   Sort descending, apply confidence labels, filter below threshold
        ↓
7. log_identification() — audit_logger.py → logs/audit.jsonl
        ↓
8. Return JSON
```

### `POST /identify/video` (video file)

```
1. Video file uploaded (MP4/AVI/MOV/MKV/WebM)
        ↓
2. Validate file extension
        ↓
3. Save to temp file (OpenCV needs a path, not a byte stream)
        ↓
4. extract_frames() — video_processor.py
   OpenCV VideoCapture → sample 1 frame per second
   (30fps video: process 1 in every 30 frames)
        ↓
5. For each sampled frame:
   ├── preprocess() with skip_quality_check=True
   │   (video frames naturally vary — don't reject too many)
   ├── get_embedding_from_image() — same as image pipeline
   └── find_top_matches() → collect {student_id, score, timestamp}
        ↓
6. Aggregate across frames — video_processor.py
   Per student:
   ├── Must appear in ≥ 2 frames (filters single-frame false positives)
   ├── Average score must be ≥ 0.35
   ├── Compute: frames_appeared, first_seen, last_seen, best/avg score
   └── Sort by first_seen timestamp
        ↓
7. Cleanup temp file (always, even if processing failed)
        ↓
8. Return report JSON
```

---

## 5. Why Augmentation Works

A single passport photo gives ONE point in 512-dim space. A new photo of the same person lands at a SLIGHTLY DIFFERENT nearby point — there's a natural "cloud" around each person's true identity region.

By generating 6 variations (flip, +brightness, -brightness, rotate ±10°) and embedding all of them, you place 6 points scattered around that identity's region. A query photo has 6 chances to match instead of 1. The matcher takes the BEST score across all 6 and deduplicates by student.

**6 augmentations stored per student:**
- `original`      — baseline
- `flipped`       — mirrors face (handles slight left/right turns)
- `brighter`      — +20 brightness (simulates bright environment)
- `darker`        — -20 brightness (simulates dim environment)
- `rotated_plus`  — +10° tilt
- `rotated_minus` — -10° tilt

**Limits of this approach:** augmentation can't invent information not in the original photo. A heavily backlit passport photo darkened synthetically won't recover detail that was never captured. This is a workaround for "one photo per student" — real systems use multiple real photos.

---

## 6. Why Face Alignment Helps

ArcFace's ResNet-50 was trained on millions of faces ALL pre-aligned to the same eye/nose/mouth positions. The network "expects" the left eye to always be near pixel (38, 51) in a 112x112 image.

If a face is tilted and the eyes are at (20, 80), the network's filters don't line up with the actual face. It still produces an embedding, but suboptimally.

`align_face()` computes the rotation+scale+shift that maps detected landmarks to these reference positions:

```
Left eye:           (38.29, 51.70)
Right eye:          (73.53, 51.50)
Nose tip:           (56.02, 71.74)
Left mouth corner:  (41.55, 92.37)
Right mouth corner: (70.73, 92.20)
```

Then warps the entire image so those landmarks land exactly there. ArcFace then sees a "digitally re-posed" frontal face. This is why Mr. Indika's turned smiling photo went from Low to Medium confidence.

---

## 7. Video Processing — The Key Design Decisions

### Why 1 frame per second?
A 30fps video has 1800 frames per minute. Running ArcFace on all 1800 = ~30 minutes per minute of video. At 1fps = 60 frames = ~1 minute of processing per minute of video. Identity doesn't change frame-to-frame, so you lose nothing.

### Why skip quality check on video frames?
Video frames naturally vary in motion blur, brightness, and compression. If you applied the same quality checks as passport photos, you'd skip most frames. So `skip_quality_check=True` is used — the aggregation step handles noise instead.

### Why require ≥ 2 frame appearances?
A single frame's match could be a coincidence — similar face in the crowd, compression artifact, partial occlusion. Requiring multiple independent frames makes the result statistically much stronger.

### Why average score instead of best score for filtering?
Best score is gameable by a single lucky frame. Average score across multiple frames is more honest about how consistently the system recognized the person.

### Temp file pattern — why?
```python
with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
    tmp_path = tmp.name
    video_file.save(tmp_path)
try:
    # process...
finally:
    if os.path.exists(tmp_path):
        os.remove(tmp_path)
```
OpenCV's `VideoCapture` needs a real file path — it can't read from a Python bytes stream. The `finally` block guarantees cleanup even if processing crashes midway. Without this, failed uploads would fill your disk with orphaned video files.

---

## 8. Threshold Tuning

Current thresholds:
```python
score >= 0.6   → "High"     (auto-confident)
score >= 0.4   → "Medium"   (likely right, should verify)
score >= 0.35  → "Low"      (weak signal, needs review)
score < 0.35   → filtered out
```

Real-world scores observed so far:
- Same photo as registered: **1.0**
- Different photo, same person (after alignment + augmentation): **0.55–0.63**
- Mr. Indika casual photo: **0.5507**
- Mrs. Kalhari makeup/loose hair: **0.5473**

**These thresholds are NOT calibrated yet.** To do it properly:
1. Register 20+ students with passport photos
2. Run `/identify` on 3-4 DIFFERENT photos of each → record scores (true positives)
3. Run `/identify` on photos of people NOT in the system → record scores (false positives)
4. Find the score that separates the two groups best → that's your real threshold

**You haven't tested false positives yet** — this is the most important missing test before the system goes live.

---

## 9. All Endpoints — Quick Reference

| Method | Endpoint | What it does |
|---|---|---|
| GET | `/health` | Status + registered student count |
| POST | `/upload` | Validate image + return diagnostics |
| POST | `/register` | Register student with 6 augmented embeddings |
| POST | `/identify` | Identify face(s) in a single image |
| POST | `/identify/video` | Identify people across a video file |
| GET | `/students` | List all registered students |
| GET | `/students/<id>` | Get one student's details |
| DELETE | `/students/<id>` | Remove a student |
| GET | `/logs` | Recent audit log entries |
| GET | `/stats` | Dashboard statistics |

---

## 10. File-by-File Reference

```
python-ai-service/
├── app.py                   Flask routes — the API contract layer
├── import_dataset.py        Standalone script — batch registers Kaggle dataset
├── requirements.txt         Flask, numpy, opencv-python, pillow,
│                            insightface, onnxruntime, requests, kagglehub
├── .gitignore
├── NOTES.md                 ← this file (gitignored)
│
├── data/
│   ├── mock_db.json         Fake database. Students + augmented embeddings.
│   │                        DELETE THIS when changing models — old embeddings
│   │                        become incompatible with new models.
│   └── import_report.json   Auto-generated after each dataset import run.
│                            Shows who was registered, who failed and why.
│
├── logs/
│   └── audit.jsonl          One JSON object per line. Every request logged.
│
└── utils/
    ├── __init__.py          Empty — makes this a Python package
    ├── preprocessor.py      Quality check, resize, denoise, CLAHE, sharpen
    ├── aligner.py           5-point landmark alignment — biggest accuracy win
    ├── embedder.py          Loads buffalo_l (singleton), calls aligner
    ├── augmentor.py         6 synthetic variations per registration photo
    ├── matcher.py           Cosine similarity + dedup + confidence labels
    ├── video_processor.py   Frame sampling, per-frame identification, aggregation
    ├── mock_db.py           JSON-file database — swap for real DB later
    └── audit_logger.py      Logs every register/identify to audit.jsonl
```

---

## 11. Teammate Compatibility — Key Things to Know

Your backend teammate (Member 2) modified some files. This caused key mismatches
that broke things. Here's what changed and how we handled it:

### What your teammate changed
- `mock_db.py` — switched internal storage key from `"students"` to `"staff"`
- `mock_db.py` — changed `register_student()` signature: removed `year`, `email`, added `image`
- `matcher.py` — changed `student_id`/`student_name` keys to `staff_id`/`staff_name`

### How we fixed it (what's in the current files)
- `mock_db.py` — stores under `"staff"` key internally (respecting teammate's change)
  BUT `register_student()` still accepts `student_id`, `year`, `email` (what `app.py` needs)
  AND `get_all_embeddings()` still returns `student_id`/`student_name` (what `matcher.py` needs)
  AND has auto-migration: if DB has old `"students"` key, converts it automatically on load
- `matcher.py` — reverted back to `student_id`/`student_name` to match `mock_db.py` output

### The lesson
When your teammate modifies shared utility files, check that the keys they use
match what every other file that calls those functions expects. The chain is:
```
mock_db.get_all_embeddings() → returns keys → matcher.find_top_matches() reads those keys
```
If either end changes key names without the other knowing, you get a KeyError at runtime.

### When real DB integration happens
The teammate will replace `mock_db.py` entirely with real PostgreSQL calls.
At that point, agree on ONE set of key names (recommend `student_id`, `student_name`)
and make sure both `mock_db.py` (or its replacement) and `matcher.py` use the same ones.

---

## 12. Dataset Import — How It Works

### The Kaggle dataset used
`kaustubhdhote/human-faces-dataset` — ~5000 real faces + ~5000 AI-generated faces.

Structure on disk after download:
```
Human Faces Dataset/
├── Real Images/        ← we use this
└── AI-Generated Images/ ← automatically skipped
```

### How `import_dataset.py` works
1. Downloads via `kagglehub` (requires `~/.kaggle/kaggle.json` credentials)
2. Walks folders recursively — skips any folder with AI/generated/GAN in its name
3. Picks N random images from real folders (shuffled for variety)
4. Generates fake Sri Lankan student records (ID, name, department, year, email)
5. Calls `POST /register` for each image via HTTP (Flask must be running)
6. Saves a report to `data/import_report.json`

### Running it
```bash
# Must have Flask running first (python app.py in another terminal)

python import_dataset.py --limit 50    # register 50 students (~6 min on CPU)
python import_dataset.py --limit 100   # register 100 students (~12 min)
python import_dataset.py --list-folders # just inspect structure, don't register
```

### Real-world results
- 74/75 attempted: 74 successful, 1 failed (bad quality image) — 98.7% success rate
- ~5 seconds per student on CPU (including 6 augmentations each)
- Detection confidence range: 0.79–0.85

### Limitation
Since the dataset has one image per unique person (no identity grouping),
you can only test false positives with it, not cross-photo matching.
For cross-photo testing you'd need LFW (Labeled Faces in the Wild) dataset
which has multiple photos per person.

---

## 13. Development Phases — What's Done vs What's Next

```
✅ Phase 1 — Core pipeline
   Face detection, ArcFace embedding, cosine similarity matching,
   mock DB, audit logging, all basic endpoints

✅ Phase 2 — Production AI quality
   Image preprocessing (CLAHE, denoise, sharpen, quality checks)
   Face alignment (5-point landmark warp)
   Embedding augmentation (6 variants per passport photo)
   Upgraded buffalo_sc → buffalo_l

✅ Phase 2.5 — Video identification
   Frame sampling (1fps), per-frame pipeline, multi-frame aggregation,
   POST /identify/video endpoint

✅ Phase 2.6 — Dataset import
   Kaggle integration, AI-folder filtering, batch registration,
   fake student record generation, import report

⏳ Phase 3 — Real database (needs backend teammate)
   Replace mock_db.json with real PostgreSQL calls via Spring Boot
   Spring Boot fetches embeddings, passes to Flask in request body
   Flask becomes pure AI service with no DB access

⏳ Phase 4 — Scale & reliability
   Manual review queue for Medium/Low confidence matches
   Batch registration from CSV + photos folder
   False positive testing + threshold calibration
   Response caching for repeated queries
   Better error monitoring
```

---

## 14. Things to Do / Remember

- [ ] **Test false positives NOW** — you have 74 registered students. Upload a photo
      of someone NOT in the DB and see if it incorrectly matches anyone.
      This is the most critical test before showing this to anyone.
- [ ] **Threshold calibration** — 0.35/0.4/0.6 are guesses. Need real data to set properly.
- [ ] **Test multi-face image** — upload a group photo. The code supports multiple faces
      but it's untested with the current 74-student DB.
- [ ] **Test video endpoint** — needs an actual MP4 with a registered face in it.
- [ ] **Sync with teammate** — agree on key names (`student_id` vs `staff_id`) before
      real DB integration. Currently your mock_db bridges both but the real DB won't.
- [ ] **`buffalo_l` is ~160MB** — first deployment will be slow (model download).
      Pre-download it or bundle with the service before demo.
- [ ] **EXIF orientation** — `fix_orientation()` only handles one case. Phone photos
      use EXIF tags that OpenCV strips. May need `piexif` library for robust handling.
- [ ] **Detector runs twice per face** — once on full image, once on aligned crop.
      Fine for now, bottleneck for batch/video at scale.
- [ ] **Register more students** — currently 74. Run `--limit 200` or `--limit 500`
      when you want to simulate a real university load.

---

## 15. Glossary

| Term | Meaning |
|---|---|
| **Embedding** | 512 numbers representing a face's "identity fingerprint" in high-dimensional space |
| **ArcFace** | Loss function used to TRAIN the model — maximizes angular separation between identities |
| **ResNet-50** | The actual neural network architecture (50-layer CNN) — the "body" of the recognition model |
| **SCRFD** | The face detection model — finds bounding boxes + 5 landmarks. Separate from recognition. |
| **Cosine similarity** | Angle-based similarity measure. 1 = identical direction, 0 = perpendicular |
| **L2 normalization** | Scaling a vector to length 1, so cosine similarity = dot product |
| **Landmarks** | 5 specific facial points (left eye, right eye, nose tip, 2 mouth corners) |
| **Alignment** | Warping a face so landmarks always land at reference positions — "undoes" head tilt/turn |
| **CLAHE** | Contrast Limited Adaptive Histogram Equalization — local brightness normalization |
| **Augmentation** | Synthetic variations of a photo (flip, rotate, brightness) to improve matching robustness |
| **Singleton pattern** | Load the model ONCE on first request, reuse for all subsequent requests |
| **Cross-photo matching** | Matching a person across two DIFFERENT photos — the hard, realistic case |
| **Frame sampling** | Processing 1 frame per second instead of every frame — makes video processing feasible on CPU |
| **Aggregation** | Combining match results across multiple frames; requires ≥2 appearances and filters noise |
| **False positive** | System says "this is Person X" when it's actually someone else — the dangerous failure mode |
| **False negative** | System says "no match" when the person IS in the database — less dangerous but annoying |
| **Threshold calibration** | Finding the right similarity score cutoff to minimize both false positives and false negatives |
| **KeyError** | Python crash when you try to access a dict key that doesn't exist — usually a naming mismatch |