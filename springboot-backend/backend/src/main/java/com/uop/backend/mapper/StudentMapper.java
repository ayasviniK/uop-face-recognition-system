package com.uop.backend.mapper;

import com.uop.backend.dto.request.StudentCreateRequest;
import com.uop.backend.dto.request.StudentUpdateRequest;
import com.uop.backend.dto.response.StudentResponse;
import com.uop.backend.model.Student;

public class StudentMapper {

    public static StudentResponse toResponse(Student s) {
        if (s == null) return null;
        return StudentResponse.builder()
                .id(s.getId())
                .studentId(s.getStudentId())
                .fullName(s.getFullName())
                .imagePath(s.getImagePath())
                .build();
    }

    public static Student fromCreateRequest(StudentCreateRequest r){
        if (r == null) return null;
        return Student.builder()
                .studentId(r.getStudentId())
                .fullName(r.getFullName())
                .build();
    }

    public static void updateFromDto(StudentUpdateRequest r, Student s){
        if (r == null || s == null) return;
        s.setStudentId(r.getStudentId());
        s.setFullName(r.getFullName());
    }
}
