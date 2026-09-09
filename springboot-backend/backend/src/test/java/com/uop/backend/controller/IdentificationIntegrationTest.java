package com.uop.backend.controller;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
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

import com.uop.backend.ai.AiClient;
import com.uop.backend.ai.AiClient.AiMatch;
import com.uop.backend.ai.AiClient.AiResponse;
import com.uop.backend.client.UniversityIndexClient;
import com.uop.backend.dto.response.UniversityStudentResponse;
import com.uop.backend.model.Student;
import com.uop.backend.repository.StudentRepository;

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

    @MockBean
    private UniversityIndexClient universityIndexClient;

    @BeforeEach
    void setUp() {
        studentRepository.deleteAll();
    }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    public void search_endpoint_returnsMatchingStudent() throws Exception {
        // 1. Prepare local student record (identification metadata)
        Student student = Student.builder()
                .studentId("E/18/001")
                .faculty("Engineering")
                .tier(1)
                .build();
        studentRepository.save(student);

        // 2. Mock AI client response
        AiResponse resp = new AiResponse();
        AiMatch m = new AiMatch();
        m.studentId = "E/18/001";
        m.confidence = 0.888;
        resp.matches = List.of(m);
        Mockito.when(aiClient.sendImage(Mockito.any())).thenReturn(resp);

        // 3. Mock University Index response
        UniversityStudentResponse uStudent = UniversityStudentResponse.builder()
                .studentId("E/18/001")
                .name("Kasun Perera")
                .faculty("Engineering")
                .year(3)
                .photoUrl("https://photo.uop.lk/e18001.jpg")
                .build();
        Mockito.when(universityIndexClient.getStudent(Mockito.eq("Engineering"), Mockito.eq("E/18/001"))).thenReturn(uStudent);

        MockMultipartFile file = new MockMultipartFile("file", "photo.jpg", MediaType.IMAGE_JPEG_VALUE,
                "dummy".getBytes());

        mockMvc.perform(MockMvcRequestBuilders.multipart("/api/identification/search").file(file))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.studentId").value("E/18/001"))
                .andExpect(jsonPath("$.data.name").value("Kasun Perera"))
                .andExpect(jsonPath("$.data.faculty").value("Engineering"))
                .andExpect(jsonPath("$.data.year").value(3))
                .andExpect(jsonPath("$.data.confidence").value(0.888))
                .andExpect(jsonPath("$.data.confidenceLabel").value("High"));
    }
}
