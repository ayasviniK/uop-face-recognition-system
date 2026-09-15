package com.uop.backend.service;

import java.util.Map;

import org.springframework.stereotype.Component;

/**
 * Centralized faculty resolver.
 * Parses the faculty from the first character prefix of the University of Peradeniya student ID.
 */
@Component
public class FacultyResolver {

    private static final Map<String, String> FACULTY_MAP = Map.of(
        "E", "Engineering",
        "M", "Medicine",
        "S", "Science",
        "A", "Arts"
        // Additional university faculties (Agriculture, Dental, Veterinary, Allied Health, etc.)
        // can be added here once officially specified.
    );

    public String resolve(String studentId) {
        if (studentId == null || studentId.isBlank()) {
            return "Unknown";
        }

        String prefix = studentId.substring(0, 1).toUpperCase();
        return FACULTY_MAP.getOrDefault(prefix, "Unknown");
    }
}
