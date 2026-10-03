"""Spring Boot/MySQL adapter for the Flask AI service."""

import os
from typing import Any

import requests

_EMBEDDING_FIELDS = {
    "embeddingOriginal": "original",
    "embeddingFlipped": "flipped",
    "embeddingBrighter": "brighter",
    "embeddingDarker": "darker",
    "embeddingRotatedPlus": "rotated_plus",
    "embeddingRotatedMinus": "rotated_minus",
    "embeddingLeft1": "left_1",
    "embeddingLeft2": "left_2",
    "embeddingRight1": "right_1",
    "embeddingRight2": "right_2",
}


def _base_url() -> str:
    return os.environ.get("SPRING_BOOT_URL", "http://localhost:8080").rstrip("/")


def _headers() -> dict[str, str]:
    return {
        "Accept": "application/json",
        "X-Internal-API-Key": os.environ.get("INTERNAL_API_KEY", ""),
    }


def get_student_ids() -> list[str]:
    response = requests.get(
        f"{_base_url()}/internal/students/ids",
        headers=_headers(),
        timeout=5,
    )
    response.raise_for_status()
    payload = response.json()
    return payload.get("studentIds", []) if isinstance(payload, dict) else []


def get_stats() -> dict[str, int]:
    response = requests.get(
        f"{_base_url()}/internal/students/stats",
        headers=_headers(),
        timeout=5,
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


def get_embeddings() -> list[dict[str, Any]]:
    response = requests.get(
        f"{_base_url()}/internal/students/embeddings",
        headers=_headers(),
        timeout=15,
    )
    response.raise_for_status()
    records = response.json()
    candidates = []
    for record in records if isinstance(records, list) else []:
        student_id = record.get("studentId")
        for field, augmentation in _EMBEDDING_FIELDS.items():
            vector = record.get(field)
            if student_id and vector:
                candidates.append({
                    "student_id": student_id,
                    "student_name": f"Student ({student_id})",
                    "faculty": student_id.split("/", 1)[0],
                    "department": student_id.split("/", 1)[0],
                    "year": record.get("year", 1),
                    "augmentation": augmentation,
                    "embedding": vector,
                })
    return candidates


def save_embeddings(payload: dict[str, Any]) -> None:
    response = requests.post(
        f"{_base_url()}/internal/students/embeddings",
        json=payload,
        headers={**_headers(), "Content-Type": "application/json"},
        timeout=15,
    )
    response.raise_for_status()
