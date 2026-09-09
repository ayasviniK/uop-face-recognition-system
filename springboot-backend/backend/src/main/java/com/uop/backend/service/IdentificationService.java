package com.uop.backend.service;

import org.springframework.web.multipart.MultipartFile;
import com.uop.backend.dto.response.IdentificationResponse;

public interface IdentificationService {
    /**
     * Sends the probe image to the Flask AI service, resolves student faculty,
     * queries the University Index for full student details, and builds the identification response.
     */
    IdentificationResponse search(MultipartFile image) throws Exception;
}
