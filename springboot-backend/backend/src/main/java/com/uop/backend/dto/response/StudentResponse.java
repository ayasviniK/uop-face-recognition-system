package com.uop.backend.dto.response;

import java.time.LocalDateTime;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StudentResponse {
    private String studentId;
    private String faculty;
    private Integer tier;
    private LocalDateTime syncedAt;
    private LocalDateTime updatedAt;
}
