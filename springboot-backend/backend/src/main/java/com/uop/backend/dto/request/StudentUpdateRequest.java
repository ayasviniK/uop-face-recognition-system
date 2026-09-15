package com.uop.backend.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StudentUpdateRequest {

    @Size(max = 100, message = "faculty must not exceed 100 characters")
    private String faculty;

    @Min(value = 1, message = "tier must be 1 or 2")
    @Max(value = 2, message = "tier must be 1 or 2")
    private Integer tier;
}
