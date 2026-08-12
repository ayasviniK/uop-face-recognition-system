package com.uop.backend.integration;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.mockito.ArgumentMatchers.any;
import org.mockito.Mockito;
import static org.mockito.Mockito.when;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import com.uop.backend.model.Student;
import com.uop.backend.repository.StudentRepository;
import com.uop.backend.service.impl.StudentServiceImpl;
import com.uop.backend.storage.FileSystemStorageService;
import com.uop.backend.storage.StorageService;

class StudentIntegrationTest {

    @TempDir
    Path tempDir;

    @Test
    void uploadImage_updatesStudentImagePathAndStoresFile() throws Exception {
        StudentRepository repository = Mockito.mock(StudentRepository.class);
        StorageService storageService = new FileSystemStorageService(tempDir.toString());
        StudentServiceImpl service = new StudentServiceImpl(repository, storageService);

        Student existing = Student.builder()
                .id(1L)
                .studentId("INT100")
                .fullName("Int Test")
                .build();

        when(repository.findByStudentId("INT100")).thenReturn(Optional.of(existing));
        when(repository.save(any(Student.class))).thenAnswer(invocation -> invocation.getArgument(0));

        MultipartFile image = new MockMultipartFile(
                "file",
                "face.jpg",
                "image/jpeg",
                new byte[] { 1, 2, 3, 4, 5 });

        var response = service.updateStudentImageByStudentId("INT100", image);

        assertEquals("INT100", response.getStudentId());
        assertTrue(response.getImagePath().endsWith("INT100.jpg"));
        assertTrue(Files.exists(tempDir.resolve("INT100.jpg")));
    }
}
