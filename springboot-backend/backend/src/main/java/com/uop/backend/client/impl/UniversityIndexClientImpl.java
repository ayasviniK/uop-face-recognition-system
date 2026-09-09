package com.uop.backend.client.impl;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import com.uop.backend.client.UniversityIndexClient;
import com.uop.backend.dto.response.UniversityStudentResponse;
import com.uop.backend.exception.ResourceNotFoundException;
import com.uop.backend.exception.UniversityIndexException;

import lombok.extern.slf4j.Slf4j;

/**
 * Implementation of UniversityIndexClient that communicates with the University Index HTTP API.
 * Configured via application properties.
 */
@Component
@Slf4j
public class UniversityIndexClientImpl implements UniversityIndexClient {

    private final RestTemplate restTemplate;
    private final String baseUrl;
    private final String apiKey;

    public UniversityIndexClientImpl(
            RestTemplate restTemplate,
            @Value("${university.index.base-url:}") String baseUrl,
            @Value("${university.index.api-key:}") String apiKey) {
        this.restTemplate = restTemplate;
        this.baseUrl = baseUrl != null ? baseUrl.trim() : "";
        this.apiKey = apiKey != null ? apiKey.trim() : "";
    }

    @Override
    public UniversityStudentResponse getStudent(String faculty, String studentId) {
        if (studentId == null || studentId.isBlank()) {
            throw new IllegalArgumentException("Student ID cannot be null or blank");
        }

        if (baseUrl.isBlank()) {
            log.warn("University Index base URL is not configured. Request for studentId={} cannot be fulfilled by external API.", studentId);
            throw new UniversityIndexException("Unable to retrieve student information from the University Index.");
        }

        // Endpoint structure will be finalized once university releases the official API spec.
        // Example structure: {baseUrl}/api/students/{studentId} or {baseUrl}/api/{faculty}/students/{studentId}
        String endpoint = baseUrl.endsWith("/") ? baseUrl + "api/students/" + studentId : baseUrl + "/api/students/" + studentId;

        HttpHeaders headers = new HttpHeaders();
        if (!apiKey.isBlank()) {
            headers.set("Authorization", "Bearer " + apiKey);
        }

        HttpEntity<Void> requestEntity = new HttpEntity<>(headers);

        try {
            log.info("Calling University Index for studentId={} and faculty={}", studentId, faculty);
            ResponseEntity<UniversityStudentResponse> response = restTemplate.exchange(
                    endpoint,
                    HttpMethod.GET,
                    requestEntity,
                    UniversityStudentResponse.class
            );

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return response.getBody();
            } else {
                log.error("University Index returned non-successful status {} for studentId={}", response.getStatusCode(), studentId);
                throw new UniversityIndexException("Unable to retrieve student information from the University Index.");
            }
        } catch (HttpClientErrorException.NotFound e) {
            log.warn("Student {} not found in University Index: {}", studentId, e.getMessage());
            throw new ResourceNotFoundException("Student not found in the University Index: " + studentId);
        } catch (HttpClientErrorException.Unauthorized | HttpClientErrorException.Forbidden e) {
            log.error("Authentication/authorization failure communicating with University Index: {}", e.getMessage());
            throw new UniversityIndexException("Unable to retrieve student information from the University Index.");
        } catch (HttpServerErrorException e) {
            log.error("University Index server error {}: {}", e.getStatusCode(), e.getMessage());
            throw new UniversityIndexException("Unable to retrieve student information from the University Index.");
        } catch (ResourceAccessException e) {
            log.error("Connection error or timeout communicating with University Index: {}", e.getMessage());
            throw new UniversityIndexException("Unable to retrieve student information from the University Index.");
        } catch (ResourceNotFoundException e) {
            throw e;
        } catch (Exception e) {
            log.error("Unexpected error communicating with University Index for studentId {}: {}", studentId, e.getMessage(), e);
            throw new UniversityIndexException("Unable to retrieve student information from the University Index.");
        }
    }
}
