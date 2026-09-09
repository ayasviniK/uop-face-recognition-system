package com.uop.backend.service.impl;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.uop.backend.ai.AiClient;
import com.uop.backend.ai.AiClient.AiMatch;
import com.uop.backend.ai.AiClient.AiResponse;
import com.uop.backend.client.UniversityIndexClient;
import com.uop.backend.dto.response.IdentificationResponse;
import com.uop.backend.dto.response.UniversityStudentResponse;
import com.uop.backend.exception.FileValidationException;
import com.uop.backend.exception.ResourceNotFoundException;
import com.uop.backend.exception.StudentNotFoundException;
import com.uop.backend.model.Student;
import com.uop.backend.repository.StudentRepository;
import com.uop.backend.service.FacultyResolver;
import com.uop.backend.service.IdentificationService;
import com.uop.backend.util.ConfidenceScoreUtil;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class IdentificationServiceImpl implements IdentificationService {

    private final AiClient aiClient;
    private final StudentRepository studentRepository;
    private final FacultyResolver facultyResolver;
    private final UniversityIndexClient universityIndexClient;

    @Override
    @Transactional(readOnly = true)
    public IdentificationResponse search(MultipartFile image) throws Exception {
        validateImage(image);

        log.info("Sending probe image (size: {} bytes) to Flask AI recognition service", image.getSize());
        AiResponse aiResponse = aiClient.sendImage(image);

        if (aiResponse == null || aiResponse.matches == null || aiResponse.matches.isEmpty()) {
            log.warn("No face detected or no matching student found by Flask AI service");
            throw new ResourceNotFoundException("No face detected or no matching student found");
        }

        AiMatch topMatch = aiResponse.matches.get(0);
        if (topMatch.studentId == null || topMatch.studentId.trim().isEmpty()) {
            log.warn("AI service returned an empty student ID in top match");
            throw new ResourceNotFoundException("No face detected or no matching student found");
        }

        double confidence = topMatch.confidence;
        ConfidenceScoreUtil.validateConfidence(confidence);
        String confidenceLabel = ConfidenceScoreUtil.getConfidenceLabel(confidence);

        log.info("AI matched studentId={}, confidence={}, label={}", topMatch.studentId, confidence, confidenceLabel);

        // 1. Look up student in local database to verify and obtain local metadata
        Student student = studentRepository.findByStudentId(topMatch.studentId.trim())
                .orElseThrow(() -> {
                    log.warn("Recognized studentId {} not found in local database", topMatch.studentId);
                    return new StudentNotFoundException("Student recognized by AI (" + topMatch.studentId + ") is not registered in the local database");
                });

        // 2. Resolve faculty
        String faculty = student.getFaculty();
        if (faculty == null || faculty.isBlank()) {
            faculty = facultyResolver.resolve(student.getStudentId());
        }

        // 3. Query University Index for full student personal details
        UniversityStudentResponse universityStudent = universityIndexClient.getStudent(faculty, student.getStudentId());

        // 4. Assemble final identification response
        return IdentificationResponse.builder()
                .studentId(student.getStudentId())
                .name(universityStudent != null ? universityStudent.getName() : null)
                .faculty((universityStudent != null && universityStudent.getFaculty() != null) ? universityStudent.getFaculty() : faculty)
                .year(universityStudent != null ? universityStudent.getYear() : null)
                .photoUrl(universityStudent != null ? universityStudent.getPhotoUrl() : null)
                .confidence(confidence)
                .confidenceLabel(confidenceLabel)
                .build();
    }

    private void validateImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new FileValidationException("Upload file is empty");
        }
        if (file.getSize() > 5 * 1024 * 1024) { // 5MB
            throw new FileValidationException("Upload file size exceeds 5MB limit");
        }
        String original = file.getOriginalFilename();
        if (original == null || original.trim().isEmpty()) {
            throw new FileValidationException("Invalid upload filename");
        }
        String ext = "";
        int idx = original.lastIndexOf('.');
        if (idx >= 0) {
            ext = original.substring(idx).toLowerCase();
        }
        if (!ext.equals(".jpg") && !ext.equals(".jpeg") && !ext.equals(".png")) {
            throw new FileValidationException("Only PNG and JPEG images are allowed (.jpg, .jpeg, .png)");
        }
        String ct = file.getContentType();
        if (ct == null || !(ct.equalsIgnoreCase("image/jpeg") || ct.equalsIgnoreCase("image/png") || ct.equalsIgnoreCase("image/jpg"))) {
            throw new FileValidationException("Only PNG and JPEG images are allowed (invalid Content-Type)");
        }
    }
}
