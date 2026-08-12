package com.uop.backend.ai;

import java.io.IOException;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@Component
public class AiClient {

    private final RestTemplate restTemplate;
    private final String aiUrl;

    public AiClient(RestTemplate restTemplate, @Value("${ai.service.url}") String aiUrl) {
        this.restTemplate = restTemplate;
        this.aiUrl = aiUrl;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class AiMatch {
        @JsonProperty("studentId")
        public String studentId;
        @JsonProperty("confidence")
        public double confidence;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class AiResponse {
        @JsonProperty("matches")
        public List<AiMatch> matches;
    }

    private static final int MAX_ATTEMPTS = 3;
    private static final long BACKOFF_MS = 1000;

    public AiResponse sendImage(MultipartFile file) throws IOException {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        ByteArrayResource fileAsResource = new ByteArrayResource(file.getBytes()) {
            @Override
            public String getFilename() {
                return file.getOriginalFilename();
            }
        };
        body.add("file", fileAsResource);

        HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);

        int attempt = 0;
        Exception lastException = null;
        while (attempt < MAX_ATTEMPTS) {
            attempt++;
            try {
                AiResponse response = restTemplate.postForObject(aiUrl, requestEntity, AiResponse.class);
                if (response == null) {
                    throw new RuntimeException("Empty response from AI recognition service");
                }
                return response;
            } catch (org.springframework.web.client.ResourceAccessException e) {
                lastException = e;
                if (attempt < MAX_ATTEMPTS) {
                    try {
                        Thread.sleep(BACKOFF_MS * attempt);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw new RuntimeException("AI recognition service call interrupted", ie);
                    }
                }
            } catch (org.springframework.web.client.HttpStatusCodeException e) {
                throw new RuntimeException("AI recognition service returned error status " + e.getStatusCode() + ": " + e.getResponseBodyAsString(), e);
            } catch (Exception e) {
                throw new RuntimeException("AI recognition service invocation failed: " + e.getMessage(), e);
            }
        }
        throw new RuntimeException("AI recognition service unavailable after " + MAX_ATTEMPTS + " attempts: " + lastException.getMessage(), lastException);
    }
}
