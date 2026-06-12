"""
Face Aligner
------------
Aligns a detected face to a standard frontal position using the
5 facial landmarks detected by InsightFace:
  - Left eye center
  - Right eye center
  - Nose tip
  - Left mouth corner
  - Right mouth corner

Why alignment matters:
ArcFace was trained on aligned faces — specifically, faces where the
eyes are always at a fixed position in the image. When a face is
turned, tilted, or off-center, the eye positions shift, and ArcFace
has to "guess" the identity rather than compare directly.

Alignment solves this by applying a similarity transform (rotation +
scale + translation) that warps any face so the eyes land at the
same fixed coordinates every time. A turned face becomes frontal.
A tilted face becomes upright. ArcFace then sees a consistent input
regardless of the original photo angle.

This is the single biggest accuracy improvement for real-world photos.

Reference landmark positions (112x112 ArcFace standard):
  Left eye:          (38.29, 51.70)
  Right eye:         (73.53, 51.50)
  Nose tip:          (56.02, 71.74)
  Left mouth corner: (41.55, 92.37)
  Right mouth corner:(70.73, 92.20)
"""

import cv2
import numpy as np


# Standard landmark positions for a 112x112 aligned face
# These are the target coordinates ArcFace expects
REFERENCE_LANDMARKS = np.array([
    [38.29, 51.70],   # left eye
    [73.53, 51.50],   # right eye
    [56.02, 71.74],   # nose tip
    [41.55, 92.37],   # left mouth corner
    [70.73, 92.20],   # right mouth corner
], dtype=np.float32)

OUTPUT_SIZE = (112, 112)  # ArcFace standard input size


def align_face(img: np.ndarray, landmarks: np.ndarray) -> np.ndarray | None:
    """
    Align a face using its 5 detected landmarks.

    Args:
        img: Full OpenCV BGR image.
        landmarks: (5, 2) array of (x, y) landmark coordinates
                   in the order: left_eye, right_eye, nose, left_mouth, right_mouth.
                   This is what InsightFace returns in face.kps.

    Returns:
        112x112 aligned face crop, or None if transform fails.
    """
    if landmarks is None or landmarks.shape != (5, 2):
        return None

    src = landmarks.astype(np.float32)
    dst = REFERENCE_LANDMARKS

    # Estimate similarity transform (rotation + uniform scale + translation)
    # This is better than affine transform because it preserves face proportions
    transform = cv2.estimateAffinePartial2D(src, dst, method=cv2.LMEDS)[0]

    if transform is None:
        return None

    # Apply the transform to warp the full image, then crop to 112x112
    aligned = cv2.warpAffine(
        img,
        transform,
        OUTPUT_SIZE,
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )

    return aligned


def get_aligned_faces(img: np.ndarray, analyzer) -> list[dict]:
    """
    Detect all faces in an image and return aligned crops + embeddings.

    This replaces the simple get_embedding_from_image() call.
    The difference: instead of embedding the raw face crop, we first
    align each face to the standard position, then embed.

    Args:
        img: OpenCV BGR image.
        analyzer: InsightFace FaceAnalysis instance (from embedder.get_analyzer()).

    Returns:
        List of dicts with:
          - 'box': [x1, y1, w, h]
          - 'confidence': float
          - 'landmarks': (5, 2) array
          - 'embedding': (512,) array — from aligned face
          - 'aligned_crop': 112x112 aligned face image
    """
    faces = analyzer.get(img)

    if not faces:
        return []

    results = []
    for face in faces:
        x1, y1, x2, y2 = [int(v) for v in face.bbox]

        # Get the 5 landmarks
        landmarks = face.kps  # shape (5, 2)

        # Align the face
        aligned = align_face(img, landmarks)

        if aligned is None:
            # Fallback: use the raw normed embedding if alignment fails
            results.append({
                "box": [x1, y1, x2 - x1, y2 - y1],
                "confidence": round(float(face.det_score), 4),
                "landmarks": landmarks.tolist() if landmarks is not None else None,
                "embedding": face.normed_embedding,
                "aligned_crop": None,
            })
            continue

        # Re-embed using the aligned crop for better accuracy
        # The aligned crop is a clean 112x112 frontal face
        aligned_faces = analyzer.get(aligned)

        if aligned_faces:
            # Use embedding from aligned crop
            best = max(aligned_faces, key=lambda f: f.det_score)
            embedding = best.normed_embedding
        else:
            # Alignment worked visually but detector didn't find face in crop
            # Fall back to original embedding
            embedding = face.normed_embedding

        results.append({
            "box": [x1, y1, x2 - x1, y2 - y1],
            "confidence": round(float(face.det_score), 4),
            "landmarks": landmarks.tolist() if landmarks is not None else None,
            "embedding": embedding,
            "aligned_crop": aligned,
        })

    return results
