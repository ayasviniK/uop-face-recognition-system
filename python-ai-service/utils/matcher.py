"""
Matcher
-------
Compares a query embedding against all candidate embeddings and
returns the best matches.

With augmented embeddings, each student has multiple entries in the
candidates list. We compare against all of them, then keep only the
best score per student (deduplication).
"""

import numpy as np

SIMILARITY_THRESHOLD = 0.35


def cosine_similarity(embedding_a, embedding_b) -> float:
    a = np.array(embedding_a)
    b = np.array(embedding_b)
    return float(np.dot(a, b))


def find_top_matches(
    query_embedding,
    candidate_embeddings: list,
    top_k: int = 5,
) -> list:
    # Score every candidate embedding
    scored = []
    for candidate in candidate_embeddings:
        score = cosine_similarity(query_embedding, candidate["embedding"])
        scored.append({
            "student_id":            candidate["student_id"],
            "student_name":          candidate["student_name"],
            "department":            candidate.get("department", ""),
            "similarity_score":      round(score, 4),
            "matched_augmentation":  candidate.get("augmentation", "original"),
        })

    # Deduplicate: keep only the best score per student
    best_per_student = {}
    for entry in scored:
        sid = entry["student_id"]
        if sid not in best_per_student or entry["similarity_score"] > best_per_student[sid]["similarity_score"]:
            best_per_student[sid] = entry

    # Sort by score descending
    unique_results = sorted(best_per_student.values(), key=lambda x: x["similarity_score"], reverse=True)

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