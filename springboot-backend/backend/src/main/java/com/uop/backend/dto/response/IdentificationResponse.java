package com.uop.backend.dto.response;

import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class IdentificationResponse {
    private String studentId;
    private String name;
    private String faculty;
    private Integer year;
    private String photoUrl;
    private Double confidence;
    private String confidenceLabel;

    @Builder
    public IdentificationResponse(String studentId, String name, String faculty, Integer year,
            String photoUrl, Double confidence, String confidenceLabel) {
        this.studentId = studentId;
        this.name = name;
        this.faculty = faculty;
        this.year = year;
        this.photoUrl = photoUrl;
        this.confidence = confidence;
        this.confidenceLabel = confidenceLabel;
    }
}
