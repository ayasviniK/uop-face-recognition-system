package com.uop.backend.dto.response;

import java.util.List;

import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class StudentIdsResponse {
    private List<String> studentIds;

    @Builder
    public StudentIdsResponse(List<String> studentIds) {
        this.studentIds = studentIds;
    }
}
