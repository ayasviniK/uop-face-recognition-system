package com.uop.backend.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
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

    @Test
    void saveEmbeddings_existingSixEmbeddingsOnly_successWithNewFieldsNull() {
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

        ArgumentCaptor<Embedding> embeddingCaptor = ArgumentCaptor.forClass(Embedding.class);
        verify(embeddingRepository).save(embeddingCaptor.capture());
        Embedding saved = embeddingCaptor.getValue();
        assertNotNull(saved.getEmbeddingOriginal());
        assertNull(saved.getEmbeddingLeft1());
        assertNull(saved.getEmbeddingLeft2());
        assertNull(saved.getEmbeddingRight1());
        assertNull(saved.getEmbeddingRight2());
    }

    @Test
    void saveEmbeddings_allFourNewFieldsValid512_successPersisted() {
        List<Double> vector512 = createVector(512);
        List<Double> left1 = createVector(512);
        List<Double> left2 = createVector(512);
        List<Double> right1 = createVector(512);
        List<Double> right2 = createVector(512);

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
                .embeddingLeft1(left1)
                .embeddingLeft2(left2)
                .embeddingRight1(right1)
                .embeddingRight2(right2)
                .build();

        when(studentRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(embeddingRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(studentRepository.save(any(Student.class))).thenAnswer(i -> i.getArgument(0));
        when(embeddingRepository.save(any(Embedding.class))).thenAnswer(i -> i.getArgument(0));

        var response = internalStudentService.saveEmbeddings(request);

        assertNotNull(response);
        ArgumentCaptor<Embedding> embeddingCaptor = ArgumentCaptor.forClass(Embedding.class);
        verify(embeddingRepository).save(embeddingCaptor.capture());
        Embedding saved = embeddingCaptor.getValue();
        assertEquals(512, saved.getEmbeddingLeft1().size());
        assertEquals(512, saved.getEmbeddingLeft2().size());
        assertEquals(512, saved.getEmbeddingRight1().size());
        assertEquals(512, saved.getEmbeddingRight2().size());
    }

    @Test
    void saveEmbeddings_allFourNewFieldsExplicitlyNull_success() {
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
                .embeddingLeft1(null)
                .embeddingLeft2(null)
                .embeddingRight1(null)
                .embeddingRight2(null)
                .build();

        when(studentRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(embeddingRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(studentRepository.save(any(Student.class))).thenAnswer(i -> i.getArgument(0));
        when(embeddingRepository.save(any(Embedding.class))).thenAnswer(i -> i.getArgument(0));

        var response = internalStudentService.saveEmbeddings(request);

        assertNotNull(response);
        ArgumentCaptor<Embedding> embeddingCaptor = ArgumentCaptor.forClass(Embedding.class);
        verify(embeddingRepository).save(embeddingCaptor.capture());
        Embedding saved = embeddingCaptor.getValue();
        assertNull(saved.getEmbeddingLeft1());
        assertNull(saved.getEmbeddingLeft2());
        assertNull(saved.getEmbeddingRight1());
        assertNull(saved.getEmbeddingRight2());
    }

    @Test
    void saveEmbeddings_onlyLeftSideEmbeddingsSupplied_success() {
        List<Double> vector512 = createVector(512);
        List<Double> left1 = createVector(512);
        List<Double> left2 = createVector(512);

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
                .embeddingLeft1(left1)
                .embeddingLeft2(left2)
                .embeddingRight1(null)
                .embeddingRight2(null)
                .build();

        when(studentRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(embeddingRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(studentRepository.save(any(Student.class))).thenAnswer(i -> i.getArgument(0));
        when(embeddingRepository.save(any(Embedding.class))).thenAnswer(i -> i.getArgument(0));

        var response = internalStudentService.saveEmbeddings(request);

        assertNotNull(response);
        ArgumentCaptor<Embedding> embeddingCaptor = ArgumentCaptor.forClass(Embedding.class);
        verify(embeddingRepository).save(embeddingCaptor.capture());
        Embedding saved = embeddingCaptor.getValue();
        assertNotNull(saved.getEmbeddingLeft1());
        assertNotNull(saved.getEmbeddingLeft2());
        assertNull(saved.getEmbeddingRight1());
        assertNull(saved.getEmbeddingRight2());
    }

    @Test
    void saveEmbeddings_onlyRightSideEmbeddingsSupplied_success() {
        List<Double> vector512 = createVector(512);
        List<Double> right1 = createVector(512);
        List<Double> right2 = createVector(512);

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
                .embeddingLeft1(null)
                .embeddingLeft2(null)
                .embeddingRight1(right1)
                .embeddingRight2(right2)
                .build();

        when(studentRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(embeddingRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(studentRepository.save(any(Student.class))).thenAnswer(i -> i.getArgument(0));
        when(embeddingRepository.save(any(Embedding.class))).thenAnswer(i -> i.getArgument(0));

        var response = internalStudentService.saveEmbeddings(request);

        assertNotNull(response);
        ArgumentCaptor<Embedding> embeddingCaptor = ArgumentCaptor.forClass(Embedding.class);
        verify(embeddingRepository).save(embeddingCaptor.capture());
        Embedding saved = embeddingCaptor.getValue();
        assertNull(saved.getEmbeddingLeft1());
        assertNull(saved.getEmbeddingLeft2());
        assertNotNull(saved.getEmbeddingRight1());
        assertNotNull(saved.getEmbeddingRight2());
    }

    @Test
    void saveEmbeddings_bothLeftAndRightSupplied_success() {
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
                .embeddingLeft1(createVector(512))
                .embeddingLeft2(createVector(512))
                .embeddingRight1(createVector(512))
                .embeddingRight2(createVector(512))
                .build();

        when(studentRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(embeddingRepository.findByStudentId("E/18/001")).thenReturn(Optional.empty());
        when(studentRepository.save(any(Student.class))).thenAnswer(i -> i.getArgument(0));
        when(embeddingRepository.save(any(Embedding.class))).thenAnswer(i -> i.getArgument(0));

        var response = internalStudentService.saveEmbeddings(request);

        assertNotNull(response);
        ArgumentCaptor<Embedding> embeddingCaptor = ArgumentCaptor.forClass(Embedding.class);
        verify(embeddingRepository).save(embeddingCaptor.capture());
        Embedding saved = embeddingCaptor.getValue();
        assertNotNull(saved.getEmbeddingLeft1());
        assertNotNull(saved.getEmbeddingLeft2());
        assertNotNull(saved.getEmbeddingRight1());
        assertNotNull(saved.getEmbeddingRight2());
    }

    @Test
    void saveEmbeddings_newFieldFewerThan512_throwsEmbeddingValidationException() {
        List<Double> vector512 = createVector(512);
        List<Double> vector511 = createVector(511);

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
                .embeddingLeft1(vector511)
                .build();

        assertThrows(EmbeddingValidationException.class, () -> internalStudentService.saveEmbeddings(request));
    }

    @Test
    void saveEmbeddings_newFieldMoreThan512_throwsEmbeddingValidationException() {
        List<Double> vector512 = createVector(512);
        List<Double> vector513 = createVector(513);

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
                .embeddingRight2(vector513)
                .build();

        assertThrows(EmbeddingValidationException.class, () -> internalStudentService.saveEmbeddings(request));
    }

    @Test
    void saveEmbeddings_newFieldContainsNullElement_throwsEmbeddingValidationException() {
        List<Double> vector512 = createVector(512);
        List<Double> invalidVector = createVector(512);
        invalidVector.set(10, null);

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
                .embeddingLeft2(invalidVector)
                .build();

        assertThrows(EmbeddingValidationException.class, () -> internalStudentService.saveEmbeddings(request));
    }

    @Test
    void saveEmbeddings_newFieldContainsNaN_throwsEmbeddingValidationException() {
        List<Double> vector512 = createVector(512);
        List<Double> invalidVector = createVector(512);
        invalidVector.set(25, Double.NaN);

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
                .embeddingRight1(invalidVector)
                .build();

        assertThrows(EmbeddingValidationException.class, () -> internalStudentService.saveEmbeddings(request));
    }

    @Test
    void saveEmbeddings_newFieldContainsPositiveInfinity_throwsEmbeddingValidationException() {
        List<Double> vector512 = createVector(512);
        List<Double> invalidVector = createVector(512);
        invalidVector.set(50, Double.POSITIVE_INFINITY);

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
                .embeddingLeft1(invalidVector)
                .build();

        assertThrows(EmbeddingValidationException.class, () -> internalStudentService.saveEmbeddings(request));
    }

    @Test
    void saveEmbeddings_newFieldContainsNegativeInfinity_throwsEmbeddingValidationException() {
        List<Double> vector512 = createVector(512);
        List<Double> invalidVector = createVector(512);
        invalidVector.set(75, Double.NEGATIVE_INFINITY);

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
                .embeddingRight2(invalidVector)
                .build();

        assertThrows(EmbeddingValidationException.class, () -> internalStudentService.saveEmbeddings(request));
    }

    @Test
    void saveEmbeddings_mandatoryFieldContainsNullElement_throwsEmbeddingValidationException() {
        List<Double> vector512 = createVector(512);
        List<Double> invalidVector = createVector(512);
        invalidVector.set(0, null);

        EmbeddingSaveRequest request = EmbeddingSaveRequest.builder()
                .studentId("E/18/001")
                .faculty("Engineering")
                .tier(1)
                .embeddingOriginal(invalidVector)
                .embeddingFlipped(vector512)
                .embeddingBrighter(vector512)
                .embeddingDarker(vector512)
                .embeddingRotatedPlus(vector512)
                .embeddingRotatedMinus(vector512)
                .build();

        assertThrows(EmbeddingValidationException.class, () -> internalStudentService.saveEmbeddings(request));
    }

    @Test
    void saveEmbeddings_mandatoryFieldContainsNaN_throwsEmbeddingValidationException() {
        List<Double> vector512 = createVector(512);
        List<Double> invalidVector = createVector(512);
        invalidVector.set(0, Double.NaN);

        EmbeddingSaveRequest request = EmbeddingSaveRequest.builder()
                .studentId("E/18/001")
                .faculty("Engineering")
                .tier(1)
                .embeddingOriginal(invalidVector)
                .embeddingFlipped(vector512)
                .embeddingBrighter(vector512)
                .embeddingDarker(vector512)
                .embeddingRotatedPlus(vector512)
                .embeddingRotatedMinus(vector512)
                .build();

        assertThrows(EmbeddingValidationException.class, () -> internalStudentService.saveEmbeddings(request));
    }

    @Test
    void saveEmbeddings_mandatoryFieldContainsInfinity_throwsEmbeddingValidationException() {
        List<Double> vector512 = createVector(512);
        List<Double> invalidVector = createVector(512);
        invalidVector.set(0, Double.POSITIVE_INFINITY);

        EmbeddingSaveRequest request = EmbeddingSaveRequest.builder()
                .studentId("E/18/001")
                .faculty("Engineering")
                .tier(1)
                .embeddingOriginal(invalidVector)
                .embeddingFlipped(vector512)
                .embeddingBrighter(vector512)
                .embeddingDarker(vector512)
                .embeddingRotatedPlus(vector512)
                .embeddingRotatedMinus(vector512)
                .build();

        assertThrows(EmbeddingValidationException.class, () -> internalStudentService.saveEmbeddings(request));
    }

    @Test
    void saveEmbeddings_partialUpdate_doesNotOverwriteExistingLeftEmbeddingsWhenRightSupplied() {
        List<Double> vector512 = createVector(512);
        List<Double> existingLeft1 = createVector(512);
        List<Double> existingLeft2 = createVector(512);
        List<Double> newRight1 = createVector(512);
        List<Double> newRight2 = createVector(512);

        // Pre-existing embedding with left-side embeddings populated, right-side null
        Embedding existingEmbedding = Embedding.builder()
                .studentId("E/18/001")
                .embeddingOriginal(vector512)
                .embeddingFlipped(vector512)
                .embeddingBrighter(vector512)
                .embeddingDarker(vector512)
                .embeddingRotatedPlus(vector512)
                .embeddingRotatedMinus(vector512)
                .embeddingLeft1(existingLeft1)
                .embeddingLeft2(existingLeft2)
                .embeddingRight1(null)
                .embeddingRight2(null)
                .build();

        Student existingStudent = Student.builder()
                .studentId("E/18/001")
                .faculty("Engineering")
                .tier(1)
                .build();

        when(studentRepository.findByStudentId("E/18/001")).thenReturn(Optional.of(existingStudent));
        when(embeddingRepository.findByStudentId("E/18/001")).thenReturn(Optional.of(existingEmbedding));
        when(studentRepository.save(any(Student.class))).thenAnswer(i -> i.getArgument(0));
        when(embeddingRepository.save(any(Embedding.class))).thenAnswer(i -> i.getArgument(0));

        // Incoming update supplies right-side embeddings, with left-side null/omitted
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
                .embeddingLeft1(null)
                .embeddingLeft2(null)
                .embeddingRight1(newRight1)
                .embeddingRight2(newRight2)
                .build();

        internalStudentService.saveEmbeddings(request);

        ArgumentCaptor<Embedding> captor = ArgumentCaptor.forClass(Embedding.class);
        verify(embeddingRepository).save(captor.capture());
        Embedding updated = captor.getValue();

        // Left-side embeddings must be preserved, not overwritten with null
        assertEquals(existingLeft1, updated.getEmbeddingLeft1());
        assertEquals(existingLeft2, updated.getEmbeddingLeft2());
        // Right-side embeddings must now be populated
        assertEquals(newRight1, updated.getEmbeddingRight1());
        assertEquals(newRight2, updated.getEmbeddingRight2());
    }

    @Test
    void saveEmbeddings_partialUpdate_doesNotOverwriteExistingRightEmbeddingsWhenLeftSupplied() {
        List<Double> vector512 = createVector(512);
        List<Double> existingRight1 = createVector(512);
        List<Double> existingRight2 = createVector(512);
        List<Double> newLeft1 = createVector(512);
        List<Double> newLeft2 = createVector(512);

        // Pre-existing embedding with right-side embeddings populated, left-side null
        Embedding existingEmbedding = Embedding.builder()
                .studentId("E/18/001")
                .embeddingOriginal(vector512)
                .embeddingFlipped(vector512)
                .embeddingBrighter(vector512)
                .embeddingDarker(vector512)
                .embeddingRotatedPlus(vector512)
                .embeddingRotatedMinus(vector512)
                .embeddingLeft1(null)
                .embeddingLeft2(null)
                .embeddingRight1(existingRight1)
                .embeddingRight2(existingRight2)
                .build();

        Student existingStudent = Student.builder()
                .studentId("E/18/001")
                .faculty("Engineering")
                .tier(1)
                .build();

        when(studentRepository.findByStudentId("E/18/001")).thenReturn(Optional.of(existingStudent));
        when(embeddingRepository.findByStudentId("E/18/001")).thenReturn(Optional.of(existingEmbedding));
        when(studentRepository.save(any(Student.class))).thenAnswer(i -> i.getArgument(0));
        when(embeddingRepository.save(any(Embedding.class))).thenAnswer(i -> i.getArgument(0));

        // Incoming update supplies left-side embeddings, with right-side null/omitted
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
                .embeddingLeft1(newLeft1)
                .embeddingLeft2(newLeft2)
                .embeddingRight1(null)
                .embeddingRight2(null)
                .build();

        internalStudentService.saveEmbeddings(request);

        ArgumentCaptor<Embedding> captor = ArgumentCaptor.forClass(Embedding.class);
        verify(embeddingRepository).save(captor.capture());
        Embedding updated = captor.getValue();

        // Right-side embeddings must be preserved, not overwritten with null
        assertEquals(existingRight1, updated.getEmbeddingRight1());
        assertEquals(existingRight2, updated.getEmbeddingRight2());
        // Left-side embeddings must now be populated
        assertEquals(newLeft1, updated.getEmbeddingLeft1());
        assertEquals(newLeft2, updated.getEmbeddingLeft2());
    }

    @Test
    void getEmbeddings_returnsAllTenEmbeddings() {
        List<Double> vector512 = createVector(512);
        Embedding embedding = Embedding.builder()
                .studentId("E/18/001")
                .embeddingOriginal(vector512)
                .embeddingFlipped(vector512)
                .embeddingBrighter(vector512)
                .embeddingDarker(vector512)
                .embeddingRotatedPlus(vector512)
                .embeddingRotatedMinus(vector512)
                .embeddingLeft1(vector512)
                .embeddingLeft2(vector512)
                .embeddingRight1(vector512)
                .embeddingRight2(vector512)
                .build();

        List<Object[]> rows = new ArrayList<>();
        rows.add(new Object[]{embedding, 1});
        when(embeddingRepository.findEmbeddingsWithTier(null, null))
                .thenReturn(rows);

        var responses = internalStudentService.getEmbeddings(null, null);

        assertNotNull(responses);
        assertEquals(1, responses.size());
        var res = responses.get(0);
        assertEquals("E/18/001", res.getStudentId());
        assertEquals(1, res.getTier());
        assertNotNull(res.getEmbeddingOriginal());
        assertNotNull(res.getEmbeddingLeft1());
        assertNotNull(res.getEmbeddingLeft2());
        assertNotNull(res.getEmbeddingRight1());
        assertNotNull(res.getEmbeddingRight2());
    }
}
