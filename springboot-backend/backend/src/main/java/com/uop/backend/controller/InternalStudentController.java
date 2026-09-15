package com.uop.backend.controller;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.uop.backend.dto.request.EmbeddingSaveRequest;
import com.uop.backend.dto.request.SyncLogRequest;
import com.uop.backend.dto.request.TierUpdateRequest;
import com.uop.backend.dto.response.EmbeddingResponse;
import com.uop.backend.dto.response.StudentIdsResponse;
import com.uop.backend.model.SyncLog;
import com.uop.backend.service.InternalStudentService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Dedicated internal API controller for Flask AI Service synchronization and identification matching.
 * The React frontend must never call these endpoints.
 */
@RestController
@RequestMapping("/internal")
@RequiredArgsConstructor
@Tag(name = "Internal AI Integration", description = "Endpoints for Flask AI Service integration.")
public class InternalStudentController {

    private final InternalStudentService internalStudentService;

    @GetMapping("/students/embeddings")
    @Operation(summary = "Get student embeddings", description = "Retrieves stored face embeddings filtered optionally by tier and facultyPrefix.")
    public ResponseEntity<List<EmbeddingResponse>> getEmbeddings(
            @RequestParam(name = "tier", required = false) Integer tier,
            @RequestParam(name = "facultyPrefix", required = false) String facultyPrefix) {
        List<EmbeddingResponse> embeddings = internalStudentService.getEmbeddings(tier, facultyPrefix);
        return ResponseEntity.ok(embeddings);
    }

    @PostMapping("/students/embeddings")
    @Operation(summary = "Save or update student embeddings", description = "UPSERT student and 6 ArcFace augmented embeddings.")
    public ResponseEntity<Map<String, Object>> saveEmbeddings(@Valid @RequestBody EmbeddingSaveRequest request) {
        Map<String, Object> result = internalStudentService.saveEmbeddings(request);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/students/ids")
    @Operation(summary = "Get all student IDs", description = "Returns all student IDs currently stored in the local database for sync comparison.")
    public ResponseEntity<StudentIdsResponse> getAllStudentIds() {
        StudentIdsResponse response = internalStudentService.getAllStudentIds();
        return ResponseEntity.ok(response);
    }

    @PatchMapping(value = {
            "/students/{studentId}/tier",
            "/students/{p1}/{p2}/{p3}/tier",
            "/students/{p1}/{p2}/tier"
    })
    @Operation(summary = "Update student tier", description = "Moves student between tier 1 and tier 2 without deleting them.")
    public ResponseEntity<Map<String, String>> updateTier(
            @PathVariable Map<String, String> pathVars,
            @Valid @RequestBody TierUpdateRequest request) {
        String studentId = extractStudentId(pathVars);
        Map<String, String> response = internalStudentService.updateStudentTier(studentId, request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/sync/log")
    @Operation(summary = "Log synchronization run", description = "Persists a synchronization run result into sync_log.")
    public ResponseEntity<SyncLog> recordSyncLog(@Valid @RequestBody SyncLogRequest request) {
        SyncLog syncLog = internalStudentService.recordSyncLog(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(syncLog);
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
