"""
Embedding Augmentor
-------------------
Generates multiple embeddings from a single photo by creating
slightly varied versions of it.

Why does this work?
ArcFace is trained on millions of photos with natural variation.
When we augment a photo, we're simulating that natural variation —
different lighting, slight angle change, mirror image.
The resulting embeddings cover more of the "space" that represents
this person's face, so cross-photo matching becomes more robust.

Augmentations we apply:
  1. Original           — baseline
  2. Horizontal flip    — mirrors the face (handles slight left/right turns)
  3. Brightness +20     — simulates brighter environment
  4. Brightness -20     — simulates darker environment
  5. Rotate +10°        — slight head tilt right
  6. Rotate -10°        — slight head tilt left

We intentionally keep augmentations small and realistic.
Wild augmentations (90° rotations, extreme brightness) would generate
embeddings that don't represent the person accurately.
"""

import cv2
import numpy as np


def _adjust_brightness(img: np.ndarray, delta: int) -> np.ndarray:
    """
    Shift brightness by delta (-255 to +255).
    Clips pixel values to valid range [0, 255].
    """
    adjusted = img.astype(np.int16) + delta
    return np.clip(adjusted, 0, 255).astype(np.uint8)


def _rotate(img: np.ndarray, angle: float) -> np.ndarray:
    """
    Rotate image around its center by angle degrees.
    Fills empty corners with the image's border color (avoids black corners
    which can confuse face detection).
    """
    h, w = img.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, angle, scale=1.0)
    return cv2.warpAffine(
        img, matrix, (w, h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,  # fill corners with edge pixels
    )


def generate_augmented_versions(img: np.ndarray) -> list[dict]:
    """
    Generate a list of augmented versions of the input image.

    Args:
        img: Preprocessed OpenCV BGR image (full image, not just face crop).

    Returns:
        List of dicts, each with:
          - 'name': description of the augmentation
          - 'image': the augmented OpenCV image
    """
    return [
        {"name": "original",       "image": img.copy()},
        {"name": "flipped",        "image": cv2.flip(img, 1)},
        {"name": "brighter",       "image": _adjust_brightness(img, +20)},
        {"name": "darker",         "image": _adjust_brightness(img, -20)},
        {"name": "rotated_plus",   "image": _rotate(img, +10)},
        {"name": "rotated_minus",  "image": _rotate(img, -10)},
    ]


def generate_augmented_embeddings(img: np.ndarray, embedder_fn) -> list[dict]:
    """
    Generate embeddings for all augmented versions of an image.

    Args:
        img: Preprocessed OpenCV BGR image.
        embedder_fn: Function that takes an image and returns a list of
                     detected face dicts with 'embedding' key.
                     (This is get_embedding_from_image from embedder.py)

    Returns:
        List of dicts, each with:
          - 'augmentation': name of the augmentation
          - 'embedding': np.ndarray of shape (512,)

    Only includes augmentations where a face was successfully detected.
    """
    versions = generate_augmented_versions(img)
    results = []

    for version in versions:
        faces = embedder_fn(version["image"])
        if faces:
            # Take the highest-confidence face in this augmented version
            best = max(faces, key=lambda f: f["confidence"])
            results.append({
                "augmentation": version["name"],
                "embedding": best["embedding"].tolist(),
            })

    return results
