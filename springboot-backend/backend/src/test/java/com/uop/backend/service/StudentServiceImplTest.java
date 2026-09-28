package com.uop.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.Arrays;
import java.util.Optional;

import com.uop.backend.dto.request.StudentCreateRequest;
import com.uop.backend.dto.response.StudentResponse;
import com.uop.backend.exception.DuplicateResourceException;
import com.uop.backend.exception.ResourceNotFoundException;
import com.uop.backend.model.Student;
import com.uop.backend.repository.StudentRepository;
import com.uop.backend.service.impl.StudentServiceImpl;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.mockito.Spy;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

public class StudentServiceImplTest {

    @Mock
    private StudentRepository studentRepository;

    @Spy
    private FacultyResolver facultyResolver = new FacultyResolver();

    @InjectMocks
    private StudentServiceImpl studentService;

    @BeforeEach
    void setup() {
        MockitoAnnotations.openMocks(this);
    }

    @Test
    void createStudent_success() {
        StudentCreateRequest req = StudentCreateRequest.builder()
                .studentId("E/18/123")
                .faculty("Engineering")
                .tier(1)
                .build();

        when(studentRepository.existsByStudentId("E/18/123")).thenReturn(false);

        Student saved = Student.builder()
                .studentId("E/18/123")
                .faculty("Engineering")
                .tier(1)
                .build();
        when(studentRepository.save(any(Student.class))).thenReturn(saved);

        StudentResponse res = studentService.createStudent(req);
        assertNotNull(res);
        assertEquals("E/18/123", res.getStudentId());
        assertEquals("Engineering", res.getFaculty());
        verify(studentRepository).save(any(Student.class));
    }

    @Test
    void createStudent_duplicateStudentId_throws() {
        StudentCreateRequest req = StudentCreateRequest.builder()
                .studentId("E/18/123")
                .faculty("Engineering")
                .build();

        when(studentRepository.existsByStudentId("E/18/123")).thenReturn(true);

        assertThrows(DuplicateResourceException.class, () -> studentService.createStudent(req));
    }

    @Test
    void getAllStudents_returnsList() {
        Student s1 = Student.builder()
                .studentId("E/18/001")
                .faculty("Engineering")
                .tier(1)
                .build();
        Student s2 = Student.builder()
                .studentId("M/20/002")
                .faculty("Medicine")
                .tier(1)
                .build();
        Pageable pageable = PageRequest.of(0, 10);
        when(studentRepository.findAll(pageable)).thenReturn(new PageImpl<>(Arrays.asList(s1, s2)));

        Page<StudentResponse> page = studentService.getAllStudents(pageable);
        assertEquals(2, page.getContent().size());
        assertEquals("E/18/001", page.getContent().get(0).getStudentId());
    }

    @Test
    void getStudentById_notFound_throws() {
        when(studentRepository.findByStudentId("E/99/999")).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> studentService.getStudentById("E/99/999"));
    }

    @Test
    void deleteStudent_notFound_throws() {
        when(studentRepository.existsByStudentId("E/99/999")).thenReturn(false);
        assertThrows(ResourceNotFoundException.class, () -> studentService.deleteStudent("E/99/999"));
    }
}
