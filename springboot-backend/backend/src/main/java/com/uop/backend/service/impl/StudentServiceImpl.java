package com.uop.backend.service.impl;

import java.util.ArrayList;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.uop.backend.dto.request.StudentCreateRequest;
import com.uop.backend.dto.request.StudentUpdateRequest;
import com.uop.backend.dto.response.StudentResponse;
import com.uop.backend.exception.DuplicateResourceException;
import com.uop.backend.exception.ResourceNotFoundException;
import com.uop.backend.mapper.StudentMapper;
import com.uop.backend.model.Student;
import com.uop.backend.repository.StudentRepository;
import com.uop.backend.service.FacultyResolver;
import com.uop.backend.service.StudentService;

import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class StudentServiceImpl implements StudentService {

    private final StudentRepository studentRepository;
    private final FacultyResolver facultyResolver;

    @Override
    public StudentResponse createStudent(StudentCreateRequest request) {
        String studentId = request.getStudentId().trim();
        if (studentRepository.existsByStudentId(studentId)) {
            throw new DuplicateResourceException("studentId already exists: " + studentId);
        }

        String faculty = request.getFaculty();
        if (faculty == null || faculty.isBlank()) {
            faculty = facultyResolver.resolve(studentId);
        }

        Student s = Student.builder()
                .studentId(studentId)
                .faculty(faculty)
                .tier(request.getTier() != null ? request.getTier() : 1)
                .build();

        Student saved = studentRepository.save(s);
        return StudentMapper.toResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<StudentResponse> getAllStudents(Pageable pageable) {
        return studentRepository.findAll(pageable)
                .map(StudentMapper::toResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<StudentResponse> searchStudents(String studentId, String faculty, Integer tier, Pageable pageable) {
        Specification<Student> spec = (root, query, cb) -> {
            var predicates = new ArrayList<Predicate>();
            if (studentId != null && !studentId.trim().isEmpty()) {
                predicates.add(cb.like(cb.lower(root.get("studentId")), "%" + studentId.trim().toLowerCase() + "%"));
            }
            if (faculty != null && !faculty.trim().isEmpty()) {
                predicates.add(cb.like(cb.lower(root.get("faculty")), "%" + faculty.trim().toLowerCase() + "%"));
            }
            if (tier != null) {
                predicates.add(cb.equal(root.get("tier"), tier));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        return studentRepository.findAll(spec, pageable).map(StudentMapper::toResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public StudentResponse getStudentById(String studentId) {
        Student s = studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResourceNotFoundException("Student not found: " + studentId));
        return StudentMapper.toResponse(s);
    }

    @Override
    public StudentResponse updateStudent(String studentId, StudentUpdateRequest request) {
        Student s = studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResourceNotFoundException("Student not found: " + studentId));

        StudentMapper.updateFromDto(request, s);
        Student updated = studentRepository.save(s);
        return StudentMapper.toResponse(updated);
    }

    @Override
    public void deleteStudent(String studentId) {
        if (!studentRepository.existsByStudentId(studentId)) {
            throw new ResourceNotFoundException("Student not found: " + studentId);
        }
        studentRepository.deleteById(studentId);
    }
}
