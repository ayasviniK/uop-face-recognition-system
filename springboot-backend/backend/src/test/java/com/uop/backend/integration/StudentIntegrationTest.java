package com.uop.backend.integration;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import org.junit.jupiter.api.Test;
import static org.mockito.ArgumentMatchers.any;
import org.mockito.Mockito;
import static org.mockito.Mockito.when;

import com.uop.backend.dto.request.StudentCreateRequest;
import com.uop.backend.model.Student;
import com.uop.backend.repository.StudentRepository;
import com.uop.backend.service.FacultyResolver;
import com.uop.backend.service.impl.StudentServiceImpl;

class StudentIntegrationTest {

    @Test
    void createStudent_resolvesFacultyAndSavesStudent() {
        StudentRepository repository = Mockito.mock(StudentRepository.class);
        FacultyResolver facultyResolver = new FacultyResolver();
        StudentServiceImpl service = new StudentServiceImpl(repository, facultyResolver);

        when(repository.existsByStudentId("E/18/100")).thenReturn(false);
        when(repository.save(any(Student.class))).thenAnswer(invocation -> invocation.getArgument(0));

        StudentCreateRequest req = StudentCreateRequest.builder()
                .studentId("E/18/100")
                .build();

        var response = service.createStudent(req);

        assertNotNull(response);
        assertEquals("E/18/100", response.getStudentId());
        assertEquals("Engineering", response.getFaculty());
        assertEquals(1, response.getTier());
    }
}
