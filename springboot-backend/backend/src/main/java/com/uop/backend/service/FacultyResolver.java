package com.uop.backend.service;

import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Centralized faculty resolver.
 * Parses the faculty from the prefix of the University of Peradeniya student ID.
 */
@Component
public class FacultyResolver {

    private static final Map<String, String> FACULTY_MAP = Map.ofEntries(
        Map.entry("E", "Engineering"),
        Map.entry("ENG", "Engineering"),
        Map.entry("M", "Medicine"),
        Map.entry("MED", "Medicine"),
        Map.entry("S", "Science"),
        Map.entry("SCI", "Science"),
        Map.entry("A", "Arts"),
        Map.entry("ART", "Arts"),
        Map.entry("AG", "Agriculture"),
        Map.entry("AGR", "Agriculture"),
        Map.entry("AHS", "Allied Health Sciences"),
        Map.entry("D", "Dentistry"),
        Map.entry("DEN", "Dentistry"),
        Map.entry("VS", "Veterinary Medicine"),
        Map.entry("VM", "Veterinary Medicine"),
        Map.entry("VET", "Veterinary Medicine"),
        Map.entry("MG", "Management"),
        Map.entry("MGT", "Management")
    );

    public String resolve(String studentId) {
        if (studentId == null || studentId.isBlank()) {
            return "Unknown";
        }

        String trimmed = studentId.trim();
        String prefix = trimmed.split("/")[0].toUpperCase();
        if (FACULTY_MAP.containsKey(prefix)) {
            return FACULTY_MAP.get(prefix);
        }
        String firstChar = prefix.substring(0, 1);
        return FACULTY_MAP.getOrDefault(firstChar, "Unknown");
    }
}
