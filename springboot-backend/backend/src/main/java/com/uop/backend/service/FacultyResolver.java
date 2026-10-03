package com.uop.backend.service;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Centralized faculty resolver.
 * Parses the faculty from the University of Peradeniya student ID or registry name.
 */
@Component
public class FacultyResolver {

    private static final Map<String, String> FACULTY_MAP;

    static {
        Map<String, String> map = new HashMap<>();
        // Engineering
        map.put("E", "Engineering");
        map.put("ENG", "Engineering");
        map.put("ENGINEERING", "Engineering");

        // Medicine
        map.put("M", "Medicine");
        map.put("MED", "Medicine");
        map.put("MEDICINE", "Medicine");

        // Science
        map.put("S", "Science");
        map.put("SCI", "Science");
        map.put("SCIENCE", "Science");

        // Arts
        map.put("A", "Arts");
        map.put("ART", "Arts");
        map.put("ARTS", "Arts");

        // Agriculture
        map.put("AG", "Agriculture");
        map.put("AGR", "Agriculture");
        map.put("AGRI", "Agriculture");
        map.put("AGRICULTURE", "Agriculture");

        // Allied Health Sciences
        map.put("AHS", "Allied Health Sciences");
        map.put("AH", "Allied Health Sciences");
        map.put("ALLIED", "Allied Health Sciences");
        map.put("ALLIED HEALTH", "Allied Health Sciences");
        map.put("ALLIED HEALTH SCIENCES", "Allied Health Sciences");

        // Dentistry
        map.put("D", "Dentistry");
        map.put("DEN", "Dentistry");
        map.put("DENT", "Dentistry");
        map.put("DENTAL", "Dentistry");
        map.put("DENTISTRY", "Dentistry");
        map.put("DT", "Dentistry");

        // Veterinary Medicine
        map.put("VS", "Veterinary Medicine");
        map.put("VM", "Veterinary Medicine");
        map.put("VET", "Veterinary Medicine");
        map.put("VETERINARY", "Veterinary Medicine");
        map.put("VETERINARY MEDICINE", "Veterinary Medicine");
        map.put("V", "Veterinary Medicine");

        // Management
        map.put("MG", "Management");
        map.put("MGT", "Management");
        map.put("MANAGEMENT", "Management");

        FACULTY_MAP = Collections.unmodifiableMap(map);
    }

    private static final Pattern LEADING_LETTERS = Pattern.compile("^([A-Za-z]+)");

    public String resolve(String studentId) {
        if (studentId == null || studentId.isBlank()) {
            return "Unknown";
        }

        String trimmed = studentId.trim();
        String upper = trimmed.toUpperCase();

        // 1. Direct exact match (e.g. "Art", "agri", "AHS", "Engineering", "AG", etc.)
        if (FACULTY_MAP.containsKey(upper)) {
            return FACULTY_MAP.get(upper);
        }

        // 2. Keyword check for unambiguous substrings in name
        if (upper.contains("ALLIED") || upper.contains("AHS")) {
            return "Allied Health Sciences";
        }
        if (upper.contains("AGRICULTURE") || upper.contains("AGRI")) {
            return "Agriculture";
        }
        if (upper.contains("MANAGEMENT")) {
            return "Management";
        }
        if (upper.contains("VETERINARY")) {
            return "Veterinary Medicine";
        }
        if (upper.contains("DENTISTRY") || upper.contains("DENTAL")) {
            return "Dentistry";
        }
        if (upper.contains("ENGINEERING")) {
            return "Engineering";
        }
        if (upper.contains("MEDICINE")) {
            return "Medicine";
        }
        if (upper.contains("SCIENCE")) {
            return "Science";
        }

        // 3. Delimited tokens check (e.g. "AHS/16/001", "AG/23/001", "19/ENG/045", "AHS_16_001")
        String[] tokens = upper.split("[/_\\-\\.\\s]+");

        // Pass 3a: Check multi-letter tokens first to prevent "A" matching before "AG" or "AHS"
        for (String token : tokens) {
            if (token.length() > 1 && FACULTY_MAP.containsKey(token)) {
                return FACULTY_MAP.get(token);
            }
        }

        // Pass 3b: Check single-letter tokens (e.g. first token is "A", "E", "M", "S", "D", "V")
        if (tokens.length > 0 && tokens[0].length() == 1 && FACULTY_MAP.containsKey(tokens[0])) {
            return FACULTY_MAP.get(tokens[0]);
        }
        // In case of year first like "21/A/001"
        for (String token : tokens) {
            if (token.length() == 1 && FACULTY_MAP.containsKey(token)) {
                return FACULTY_MAP.get(token);
            }
        }

        // 4. Undelimited prefix check (e.g. "AHS16001", "AG23001", "A16001", "E18001")
        Matcher m = LEADING_LETTERS.matcher(trimmed);
        if (m.find()) {
            String lead = m.group(1).toUpperCase();
            if (FACULTY_MAP.containsKey(lead)) {
                return FACULTY_MAP.get(lead);
            }
        }

        return "Unknown";
    }
}
