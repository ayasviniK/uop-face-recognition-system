package com.uop.backend.service.impl;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.uop.backend.dto.request.StudentCreateRequest;
import com.uop.backend.dto.request.StudentUpdateRequest;
import com.uop.backend.dto.response.StudentResponse;
import com.uop.backend.exception.DuplicateResourceException;
import com.uop.backend.exception.ResourceNotFoundException;
import com.uop.backend.mapper.StudentMapper;
import com.uop.backend.model.Student;
import com.uop.backend.repository.StudentRepository;
import com.uop.backend.service.StudentService;
import com.uop.backend.storage.StorageService;

import java.util.ArrayList;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class StudentServiceImpl implements StudentService {

    private final StudentRepository studentRepository;
    private final StorageService storageService;

    @Override
    public StudentResponse createStudent(StudentCreateRequest request) {
        if (studentRepository.existsByStudentId(request.getStudentId())){
            throw new DuplicateResourceException("studentId already exists");
        }
        Student s = StudentMapper.fromCreateRequest(request);
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
    public Page<StudentResponse> searchStudents(String studentId, String fullName, Pageable pageable) {
        Specification<Student> spec = (root, query, cb) -> {
            var predicates = new ArrayList<Predicate>();
            if (studentId != null && !studentId.trim().isEmpty()) {
                predicates.add(cb.like(cb.lower(root.get("studentId")), "%" + studentId.trim().toLowerCase() + "%"));
            }
            if (fullName != null && !fullName.trim().isEmpty()) {
                predicates.add(cb.like(cb.lower(root.get("fullName")), "%" + fullName.trim().toLowerCase() + "%"));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        return studentRepository.findAll(spec, pageable).map(StudentMapper::toResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public StudentResponse getStudentById(Long id) {
        Student s = studentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Student not found"));
        return StudentMapper.toResponse(s);
    }

    @Override
    public StudentResponse updateStudent(Long id, StudentUpdateRequest request) {
        Student s = studentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Student not found"));

        // check studentId uniqueness
        if (!s.getStudentId().equals(request.getStudentId()) && studentRepository.existsByStudentId(request.getStudentId())){
            throw new DuplicateResourceException("studentId already exists");
        }

        StudentMapper.updateFromDto(request, s);
        Student updated = studentRepository.save(s);
        return StudentMapper.toResponse(updated);
    }

    @Override
    public void deleteStudent(Long id) {
        if (!studentRepository.existsById(id)){
            throw new ResourceNotFoundException("Student not found");
        }
        studentRepository.deleteById(id);
    }

    @Override
    public StudentResponse updateStudentImageByStudentId(String studentId, MultipartFile file) {
        Student s = studentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResourceNotFoundException("Student not found"));

        String path = storageService.store(file, studentId);
        s.setImagePath(path);
        Student updated = studentRepository.save(s);
        return StudentMapper.toResponse(updated);
    }
}
