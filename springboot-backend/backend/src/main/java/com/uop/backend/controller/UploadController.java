package com.uop.backend.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.uop.backend.dto.ApiResponse;
import com.uop.backend.storage.StorageService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/uploads")
@RequiredArgsConstructor
@Tag(name = "Image Uploads", description = "Endpoints for probe image uploads.")
public class UploadController {

    private final StorageService storageService;

    @PostMapping("/probe-image")
    @Operation(summary = "Upload probe image", description = "Stores temporary probe photo for face recognition processing.")
    public ResponseEntity<ApiResponse<String>> uploadProbeImage(@RequestParam("file") MultipartFile file) {
        String path = storageService.store(file, "probe_" + System.currentTimeMillis());
        return ResponseEntity.ok(ApiResponse.success(path, "Probe image uploaded successfully"));
    }

    @PostMapping("/student-image")
    @Operation(summary = "Upload student photograph (Deprecated)", description = "Student photos are now managed exclusively via University Index synchronization.")
    public ResponseEntity<ApiResponse<String>> uploadStudentImage(
            @RequestParam("file") MultipartFile file,
            @RequestParam("studentId") String studentId) {
        String path = storageService.store(file, studentId.replace("/", "_"));
        return ResponseEntity.ok(ApiResponse.success(path, "Photo processed. Note: Permanent student photos are sourced directly from the University Index."));
    }
}
