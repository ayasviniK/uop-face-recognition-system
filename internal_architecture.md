# Internal Architecture & AI Details: UoP Face Recognition System

> **Personal reference only — excluded from version control via `.gitignore`.**
> Describes the actual current implementation, not the planned one.

---

## 1. High-Level Architecture

The system is a three-tier architecture:

```
React Frontend  →  Spring Boot Backend  →  Python AI Service (Flask)
                                                    ↓
                                             PostgreSQL (via Spring)
```

**Current status:**
- **Python AI Service** — fully implemented with a mock JSON database standing in for PostgreSQL
- **Spring Boot Backend** — in development (teammate)
- **React Frontend** — in development (teammate)

The Flask service is a standalone REST API. It does all the AI work (detection, alignment, embedding, matching) and nothing else. No authentication, no business logic, no direct DB connection in production — that's all Spring Boot's job.

---

## 2. Python AI Service — File Structure

```
python-ai-service/
├── app.py                  Flask routes — the API layer
├── import_dataset.py       Standalone script for bulk registering Kaggle dataset
├── requirements.txt
├── .gitignore
├── NOTES.md                (this file — gitignored)
│
├── data/
│   ├── mock_db.json        JSON-based mock database (embeddings + metadata)
│   └── import_report.json  Generated after each dataset import run
│
├── logs/
│   └── audit.jsonl         One JSON object per line — every request logged
│
└── utils/
    ├── preprocessor.py     Image quality checks + normalization
    ├── aligner.py          5-point facial landmark alignment
    ├── embedder.py         Loads InsightFace buffalo_l, calls aligner
    ├── augmentor.py        Generates 6 synthetic variants per registration photo
    ├── matcher.py          Cosine similarity + deduplication + confidence labels
    ├── video_processor.py  Frame sampling + per-frame pipeline + aggregation
    ├── mock_db.py          JSON file database — will be replaced by real DB calls
    └── audit_logger.py     Logs every register/identify to audit.jsonl
```

> `face_detector.py` was deleted — it was an early OpenCV YuNet detector that became
> completely redundant once InsightFace buffalo_l was integrated. InsightFace runs its
> own SCRFD detector internally, so the OpenCV one was never called.

---

## 3. The AI Pipeline — Step by Step

Every image goes through this full pipeline before any matching happens:

```
Uploaded Image
      ↓
[1] preprocessor.py    — quality checks + normalize
      ↓
[2] embedder.py → aligner.py
      → SCRFD detector (built into buffalo_l) finds faces + 5 landmarks
      → aligner.py warps each face to standard 112x112 frontal position
      → ResNet-50/ArcFace generates 512-dim embedding
      ↓
[3] matcher.py         — cosine similarity vs all stored embeddings
      → deduplication (best score per person)
      → confidence labeling
      ↓
Result JSON
```

---

## 4. Deep Dive — Each Component

### `preprocessor.py` — Image Normalization

Runs before the AI sees anything. Catches bad images early.

**Quality checks (rejection criteria):**
- Image smaller than 64×64px
- Mean brightness below 30 or above 230 (too dark / overexposed)
- Laplacian variance below 50 (too blurry)

**Processing steps (in order):**
1. `fix_orientation()` — corrects landscape photos that should be portrait
2. `resize_to_standard()` — scales longest side to 640px, preserving aspect ratio
3. `denoise()` — `cv2.fastNlMeansDenoisingColored` removes scan grain (critical for passport photocopies)
4. `normalize_brightness()` — CLAHE applied to the Y channel in YCrCb colorspace. Works locally per region — fixes uneven lighting without washing out well-lit areas
5. `sharpen()` — unsharp mask via Gaussian blur subtraction recovers JPEG/scan compression loss

> Video frames skip quality checks (`skip_quality_check=True`) because frames naturally
> vary in blur and brightness. The multi-frame aggregation step handles noise instead.

---

### `embedder.py` + `aligner.py` — Detection, Alignment, and Embedding

These two files work together as one pipeline. This is where the actual AI runs.

#### The Model: InsightFace `buffalo_l`

`buffalo_l` is a model *pack* — it bundles several ONNX models that run together:

| Model file | What it does | Architecture |
|---|---|---|
| `det_10g.onnx` | Detects face bounding boxes + 5 landmarks | SCRFD |
| `w600k_r50.onnx` | Generates 512-dim face embedding | ResNet-50 / ArcFace |
| `2d106det.onnx` | 106-point landmark refinement | CNN |
| `1k3d68.onnx` | 3D landmark detection | CNN |
| `genderage.onnx` | Gender + age estimate (unused by us) | Small CNN |

When `analyzer.get(img)` is called, InsightFace runs all of these internally and returns structured face objects with bounding boxes, landmarks, and embeddings already extracted.

#### What ArcFace Actually Is

ArcFace is NOT the network. It's the *loss function* used to train the network.

- **ResNet-50** = the actual neural network (50-layer CNN). It processes the image and outputs the 512-number vector.
- **ArcFace (Additive Angular Margin Loss)** = the mathematical technique used *during training only* to teach ResNet-50 that same-person embeddings should point in the same direction and different-person embeddings should point in different directions.

After training, ArcFace is gone — only the trained ResNet-50 weights remain in the `.onnx` file. The reason cosine similarity works so well is because ArcFace literally optimized the model for angular separation between identities.

#### `buffalo_l` vs `buffalo_sc`

| | `buffalo_sc` | `buffalo_l` |
|---|---|---|
| Recognition model | MobileFaceNet | ResNet-50 |
| Speed on CPU | Faster | ~2-3× slower |
| Cross-photo accuracy | Lower | Significantly higher |
| Model size | ~16MB | ~160MB |

#### Face Alignment (`aligner.py`)

ResNet-50/ArcFace was trained on faces all pre-aligned to the same pixel positions.
It "expects" the left eye to always be near (38, 51) in a 112×112 image.

If a face is tilted 15° and the eyes land at (20, 80), the model's learned filters
don't spatially match the actual face features — accuracy drops significantly.

**What alignment does:**

1. SCRFD detects 5 landmarks: left eye, right eye, nose tip, left mouth corner, right mouth corner
2. `cv2.estimateAffinePartial2D(method=cv2.LMEDS)` computes the rotation + scale + translation that maps detected landmark positions to these reference positions:

```
Left eye:           (38.29, 51.70)
Right eye:          (73.53, 51.50)
Nose tip:           (56.02, 71.74)
Left mouth corner:  (41.55, 92.37)
Right mouth corner: (70.73, 92.20)
```

3. `cv2.warpAffine` applies the transform — output is a 112×112 image where landmarks always land at reference positions regardless of original head pose
4. The aligned crop is re-fed into `analyzer.get()` to extract the final embedding

This is why Mr. Indika's turned smiling photo improved significantly after alignment was added.

#### The 512-Dimensional Embedding

ResNet-50 outputs `normed_embedding` — a vector of 512 floats, L2-normalized (total length = exactly 1).

L2 normalization means: `cosine_similarity(a, b) = dot_product(a, b)`

This is why `matcher.py` can just do `np.dot(a, b)`. The normalization removes magnitude
and leaves only direction — the "fingerprint" encodes purely where this face points in
512-dimensional embedding space.

---

### `augmentor.py` — Embedding Augmentation (Registration Only)

**Problem:** One passport photo = one point in 512-dim space. A real photo of the same
person taken later might land at a slightly different nearby point and miss the single
stored embedding.

**Solution:** Generate 6 synthetic variants and embed all of them. This places 6 points
scattered around the person's true region in embedding space — 6 chances to match instead of 1.

| Augmentation | Transform |
|---|---|
| `original` | No change — baseline |
| `flipped` | Horizontal mirror — handles slight left/right turns |
| `brighter` | All pixels +20 — simulates brighter environment |
| `darker` | All pixels -20 — simulates dimmer environment |
| `rotated_plus` | +10° rotation around center |
| `rotated_minus` | -10° rotation around center |

Each variant goes through the full alignment + embedding pipeline. Only variants where
a face is successfully detected are stored.

**Limit:** Augmentation can't invent detail not in the original photo. This is a
workaround for single-photo registration — real systems use multiple real photos.

---

### `matcher.py` — Cosine Similarity Matching

**Input:** One query embedding (512-dim) + all stored candidate embeddings (one per augmentation per person).

**Process:**
1. `np.dot(query, candidate["embedding"])` for every candidate — cosine similarity for L2-normalized vectors
2. Group by `student_id` — keep only the highest score per person (deduplication)
3. Sort descending
4. Apply confidence labels, filter out scores below threshold

**Confidence thresholds:**

| Score | Label | Meaning |
|---|---|---|
| ≥ 0.60 | High | System is confident |
| ≥ 0.40 | Medium | Likely correct, worth verifying |
| ≥ 0.35 | Low | Weak signal, needs human review |
| < 0.35 | — | Filtered out entirely |

**Real-world scores observed:**
- Same photo as registered: **1.0**
- Different photo, same person: **0.55–0.63**
- Mr. Indika turned smiling photo: **0.5507 (Medium)**
- Mrs. Kalhari, makeup + loose hair: **0.5473 (Medium)**

> These thresholds are NOT calibrated — they're reasonable starting estimates.
> Proper calibration needs 20+ people tested with multiple photos each.

---

### `video_processor.py` — Video Identification

Same image pipeline applied across video frames with aggregation.

**1fps sampling** — 30fps video = 1800 frames/minute. ArcFace on all of them = ~30 min/min on CPU. At 1fps = ~1 min processing per 1 min of video. Identity doesn't change frame-to-frame.

**Skip quality check** — Video frames vary in blur/brightness naturally. Strict checks would skip most frames. Aggregation handles noise.

**Minimum 2 frame appearances** — Single frame match could be a false positive. 2+ independent frames is statistically much stronger.

**Average score for filtering** — Best score can be won by one lucky frame. Average across all appearances is more honest.

**Temp file** — OpenCV `VideoCapture` needs a real file path, not a stream. `finally` block guarantees cleanup even if processing crashes.

---

## 5. Mock Database (`mock_db.py`)

Simulates PostgreSQL using a local JSON file.

**Key design note:** The internal storage key is `"staff_id"` (teammate's convention)
but all functions that return data to `matcher.py` and `app.py` use `"student_id"` and
`"student_name"` — the keys the rest of the code expects. This bridging is intentional
to avoid a cascade of changes everywhere else.

**When real DB integration happens:** `mock_db.py` gets replaced entirely. Function
signatures stay the same — only the internals change (JSON reads → HTTP calls to
Spring Boot). `app.py` doesn't need to change at all.

> Delete `mock_db.json` whenever you change the AI model or alignment settings.
> Old embeddings from the previous model are incompatible with new ones.

---

## 6. External Libraries

| Library | Role in this project |
|---|---|
| **`insightface`** | Core AI engine — SCRFD detection, landmark extraction, ResNet-50/ArcFace embedding |
| **`onnxruntime`** | Runs InsightFace's `.onnx` model files on CPU |
| **`opencv-python`** | Image processing — `warpAffine` for alignment, `VideoCapture` for video, CLAHE, denoising |
| **`numpy`** | Math — dot products for cosine similarity, array manipulation, image byte conversion |
| **`Flask`** | REST API framework — HTTP routing, request parsing, JSON responses |
| **`kagglehub`** | Downloads Kaggle datasets (`import_dataset.py` only) |
| **`requests`** | HTTP client used by `import_dataset.py` to call Flask's `/register` endpoint |

---

## 7. Things Still Pending

- [ ] **False positive testing** — 74 students registered, no photo of a non-registered person tested yet. Most critical missing validation before showing this to anyone.
- [ ] **Threshold calibration** — 0.35/0.40/0.60 are estimates. Need real data from 20+ people with multiple photos each.
- [ ] **Real DB integration** — replace `mock_db.py` with Spring Boot API calls. Agree on key naming (`student_id` vs `staff_id`) with teammate before integration.
- [ ] **Video endpoint testing** — needs a real MP4 with a registered face in it.
- [ ] **Manual review queue** — Medium/Low confidence matches should go to a human queue rather than auto-returning.
- [ ] **`buffalo_l` pre-download** — model is ~160MB and downloads on first request. Pre-bundle before any demo or deployment.