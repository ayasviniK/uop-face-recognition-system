import cv2
import numpy as np


def detect_faces(img: np.ndarray) -> list[dict]:
    """
    Detect faces in an OpenCV image using the built-in DNN face detector.

    Why DNN instead of Haar cascades?
    - Haar cascades are fast but have high false-positive rates and struggle
      with non-frontal faces, lighting variation, and partial occlusion.
    - The DNN detector (ResNet-based SSD) is more accurate for real photos
      like passport images and group shots.

    Args:
        img: OpenCV BGR image as a NumPy array.

    Returns:
        List of dicts, each with:
          - 'box': [x, y, w, h] bounding box
          - 'confidence': float between 0 and 1
          - 'crop': the cropped face as a NumPy array (resized to 112x112 for ArcFace)
    """
    h, w = img.shape[:2]

    # Load the pre-trained DNN face detector bundled with OpenCV
    detector = cv2.FaceDetectorYN.create(
        model="",               # We'll use the default model path (set below)
        config="",
        input_size=(w, h),
        score_threshold=0.7,   # Ignore detections below 70% confidence
        nms_threshold=0.3,     # Remove overlapping boxes (non-max suppression)
        top_k=5000,
    )

    # Run detection
    _, faces = detector.detect(img)

    if faces is None:
        return []

    results = []
    for face in faces:
        # OpenCV YuNet returns: x, y, w, h, then landmark coords, then confidence
        x, y, fw, fh = int(face[0]), int(face[1]), int(face[2]), int(face[3])
        confidence = float(face[-1])

        # Clamp box to image boundaries (sometimes boxes go slightly outside)
        x = max(0, x)
        y = max(0, y)
        fw = min(fw, w - x)
        fh = min(fh, h - y)

        if fw <= 0 or fh <= 0:
            continue

        # Crop face region
        face_crop = img[y:y+fh, x:x+fw]

        # Resize to 112x112 — this is what ArcFace expects
        face_crop_resized = cv2.resize(face_crop, (112, 112))

        results.append({
            "box": [x, y, fw, fh],
            "confidence": round(confidence, 4),
            "crop": face_crop_resized,
        })

    return results


def draw_faces(img: np.ndarray, faces: list[dict]) -> np.ndarray:
    """
    Draw bounding boxes on a copy of the image. Useful for debugging.
    Never call this in production — it's a dev tool only.
    """
    output = img.copy()
    for face in faces:
        x, y, fw, fh = face["box"]
        conf = face["confidence"]
        cv2.rectangle(output, (x, y), (x + fw, y + fh), (0, 255, 0), 2)
        cv2.putText(output, f"{conf:.2f}", (x, y - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
    return output
