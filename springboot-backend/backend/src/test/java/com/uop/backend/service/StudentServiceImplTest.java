package com.uop.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.Arrays;
import java.util.Optional;

import com.uop.backend.dto.request.StudentCreateRequest;
import com.uop.backend.dto.request.StudentUpdateRequest;
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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

public class StudentServiceImplTest {

    @Mock
    private StudentRepository studentRepository;

    @InjectMocks
    private StudentServiceImpl studentService;

    @BeforeEach
    void setup(){
        MockitoAnnotations.openMocks(this);
    }

    @Test
    void createStudent_success() {
        StudentCreateRequest req = new StudentCreateRequest();
        req.setStudentId("S123");
        req.setFullName("John Doe");

        when(studentRepository.existsByStudentId("S123")).thenReturn(false);

        Student saved = Student.builder()
                .id(1L)
                .studentId("S123")
                .fullName("John Doe")
                .build();
        when(studentRepository.save(any(Student.class))).thenReturn(saved);

        StudentResponse res = studentService.createStudent(req);
        assertNotNull(res);
        assertEquals(1L, res.getId());
        assertEquals("S123", res.getStudentId());
        verify(studentRepository).save(any(Student.class));
    }

    @Test
    void createStudent_duplicateStudentId_throws() {
        StudentCreateRequest req = new StudentCreateRequest();
        req.setStudentId("S123");
        req.setFullName("John Doe");

        when(studentRepository.existsByStudentId("S123")).thenReturn(true);

        assertThrows(DuplicateResourceException.class, () -> studentService.createStudent(req));
    }

    @Test
    void getAllStudents_returnsList(){
        Student s1 = Student.builder()
                .id(1L)
                .studentId("S1")
                .fullName("A")
                .build();
        Student s2 = Student.builder()
                .id(2L)
                .studentId("S2")
                .fullName("B")
                .build();
        Pageable pageable = PageRequest.of(0, 10);
        when(studentRepository.findAll(pageable)).thenReturn(new PageImpl<>(Arrays.asList(s1, s2)));

        Page<StudentResponse> page = studentService.getAllStudents(pageable);
        assertEquals(2, page.getContent().size());
        assertEquals("S1", page.getContent().get(0).getStudentId());
    }

    @Test
    void getStudentById_notFound_throws(){
        when(studentRepository.findById(10L)).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> studentService.getStudentById(10L));
    }

    @Test
    void deleteStudent_notFound_throws(){
        when(studentRepository.existsById(10L)).thenReturn(false);
        assertThrows(ResourceNotFoundException.class, () -> studentService.deleteStudent(10L));
    }
}
