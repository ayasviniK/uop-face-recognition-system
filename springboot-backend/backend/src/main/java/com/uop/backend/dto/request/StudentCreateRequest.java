package com.uop.backend.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import lombok.Data;

@Data
public class StudentCreateRequest {

    @NotBlank
    @Size(max = 64)
    private String studentId;

    @NotBlank
    @Size(max = 200)
    private String fullName;
}
