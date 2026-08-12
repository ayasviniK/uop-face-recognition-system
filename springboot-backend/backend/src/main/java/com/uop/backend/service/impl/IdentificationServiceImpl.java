package com.uop.backend.service.impl;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.uop.backend.ai.AiClient;
import com.uop.backend.ai.AiClient.AiMatch;
import com.uop.backend.ai.AiClient.AiResponse;
import com.uop.backend.dto.response.IdentificationResponse;
import com.uop.backend.exception.FileValidationException;
import com.uop.backend.exception.ResourceNotFoundException;
import com.uop.backend.model.Student;
import com.uop.backend.repository.StudentRepository;
import com.uop.backend.service.IdentificationService;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class IdentificationServiceImpl implements IdentificationService {

    private final AiClient aiClient;
    private final StudentRepository studentRepository;

    public IdentificationServiceImpl(AiClient aiClient, StudentRepository studentRepository) {
        this.aiClient = aiClient;
        this.studentRepository = studentRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public IdentificationResponse search(MultipartFile image) throws Exception {
        validateImage(image);

        log.info("Sending probe image of size {} bytes to Flask AI recognition service", image.getSize());
        AiResponse aiResponse;
        try {
            aiResponse = aiClient.sendImage(image);
        } catch (org.springframework.web.client.ResourceAccessException e) {
            log.error("Flask service is unavailable: {}", e.getMessage());
            throw new RuntimeException("Face recognition service is currently unavailable", e);
        } catch (Exception e) {
            log.error("Error calling Flask service: {}", e.getMessage());
            throw new RuntimeException("Error occurred during face recognition: " + e.getMessage(), e);
        }

        if (aiResponse == null || aiResponse.matches == null) {
            log.error("Invalid response format received from Flask service");
            throw new RuntimeException("Invalid response from face recognition service");
        }

        // Handle no face detected
        if (aiResponse.matches.isEmpty()) {
            log.warn("No face detected or no matching student found by the Flask service");
            throw new ResourceNotFoundException("No face detected or no matching student found");
        }

        // Handle multiple faces detected if the service returns such details, 
        // or if we detect multiple matches with high confidence above threshold.
        // Let's assume if there are more than 3 matches with confidence > 80% it might be a crowd,
        // or the Flask service can set a flag, but for now we look at the top match.
        AiMatch topMatch = aiResponse.matches.get(0);
        if (topMatch.studentId == null || topMatch.studentId.trim().isEmpty()) {
            throw new ResourceNotFoundException("No face detected or no matching student found");
        }

        log.info("Face recognized: studentId={}, confidence={}", topMatch.studentId, topMatch.confidence);

        // Fetch matching student details from the database
        Student student = studentRepository.findByStudentId(topMatch.studentId)
                .orElseThrow(() -> {
                    log.warn("Recognized studentId {} not found in database", topMatch.studentId);
                    return new ResourceNotFoundException("Student recognized but not registered in database");
                });

        return IdentificationResponse.builder()
                .studentId(student.getStudentId())
                .fullName(student.getFullName())
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
