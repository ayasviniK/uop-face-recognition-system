package com.uop.backend.storage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import com.uop.backend.exception.FileValidationException;

@Service
public class FileSystemStorageService implements StorageService {

    private final Path rootLocation;
    private final String uploadDir;

    public FileSystemStorageService(@Value("${file.upload-dir}") String uploadDir) {
        this.uploadDir = uploadDir;
        this.rootLocation = Paths.get(uploadDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.rootLocation);
        } catch (IOException e) {
            throw new RuntimeException("Could not create storage directory", e);
        }
    }

    @Override
    public String store(MultipartFile file, String studentId) {
        validateImage(file);
        
        // Prevent path traversal in studentId
        if (studentId == null || studentId.trim().isEmpty() || studentId.contains("..") || studentId.contains("/") || studentId.contains("\\")) {
            throw new FileValidationException("Invalid studentId provided for file naming");
        }

        String original = file.getOriginalFilename();
        String cleanName = StringUtils.cleanPath(Objects.requireNonNull(original));
        String ext = "";
        int i = cleanName.lastIndexOf('.');
        if (i >= 0) {
            ext = cleanName.substring(i).toLowerCase();
        }

        // Filename is studentId + extension
        String filename = studentId + ext;

        try {
            Path target = this.rootLocation.resolve(filename).normalize();
            
            // Prevent path traversal attacks
            if (!target.toAbsolutePath().startsWith(this.rootLocation.toAbsolutePath())) {
                throw new FileValidationException("Path traversal attempt detected");
            }

            try (var in = file.getInputStream()) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }
            
            return uploadDir + "/" + filename;
        } catch (IOException e) {
            throw new RuntimeException("Failed to store file", e);
        }
    }

    private void validateImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new FileValidationException("File is empty");
        }
        if (file.getSize() > 5 * 1024 * 1024) { // 5MB limit
            throw new FileValidationException("File size exceeds 5MB limit");
        }
        String original = file.getOriginalFilename();
        if (original == null || original.trim().isEmpty()) {
            throw new FileValidationException("Invalid filename");
        }
        String cleanName = StringUtils.cleanPath(original);
        if (cleanName.contains("..")) {
            throw new FileValidationException("Path traversal attempt in filename");
        }
        String ext = "";
        int idx = cleanName.lastIndexOf('.');
        if (idx >= 0) {
            ext = cleanName.substring(idx).toLowerCase();
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
