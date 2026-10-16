package com.uop.backend.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class SyncLogRequest {

    @Min(value = 0, message = "studentsAdded cannot be negative")
    private Integer studentsAdded = 0;

    @Min(value = 0, message = "studentsUpdated cannot be negative")
    private Integer studentsUpdated = 0;

    @Min(value = 0, message = "studentsTieredDown cannot be negative")
    private Integer studentsTieredDown = 0;

    @NotBlank(message = "status is mandatory")
    private String status = "success";

    private String notes;

    @Builder
    public SyncLogRequest(Integer studentsAdded, Integer studentsUpdated, Integer studentsTieredDown,
            String status, String notes) {
        this.studentsAdded = studentsAdded != null ? studentsAdded : 0;
        this.studentsUpdated = studentsUpdated != null ? studentsUpdated : 0;
        this.studentsTieredDown = studentsTieredDown != null ? studentsTieredDown : 0;
        this.status = status != null ? status : "success";
        this.notes = notes;
    }
}
