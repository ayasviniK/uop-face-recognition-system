package com.uop.backend.util;

import com.uop.backend.exception.AiServiceException;

/**
 * Utility for confidence score categorization and strict validation as defined by the Sentinel Integration Guide.
 */
public final class ConfidenceScoreUtil {

    private ConfidenceScoreUtil() {}

    /**
     * Strictly validates that the AI confidence score is within the official range [0.0, 1.0].
     * Rejects invalid values (negative, greater than 1.0, NaN, Infinite) by throwing AiServiceException.
     * Automatic normalization (e.g. dividing by 100) is strictly disallowed.
     *
     * @param confidence AI confidence score
     * @throws AiServiceException if confidence is not between 0.0 and 1.0 inclusive
     */
    public static void validateConfidence(double confidence) {
        if (Double.isNaN(confidence) || Double.isInfinite(confidence) || confidence < 0.0 || confidence > 1.0) {
            throw new AiServiceException(
                    "Invalid AI confidence score: " + confidence + ". Confidence must be strictly between 0.0 and 1.0.");
        }
    }

    /**
     * Categorizes confidence score into High, Medium, Low, or No match.
     * Strictly validates the confidence score first.
     *
     * Thresholds:
     * >= 0.60      -> High
     * 0.40 - 0.59  -> Medium
     * 0.35 - 0.39  -> Low
     * < 0.35       -> No match
     *
     * @param confidence AI confidence score between 0.0 and 1.0
     * @return Categorization label string
     */
    public static String getConfidenceLabel(double confidence) {
        validateConfidence(confidence);

        if (confidence >= 0.60) {
            return "High";
        }
        if (confidence >= 0.40) {
            return "Medium";
        }
        if (confidence >= 0.35) {
            return "Low";
        }
        return "No match";
    }
}
