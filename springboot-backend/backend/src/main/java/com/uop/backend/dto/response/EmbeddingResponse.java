package com.uop.backend.dto.response;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
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
}
