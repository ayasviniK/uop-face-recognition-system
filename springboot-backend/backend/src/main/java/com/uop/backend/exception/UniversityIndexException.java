package com.uop.backend.exception;

public class UniversityIndexException extends RuntimeException {
    public UniversityIndexException(String message) {
        super(message);
    }

    public UniversityIndexException(String message, Throwable cause) {
        super(message, cause);
    }
}
