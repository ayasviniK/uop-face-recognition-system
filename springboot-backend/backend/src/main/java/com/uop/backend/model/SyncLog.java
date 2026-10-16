package com.uop.backend.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "sync_log")
@Data
@NoArgsConstructor
public class SyncLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "synced_at")
    private LocalDateTime syncedAt;

    @Column(name = "students_added")
    private Integer studentsAdded = 0;

    @Column(name = "students_updated")
    private Integer studentsUpdated = 0;

    @Column(name = "students_tiered_down")
    private Integer studentsTieredDown = 0;

    @Column(name = "status", length = 20)
    private String status = "success";

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Builder
    public SyncLog(Long id, LocalDateTime syncedAt, Integer studentsAdded, Integer studentsUpdated,
            Integer studentsTieredDown, String status, String notes) {
        this.id = id;
        this.syncedAt = syncedAt;
        this.studentsAdded = studentsAdded != null ? studentsAdded : 0;
        this.studentsUpdated = studentsUpdated != null ? studentsUpdated : 0;
        this.studentsTieredDown = studentsTieredDown != null ? studentsTieredDown : 0;
        this.status = status != null ? status : "success";
        this.notes = notes;
    }

    @PrePersist
    protected void onCreate() {
        if (syncedAt == null) {
            syncedAt = LocalDateTime.now();
        }
        if (status == null) {
            status = "success";
        }
    }
}
