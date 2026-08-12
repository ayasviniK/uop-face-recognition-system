package com.uop.backend.storage;

import org.springframework.web.multipart.MultipartFile;

public interface StorageService {
    /**
     * Store the student registration photograph under the upload directory.
     * Renames the file to studentId + extension (e.g., "IT22012345.jpg").
     * Returns the relative path to be stored in the database, e.g., "uploads/students/IT22012345.jpg".
     */
    String store(MultipartFile file, String studentId);
}
