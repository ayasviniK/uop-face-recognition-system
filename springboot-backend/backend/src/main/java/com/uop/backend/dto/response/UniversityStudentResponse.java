package com.uop.backend.dto.response;

import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class UniversityStudentResponse {
    private String studentId;
    private String name;
    private String faculty;
    private Integer year;
    private String photoUrl;

    @Builder
    public UniversityStudentResponse(String studentId, String name, String faculty, Integer year, String photoUrl) {
        this.studentId = studentId;
        this.name = name;
        this.faculty = faculty;
        this.year = year;
        this.photoUrl = photoUrl;
    }
}
