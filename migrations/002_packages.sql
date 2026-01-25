-- USEA eSign Database Schema
-- Migration: 002_packages
-- Adds support for signing packages (multi-party signing with roles)

-- Table: signing_packages
-- Groups multiple signature requests for a single entry/transaction
CREATE TABLE IF NOT EXISTS signing_packages (
    id VARCHAR(36) PRIMARY KEY,
    package_code VARCHAR(20) NOT NULL UNIQUE,
    external_ref VARCHAR(100),
    external_type VARCHAR(50),
    template_code VARCHAR(100),
    template_version INT,
    document_name VARCHAR(255) NOT NULL,
    document_content TEXT,
    jurisdiction VARCHAR(10),
    merge_variables TEXT,
    status ENUM('pending', 'partial', 'complete', 'expired', 'cancelled') DEFAULT 'pending',
    total_signers INT DEFAULT 0,
    completed_signers INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    callback_url VARCHAR(500),
    created_by VARCHAR(100),
    INDEX idx_package_code (package_code),
    INDEX idx_external_ref (external_ref),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: signing_roles
-- Tracks individual signers within a package and their roles
CREATE TABLE IF NOT EXISTS signing_roles (
    id VARCHAR(36) PRIMARY KEY,
    package_id VARCHAR(36) NOT NULL,
    role_name VARCHAR(50) NOT NULL,
    signer_name VARCHAR(255) NOT NULL,
    signer_email VARCHAR(255),
    signer_phone VARCHAR(20),
    is_minor BOOLEAN DEFAULT FALSE,
    request_id VARCHAR(36),
    consolidated_group VARCHAR(36),
    status ENUM('pending', 'sent', 'signed') DEFAULT 'pending',
    signed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (package_id) REFERENCES signing_packages(id) ON DELETE CASCADE,
    FOREIGN KEY (request_id) REFERENCES signature_requests(id) ON DELETE SET NULL,
    INDEX idx_package_id (package_id),
    INDEX idx_consolidated_group (consolidated_group),
    INDEX idx_signer_email (signer_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: jurisdiction_addendums
-- Jurisdiction-specific legal language to append to documents
CREATE TABLE IF NOT EXISTS jurisdiction_addendums (
    id VARCHAR(36) PRIMARY KEY,
    jurisdiction_code VARCHAR(10) NOT NULL UNIQUE,
    jurisdiction_name VARCHAR(100) NOT NULL,
    addendum_html TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_jurisdiction_code (jurisdiction_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add package_id column to signature_requests for linking
ALTER TABLE signature_requests ADD COLUMN package_id VARCHAR(36) NULL;
ALTER TABLE signature_requests ADD COLUMN roles_display VARCHAR(500) NULL;
ALTER TABLE signature_requests ADD INDEX idx_package_id (package_id);
