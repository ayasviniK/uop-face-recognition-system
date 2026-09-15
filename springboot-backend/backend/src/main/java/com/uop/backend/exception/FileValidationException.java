package com.uop.backend.exception;

public class FileValidationException extends RuntimeException {
    public FileValidationException(String message){
        super(message);
    }
}
