package com.uop.backend.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.mockito.ArgumentMatchers.any;
import org.mockito.Mockito;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.uop.backend.dto.request.EmbeddingSaveRequest;
import com.uop.backend.exception.EmbeddingValidationException;
import com.uop.backend.model.Embedding;
import com.uop.backend.model.Student;
import com.uop.backend.repository.EmbeddingRepository;
import com.uop.backend.repository.StudentRepository;
import com.uop.backend.repository.SyncLogRepository;
import com.uop.backend.service.impl.InternalStudentServiceImpl;

class EmbeddingValidationTest {

    private StudentRepository studentRepository;
    private EmbeddingRepository embeddingRepository;
    private SyncLogRepository syncLogRepository;
    private FacultyResolver facultyResolver;
    private InternalStudentServiceImpl internalStudentService;

    @BeforeEach
    void setUp() {
        studentRepository = Mockito.mock(StudentRepository.class);
        embeddingRepository = Mockito.mock(EmbeddingRepository.class);
        syncLogRepository = Mockito.mock(SyncLogRepository.class);
        facultyResolver = new FacultyResolver();
        internalStudentService = new InternalStudentServiceImpl(
                studentRepository,
                embeddingRepository,
                syncLogRepository,
                facultyResolver
        );
    }

    private List<Double> createVector(int size) {
        List<Double> vector = new ArrayList<>(size);
        for (int i = 0; i < size; i++) {
            vector.add(0.01 * (i % 10));
        }
        return vector;
    }

    @Test
    void saveEmbeddings_valid512Embeddings_successUpsert() {
        List<Double> vector512 = createVector(512);

        EmbeddingSaveRequest request = EmbeddingSaveRequest.builder()
                .studentId("E/18/001")
                .faculty("Engineering")
                .tier(1)
                .embeddingOriginal(vector512)
                .embeddingFlipped(vector512)
                .embeddingBrighter(vector512)
                .embeddingDarker(vector512)
                .embeddingRotatedPlus(vector512)
                .embeddingRotatedMinus(vector512)
                .build();

        when(studentRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(embeddingRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(studentRepository.save(any(Student.class))).thenAnswer(i -> i.getArgument(0));
        when(embeddingRepository.save(any(Embedding.class))).thenAnswer(i -> i.getArgument(0));

        var response = internalStudentService.saveEmbeddings(request);

        assertNotNull(response);
        assertEquals("Embeddings saved", response.get("message"));
        assertEquals("E/18/001", response.get("studentId"));

        verify(studentRepository).save(any(Student.class));
        verify(embeddingRepository).save(any(Embedding.class));
    }

    @Test
    void saveEmbeddings_facultyOmitted_authoritativelyDerivesFacultyFromStudentId() {
        List<Double> vector512 = createVector(512);

        // Note: faculty is omitted (null)
        EmbeddingSaveRequest request = EmbeddingSaveRequest.builder()
                .studentId("E/18/001")
                .tier(1)
                .embeddingOriginal(vector512)
                .embeddingFlipped(vector512)
                .embeddingBrighter(vector512)
                .embeddingDarker(vector512)
                .embeddingRotatedPlus(vector512)
                .embeddingRotatedMinus(vector512)
                .build();

        when(studentRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(embeddingRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(studentRepository.save(any(Student.class))).thenAnswer(i -> i.getArgument(0));
        when(embeddingRepository.save(any(Embedding.class))).thenAnswer(i -> i.getArgument(0));

        var response = internalStudentService.saveEmbeddings(request);

        assertNotNull(response);
        assertEquals("Embeddings saved", response.get("message"));

        ArgumentCaptor<Student> studentCaptor = ArgumentCaptor.forClass(Student.class);
        verify(studentRepository).save(studentCaptor.capture());
        assertEquals("Engineering", studentCaptor.getValue().getFaculty());
    }

    @Test
    void saveEmbeddings_conflictingFacultySupplied_authoritativelyDerivedFromStudentId() {
        List<Double> vector512 = createVector(512);

        // Even if incoming request mistakenly passes "Arts" for an Engineering student ID
        EmbeddingSaveRequest request = EmbeddingSaveRequest.builder()
                .studentId("E/18/001")
                .faculty("Arts")
                .tier(1)
                .embeddingOriginal(vector512)
                .embeddingFlipped(vector512)
                .embeddingBrighter(vector512)
                .embeddingDarker(vector512)
                .embeddingRotatedPlus(vector512)
                .embeddingRotatedMinus(vector512)
                .build();

        when(studentRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(embeddingRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(studentRepository.save(any(Student.class))).thenAnswer(i -> i.getArgument(0));
        when(embeddingRepository.save(any(Embedding.class))).thenAnswer(i -> i.getArgument(0));

        internalStudentService.saveEmbeddings(request);

        ArgumentCaptor<Student> studentCaptor = ArgumentCaptor.forClass(Student.class);
        verify(studentRepository).save(studentCaptor.capture());
        // Must authoritatively be Engineering, NOT Arts
        assertEquals("Engineering", studentCaptor.getValue().getFaculty());
    }

    @Test
    void saveEmbeddings_nullVector_throwsEmbeddingValidationException() {
        List<Double> vector512 = createVector(512);

        EmbeddingSaveRequest request = EmbeddingSaveRequest.builder()
                .studentId("E/18/001")
                .faculty("Engineering")
                .tier(1)
                .embeddingOriginal(null) // null vector
                .embeddingFlipped(vector512)
                .embeddingBrighter(vector512)
                .embeddingDarker(vector512)
                .embeddingRotatedPlus(vector512)
                .embeddingRotatedMinus(vector512)
                .build();

        assertThrows(EmbeddingValidationException.class, () -> internalStudentService.saveEmbeddings(request));
    }

    @Test
    void saveEmbeddings_wrongLengthVector_throwsEmbeddingValidationException() {
        List<Double> vector512 = createVector(512);
        List<Double> vector128 = createVector(128); // Wrong dimension

        EmbeddingSaveRequest request = EmbeddingSaveRequest.builder()
                .studentId("E/18/001")
                .faculty("Engineering")
                .tier(1)
                .embeddingOriginal(vector512)
                .embeddingFlipped(vector128) // 128 instead of 512
                .embeddingBrighter(vector512)
                .embeddingDarker(vector512)
                .embeddingRotatedPlus(vector512)
                .embeddingRotatedMinus(vector512)
                .build();

        assertThrows(EmbeddingValidationException.class, () -> internalStudentService.saveEmbeddings(request));
    }

    @Test
    void saveEmbeddings_emptyStudentId_throwsEmbeddingValidationException() {
        List<Double> vector512 = createVector(512);

        EmbeddingSaveRequest request = EmbeddingSaveRequest.builder()
                .studentId("   ")
                .faculty("Engineering")
                .tier(1)
                .embeddingOriginal(vector512)
                .embeddingFlipped(vector512)
                .embeddingBrighter(vector512)
                .embeddingDarker(vector512)
                .embeddingRotatedPlus(vector512)
                .embeddingRotatedMinus(vector512)
                .build();

        assertThrows(EmbeddingValidationException.class, () -> internalStudentService.saveEmbeddings(request));
    }

    @Test
    void saveEmbeddings_invalidTier_throwsEmbeddingValidationException() {
        List<Double> vector512 = createVector(512);

        EmbeddingSaveRequest request = EmbeddingSaveRequest.builder()
                .studentId("E/18/001")
                .faculty("Engineering")
                .tier(3) // Invalid tier (must be 1 or 2)
                .embeddingOriginal(vector512)
                .embeddingFlipped(vector512)
                .embeddingBrighter(vector512)
                .embeddingDarker(vector512)
                .embeddingRotatedPlus(vector512)
                .embeddingRotatedMinus(vector512)
                .build();

        assertThrows(EmbeddingValidationException.class, () -> internalStudentService.saveEmbeddings(request));
    }
}
