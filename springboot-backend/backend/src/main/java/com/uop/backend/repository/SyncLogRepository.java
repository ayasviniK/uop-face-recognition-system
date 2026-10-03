package com.uop.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.uop.backend.model.SyncLog;

@Repository
public interface SyncLogRepository extends JpaRepository<SyncLog, Long> {
}
