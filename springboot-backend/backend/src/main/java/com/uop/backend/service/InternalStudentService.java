package com.uop.backend.service;

import java.util.List;
import java.util.Map;

import com.uop.backend.dto.request.EmbeddingSaveRequest;
import com.uop.backend.dto.request.SyncLogRequest;
import com.uop.backend.dto.request.TierUpdateRequest;
import com.uop.backend.dto.response.EmbeddingResponse;
import com.uop.backend.dto.response.StudentIdsResponse;
import com.uop.backend.model.SyncLog;

public interface InternalStudentService {

    List<EmbeddingResponse> getEmbeddings(Integer tier, String facultyPrefix);

    Map<String, Object> saveEmbeddings(EmbeddingSaveRequest request);

    StudentIdsResponse getAllStudentIds();

    Map<String, String> updateStudentTier(String studentId, TierUpdateRequest request);

    SyncLog recordSyncLog(SyncLogRequest request);
}
