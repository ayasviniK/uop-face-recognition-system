package com.uop.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UniversityStudentResponse {
    private String studentId;
    private String name;
    private String faculty;
    private Integer year;
    private String photoUrl;
}
