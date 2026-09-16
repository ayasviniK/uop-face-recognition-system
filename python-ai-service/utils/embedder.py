"""
Embedder
--------
Generates face embeddings using InsightFace buffalo_l.
Now uses face alignment for significantly better cross-photo accuracy.
"""

import numpy as np
import insightface
from insightface.app import FaceAnalysis
from utils.aligner import get_aligned_faces


_face_analyzer = None


def get_analyzer() -> FaceAnalysis:
    """
    Load and return the InsightFace analyzer (singleton).
    buffalo_l = full accuracy model (vs buffalo_sc = lightweight).
    ctx_id=-1 = CPU only.
    """
    global _face_analyzer
    if _face_analyzer is None:
        _face_analyzer = FaceAnalysis(
            name="buffalo_l",
            providers=["CPUExecutionProvider"]
        )
        _face_analyzer.prepare(ctx_id=-1, det_size=(640, 640))
    return _face_analyzer


def get_embedding_from_image(img: np.ndarray) -> list[dict]:
    """
    Detect all faces in an image, align each one, and return embeddings.

    Returns list of dicts with:
      - 'box': [x, y, w, h]
      - 'confidence': float
      - 'embedding': np.ndarray (512,)
      - 'landmarks': list of 5 (x,y) points
    """
    analyzer = get_analyzer()
    return get_aligned_faces(img, analyzer)