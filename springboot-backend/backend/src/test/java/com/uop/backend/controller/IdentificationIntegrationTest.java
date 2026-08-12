package com.uop.backend.controller;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.uop.backend.ai.AiClient;
import com.uop.backend.ai.AiClient.AiMatch;
import com.uop.backend.ai.AiClient.AiResponse;
import com.uop.backend.model.Student;
import com.uop.backend.repository.StudentRepository;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import org.mockito.Mockito;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class IdentificationIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private StudentRepository studentRepository;

    @MockBean
    private AiClient aiClient;

    @BeforeEach
    void setUp() {
        studentRepository.deleteAll();
    }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    public void search_endpoint_returnsMatchingStudent() throws Exception {
        // Prepare student in DB
        Student student = Student.builder()
                .studentId("IT2023999")
                .fullName("John Doe")
                .imagePath("uploads/students/IT2023999.jpg")
                .build();
        studentRepository.save(student);

        AiResponse resp = new AiResponse();
        AiMatch m = new AiMatch();
        m.studentId = "IT2023999";
        m.confidence = 88.8;
        resp.matches = List.of(m);

        Mockito.when(aiClient.sendImage(Mockito.any())).thenReturn(resp);

        MockMultipartFile file = new MockMultipartFile("file", "photo.jpg", MediaType.IMAGE_JPEG_VALUE,
                "dummy".getBytes());

        mockMvc.perform(MockMvcRequestBuilders.multipart("/api/identification/search").file(file))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.studentId").value("IT2023999"))
                .andExpect(jsonPath("$.data.fullName").value("John Doe"));
    }
}
