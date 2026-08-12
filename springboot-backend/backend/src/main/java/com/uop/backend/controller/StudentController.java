package com.uop.backend.controller;

import java.net.URI;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.uop.backend.dto.ApiResponse;
import com.uop.backend.dto.request.StudentCreateRequest;
import com.uop.backend.dto.request.StudentUpdateRequest;
import com.uop.backend.dto.response.StudentResponse;
import com.uop.backend.service.StudentService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/students")
@RequiredArgsConstructor
@Tag(name = "Student Management", description = "Endpoints for creating, retrieving, updating, and deleting student records.")
public class StudentController {

    private final StudentService studentService;

    @PostMapping
    @Operation(summary = "Create a new student", description = "Registers a new student in the system with a unique student ID and full name.")
    public ResponseEntity<ApiResponse<StudentResponse>> createStudent(@Valid @RequestBody StudentCreateRequest request) {
        StudentResponse created = studentService.createStudent(request);
        URI location = URI.create("/api/students/" + created.getId());
        return ResponseEntity.created(location).body(ApiResponse.success(created, "Student created successfully"));
    }

    @GetMapping
    @Operation(summary = "List all students or search by parameters", description = "Retrieves a paginated list of registered students with optional search filters.")
    public ResponseEntity<ApiResponse<Page<StudentResponse>>> getStudents(
            @RequestParam(value = "studentId", required = false) String studentId,
            @RequestParam(value = "fullName", required = false) String fullName,
            Pageable pageable) {
        Page<StudentResponse> result;
        if ((studentId != null && !studentId.trim().isEmpty()) || (fullName != null && !fullName.trim().isEmpty())) {
            result = studentService.searchStudents(studentId, fullName, pageable);
        } else {
            result = studentService.getAllStudents(pageable);
        }
        return ResponseEntity.ok(ApiResponse.success(result, "Students retrieved successfully"));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get student by ID", description = "Retrieves details of a student by their database ID.")
    public ResponseEntity<ApiResponse<StudentResponse>> getStudent(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(studentService.getStudentById(id), "Student retrieved successfully"));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update student details", description = "Updates fields of an existing student record by their database ID.")
    public ResponseEntity<ApiResponse<StudentResponse>> updateStudent(@PathVariable Long id, @Valid @RequestBody StudentUpdateRequest request) {
        StudentResponse updated = studentService.updateStudent(id, request);
        return ResponseEntity.ok(ApiResponse.success(updated, "Student updated successfully"));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete student", description = "Removes a student record by their database ID.")
    public ResponseEntity<ApiResponse<Void>> deleteStudent(@PathVariable Long id) {
        studentService.deleteStudent(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Student deleted successfully"));
    }
}
