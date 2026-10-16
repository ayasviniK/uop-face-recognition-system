package com.uop.backend.dto.response;

import java.util.List;

import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class EmbeddingResponse {
    private String studentId;
    private Integer tier;
    private List<Double> embeddingOriginal;
    private List<Double> embeddingFlipped;
    private List<Double> embeddingBrighter;
    private List<Double> embeddingDarker;
    private List<Double> embeddingRotatedPlus;
    private List<Double> embeddingRotatedMinus;
    private List<Double> embeddingLeft1;
    private List<Double> embeddingLeft2;
    private List<Double> embeddingRight1;
    private List<Double> embeddingRight2;

    @Builder
    public EmbeddingResponse(String studentId, Integer tier, List<Double> embeddingOriginal,
            List<Double> embeddingFlipped, List<Double> embeddingBrighter, List<Double> embeddingDarker,
            List<Double> embeddingRotatedPlus, List<Double> embeddingRotatedMinus, List<Double> embeddingLeft1,
            List<Double> embeddingLeft2, List<Double> embeddingRight1, List<Double> embeddingRight2) {
        this.studentId = studentId;
        this.tier = tier;
        this.embeddingOriginal = embeddingOriginal;
        this.embeddingFlipped = embeddingFlipped;
        this.embeddingBrighter = embeddingBrighter;
        this.embeddingDarker = embeddingDarker;
        this.embeddingRotatedPlus = embeddingRotatedPlus;
        this.embeddingRotatedMinus = embeddingRotatedMinus;
        this.embeddingLeft1 = embeddingLeft1;
        this.embeddingLeft2 = embeddingLeft2;
        this.embeddingRight1 = embeddingRight1;
        this.embeddingRight2 = embeddingRight2;
    }
}
