-- SignatureHub PostgreSQL Schema
-- Migration: 001_init
-- Creates all tables in their final state for PostgreSQL

-- Table: signature_requests
CREATE TABLE IF NOT EXISTS signature_requests (
    id VARCHAR(36) PRIMARY KEY,
    reference_code VARCHAR(20) NOT NULL UNIQUE,
    external_ref VARCHAR(100),
    external_type VARCHAR(50),
    document_category VARCHAR(50) DEFAULT 'other',
    document_name VARCHAR(255) NOT NULL,
    document_content TEXT,
    document_content_snapshot TEXT,
    document_url VARCHAR(500),
    waiver_template_code VARCHAR(100),
    waiver_template_version INTEGER,
    merge_variables TEXT,
    jurisdiction VARCHAR(10),
    metadata TEXT,
    signer_name VARCHAR(255) NOT NULL,
    signer_email VARCHAR(255),
    signer_phone VARCHAR(20),
    verification_method VARCHAR(20) DEFAULT 'email'
        CHECK (verification_method IN ('email', 'sms', 'both')),
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'viewed', 'verified', 'signed', 'expired', 'cancelled', 'declined')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    signed_at TIMESTAMP NULL,
    callback_url VARCHAR(500),
    created_by VARCHAR(100),
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'default-tenant',
    package_id VARCHAR(36),
    roles_display VARCHAR(500),
    decline_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_sr_reference_code ON signature_requests(reference_code);
CREATE INDEX IF NOT EXISTS idx_sr_tenant ON signature_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sr_external_ref ON signature_requests(external_ref);
CREATE INDEX IF NOT EXISTS idx_sr_status ON signature_requests(status);
CREATE INDEX IF NOT EXISTS idx_sr_signer_email ON signature_requests(signer_email);
CREATE INDEX IF NOT EXISTS idx_sr_jurisdiction ON signature_requests(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_sr_package_id ON signature_requests(package_id);

-- Table: signature_tokens
CREATE TABLE IF NOT EXISTS signature_tokens (
    id VARCHAR(36) PRIMARY KEY,
    request_id VARCHAR(36) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    verification_code VARCHAR(6),
    code_expires_at TIMESTAMP NULL,
    code_attempts INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP NULL,
    FOREIGN KEY (request_id) REFERENCES signature_requests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_st_token ON signature_tokens(token);

-- Table: signatures
CREATE TABLE IF NOT EXISTS signatures (
    id VARCHAR(36) PRIMARY KEY,
    request_id VARCHAR(36) NOT NULL UNIQUE,
    signature_type VARCHAR(20) NOT NULL
        CHECK (signature_type IN ('typed', 'drawn')),
    typed_name VARCHAR(255),
    signature_image TEXT,
    signer_ip VARCHAR(45),
    user_agent TEXT,
    signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verification_method_used VARCHAR(20),
    consent_text TEXT,
    FOREIGN KEY (request_id) REFERENCES signature_requests(id) ON DELETE CASCADE
);

-- Table: waiver_templates
CREATE TABLE IF NOT EXISTS waiver_templates (
    id VARCHAR(36) PRIMARY KEY,
    template_code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    html_content TEXT NOT NULL,
    jurisdiction VARCHAR(10),
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'default-tenant',
    UNIQUE (template_code, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_wt_template_code ON waiver_templates(template_code);
CREATE INDEX IF NOT EXISTS idx_wt_tenant ON waiver_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wt_jurisdiction ON waiver_templates(jurisdiction);

-- Table: signing_packages
CREATE TABLE IF NOT EXISTS signing_packages (
    id VARCHAR(36) PRIMARY KEY,
    package_code VARCHAR(20) NOT NULL UNIQUE,
    external_ref VARCHAR(100),
    external_type VARCHAR(50),
    template_code VARCHAR(100),
    template_version INTEGER,
    document_name VARCHAR(255) NOT NULL,
    document_content TEXT,
    jurisdiction VARCHAR(10),
    merge_variables TEXT,
    event_date VARCHAR(20),
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'partial', 'complete', 'expired', 'cancelled')),
    total_signers INTEGER DEFAULT 0,
    completed_signers INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    callback_url VARCHAR(500),
    created_by VARCHAR(100),
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'default-tenant'
);

CREATE INDEX IF NOT EXISTS idx_sp_package_code ON signing_packages(package_code);
CREATE INDEX IF NOT EXISTS idx_sp_tenant ON signing_packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sp_external_ref ON signing_packages(external_ref);
CREATE INDEX IF NOT EXISTS idx_sp_status ON signing_packages(status);

-- Table: signing_roles
CREATE TABLE IF NOT EXISTS signing_roles (
    id VARCHAR(36) PRIMARY KEY,
    package_id VARCHAR(36) NOT NULL,
    role_name VARCHAR(50) NOT NULL,
    signer_name VARCHAR(255) NOT NULL,
    signer_email VARCHAR(255),
    signer_phone VARCHAR(20),
    date_of_birth VARCHAR(20),
    is_minor BOOLEAN DEFAULT FALSE,
    is_package_admin BOOLEAN DEFAULT FALSE,
    request_id VARCHAR(36),
    consolidated_group VARCHAR(36),
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'signed', 'declined')),
    signed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (package_id) REFERENCES signing_packages(id) ON DELETE CASCADE,
    FOREIGN KEY (request_id) REFERENCES signature_requests(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sr_package_id ON signing_roles(package_id);
CREATE INDEX IF NOT EXISTS idx_sr_consolidated_group ON signing_roles(consolidated_group);
CREATE INDEX IF NOT EXISTS idx_sr_signer_email_roles ON signing_roles(signer_email);
CREATE INDEX IF NOT EXISTS idx_sr_package_admin ON signing_roles(package_id, is_package_admin);

-- Table: jurisdiction_addendums
CREATE TABLE IF NOT EXISTS jurisdiction_addendums (
    id VARCHAR(36) PRIMARY KEY,
    jurisdiction_code VARCHAR(10) NOT NULL UNIQUE,
    jurisdiction_name VARCHAR(100) NOT NULL,
    addendum_html TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'default-tenant'
);

CREATE INDEX IF NOT EXISTS idx_ja_jurisdiction_code ON jurisdiction_addendums(jurisdiction_code);
CREATE INDEX IF NOT EXISTS idx_ja_tenant ON jurisdiction_addendums(tenant_id);

-- Table: api_keys
CREATE TABLE IF NOT EXISTS api_keys (
    id VARCHAR(36) PRIMARY KEY,
    api_key VARCHAR(100) NOT NULL UNIQUE,
    tenant_id VARCHAR(100) NOT NULL,
    tenant_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    permissions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ak_api_key ON api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_ak_tenant ON api_keys(tenant_id);
