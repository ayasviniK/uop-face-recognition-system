CREATE DATABASE IF NOT EXISTS uop_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE uop_db;

CREATE TABLE IF NOT EXISTS admins (
    id BIGINT NOT NULL AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_admins_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS students (
    student_id VARCHAR(50) NOT NULL,
    faculty VARCHAR(100) NOT NULL,
    tier TINYINT NOT NULL DEFAULT 1,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS embeddings (
    student_id VARCHAR(50) NOT NULL,
    embedding_original JSON NOT NULL,
    embedding_flipped JSON NOT NULL,
    embedding_brighter JSON NOT NULL,
    embedding_darker JSON NOT NULL,
    embedding_rotated_plus JSON NOT NULL,
    embedding_rotated_minus JSON NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (student_id),
    CONSTRAINT fk_embeddings_students FOREIGN KEY (student_id) REFERENCES students (student_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    students_added INT DEFAULT 0,
    students_updated INT DEFAULT 0,
    students_tiered_down INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'success',
    notes TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;