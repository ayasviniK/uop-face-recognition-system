package com.uop.backend.service.impl;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.uop.backend.dto.request.EmbeddingSaveRequest;
import com.uop.backend.dto.request.SyncLogRequest;
import com.uop.backend.dto.request.TierUpdateRequest;
import com.uop.backend.dto.response.EmbeddingResponse;
import com.uop.backend.dto.response.StudentIdsResponse;
import com.uop.backend.exception.EmbeddingValidationException;
import com.uop.backend.exception.ResourceNotFoundException;
import com.uop.backend.model.Embedding;
import com.uop.backend.model.Student;
import com.uop.backend.model.SyncLog;
import com.uop.backend.repository.EmbeddingRepository;
import com.uop.backend.repository.StudentRepository;
import com.uop.backend.repository.SyncLogRepository;
import com.uop.backend.service.FacultyResolver;
import com.uop.backend.service.InternalStudentService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class InternalStudentServiceImpl implements InternalStudentService {

    private static final int EXPECTED_EMBEDDING_DIMENSION = 512;

    private final StudentRepository studentRepository;
    private final EmbeddingRepository embeddingRepository;
    private final SyncLogRepository syncLogRepository;
    private final FacultyResolver facultyResolver;

    @Override
    @Transactional(readOnly = true)
    public List<EmbeddingResponse> getEmbeddings(Integer tier, String facultyPrefix) {
        String pattern = null;
        if (facultyPrefix != null && !facultyPrefix.isBlank()) {
            String prefix = facultyPrefix.trim().replace("/", "").toUpperCase();
            pattern = prefix + "/%";
        }

        log.info("Fetching embeddings for tier={}, facultyPrefixPattern={}", tier, pattern);
        List<Object[]> results = embeddingRepository.findEmbeddingsWithTier(tier, pattern);

        List<EmbeddingResponse> responses = new ArrayList<>(results.size());
        for (Object[] row : results) {
            Embedding e = (Embedding) row[0];
            Integer studentTier = (Integer) row[1];

            responses.add(EmbeddingResponse.builder()
                    .studentId(e.getStudentId())
                    .tier(studentTier != null ? studentTier : 1)
                    .embeddingOriginal(e.getEmbeddingOriginal())
                    .embeddingFlipped(e.getEmbeddingFlipped())
                    .embeddingBrighter(e.getEmbeddingBrighter())
                    .embeddingDarker(e.getEmbeddingDarker())
                    .embeddingRotatedPlus(e.getEmbeddingRotatedPlus())
                    .embeddingRotatedMinus(e.getEmbeddingRotatedMinus())
                    .build());
        }

        log.info("Retrieved {} embeddings for tier={}, facultyPrefix={}", responses.size(), tier, facultyPrefix);
        return responses;
    }

    @Override
    @Transactional
    public Map<String, Object> saveEmbeddings(EmbeddingSaveRequest request) {
        validateEmbeddingVectors(request);

        String studentId = request.getStudentId().trim();
        String faculty = facultyResolver.resolve(studentId);
        int tier = (request.getTier() != null && (request.getTier() == 1 || request.getTier() == 2))
                ? request.getTier()
                : 1;

        LocalDateTime now = LocalDateTime.now();

        // 1. UPSERT Student
        Student student = studentRepository.findByStudentId(studentId)
                .map(existing -> {
                    existing.setFaculty(faculty);
                    existing.setTier(tier);
                    existing.setUpdatedAt(now);
                    return existing;
                })
                .orElseGet(() -> Student.builder()
                        .studentId(studentId)
                        .faculty(faculty)
                        .tier(tier)
                        .syncedAt(now)
                        .updatedAt(now)
                        .build());
        studentRepository.save(student);

        // 2. UPSERT Embedding
        Embedding embedding = embeddingRepository.findByStudentId(studentId)
                .map(existing -> {
                    existing.setEmbeddingOriginal(request.getEmbeddingOriginal());
                    existing.setEmbeddingFlipped(request.getEmbeddingFlipped());
                    existing.setEmbeddingBrighter(request.getEmbeddingBrighter());
                    existing.setEmbeddingDarker(request.getEmbeddingDarker());
                    existing.setEmbeddingRotatedPlus(request.getEmbeddingRotatedPlus());
                    existing.setEmbeddingRotatedMinus(request.getEmbeddingRotatedMinus());
                    existing.setUpdatedAt(now);
                    return existing;
                })
                .orElseGet(() -> Embedding.builder()
                        .studentId(studentId)
                        .embeddingOriginal(request.getEmbeddingOriginal())
                        .embeddingFlipped(request.getEmbeddingFlipped())
                        .embeddingBrighter(request.getEmbeddingBrighter())
                        .embeddingDarker(request.getEmbeddingDarker())
                        .embeddingRotatedPlus(request.getEmbeddingRotatedPlus())
                        .embeddingRotatedMinus(request.getEmbeddingRotatedMinus())
                        .generatedAt(now)
                        .updatedAt(now)
                        .build());
        embeddingRepository.save(embedding);

        log.info("Successfully upserted student and 6 embeddings for studentId={}", studentId);
        return Map.of("message", "Embeddings saved", "studentId", studentId);
    }

    @Override
    @Transactional(readOnly = true)
    public StudentIdsResponse getAllStudentIds() {
        List<String> ids = studentRepository.findAllStudentIds();
        log.info("Retrieved {} total student IDs from local database", ids.size());
        return StudentIdsResponse.builder().studentIds(ids).build();
    }

    @Override
    @Transactional
    public Map<String, String> updateStudentTier(String studentId, TierUpdateRequest request) {
        if (request.getTier() == null || (request.getTier() != 1 && request.getTier() != 2)) {
            throw new IllegalArgumentException("Tier must be 1 or 2");
        }

        Student student = studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResourceNotFoundException("Student not found: " + studentId));

        student.setTier(request.getTier());
        student.setUpdatedAt(LocalDateTime.now());
        studentRepository.save(student);

        log.info("Moved student {} to tier {}", studentId, request.getTier());
        return Map.of("message", "Student " + studentId + " moved to tier " + request.getTier());
    }

    @Override
    @Transactional
    public SyncLog recordSyncLog(SyncLogRequest request) {
        SyncLog logEntry = SyncLog.builder()
                .syncedAt(LocalDateTime.now())
                .studentsAdded(request.getStudentsAdded() != null ? request.getStudentsAdded() : 0)
                .studentsUpdated(request.getStudentsUpdated() != null ? request.getStudentsUpdated() : 0)
                .studentsTieredDown(request.getStudentsTieredDown() != null ? request.getStudentsTieredDown() : 0)
                .status(request.getStatus() != null && !request.getStatus().isBlank() ? request.getStatus() : "success")
                .notes(request.getNotes())
                .build();

        SyncLog saved = syncLogRepository.save(logEntry);
        log.info("Recorded sync log id={}, status={}, added={}, updated={}, tieredDown={}",
                saved.getId(), saved.getStatus(), saved.getStudentsAdded(), saved.getStudentsUpdated(), saved.getStudentsTieredDown());
        return saved;
    }

    private void validateEmbeddingVectors(EmbeddingSaveRequest request) {
        if (request.getStudentId() == null || request.getStudentId().isBlank()) {
            throw new EmbeddingValidationException("studentId cannot be null or blank");
        }
        if (request.getTier() != null && request.getTier() != 1 && request.getTier() != 2) {
            throw new EmbeddingValidationException("tier must be 1 or 2");
        }

        validateVector("embeddingOriginal", request.getEmbeddingOriginal());
        validateVector("embeddingFlipped", request.getEmbeddingFlipped());
        validateVector("embeddingBrighter", request.getEmbeddingBrighter());
        validateVector("embeddingDarker", request.getEmbeddingDarker());
        validateVector("embeddingRotatedPlus", request.getEmbeddingRotatedPlus());
        validateVector("embeddingRotatedMinus", request.getEmbeddingRotatedMinus());
    }

    private void validateVector(String name, List<Double> vector) {
        if (vector == null) {
            throw new EmbeddingValidationException("Vector '" + name + "' cannot be null");
        }
        if (vector.size() != EXPECTED_EMBEDDING_DIMENSION) {
            throw new EmbeddingValidationException(
                    "Vector '" + name + "' must contain exactly " + EXPECTED_EMBEDDING_DIMENSION + " elements, found: " + vector.size());
        }
    }
}
