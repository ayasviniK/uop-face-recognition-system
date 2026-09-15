package com.uop.backend.exception;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import com.uop.backend.dto.ApiResponse;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;

@ControllerAdvice
@Slf4j
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {

        List<String> errorsList = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .collect(Collectors.toList());

        ApiResponse<Void> apiError = ApiResponse.error("Validation Failed", errorsList);
        return new ResponseEntity<>(apiError, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotFound(ResourceNotFoundException ex, HttpServletRequest request) {
        log.warn("Resource not found: {}", ex.getMessage());
        ApiResponse<Void> err = ApiResponse.error(ex.getMessage());
        return new ResponseEntity<>(err, HttpStatus.NOT_FOUND);
    }

    @ExceptionHandler(DuplicateResourceException.class)
    public ResponseEntity<ApiResponse<Void>> handleConflict(DuplicateResourceException ex, HttpServletRequest request) {
        log.warn("Resource conflict: {}", ex.getMessage());
        ApiResponse<Void> err = ApiResponse.error(ex.getMessage());
        return new ResponseEntity<>(err, HttpStatus.CONFLICT);
    }

    @ExceptionHandler(FileValidationException.class)
    public ResponseEntity<ApiResponse<Void>> handleFileValidation(FileValidationException ex, HttpServletRequest request) {
        log.warn("File validation error: {}", ex.getMessage());
        ApiResponse<Void> err = ApiResponse.error(ex.getMessage());
        return new ResponseEntity<>(err, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(EmbeddingValidationException.class)
    public ResponseEntity<ApiResponse<Void>> handleEmbeddingValidation(EmbeddingValidationException ex, HttpServletRequest request) {
        log.warn("Embedding validation failure: {}", ex.getMessage());
        ApiResponse<Void> err = ApiResponse.error(ex.getMessage());
        return new ResponseEntity<>(err, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(InternalAuthenticationException.class)
    public ResponseEntity<ApiResponse<Void>> handleInternalAuth(InternalAuthenticationException ex, HttpServletRequest request) {
        log.warn("Internal authentication failure: {}", ex.getMessage());
        ApiResponse<Void> err = ApiResponse.error(ex.getMessage());
        return new ResponseEntity<>(err, HttpStatus.UNAUTHORIZED);
    }

    @ExceptionHandler(AiServiceException.class)
    public ResponseEntity<ApiResponse<Void>> handleAiServiceException(AiServiceException ex, HttpServletRequest request) {
        log.error("AI service error: {}", ex.getMessage(), ex);
        ApiResponse<Void> err = ApiResponse.error("Face recognition service is currently unavailable");
        return new ResponseEntity<>(err, HttpStatus.SERVICE_UNAVAILABLE);
    }

    @ExceptionHandler(UniversityIndexException.class)
    public ResponseEntity<ApiResponse<Void>> handleUniversityIndexException(UniversityIndexException ex, HttpServletRequest request) {
        log.error("University Index error: {}", ex.getMessage(), ex);
        ApiResponse<Void> err = ApiResponse.error("Unable to retrieve student information from the University Index.");
        return new ResponseEntity<>(err, HttpStatus.BAD_GATEWAY);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalArgument(IllegalArgumentException ex, HttpServletRequest request) {
        log.warn("Bad argument: {}", ex.getMessage());
        ApiResponse<Void> err = ApiResponse.error(ex.getMessage());
        return new ResponseEntity<>(err, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleAny(Exception ex, HttpServletRequest request) {
        log.error("Unexpected server error processing request URI: {}", request.getRequestURI(), ex);
        ApiResponse<Void> err = ApiResponse.error("An unexpected error occurred. Please try again later.");
        return new ResponseEntity<>(err, HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
