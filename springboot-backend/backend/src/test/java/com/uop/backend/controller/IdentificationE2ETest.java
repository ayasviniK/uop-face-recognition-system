package com.uop.backend.controller;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.uop.backend.client.UniversityIndexClient;
import com.uop.backend.dto.response.UniversityStudentResponse;
import com.uop.backend.model.Student;
import com.uop.backend.repository.StudentRepository;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class IdentificationE2ETest {

    private static WireMockServer wireMockServer;
    private static Path tempStorageDir;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private StudentRepository studentRepository;

    @MockBean
    private UniversityIndexClient universityIndexClient;

    @BeforeAll
    public static void startWireMock() throws Exception {
        wireMockServer = new WireMockServer(WireMockConfiguration.options().dynamicPort());
        wireMockServer.start();
        tempStorageDir = Files.createTempDirectory("test-storage-e2e");
    }

    @AfterAll
    public static void stopWireMock() throws Exception {
        if (wireMockServer != null) {
            wireMockServer.stop();
        }
        if (tempStorageDir != null) {
            try {
                Files.walk(tempStorageDir).sorted((a,b)->b.compareTo(a)).forEach(p->p.toFile().delete());
            } catch (Exception ignored) {}
        }
    }

    @DynamicPropertySource
    static void registerProperties(DynamicPropertyRegistry reg) {
        String url = "http://localhost:" + wireMockServer.port() + "/api/recognize";
        reg.add("ai.service.url", () -> url);
        reg.add("file.upload-dir", () -> tempStorageDir.toString());
    }

    @BeforeEach
    public void setUp() {
        studentRepository.deleteAll();

        // Seed the recognized student
        Student student = Student.builder()
                .studentId("E/18/001")
                .faculty("Engineering")
                .tier(1)
                .build();
        studentRepository.save(student);

        wireMockServer.stubFor(post(urlEqualTo("/api/recognize"))
                .willReturn(aResponse().withHeader("Content-Type", "application/json")
                        .withBody("{\"matches\":[{\"studentId\":\"E/18/001\",\"confidence\":0.95}]}")));

        UniversityStudentResponse uStudent = UniversityStudentResponse.builder()
                .studentId("E/18/001")
                .name("Kasun Perera")
                .faculty("Engineering")
                .year(4)
                .photoUrl("https://example.com/photo.jpg")
                .build();
        Mockito.when(universityIndexClient.getStudent(Mockito.any(), Mockito.eq("E/18/001"))).thenReturn(uStudent);
    }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    public void e2e_search_endpoint() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "photo.jpg", MediaType.IMAGE_JPEG_VALUE,
                "dummy".getBytes());

        mockMvc.perform(MockMvcRequestBuilders.multipart("/api/identification/search").file(file))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.studentId").value("E/18/001"))
                .andExpect(jsonPath("$.data.name").value("Kasun Perera"))
                .andExpect(jsonPath("$.data.faculty").value("Engineering"))
                .andExpect(jsonPath("$.data.confidence").value(0.95))
                .andExpect(jsonPath("$.data.confidenceLabel").value("High"));
    }
}
