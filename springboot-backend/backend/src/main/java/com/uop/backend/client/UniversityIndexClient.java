package com.uop.backend.client;

import com.uop.backend.dto.response.UniversityStudentResponse;

/**
 * Abstraction for communicating with the University of Peradeniya Student Information Index API.
 * The production specification is pending official university release.
 */
public interface UniversityIndexClient {

    /**
     * Retrieves full student personal details from the University Index.
     *
     * @param faculty   the resolved student faculty
     * @param studentId the university student identifier
     * @return UniversityStudentResponse with full details (name, faculty, year, photoUrl)
     */
    UniversityStudentResponse getStudent(String faculty, String studentId);
}
