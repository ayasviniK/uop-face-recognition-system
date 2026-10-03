package com.uop.backend.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.uop.backend.dto.response.IdentificationResponse;
import com.uop.backend.service.IdentificationService;

public class IdentificationControllerUnitTest {

    private MockMvc mockMvc;
    private IdentificationService identificationService;

    @BeforeEach
    public void setup() {
        identificationService = Mockito.mock(IdentificationService.class);
        IdentificationController controller = new IdentificationController(identificationService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    public void postSearch_returnsResult() throws Exception {
        IdentificationResponse res = IdentificationResponse.builder()
                .studentId("E/18/001")
                .name("Kasun Perera")
                .faculty("Engineering")
                .year(3)
                .confidence(0.847)
                .confidenceLabel("High")
                .build();

        Mockito.when(identificationService.search(Mockito.any())).thenReturn(res);

        MockMultipartFile file = new MockMultipartFile("file", "photo.jpg", MediaType.IMAGE_JPEG_VALUE,
                "dummy".getBytes());

        mockMvc.perform(MockMvcRequestBuilders.multipart("/api/identification/search").file(file))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.studentId").value("E/18/001"))
                .andExpect(jsonPath("$.data.name").value("Kasun Perera"))
                .andExpect(jsonPath("$.data.faculty").value("Engineering"))
                .andExpect(jsonPath("$.data.confidence").value(0.847))
                .andExpect(jsonPath("$.data.confidenceLabel").value("High"));
    }
}
