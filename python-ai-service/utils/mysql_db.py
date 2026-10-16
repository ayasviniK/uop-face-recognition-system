"""Spring Boot/MySQL adapter for the Flask AI service."""

import os
import json
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


import numpy as np

class VectorCandidates:
    def __init__(self, sids, embs):
        self.sids = list(sids) if hasattr(sids, "tolist") else list(sids)
        self.embs = np.array(embs, dtype=np.float32)

    def __len__(self):
        return len(self.sids)

    def __bool__(self):
        return len(self.sids) > 0

    def __getitem__(self, idx):
        return {"student_id": self.sids[idx], "embedding": self.embs[idx]}

    def add_vector(self, student_id, vector, verbose=False):
        if vector is None:
            return
        v = np.array(vector, dtype=np.float32).flatten()
        norm = np.linalg.norm(v)
        if norm > 0:
            v = v / norm
        sid_str = str(student_id).strip()
        if sid_str in self.sids:
            idx = self.sids.index(sid_str)
            self.embs[idx] = v
        else:
            self.sids.append(sid_str)
            if len(self.embs) == 0:
                self.embs = v.reshape(1, -1)
            else:
                self.embs = np.vstack([self.embs, v.reshape(1, -1)])
        if verbose:
            print(f"[CACHE] Embedding updated for student {sid_str} (total in cache: {len(self.sids)})")

    def search(self, query_vec, top_k=5):
        if len(self.sids) == 0:
            return []
        q = np.array(query_vec, dtype=np.float32)
        norm = np.linalg.norm(q)
        if norm > 0:
            q = q / norm
        sims = np.dot(self.embs, q)
        top_idx = np.argsort(sims)[::-1][:top_k]
        matches = []
        for idx in top_idx:
            score = float(sims[idx])
            sid = str(self.sids[idx])
            faculty = sid.split("/")[0].upper() if sid else "UNKNOWN"
            label = "High" if score >= 0.6 else ("Medium" if score >= 0.4 else ("Low" if score >= 0.38 else "No Match"))
            matches.append({
                "student_id": sid,
                "student_name": f"Student ({sid})",
                "faculty": faculty,
                "department": faculty,
                "year": 1,
                "similarity_score": round(score, 4),
                "matched_augmentation": "original",
                "confidence_label": label,
            })
        return matches

_CACHED_VECTORS = None


def add_candidate_vector(student_id: str, vector, verbose=True):
    global _CACHED_VECTORS
    if _CACHED_VECTORS is None:
        get_embeddings()
    if _CACHED_VECTORS is not None:
        _CACHED_VECTORS.add_vector(student_id, vector, verbose=verbose)


def _merge_mock_db_into_candidates(candidates: VectorCandidates) -> None:
    mock_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "mock_db.json")
    if not os.path.exists(mock_file):
        return
    try:
        with open(mock_file, "r", encoding="utf-8") as f:
            mock_data = json.load(f)
        added_count = 0
        for sid, info in mock_data.get("staff", {}).items():
            for emb in info.get("embeddings", []):
                v = emb.get("embedding")
                if v:
                    candidates.add_vector(sid, v, verbose=False)
                    added_count += 1
        if added_count > 0:
            print(f"[CACHE] Merged {added_count} embedding vectors from mock_db into vector cache")
    except Exception as me:
        print(f"Notice loading mock_db additions: {me}")


def get_embeddings():
    global _CACHED_VECTORS
    if _CACHED_VECTORS is not None:
        return _CACHED_VECTORS

    cache_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "embeddings_cache.npz")
    if os.path.exists(cache_file):
        try:
            data = np.load(cache_file)
            _CACHED_VECTORS = VectorCandidates(data["student_ids"], data["embeddings"])
            _merge_mock_db_into_candidates(_CACHED_VECTORS)
            return _CACHED_VECTORS
        except Exception as e:
            print(f"Error loading {cache_file}: {e}")

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
    sid = payload.get("studentId")
    orig = payload.get("embeddingOriginal")
    if sid and orig:
        add_candidate_vector(sid, orig)

    try:
        response = requests.post(
            f"{_base_url()}/internal/students/embeddings",
            json=payload,
            headers={**_headers(), "Content-Type": "application/json"},
            timeout=15,
        )
        response.raise_for_status()
    except Exception as exc:
        print(f"Notice: Spring Boot sync for {sid}: {exc}")

