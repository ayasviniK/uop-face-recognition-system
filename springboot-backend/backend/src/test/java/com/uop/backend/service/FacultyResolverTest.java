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
    }

    @Test
    void resolve_nullOrBlank_returnsUnknown() {
        assertEquals("Unknown", facultyResolver.resolve(null));
        assertEquals("Unknown", facultyResolver.resolve(""));
        assertEquals("Unknown", facultyResolver.resolve("   "));
    }
}
