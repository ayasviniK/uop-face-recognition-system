package com.uop.backend.exception;

public class StudentNotFoundException extends ResourceNotFoundException {
    public StudentNotFoundException(String message) {
        super(message);
    }
}
