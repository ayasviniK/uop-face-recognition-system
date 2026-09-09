package com.uop.backend.controller;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

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
@Tag(name = "Student Management", description = "Endpoints for viewing and querying local student metadata.")
public class StudentController {

    private final StudentService studentService;

    @PostMapping
    @Operation(summary = "Register student metadata", description = "Registers student metadata with unique student ID, faculty, and tier.")
    public ResponseEntity<ApiResponse<StudentResponse>> createStudent(@Valid @RequestBody StudentCreateRequest request) {
        StudentResponse created = studentService.createStudent(request);
        URI location = URI.create("/api/students/" + created.getStudentId());
        return ResponseEntity.created(location).body(ApiResponse.success(created, "Student created successfully"));
    }

    @GetMapping
    @Operation(summary = "List all students or search by parameters", description = "Retrieves a paginated list of registered students with optional search filters.")
    public ResponseEntity<ApiResponse<Page<StudentResponse>>> getStudents(
            @RequestParam(value = "studentId", required = false) String studentId,
            @RequestParam(value = "faculty", required = false) String faculty,
            @RequestParam(value = "tier", required = false) Integer tier,
            Pageable pageable) {
        Page<StudentResponse> result;
        if ((studentId != null && !studentId.trim().isEmpty()) || (faculty != null && !faculty.trim().isEmpty()) || tier != null) {
            result = studentService.searchStudents(studentId, faculty, tier, pageable);
        } else {
            result = studentService.getAllStudents(pageable);
        }
        return ResponseEntity.ok(ApiResponse.success(result, "Students retrieved successfully"));
    }

    public ResponseEntity<ApiResponse<StudentResponse>> getStudent(String studentId) {
        return ResponseEntity.ok(ApiResponse.success(studentService.getStudentById(studentId), "Student retrieved successfully"));
    }

    @GetMapping(value = {"/{studentId}", "/{p1}/{p2}/{p3}", "/{p1}/{p2}"})
    @Operation(summary = "Get student by ID", description = "Retrieves details of a student by their university student ID.")
    public ResponseEntity<ApiResponse<StudentResponse>> getStudent(@PathVariable Map<String, String> pathVars) {
        String studentId = extractStudentId(pathVars);
        return getStudent(studentId);
    }

    public ResponseEntity<ApiResponse<StudentResponse>> updateStudent(String studentId, StudentUpdateRequest request) {
        StudentResponse updated = studentService.updateStudent(studentId, request);
        return ResponseEntity.ok(ApiResponse.success(updated, "Student updated successfully"));
    }

    @PutMapping(value = {"/{studentId}", "/{p1}/{p2}/{p3}", "/{p1}/{p2}"})
    @Operation(summary = "Update student details", description = "Updates fields of an existing student record by their university student ID.")
    public ResponseEntity<ApiResponse<StudentResponse>> updateStudent(
            @PathVariable Map<String, String> pathVars,
            @Valid @RequestBody StudentUpdateRequest request) {
        String studentId = extractStudentId(pathVars);
        return updateStudent(studentId, request);
    }

    public ResponseEntity<ApiResponse<Void>> deleteStudent(String studentId) {
        studentService.deleteStudent(studentId);
        return ResponseEntity.ok(ApiResponse.success(null, "Student deleted successfully"));
    }

    @DeleteMapping(value = {"/{studentId}", "/{p1}/{p2}/{p3}", "/{p1}/{p2}"})
    @Operation(summary = "Delete student", description = "Removes a student record by their university student ID.")
    public ResponseEntity<ApiResponse<Void>> deleteStudent(@PathVariable Map<String, String> pathVars) {
        String studentId = extractStudentId(pathVars);
        return deleteStudent(studentId);
    }

    private String extractStudentId(Map<String, String> pathVars) {
        String studentId;
        if (pathVars.containsKey("p1") && pathVars.containsKey("p2") && pathVars.containsKey("p3")) {
            studentId = pathVars.get("p1") + "/" + pathVars.get("p2") + "/" + pathVars.get("p3");
        } else if (pathVars.containsKey("p1") && pathVars.containsKey("p2")) {
            studentId = pathVars.get("p1") + "/" + pathVars.get("p2");
        } else {
            studentId = pathVars.get("studentId");
        }

        if (studentId != null && studentId.contains("%2F")) {
            studentId = URLDecoder.decode(studentId, StandardCharsets.UTF_8);
        }
        return studentId != null ? studentId.trim() : "";
    }
}
