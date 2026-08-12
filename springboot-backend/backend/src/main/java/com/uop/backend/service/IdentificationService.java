package com.uop.backend.service;

import org.springframework.web.multipart.MultipartFile;
import com.uop.backend.dto.response.IdentificationResponse;

public interface IdentificationService {
    /**
     * Sends the probe image to the Flask service and retrieves the matching student from the database.
     * Throws appropriate exceptions if no face is detected, multiple faces are detected,
     * the Flask service is unavailable, or the student is not in the database.
     */
    IdentificationResponse search(MultipartFile image) throws Exception;
}
