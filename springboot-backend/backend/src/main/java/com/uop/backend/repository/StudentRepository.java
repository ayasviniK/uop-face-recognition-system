package com.uop.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.uop.backend.model.Student;

@Repository
public interface StudentRepository extends JpaRepository<Student, String>, JpaSpecificationExecutor<Student> {

    boolean existsByStudentId(String studentId);

    Optional<Student> findByStudentId(String studentId);

    @Query("SELECT s.studentId FROM Student s ORDER BY s.studentId ASC")
    List<String> findAllStudentIds();

    List<Student> findByTier(Integer tier);
}
