package com.uop.backend.service;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import org.mockito.Mock;
import static org.mockito.Mockito.when;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import com.uop.backend.ai.AiClient;
import com.uop.backend.ai.AiClient.AiMatch;
import com.uop.backend.ai.AiClient.AiResponse;
import com.uop.backend.client.UniversityIndexClient;
import com.uop.backend.dto.response.UniversityStudentResponse;
import com.uop.backend.exception.AiServiceException;
import com.uop.backend.exception.ResourceNotFoundException;
import com.uop.backend.exception.StudentNotFoundException;
import com.uop.backend.exception.UniversityIndexException;
import com.uop.backend.model.Student;
import com.uop.backend.repository.StudentRepository;
import com.uop.backend.service.impl.IdentificationServiceImpl;

@ExtendWith(MockitoExtension.class)
public class IdentificationServiceImplTest {

    @Mock
    private AiClient aiClient;

    @Mock
    private StudentRepository studentRepository;

    @Mock
    private UniversityIndexClient universityIndexClient;

    private FacultyResolver facultyResolver;
    private IdentificationServiceImpl service;

    @BeforeEach
    void setUp() {
        facultyResolver = new FacultyResolver();
        service = new IdentificationServiceImpl(aiClient, studentRepository, facultyResolver, universityIndexClient);
    }

    @Test
    public void search_aiMatchFound_universityIndexSucceeds_returnsHighConfidence() throws Exception {
        AiResponse resp = new AiResponse();
        AiMatch m = new AiMatch();
        m.studentId = "E/18/001";
        m.confidence = 0.847;
        resp.matches = List.of(m);

        when(aiClient.sendImage(any())).thenReturn(resp);

        Student student = Student.builder()
                .studentId("E/18/001")
                .faculty("Engineering")
                .tier(1)
                .build();
        when(studentRepository.findByStudentId("E/18/001")).thenReturn(Optional.of(student));

        UniversityStudentResponse uStudent = UniversityStudentResponse.builder()
                .studentId("E/18/001")
                .name("Kasun Perera")
                .faculty("Engineering")
                .year(3)
                .photoUrl("https://index.uop.lk/photos/e18001.jpg")
                .build();
        when(universityIndexClient.getStudent("Engineering", "E/18/001")).thenReturn(uStudent);

        MockMultipartFile file = new MockMultipartFile("file", "probe.jpg", "image/jpeg", new byte[]{1, 2, 3});

        var result = service.search(file);

        assertNotNull(result);
        assertEquals("E/18/001", result.getStudentId());
        assertEquals("Kasun Perera", result.getName());
        assertEquals("Engineering", result.getFaculty());
        assertEquals(3, result.getYear());
        assertEquals(0.847, result.getConfidence());
        assertEquals("High", result.getConfidenceLabel());
    }

    @Test
    public void search_aiReturnsEmptyMatches_throwsResourceNotFound() throws Exception {
        AiResponse resp = new AiResponse();
        resp.matches = Collections.emptyList();

        when(aiClient.sendImage(any())).thenReturn(resp);

        MockMultipartFile file = new MockMultipartFile("file", "probe.jpg", "image/jpeg", new byte[]{1, 2, 3});

        assertThrows(ResourceNotFoundException.class, () -> service.search(file));
    }

    @Test
    public void search_studentNotRegisteredLocally_throwsStudentNotFound() throws Exception {
        AiResponse resp = new AiResponse();
        AiMatch m = new AiMatch();
        m.studentId = "E/18/999";
        m.confidence = 0.85;
        resp.matches = List.of(m);

        when(aiClient.sendImage(any())).thenReturn(resp);
        when(studentRepository.findByStudentId("E/18/999")).thenReturn(Optional.empty());

        MockMultipartFile file = new MockMultipartFile("file", "probe.jpg", "image/jpeg", new byte[]{1, 2, 3});

        assertThrows(StudentNotFoundException.class, () -> service.search(file));
    }

    @Test
    public void search_universityIndexUnavailable_propagatesException() throws Exception {
        AiResponse resp = new AiResponse();
        AiMatch m = new AiMatch();
        m.studentId = "E/18/001";
        m.confidence = 0.75;
        resp.matches = List.of(m);

        when(aiClient.sendImage(any())).thenReturn(resp);

        Student student = Student.builder()
                .studentId("E/18/001")
                .faculty("Engineering")
                .tier(1)
                .build();
        when(studentRepository.findByStudentId("E/18/001")).thenReturn(Optional.of(student));
        when(universityIndexClient.getStudent(eq("Engineering"), eq("E/18/001")))
                .thenThrow(new UniversityIndexException("Unable to retrieve student information from the University Index."));

        MockMultipartFile file = new MockMultipartFile("file", "probe.jpg", "image/jpeg", new byte[]{1, 2, 3});

        assertThrows(UniversityIndexException.class, () -> service.search(file));
    }

    @Test
    public void search_mediumConfidenceLabel_mappedProperly() throws Exception {
        AiResponse resp = new AiResponse();
        AiMatch m = new AiMatch();
        m.studentId = "M/20/034";
        m.confidence = 0.52;
        resp.matches = List.of(m);

        when(aiClient.sendImage(any())).thenReturn(resp);

        Student student = Student.builder()
                .studentId("M/20/034")
                .faculty("Medicine")
                .tier(1)
                .build();
        when(studentRepository.findByStudentId("M/20/034")).thenReturn(Optional.of(student));

        UniversityStudentResponse uStudent = UniversityStudentResponse.builder()
                .studentId("M/20/034")
                .name("Nimal Silva")
                .faculty("Medicine")
                .build();
        when(universityIndexClient.getStudent("Medicine", "M/20/034")).thenReturn(uStudent);

        MockMultipartFile file = new MockMultipartFile("file", "probe.jpg", "image/jpeg", new byte[]{1, 2, 3});

        var result = service.search(file);
        assertEquals("Medium", result.getConfidenceLabel());
    }

    @Test
    public void search_lowConfidenceLabel_mappedProperly() throws Exception {
        AiResponse resp = new AiResponse();
        AiMatch m = new AiMatch();
        m.studentId = "S/19/012";
        m.confidence = 0.38;
        resp.matches = List.of(m);

        when(aiClient.sendImage(any())).thenReturn(resp);

        Student student = Student.builder()
                .studentId("S/19/012")
                .faculty("Science")
                .tier(2)
                .build();
        when(studentRepository.findByStudentId("S/19/012")).thenReturn(Optional.of(student));

        UniversityStudentResponse uStudent = UniversityStudentResponse.builder()
                .studentId("S/19/012")
                .name("Kamal Perera")
                .faculty("Science")
                .build();
        when(universityIndexClient.getStudent("Science", "S/19/012")).thenReturn(uStudent);

        MockMultipartFile file = new MockMultipartFile("file", "probe.jpg", "image/jpeg", new byte[]{1, 2, 3});

        var result = service.search(file);
        assertEquals("Low", result.getConfidenceLabel());
    }

    @Test
    public void search_aiReturnsInvalidConfidenceAboveOne_throwsAiServiceException() throws Exception {
        AiResponse resp = new AiResponse();
        AiMatch m = new AiMatch();
        m.studentId = "E/18/001";
        m.confidence = 1.05; // Invalid: > 1.0
        resp.matches = List.of(m);

        when(aiClient.sendImage(any())).thenReturn(resp);

        MockMultipartFile file = new MockMultipartFile("file", "probe.jpg", "image/jpeg", new byte[]{1, 2, 3});

        assertThrows(AiServiceException.class, () -> service.search(file));
    }

    @Test
    public void search_aiReturnsInvalidConfidenceOld100Scale_throwsAiServiceException() throws Exception {
        AiResponse resp = new AiResponse();
        AiMatch m = new AiMatch();
        m.studentId = "E/18/001";
        m.confidence = 85.0; // Invalid: 0-100 scale not normalized
        resp.matches = List.of(m);

        when(aiClient.sendImage(any())).thenReturn(resp);

        MockMultipartFile file = new MockMultipartFile("file", "probe.jpg", "image/jpeg", new byte[]{1, 2, 3});

        assertThrows(AiServiceException.class, () -> service.search(file));
    }

    @Test
    public void search_aiReturnsNegativeConfidence_throwsAiServiceException() throws Exception {
        AiResponse resp = new AiResponse();
        AiMatch m = new AiMatch();
        m.studentId = "E/18/001";
        m.confidence = -0.1; // Invalid: < 0.0
        resp.matches = List.of(m);

        when(aiClient.sendImage(any())).thenReturn(resp);

        MockMultipartFile file = new MockMultipartFile("file", "probe.jpg", "image/jpeg", new byte[]{1, 2, 3});

        assertThrows(AiServiceException.class, () -> service.search(file));
    }
}
