"""
Matcher
-------
Compares a query embedding against all candidate embeddings and
returns the best matches.

With augmented embeddings, each staff member has multiple entries in the
candidates list. We compare against all of them, then keep only the
best score per staff member (deduplication). This way the top_matches list
shows unique staff ranked by their best augmentation match.
"""

import numpy as np


SIMILARITY_THRESHOLD = 0.35  # Lowered slightly to account for cross-photo variation


def cosine_similarity(embedding_a: np.ndarray, embedding_b: np.ndarray) -> float:
    """
    Cosine similarity between two L2-normalized embeddings.
    For normalized vectors this equals the dot product.
    Result is between -1 (opposite) and 1 (identical).
    """
    a = np.array(embedding_a)
    b = np.array(embedding_b)
    return float(np.dot(a, b))


def find_top_matches(
    query_embedding: np.ndarray,
    candidate_embeddings: list[dict],
    top_k: int = 5,
) -> list[dict]:
    """
    Find the top-k best matching students for a query embedding.

    Args:
        query_embedding: Embedding of the face we're trying to identify.
        candidate_embeddings: List from get_all_embeddings() — may contain
                              multiple entries per student (one per augmentation).
        top_k: How many results to return.

    Returns:
        List of top matches, deduplicated by staff member, sorted by score descending.
        Each entry has: staff_id, staff_name, department,
                        similarity_score, confidence_label, matched_augmentation.
    """
    # Score every candidate embedding
    scored = []
    for candidate in candidate_embeddings:
        score = cosine_similarity(query_embedding, candidate["embedding"])
        scored.append({
            "staff_id": candidate["staff_id"],
            "staff_name": candidate["staff_name"],
            "department": candidate.get("department", ""),
            "similarity_score": round(score, 4),
            "matched_augmentation": candidate.get("augmentation", "original"),
        })

    # Deduplicate: keep only the best score per staff member
    best_per_staff = {}
    for entry in scored:
        sid = entry["staff_id"]
        if sid not in best_per_staff or entry["similarity_score"] > best_per_staff[sid]["similarity_score"]:
            best_per_staff[sid] = entry

    # Sort by score descending
    unique_results = sorted(best_per_staff.values(), key=lambda x: x["similarity_score"], reverse=True)

    # Add confidence label and filter below threshold
    final = []
    for result in unique_results[:top_k]:
        result["confidence_label"] = _score_to_label(result["similarity_score"])
        if result["similarity_score"] >= SIMILARITY_THRESHOLD:
            final.append(result)

    return final


def _score_to_label(score: float) -> str:
    if score >= 0.6:
        return "High"
    elif score >= 0.4:
        return "Medium"
    elif score >= 0.35:
        return "Low"
    else:
        return "No Match"