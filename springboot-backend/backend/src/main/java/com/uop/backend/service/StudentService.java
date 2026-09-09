package com.uop.backend.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import com.uop.backend.dto.request.StudentCreateRequest;
import com.uop.backend.dto.request.StudentUpdateRequest;
import com.uop.backend.dto.response.StudentResponse;

public interface StudentService {

    StudentResponse createStudent(StudentCreateRequest request);

    Page<StudentResponse> getAllStudents(Pageable pageable);

    Page<StudentResponse> searchStudents(String studentId, String faculty, Integer tier, Pageable pageable);

    StudentResponse getStudentById(String studentId);

    StudentResponse updateStudent(String studentId, StudentUpdateRequest request);

    void deleteStudent(String studentId);
}
