"""
Embedding Augmentor
-------------------
Generates augmented embeddings from face photos.

Slot plan (10 total per student):
  From front photo (always available):
    1. original       — baseline
    2. flipped        — horizontal mirror
    3. brighter       — +20 brightness
    4. darker         — -20 brightness
    9. rotated_plus   — +10 degree tilt
    10. rotated_minus — -10 degree tilt

  From left profile (_L) — future, when available:
    5. left_1         — left profile original
    6. left_2         — left profile flipped (synthetic near-right view)

  From right profile (_R) — future, when available:
    7. right_1        — right profile original
    8. right_2        — right profile flipped (synthetic near-left view)

Why this layout?
  Flipping a left profile gives a synthetic right-leaning view and vice versa.
  Together with rotated front variants, all head angles are covered.
  10 slots chosen so adding more variants later is easy.
"""

import cv2
import numpy as np


def _adjust_brightness(img: np.ndarray, delta: int) -> np.ndarray:
    adjusted = img.astype(np.int16) + delta
    return np.clip(adjusted, 0, 255).astype(np.uint8)


def _rotate(img: np.ndarray, angle: float) -> np.ndarray:
    h, w = img.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, angle, scale=1.0)
    return cv2.warpAffine(
        img, matrix, (w, h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )


def generate_front_augmentations(img: np.ndarray) -> list[dict]:
    """6 augmented versions from front photo. Slots 1,2,3,4,9,10."""
    return [
        {"name": "original",      "image": img.copy()},
        {"name": "flipped",       "image": cv2.flip(img, 1)},
        {"name": "brighter",      "image": _adjust_brightness(img, +20)},
        {"name": "darker",        "image": _adjust_brightness(img, -20)},
        {"name": "rotated_plus",  "image": _rotate(img, +10)},
        {"name": "rotated_minus", "image": _rotate(img, -10)},
    ]


def generate_profile_augmentations(img: np.ndarray, side: str) -> list[dict]:
    """
    2 augmented versions from a profile photo.
    side = "left" or "right"
    Slots 5+6 for left, 7+8 for right.
    """
    return [
        {"name": f"{side}_1", "image": img.copy()},
        {"name": f"{side}_2", "image": cv2.flip(img, 1)},
    ]


def generate_augmented_embeddings(
    img: np.ndarray,
    embedder_fn,
    side: str = "front",
) -> list[dict]:
    """
    Generate embeddings for all augmented versions of a photo.

    Args:
        img:         Preprocessed OpenCV BGR image
        embedder_fn: get_embedding_from_image from embedder.py
        side:        "front", "left", or "right"

    Returns:
        List of dicts with augmentation name and 512-dim embedding.
        Only includes versions where a face was detected.
    """
    if side == "front":
        versions = generate_front_augmentations(img)
    elif side in ("left", "right"):
        versions = generate_profile_augmentations(img, side)
    else:
        versions = generate_front_augmentations(img)

    results = []
    for version in versions:
        faces = embedder_fn(version["image"])
        if faces:
            best = max(faces, key=lambda f: f["confidence"])
            embedding = best["embedding"]
            results.append({
                "augmentation": version["name"],
                "embedding":    embedding.tolist() if hasattr(embedding, "tolist") else embedding,
            })

    return results