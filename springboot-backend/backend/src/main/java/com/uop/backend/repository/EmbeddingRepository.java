package com.uop.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.uop.backend.model.Embedding;

@Repository
public interface EmbeddingRepository extends JpaRepository<Embedding, String> {

    Optional<Embedding> findByStudentId(String studentId);

    @Query("SELECT e, s.tier FROM Embedding e, Student s WHERE e.studentId = s.studentId " +
           "AND (:tier IS NULL OR s.tier = :tier) " +
           "AND (:prefixPattern IS NULL OR e.studentId LIKE :prefixPattern) " +
           "ORDER BY e.studentId ASC")
    List<Object[]> findEmbeddingsWithTier(
            @Param("tier") Integer tier,
            @Param("prefixPattern") String prefixPattern);
}
