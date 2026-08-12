package com.uop.backend.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.uop.backend.dto.ApiResponse;
import com.uop.backend.dto.response.StudentResponse;
import com.uop.backend.service.StudentService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/uploads")
@Tag(name = "Image Uploads", description = "Endpoints for uploading student registration photographs.")
public class UploadController {

    private final StudentService studentService;
    private final String uploadDir;

    public UploadController(StudentService studentService, @Value("${file.upload-dir}") String uploadDir) {
        this.studentService = studentService;
        this.uploadDir = uploadDir;
    }

    @PostMapping("/student-image")
    @Operation(summary = "Upload student registration photograph", description = "Uploads a photo for a student record and links it. Photo must be JPG/PNG and under 5MB.")
    public ResponseEntity<ApiResponse<StudentResponse>> uploadStudentImage(
            @RequestParam("file") MultipartFile file,
            @RequestParam("studentId") String studentId) {
        StudentResponse updated = studentService.updateStudentImageByStudentId(studentId, file);
        return ResponseEntity.ok(ApiResponse.success(updated, "Image uploaded and linked successfully"));
    }
}
