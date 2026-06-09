import numpy as np
import insightface
from insightface.app import FaceAnalysis


# Module-level singleton — we load the model once when the Flask app starts,
# not on every request. Loading a model takes ~2-3 seconds; you don't want
# that happening per upload.
_face_analyzer = None


def get_analyzer() -> FaceAnalysis:
    """
    Load and return the InsightFace analyzer (singleton pattern).

    InsightFace bundles several models. We use:
    - buffalo_sc: lightweight model, good balance of speed vs accuracy.
      "sc" = single-model (detection + recognition in one).
      Alternative: "buffalo_l" is more accurate but heavier — not ideal on
      your Dell Latitude with no GPU.

    ctx_id=-1 means CPU only. If you had an NVIDIA GPU you'd pass ctx_id=0.
    """
    global _face_analyzer
    if _face_analyzer is None:
        _face_analyzer = FaceAnalysis(
            name="buffalo_sc",
            providers=["CPUExecutionProvider"]
        )
        _face_analyzer.prepare(ctx_id=-1, det_size=(640, 640))
    return _face_analyzer


def get_embedding(face_crop: np.ndarray) -> np.ndarray | None:
    """
    Generate a 512-dimensional face embedding from a cropped face image.

    What is an embedding?
    Think of it as a "fingerprint" for a face — a list of 512 numbers that
    uniquely describes that person's facial features. Two photos of the same
    person will produce embeddings that are very close to each other.
    Two different people will produce embeddings far apart.

    We measure "closeness" using cosine similarity (see matcher.py).

    Args:
        face_crop: OpenCV BGR image, ideally 112x112 (what ArcFace expects).

    Returns:
        A NumPy array of shape (512,), or None if no face found in the crop.
    """
    analyzer = get_analyzer()
    faces = analyzer.get(face_crop)

    if not faces:
        return None

    # If InsightFace found multiple faces in the crop (unlikely but possible),
    # take the one with the highest detection score.
    best_face = max(faces, key=lambda f: f.det_score)

    # .normed_embedding is already L2-normalized — required for cosine similarity
    return best_face.normed_embedding


def get_embedding_from_image(img: np.ndarray) -> list[dict]:
    """
    Run the full pipeline on a full image (not a pre-cropped face).
    Detects all faces, returns embeddings for each.

    Returns:
        List of dicts with 'box', 'confidence', and 'embedding' keys.
    """
    analyzer = get_analyzer()
    faces = analyzer.get(img)

    results = []
    for face in faces:
        x1, y1, x2, y2 = [int(v) for v in face.bbox]
        results.append({
            "box": [x1, y1, x2 - x1, y2 - y1],
            "confidence": round(float(face.det_score), 4),
            "embedding": face.normed_embedding,
        })

    return results
