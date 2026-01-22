-- SignatureHub Database Schema
-- Migration: 001_initial

-- Table: signature_requests
CREATE TABLE IF NOT EXISTS signature_requests (
    id VARCHAR(36) PRIMARY KEY,
    external_ref VARCHAR(100),
    external_type VARCHAR(50),
    document_name VARCHAR(255) NOT NULL,
    document_content TEXT,
    document_url VARCHAR(500),
    signer_name VARCHAR(255) NOT NULL,
    signer_email VARCHAR(255),
    signer_phone VARCHAR(20),
    verification_method ENUM('email', 'sms', 'both') DEFAULT 'email',
    status ENUM('pending', 'sent', 'viewed', 'verified', 'signed', 'expired', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    signed_at TIMESTAMP NULL,
    callback_url VARCHAR(500),
    created_by VARCHAR(100),
    INDEX idx_external_ref (external_ref),
    INDEX idx_status (status),
    INDEX idx_signer_email (signer_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: signature_tokens
CREATE TABLE IF NOT EXISTS signature_tokens (
    id VARCHAR(36) PRIMARY KEY,
    request_id VARCHAR(36) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    verification_code VARCHAR(6),
    code_expires_at TIMESTAMP NULL,
    code_attempts INT DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP NULL,
    FOREIGN KEY (request_id) REFERENCES signature_requests(id) ON DELETE CASCADE,
    INDEX idx_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: signatures
CREATE TABLE IF NOT EXISTS signatures (
    id VARCHAR(36) PRIMARY KEY,
    request_id VARCHAR(36) NOT NULL UNIQUE,
    signature_type ENUM('typed', 'drawn') NOT NULL,
    typed_name VARCHAR(255),
    signature_image MEDIUMTEXT,
    signer_ip VARCHAR(45),
    user_agent TEXT,
    signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verification_method_used VARCHAR(20),
    consent_text TEXT,
    FOREIGN KEY (request_id) REFERENCES signature_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
