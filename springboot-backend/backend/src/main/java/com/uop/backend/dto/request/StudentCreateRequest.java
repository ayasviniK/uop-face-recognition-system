package com.uop.backend.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StudentCreateRequest {

    @NotBlank(message = "studentId is mandatory")
    @Size(max = 50, message = "studentId must not exceed 50 characters")
    private String studentId;

    @Size(max = 100, message = "faculty must not exceed 100 characters")
    private String faculty;

    @Min(value = 1, message = "tier must be 1 or 2")
    @Max(value = 2, message = "tier must be 1 or 2")
    @Builder.Default
    private Integer tier = 1;
}
