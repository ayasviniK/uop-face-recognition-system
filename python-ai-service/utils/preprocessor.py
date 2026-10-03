"""
Image Preprocessor
------------------
Cleans and normalizes images before they go into ArcFace.

Why does this matter?
ArcFace was trained on clean, well-lit, front-facing photos.
Real-world uploads — passport scans, phone photos, photocopies —
vary wildly in brightness, contrast, size, and orientation.

Preprocessing makes every image look as close to "clean" as possible
before the model sees it. This is often more impactful than upgrading
the model itself.

Pipeline:
  1. Quality checks  — reject garbage early, before wasting compute
  2. Resize          — standardize dimensions
  3. Auto-rotate     — fix EXIF orientation (phone photos are often sideways)
  4. Denoise         — reduce scan artifacts
  5. Normalize       — fix brightness and contrast
  6. Sharpen         — recover detail lost in low-res scans
"""

import cv2
import numpy as np


# ── Constants ────────────────────────────────────────────────────────────────

MIN_IMAGE_SIZE   = 64     # px — reject anything smaller than this
MAX_IMAGE_SIZE   = 1920   # px — downsample anything larger (saves memory)
TARGET_SIZE      = 640    # px — standard size we normalize to before detection
MIN_BRIGHTNESS   = 30     # 0-255 — below this = too dark
MAX_BRIGHTNESS   = 230    # 0-255 — above this = overexposed
MIN_SHARPNESS    = 20.0   # Laplacian variance — below this = too blurry


# ── Quality Checks ───────────────────────────────────────────────────────────

def check_image_quality(img: np.ndarray) -> tuple[bool, str]:
    """
    Run quality checks on a raw image before processing.

    Returns (is_ok, reason) — if not ok, reason explains why.
    We check three things:
      1. Size — too small means not enough detail for ArcFace
      2. Brightness — too dark or overexposed photos fail detection
      3. Sharpness — blurry images produce unreliable embeddings
    """
    h, w = img.shape[:2]

    # 1. Size check
    if h < MIN_IMAGE_SIZE or w < MIN_IMAGE_SIZE:
        return False, f"Image too small ({w}x{h}px). Minimum is {MIN_IMAGE_SIZE}x{MIN_IMAGE_SIZE}px."

    # 2. Brightness check
    # Convert to grayscale and measure mean pixel value
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mean_brightness = float(np.mean(gray))

    if mean_brightness < MIN_BRIGHTNESS:
        return False, f"Image is too dark (brightness={mean_brightness:.0f}). Please use a well-lit photo."

    if mean_brightness > MAX_BRIGHTNESS:
        return False, f"Image is overexposed (brightness={mean_brightness:.0f}). Please use a properly exposed photo."

    # 3. Sharpness check — Laplacian variance
    # A sharp image has high variance in its second derivative.
    # A blurry image has low variance (everything is smooth).
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if sharpness < MIN_SHARPNESS:
        return False, f"Image is too blurry (sharpness={sharpness:.1f}). Please upload a clearer photo."

    return True, "ok"


# ── Preprocessing Steps ──────────────────────────────────────────────────────

def fix_orientation(img: np.ndarray) -> np.ndarray:
    """
    EXIF orientation is normalized during decoding with PIL ImageOps.exif_transpose.
    Preserves exact camera orientation without blind aspect-ratio guessing.
    """
    return img


def resize_to_standard(img: np.ndarray) -> np.ndarray:
    """
    Downsamples only excessively large images (> 1920px) to prevent memory exhaustion.
    Leaves normal resolution images (<= 1920px) untouched so bounding box coordinates
    directly match original image coordinates in the browser.
    """
    h, w = img.shape[:2]
    longest = max(h, w)

    if longest <= MAX_IMAGE_SIZE:
        return img

    scale = MAX_IMAGE_SIZE / longest
    new_w = int(w * scale)
    new_h = int(h * scale)

    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)


def normalize_brightness(img: np.ndarray) -> np.ndarray:
    """
    Fix brightness and contrast using CLAHE (Contrast Limited Adaptive
    Histogram Equalization).

    Why CLAHE instead of simple histogram equalization?
    Simple equalization works on the whole image — it can over-brighten
    dark areas and wash out bright areas. CLAHE works on small local
    regions, so it handles uneven lighting much better (e.g. one side
    of the face in shadow).

    We apply it only to the luminance channel (Y in YCrCb) so we don't
    distort skin color.
    """
    # Convert to YCrCb color space (Y = luminance, Cr/Cb = color)
    ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
    y, cr, cb = cv2.split(ycrcb)

    # Apply CLAHE to luminance only
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    y_normalized = clahe.apply(y)

    # Merge back and convert to BGR
    normalized = cv2.merge([y_normalized, cr, cb])
    return cv2.cvtColor(normalized, cv2.COLOR_YCrCb2BGR)


def denoise(img: np.ndarray) -> np.ndarray:
    """
    Reduce noise from scanned documents or low-light photos.
    fastNlMeansDenoisingColored is OpenCV's best general-purpose denoiser.

    h=7, hColor=7 are conservative values — strong enough to remove
    scan grain but not so strong that facial detail is lost.
    """
    return cv2.fastNlMeansDenoisingColored(img, None, h=7, hColor=7,
                                           templateWindowSize=7,
                                           searchWindowSize=21)


def sharpen(img: np.ndarray) -> np.ndarray:
    """
    Apply a mild unsharp mask to recover detail lost in scans or compression.

    Unsharp masking works by:
      1. Creating a blurred version of the image
      2. Subtracting it from the original (this isolates edges)
      3. Adding the edges back, amplified

    We use a gentle strength (1.3) to avoid over-sharpening artifacts.
    """
    blurred = cv2.GaussianBlur(img, (0, 0), sigmaX=2)
    return cv2.addWeighted(img, 1.3, blurred, -0.3, 0)


# ── Main Entry Point ─────────────────────────────────────────────────────────

def preprocess(img: np.ndarray, skip_quality_check: bool = False) -> tuple[np.ndarray | None, str]:
    """
    Run the full preprocessing pipeline on an image.

    Args:
        img: Raw OpenCV BGR image.
        skip_quality_check: Set True only in tests or admin override scenarios.

    Returns:
        (processed_img, message)
        If quality check fails, processed_img is None and message explains why.
        On success, processed_img is the cleaned image ready for ArcFace.
    """
    # Step 1: Quality check
    if not skip_quality_check:
        ok, reason = check_image_quality(img)
        if not ok:
            return None, reason

    # Step 2: Fix orientation
    img = fix_orientation(img)

    # Step 3: Resize to standard dimensions
    img = resize_to_standard(img)

    # Step 4: Denoise (helps with scanned passport photos)
    img = denoise(img)

    # Step 5: Normalize brightness and contrast
    img = normalize_brightness(img)

    # Step 6: Sharpen
    img = sharpen(img)

    return img, "ok"


def get_image_info(img: np.ndarray) -> dict:
    """
    Return diagnostic info about an image.
    Used in the /upload endpoint so admins can see what was received.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = img.shape[:2]

    return {
        "width": w,
        "height": h,
        "brightness": round(float(np.mean(gray)), 1),
        "sharpness": round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 1),
        "channels": img.shape[2] if len(img.shape) == 3 else 1,
    }
