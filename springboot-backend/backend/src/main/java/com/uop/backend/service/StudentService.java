package com.uop.backend.service;

import com.uop.backend.dto.request.StudentCreateRequest;
import com.uop.backend.dto.request.StudentUpdateRequest;
import com.uop.backend.dto.response.StudentResponse;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.multipart.MultipartFile;

public interface StudentService {

    StudentResponse createStudent(StudentCreateRequest request);

    Page<StudentResponse> getAllStudents(Pageable pageable);

    Page<StudentResponse> searchStudents(String studentId, String fullName, Pageable pageable);

    StudentResponse getStudentById(Long id);

    StudentResponse updateStudent(Long id, StudentUpdateRequest request);

    void deleteStudent(Long id);

    StudentResponse updateStudentImageByStudentId(String studentId, MultipartFile file);
}
