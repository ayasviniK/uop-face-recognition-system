package com.uop.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FacultyResolverTest {

    private FacultyResolver facultyResolver;

    @BeforeEach
    void setUp() {
        facultyResolver = new FacultyResolver();
    }

    @Test
    void resolve_knownFaculties() {
        assertEquals("Engineering", facultyResolver.resolve("E/18/001"));
        assertEquals("Medicine", facultyResolver.resolve("M/20/034"));
        assertEquals("Science", facultyResolver.resolve("S/19/012"));
        assertEquals("Arts", facultyResolver.resolve("A/21/007"));
        assertEquals("Management", facultyResolver.resolve("MG/20/001"));
        assertEquals("Veterinary Medicine", facultyResolver.resolve("VS/18/054"));
        assertEquals("Dentistry", facultyResolver.resolve("D/19/001"));
        assertEquals("Agriculture", facultyResolver.resolve("AG/23/001"));
        assertEquals("Allied Health Sciences", facultyResolver.resolve("AHS/16/001"));
    }

    @Test
    void resolve_differentiatesArtAgriAndAHS() {
        // Direct registry names / abbreviations
        assertEquals("Arts", facultyResolver.resolve("Art"));
        assertEquals("Arts", facultyResolver.resolve("arts"));
        assertEquals("Arts", facultyResolver.resolve("A"));
        assertEquals("Agriculture", facultyResolver.resolve("agri"));
        assertEquals("Agriculture", facultyResolver.resolve("Agri"));
        assertEquals("Agriculture", facultyResolver.resolve("AG"));
        assertEquals("Agriculture", facultyResolver.resolve("AGR"));
        assertEquals("Agriculture", facultyResolver.resolve("Agriculture"));
        assertEquals("Allied Health Sciences", facultyResolver.resolve("AHS"));
        assertEquals("Allied Health Sciences", facultyResolver.resolve("ahs"));
        assertEquals("Allied Health Sciences", facultyResolver.resolve("Allied Health Sciences"));

        // Registration numbers with slashes
        assertEquals("Arts", facultyResolver.resolve("A/16/AI/877"));
        assertEquals("Arts", facultyResolver.resolve("ART/21/007"));
        assertEquals("Agriculture", facultyResolver.resolve("AG/16/FQ/002"));
        assertEquals("Agriculture", facultyResolver.resolve("AGRI/23/001"));
        assertEquals("Agriculture", facultyResolver.resolve("AGR/20/123"));
        assertEquals("Allied Health Sciences", facultyResolver.resolve("AHS/14/RAD/FQ/002"));
        assertEquals("Allied Health Sciences", facultyResolver.resolve("ahs/15/rad/046"));

        // Registration numbers without slashes or with underscores/hyphens
        assertEquals("Allied Health Sciences", facultyResolver.resolve("AHS16001"));
        assertEquals("Agriculture", facultyResolver.resolve("AG16001"));
        assertEquals("Arts", facultyResolver.resolve("A16001"));
        assertEquals("Allied Health Sciences", facultyResolver.resolve("AHS_16_001"));
        assertEquals("Agriculture", facultyResolver.resolve("AG_16_001"));
        assertEquals("Arts", facultyResolver.resolve("A_16_001"));
        assertEquals("Allied Health Sciences", facultyResolver.resolve("AHS-16-001"));
        assertEquals("Agriculture", facultyResolver.resolve("AG-16-001"));

        // Year-first index numbers
        assertEquals("Allied Health Sciences", facultyResolver.resolve("18/AHS/020"));
        assertEquals("Agriculture", facultyResolver.resolve("20/AG/100"));
        assertEquals("Arts", facultyResolver.resolve("21/A/001"));
        assertEquals("Engineering", facultyResolver.resolve("19/ENG/045"));
    }

    @Test
    void resolve_caseInsensitivePrefix() {
        assertEquals("Engineering", facultyResolver.resolve("e/18/001"));
        assertEquals("Medicine", facultyResolver.resolve("m/20/034"));
    }

    @Test
    void resolve_unknownPrefix_returnsUnknown() {
        assertEquals("Unknown", facultyResolver.resolve("X/18/001"));
        assertEquals("Unknown", facultyResolver.resolve("Z/22/100"));
        assertEquals("Unknown", facultyResolver.resolve("UNKNOWN"));
    }

    @Test
    void resolve_nullOrBlank_returnsUnknown() {
        assertEquals("Unknown", facultyResolver.resolve(null));
        assertEquals("Unknown", facultyResolver.resolve(""));
        assertEquals("Unknown", facultyResolver.resolve("   "));
    }
}
