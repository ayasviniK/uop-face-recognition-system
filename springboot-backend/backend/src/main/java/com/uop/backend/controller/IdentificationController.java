package com.uop.backend.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.uop.backend.dto.ApiResponse;
import com.uop.backend.dto.response.IdentificationResponse;
import com.uop.backend.service.IdentificationService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/identification")
@Validated
@Tag(name = "Face Identification", description = "Endpoints for student face search.")
public class IdentificationController {

    private final IdentificationService identificationService;

    public IdentificationController(IdentificationService identificationService) {
        this.identificationService = identificationService;
    }

    @PostMapping("/search")
    @Operation(summary = "Perform face recognition", description = "Uploads a probe image and queries the AI recognition service for student matches, returning matching student details.")
    public ResponseEntity<ApiResponse<IdentificationResponse>> search(
            @RequestParam("file") MultipartFile file) throws Exception {
        IdentificationResponse res = identificationService.search(file);
        return ResponseEntity.ok(ApiResponse.success(res, "Search completed successfully"));
    }
}
