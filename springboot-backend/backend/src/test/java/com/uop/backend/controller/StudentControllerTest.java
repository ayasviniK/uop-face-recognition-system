package com.uop.backend.controller;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import static org.mockito.Mockito.*;
import org.mockito.MockitoAnnotations;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import com.uop.backend.dto.ApiResponse;
import com.uop.backend.dto.request.StudentCreateRequest;
import com.uop.backend.dto.request.StudentUpdateRequest;
import com.uop.backend.dto.response.StudentResponse;
import com.uop.backend.service.StudentService;

class StudentControllerTest {

    @Mock
    private StudentService studentService;

    private StudentController studentController;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        studentController = new StudentController(studentService);
    }

    @Test
    void createStudent_returnsCreated() {
        StudentCreateRequest request = new StudentCreateRequest();
        request.setStudentId("S1");
        request.setFullName("John");

        StudentResponse response = StudentResponse.builder()
                .id(1L)
                .studentId("S1")
                .fullName("John")
                .build();

        when(studentService.createStudent(request)).thenReturn(response);

        ResponseEntity<ApiResponse<StudentResponse>> entity = studentController.createStudent(request);

        assertEquals(201, entity.getStatusCode().value());
        assertNotNull(entity.getBody());
        assertEquals(1L, entity.getBody().getData().getId());
    }

    @Test
    void getStudents_returnsOk() {
        Pageable pageable = PageRequest.of(0, 20);
        Page<StudentResponse> pageResult = new PageImpl<>(List.of());
        when(studentService.getAllStudents(pageable)).thenReturn(pageResult);

        ResponseEntity<ApiResponse<Page<StudentResponse>>> entity = studentController.getStudents(null, null, pageable);

        assertEquals(200, entity.getStatusCode().value());
        assertNotNull(entity.getBody());
        assertEquals(0, entity.getBody().getData().getContent().size());
    }

    @Test
    void updateStudent_returnsOk() {
        StudentUpdateRequest request = new StudentUpdateRequest();
        request.setStudentId("S2");
        request.setFullName("Jane");

        StudentResponse response = StudentResponse.builder()
                .id(2L)
                .studentId("S2")
                .fullName("Jane")
                .build();

        when(studentService.updateStudent(2L, request)).thenReturn(response);

        ResponseEntity<ApiResponse<StudentResponse>> entity = studentController.updateStudent(2L, request);

        assertEquals(200, entity.getStatusCode().value());
        assertNotNull(entity.getBody());
        assertEquals(2L, entity.getBody().getData().getId());
    }
}
