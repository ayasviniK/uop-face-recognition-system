package com.uop.backend.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class InternalSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtUtil jwtUtil;

    @Value("${internal.api-key:test-internal-api-key}")
    private String internalApiKey;

    @Test
    public void internalEndpoint_missingApiKey_rejected() throws Exception {
        mockMvc.perform(get("/internal/students/ids"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    public void internalEndpoint_wrongApiKey_rejected() throws Exception {
        mockMvc.perform(get("/internal/students/ids")
                        .header("X-Internal-API-Key", "completely-wrong-key"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    public void internalEndpoint_correctApiKey_accepted() throws Exception {
        mockMvc.perform(get("/internal/students/ids")
                        .header("X-Internal-API-Key", internalApiKey))
                .andExpect(status().isOk());
    }

    @Test
    public void protectedPublicEndpoint_missingJwt_rejected() throws Exception {
        mockMvc.perform(get("/api/students"))
                .andExpect(status().isForbidden());
    }

    @Test
    public void protectedPublicEndpoint_invalidJwt_rejected() throws Exception {
        mockMvc.perform(get("/api/students")
                        .header("Authorization", "Bearer invalid.token.value"))
                .andExpect(status().isForbidden());
    }

    @Test
    public void protectedPublicEndpoint_validAdminJwt_accepted() throws Exception {
        String adminToken = jwtUtil.generateToken("admin");

        mockMvc.perform(get("/api/students")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());
    }
}
