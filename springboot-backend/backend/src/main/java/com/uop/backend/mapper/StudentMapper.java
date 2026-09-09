package com.uop.backend.mapper;

import com.uop.backend.dto.request.StudentCreateRequest;
import com.uop.backend.dto.request.StudentUpdateRequest;
import com.uop.backend.dto.response.StudentResponse;
import com.uop.backend.model.Student;

public class StudentMapper {

    public static StudentResponse toResponse(Student s) {
        if (s == null) return null;
        return StudentResponse.builder()
                .studentId(s.getStudentId())
                .faculty(s.getFaculty())
                .tier(s.getTier())
                .syncedAt(s.getSyncedAt())
                .updatedAt(s.getUpdatedAt())
                .build();
    }

    public static Student fromCreateRequest(StudentCreateRequest r) {
        if (r == null) return null;
        return Student.builder()
                .studentId(r.getStudentId())
                .faculty(r.getFaculty())
                .tier(r.getTier() != null ? r.getTier() : 1)
                .build();
    }

    public static void updateFromDto(StudentUpdateRequest r, Student s) {
        if (r == null || s == null) return;
        if (r.getFaculty() != null && !r.getFaculty().isBlank()) {
            s.setFaculty(r.getFaculty());
        }
        if (r.getTier() != null) {
            s.setTier(r.getTier());
        }
    }
}
