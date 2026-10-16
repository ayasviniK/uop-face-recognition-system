package com.uop.backend.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class TierUpdateRequest {

    @NotNull(message = "tier is mandatory")
    @Min(value = 1, message = "tier must be 1 or 2")
    @Max(value = 2, message = "tier must be 1 or 2")
    private Integer tier;

    @Builder
    public TierUpdateRequest(Integer tier) {
        this.tier = tier;
    }
}
