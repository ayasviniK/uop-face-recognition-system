import numpy as np


# Threshold above which we consider two embeddings a "match".
# 0.4 is a reasonable starting point for ArcFace buffalo_sc.
# Too low → false positives (wrong students matched).
# Too high → false negatives (real matches missed).
# You'll tune this once you have real test data.
SIMILARITY_THRESHOLD = 0.4


def cosine_similarity(embedding_a: np.ndarray, embedding_b: np.ndarray) -> float:
    """
    Compute cosine similarity between two face embeddings.

    Why cosine similarity and not Euclidean distance?
    Cosine similarity measures the *angle* between two vectors, not their
    magnitude. Since ArcFace embeddings are L2-normalized (all have length 1),
    cosine similarity and Euclidean distance are mathematically equivalent —
    but cosine is more intuitive: 1.0 = identical, 0.0 = unrelated, -1.0 = opposite.

    For normalized vectors: cosine_similarity = dot product.
    """
    return float(np.dot(embedding_a, embedding_b))


def find_best_match(
    query_embedding: np.ndarray,
    candidate_embeddings: list[dict]
) -> dict | None:
    """
    Find the best matching student from a list of candidates.

    Args:
        query_embedding: The embedding of the face we're trying to identify.
        candidate_embeddings: List of dicts from the database, each with:
            - 'student_id': str
            - 'student_name': str
            - 'embedding': np.ndarray of shape (512,)

    Returns:
        Dict with match details, or None if no match above threshold.
    """
    if not candidate_embeddings:
        return None

    best_score = -1.0
    best_candidate = None

    for candidate in candidate_embeddings:
        score = cosine_similarity(query_embedding, candidate["embedding"])
        if score > best_score:
            best_score = score
            best_candidate = candidate

    if best_score < SIMILARITY_THRESHOLD:
        return None

    return {
        "student_id": best_candidate["student_id"],
        "student_name": best_candidate["student_name"],
        "similarity_score": round(best_score, 4),
        "confidence_label": _score_to_label(best_score),
    }


def find_top_matches(
    query_embedding: np.ndarray,
    candidate_embeddings: list[dict],
    top_k: int = 5
) -> list[dict]:
    """
    Return the top-k closest matches, regardless of threshold.
    Useful for showing "possible matches" to an admin for manual review.
    """
    scored = []
    for candidate in candidate_embeddings:
        score = cosine_similarity(query_embedding, candidate["embedding"])
        scored.append({
            "student_id": candidate["student_id"],
            "student_name": candidate["student_name"],
            "similarity_score": round(score, 4),
            "confidence_label": _score_to_label(score),
        })

    # Sort by score descending
    scored.sort(key=lambda x: x["similarity_score"], reverse=True)
    return scored[:top_k]


def _score_to_label(score: float) -> str:
    """
    Convert a raw similarity score into a human-readable confidence label.
    These ranges are approximate — you'll refine them with real test data.
    """
    if score >= 0.6:
        return "High"
    elif score >= 0.4:
        return "Medium"
    else:
        return "Low"
