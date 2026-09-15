package com.uop.backend.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.Test;

import com.uop.backend.exception.AiServiceException;

class ConfidenceScoreUtilTest {

    @Test
    void getConfidenceLabel_requiredBoundaryValues() {
        // Threshold: >= 0.60 -> High
        assertEquals("High", ConfidenceScoreUtil.getConfidenceLabel(1.00));
        assertEquals("High", ConfidenceScoreUtil.getConfidenceLabel(0.60));

        // Threshold: 0.40 - 0.59 -> Medium
        assertEquals("Medium", ConfidenceScoreUtil.getConfidenceLabel(0.59));
        assertEquals("Medium", ConfidenceScoreUtil.getConfidenceLabel(0.40));

        // Threshold: 0.35 - 0.39 -> Low
        assertEquals("Low", ConfidenceScoreUtil.getConfidenceLabel(0.39));
        assertEquals("Low", ConfidenceScoreUtil.getConfidenceLabel(0.35));

        // Threshold: < 0.35 -> No match
        assertEquals("No match", ConfidenceScoreUtil.getConfidenceLabel(0.34));
        assertEquals("No match", ConfidenceScoreUtil.getConfidenceLabel(0.00));
    }

    @Test
    void getConfidenceLabel_additionalGranularValues() {
        assertEquals("High", ConfidenceScoreUtil.getConfidenceLabel(0.85));
        assertEquals("High", ConfidenceScoreUtil.getConfidenceLabel(0.999));
        assertEquals("Medium", ConfidenceScoreUtil.getConfidenceLabel(0.50));
        assertEquals("Medium", ConfidenceScoreUtil.getConfidenceLabel(0.55));
        assertEquals("Low", ConfidenceScoreUtil.getConfidenceLabel(0.37));
        assertEquals("No match", ConfidenceScoreUtil.getConfidenceLabel(0.20));
        assertEquals("No match", ConfidenceScoreUtil.getConfidenceLabel(0.349));
    }

    @Test
    void validateConfidence_rejectsNegativeValues() {
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.validateConfidence(-0.01));
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.validateConfidence(-0.1));
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.validateConfidence(-1.0));
    }

    @Test
    void validateConfidence_rejectsValuesGreaterThanOne() {
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.validateConfidence(1.01));
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.validateConfidence(1.1));
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.validateConfidence(50.0));
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.validateConfidence(100.0));
    }

    @Test
    void getConfidenceLabel_rejectsInvalidValues() {
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.getConfidenceLabel(-0.01));
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.getConfidenceLabel(1.01));
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.getConfidenceLabel(-0.1));
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.getConfidenceLabel(1.1));
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.getConfidenceLabel(50.0));
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.getConfidenceLabel(100.0));
    }

    @Test
    void validateConfidence_rejectsNaNAndInfinite() {
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.validateConfidence(Double.NaN));
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.validateConfidence(Double.POSITIVE_INFINITY));
        assertThrows(AiServiceException.class, () -> ConfidenceScoreUtil.validateConfidence(Double.NEGATIVE_INFINITY));
    }
}
