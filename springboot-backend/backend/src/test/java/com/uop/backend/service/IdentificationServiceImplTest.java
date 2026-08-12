package com.uop.backend.service;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import static org.mockito.ArgumentMatchers.any;
import org.mockito.Mock;
import static org.mockito.Mockito.when;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.multipart.MultipartFile;

import com.uop.backend.ai.AiClient;
import com.uop.backend.ai.AiClient.AiMatch;
import com.uop.backend.ai.AiClient.AiResponse;
import com.uop.backend.model.Student;
import com.uop.backend.repository.StudentRepository;
import com.uop.backend.service.impl.IdentificationServiceImpl;

@ExtendWith(MockitoExtension.class)
public class IdentificationServiceImplTest {

    @Mock
    AiClient aiClient;

    @Mock
    StudentRepository studentRepository;

    IdentificationServiceImpl service;

    @Test
    public void search_savesRecordAndReturnsMatches() throws Exception {
        AiResponse resp = new AiResponse();
        AiMatch m = new AiMatch();
        m.studentId = "IT2023001";
        m.confidence = 92.5;
        resp.matches = List.of(m);

        when(aiClient.sendImage(any(MultipartFile.class))).thenReturn(resp);

        Student student = Student.builder()
                .studentId("IT2023001")
                .fullName("John Doe")
                .build();
        when(studentRepository.findByStudentId("IT2023001")).thenReturn(Optional.of(student));

        service = new IdentificationServiceImpl(aiClient, studentRepository);

        MultipartFile file = org.mockito.Mockito.mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("photo.jpg");
        when(file.getContentType()).thenReturn("image/jpeg");
        when(file.getSize()).thenReturn(100L);

        var result = service.search(file);

        assertEquals("IT2023001", result.getStudentId());
        assertEquals("John Doe", result.getFullName());
    }
}
