package com.uop.backend.dto.request;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class EmbeddingSaveRequest {

    @NotBlank(message = "studentId is mandatory")
    @Size(max = 50, message = "studentId must not exceed 50 characters")
    private String studentId;

    /**
     * Optional faculty field. Spring Boot authoritatively derives the faculty
     * from the studentId prefix using FacultyResolver.
     */
    @Size(max = 100, message = "faculty must not exceed 100 characters")
    private String faculty;

    @Min(value = 1, message = "tier must be 1 or 2")
    @Max(value = 2, message = "tier must be 1 or 2")
    private Integer tier = 1;

    @NotNull(message = "Original embedding is mandatory")
    @JsonProperty("embeddingOriginal")
    @JsonAlias({"originalEmbedding", "embedding_original", "original_embedding"})
    private List<Double> embeddingOriginal;

    @NotNull(message = "Flipped embedding is mandatory")
    @JsonProperty("embeddingFlipped")
    @JsonAlias({"flippedEmbedding", "embedding_flipped", "flipped_embedding"})
    private List<Double> embeddingFlipped;

    @NotNull(message = "Brighter embedding is mandatory")
    @JsonProperty("embeddingBrighter")
    @JsonAlias({"brighterEmbedding", "embedding_brighter", "brighter_embedding"})
    private List<Double> embeddingBrighter;

    @NotNull(message = "Darker embedding is mandatory")
    @JsonProperty("embeddingDarker")
    @JsonAlias({"darkerEmbedding", "embedding_darker", "darker_embedding"})
    private List<Double> embeddingDarker;

    @NotNull(message = "Rotated plus embedding is mandatory")
    @JsonProperty("embeddingRotatedPlus")
    @JsonAlias({"rotatedPlus10Embedding", "embeddingRotatedPlus10", "embedding_rotated_plus", "rotated_plus_10"})
    private List<Double> embeddingRotatedPlus;

    @NotNull(message = "Rotated minus embedding is mandatory")
    @JsonProperty("embeddingRotatedMinus")
    @JsonAlias({"rotatedMinus10Embedding", "embeddingRotatedMinus10", "embedding_rotated_minus", "rotated_minus_10"})
    private List<Double> embeddingRotatedMinus;

    @JsonProperty("embeddingLeft1")
    @JsonAlias({"embedding_left_1", "left1Embedding", "left_1_embedding"})
    private List<Double> embeddingLeft1;

    @JsonProperty("embeddingLeft2")
    @JsonAlias({"embedding_left_2", "left2Embedding", "left_2_embedding"})
    private List<Double> embeddingLeft2;

    @JsonProperty("embeddingRight1")
    @JsonAlias({"embedding_right_1", "right1Embedding", "right_1_embedding"})
    private List<Double> embeddingRight1;

    @JsonProperty("embeddingRight2")
    @JsonAlias({"embedding_right_2", "right2Embedding", "right_2_embedding"})
    private List<Double> embeddingRight2;

    @Builder
    public EmbeddingSaveRequest(String studentId, String faculty, Integer tier,
            List<Double> embeddingOriginal, List<Double> embeddingFlipped, List<Double> embeddingBrighter,
            List<Double> embeddingDarker, List<Double> embeddingRotatedPlus, List<Double> embeddingRotatedMinus,
            List<Double> embeddingLeft1, List<Double> embeddingLeft2, List<Double> embeddingRight1,
            List<Double> embeddingRight2) {
        this.studentId = studentId;
        this.faculty = faculty;
        this.tier = tier != null ? tier : 1;
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
