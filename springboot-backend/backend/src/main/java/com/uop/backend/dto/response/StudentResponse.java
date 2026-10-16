package com.uop.backend.dto.response;

import java.time.LocalDateTime;

import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class StudentResponse {
    private String studentId;
    private String faculty;
    private Integer tier;
    private LocalDateTime syncedAt;
    private LocalDateTime updatedAt;

    @Builder
    public StudentResponse(String studentId, String faculty, Integer tier, LocalDateTime syncedAt, LocalDateTime updatedAt) {
        this.studentId = studentId;
        this.faculty = faculty;
        this.tier = tier;
        this.syncedAt = syncedAt;
        this.updatedAt = updatedAt;
    }
}
