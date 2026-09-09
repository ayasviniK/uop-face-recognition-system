package com.uop.backend.controller;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.hasSize;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import org.mockito.Mockito;
import static org.mockito.Mockito.when;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.uop.backend.dto.request.EmbeddingSaveRequest;
import com.uop.backend.dto.request.SyncLogRequest;
import com.uop.backend.dto.request.TierUpdateRequest;
import com.uop.backend.dto.response.EmbeddingResponse;
import com.uop.backend.dto.response.StudentIdsResponse;
import com.uop.backend.model.SyncLog;
import com.uop.backend.service.InternalStudentService;

public class InternalStudentControllerTest {

    private MockMvc mockMvc;
    private InternalStudentService internalStudentService;
    private ObjectMapper objectMapper;

    @BeforeEach
    public void setup() {
        internalStudentService = Mockito.mock(InternalStudentService.class);
        InternalStudentController controller = new InternalStudentController(internalStudentService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
        objectMapper = new ObjectMapper();
    }

    private List<Double> createVector(int size) {
        List<Double> vector = new ArrayList<>(size);
        for (int i = 0; i < size; i++) {
            vector.add(0.05);
        }
        return vector;
    }

    @Test
    public void getStudentIds_returnsList() throws Exception {
        StudentIdsResponse response = StudentIdsResponse.builder()
                .studentIds(List.of("E/18/001", "E/18/002", "M/20/034"))
                .build();
        when(internalStudentService.getAllStudentIds()).thenReturn(response);

        mockMvc.perform(get("/internal/students/ids"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.studentIds", hasSize(3)))
                .andExpect(jsonPath("$.studentIds[0]").value("E/18/001"))
                .andExpect(jsonPath("$.studentIds[1]").value("E/18/002"))
                .andExpect(jsonPath("$.studentIds[2]").value("M/20/034"));
    }

    @Test
    public void getEmbeddings_all_returnsList() throws Exception {
        List<Double> vector = createVector(512);
        EmbeddingResponse er = EmbeddingResponse.builder()
                .studentId("E/18/001")
                .tier(1)
                .embeddingOriginal(vector)
                .build();
        when(internalStudentService.getEmbeddings(null, null)).thenReturn(List.of(er));

        mockMvc.perform(get("/internal/students/embeddings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].studentId").value("E/18/001"))
                .andExpect(jsonPath("$[0].tier").value(1));
    }

    @Test
    public void getEmbeddings_withTier1Filter() throws Exception {
        when(internalStudentService.getEmbeddings(1, null)).thenReturn(Collections.emptyList());

        mockMvc.perform(get("/internal/students/embeddings").param("tier", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    public void getEmbeddings_withTier2Filter() throws Exception {
        when(internalStudentService.getEmbeddings(2, null)).thenReturn(Collections.emptyList());

        mockMvc.perform(get("/internal/students/embeddings").param("tier", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    public void getEmbeddings_withFacultyPrefix() throws Exception {
        when(internalStudentService.getEmbeddings(null, "E")).thenReturn(Collections.emptyList());

        mockMvc.perform(get("/internal/students/embeddings").param("facultyPrefix", "E"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    public void getEmbeddings_withTierAndFacultyPrefix() throws Exception {
        when(internalStudentService.getEmbeddings(1, "E")).thenReturn(Collections.emptyList());

        mockMvc.perform(get("/internal/students/embeddings")
                        .param("tier", "1")
                        .param("facultyPrefix", "E"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    public void postEmbeddings_savesSuccessfully() throws Exception {
        List<Double> vector = createVector(512);
        EmbeddingSaveRequest request = EmbeddingSaveRequest.builder()
                .studentId("E/18/001")
                .faculty("Engineering")
                .tier(1)
                .embeddingOriginal(vector)
                .embeddingFlipped(vector)
                .embeddingBrighter(vector)
                .embeddingDarker(vector)
                .embeddingRotatedPlus(vector)
                .embeddingRotatedMinus(vector)
                .build();

        when(internalStudentService.saveEmbeddings(any()))
                .thenReturn(Map.of("message", "Embeddings saved", "studentId", "E/18/001"));

        mockMvc.perform(post("/internal/students/embeddings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Embeddings saved"))
                .andExpect(jsonPath("$.studentId").value("E/18/001"));
    }

    @Test
    public void postEmbeddings_withoutFaculty_savesSuccessfully() throws Exception {
        List<Double> vector = createVector(512);
        // Note: faculty is omitted from the request
        EmbeddingSaveRequest request = EmbeddingSaveRequest.builder()
                .studentId("E/18/001")
                .tier(1)
                .embeddingOriginal(vector)
                .embeddingFlipped(vector)
                .embeddingBrighter(vector)
                .embeddingDarker(vector)
                .embeddingRotatedPlus(vector)
                .embeddingRotatedMinus(vector)
                .build();

        when(internalStudentService.saveEmbeddings(any()))
                .thenReturn(Map.of("message", "Embeddings saved", "studentId", "E/18/001"));

        mockMvc.perform(post("/internal/students/embeddings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Embeddings saved"))
                .andExpect(jsonPath("$.studentId").value("E/18/001"));
    }

    @Test
    public void patchTier_withSlashInStudentId_updatesTier() throws Exception {
        TierUpdateRequest request = TierUpdateRequest.builder().tier(2).build();

        when(internalStudentService.updateStudentTier(eq("E/18/001"), any()))
                .thenReturn(Map.of("message", "Student E/18/001 moved to tier 2"));

        mockMvc.perform(patch("/internal/students/E/18/001/tier")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Student E/18/001 moved to tier 2"));
    }

    @Test
    public void patchTier_withUrlEncodedSlash_updatesTier() throws Exception {
        TierUpdateRequest request = TierUpdateRequest.builder().tier(1).build();

        when(internalStudentService.updateStudentTier(eq("E/18/001"), any()))
                .thenReturn(Map.of("message", "Student E/18/001 moved to tier 1"));

        mockMvc.perform(patch("/internal/students/E%2F18%2F001/tier")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Student E/18/001 moved to tier 1"));
    }

    @Test
    public void patchTier_withMedicineStudentId_updatesTier() throws Exception {
        TierUpdateRequest request = TierUpdateRequest.builder().tier(2).build();

        when(internalStudentService.updateStudentTier(eq("M/20/034"), any()))
                .thenReturn(Map.of("message", "Student M/20/034 moved to tier 2"));

        mockMvc.perform(patch("/internal/students/M/20/034/tier")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Student M/20/034 moved to tier 2"));
    }

    @Test
    public void patchTier_invalidTier_returnsBadRequest() throws Exception {
        TierUpdateRequest request = TierUpdateRequest.builder().tier(3).build();

        mockMvc.perform(patch("/internal/students/E/18/001/tier")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void postSyncLog_recordsSuccessfully() throws Exception {
        SyncLogRequest request = SyncLogRequest.builder()
                .studentsAdded(45)
                .studentsUpdated(3)
                .studentsTieredDown(12)
                .status("success")
                .notes("Semester 1 2026 batch synced")
                .build();

        SyncLog log = SyncLog.builder()
                .id(1L)
                .studentsAdded(45)
                .studentsUpdated(3)
                .studentsTieredDown(12)
                .status("success")
                .notes("Semester 1 2026 batch synced")
                .build();

        when(internalStudentService.recordSyncLog(any())).thenReturn(log);

        mockMvc.perform(post("/internal/sync/log")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.studentsAdded").value(45))
                .andExpect(jsonPath("$.status").value("success"));
    }
}
