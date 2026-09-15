package com.uop.backend.model;

import java.time.LocalDateTime;
import java.util.List;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "embeddings")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Embedding {

    @Id
    @Column(name = "student_id", nullable = false, length = 50)
    private String studentId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "embedding_original", columnDefinition = "json", nullable = false)
    private List<Double> embeddingOriginal;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "embedding_flipped", columnDefinition = "json", nullable = false)
    private List<Double> embeddingFlipped;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "embedding_brighter", columnDefinition = "json", nullable = false)
    private List<Double> embeddingBrighter;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "embedding_darker", columnDefinition = "json", nullable = false)
    private List<Double> embeddingDarker;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "embedding_rotated_plus", columnDefinition = "json", nullable = false)
    private List<Double> embeddingRotatedPlus;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "embedding_rotated_minus", columnDefinition = "json", nullable = false)
    private List<Double> embeddingRotatedMinus;

    @Column(name = "generated_at")
    private LocalDateTime generatedAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        if (generatedAt == null) {
            generatedAt = LocalDateTime.now();
        }
        if (updatedAt == null) {
            updatedAt = LocalDateTime.now();
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
