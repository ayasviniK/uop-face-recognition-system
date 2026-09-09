package com.uop.backend.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SyncLogRequest {

    @Min(value = 0, message = "studentsAdded cannot be negative")
    @Builder.Default
    private Integer studentsAdded = 0;

    @Min(value = 0, message = "studentsUpdated cannot be negative")
    @Builder.Default
    private Integer studentsUpdated = 0;

    @Min(value = 0, message = "studentsTieredDown cannot be negative")
    @Builder.Default
    private Integer studentsTieredDown = 0;

    @NotBlank(message = "status is mandatory")
    @Builder.Default
    private String status = "success";

    private String notes;
}
