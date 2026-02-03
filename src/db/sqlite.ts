import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

let db: Database.Database | null = null;

export function getSqliteDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'signatures.db');

    // Ensure directory exists
    const dir = path.dirname(dbPath);
    const fs = require('fs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    initializeTables(db);
  }
  return db;
}

function initializeTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS signature_requests (
      id TEXT PRIMARY KEY,
      reference_code TEXT NOT NULL UNIQUE,
      external_ref TEXT,
      external_type TEXT,
      document_category TEXT DEFAULT 'other',
      document_name TEXT NOT NULL,
      document_content TEXT,
      document_content_snapshot TEXT,
      document_url TEXT,
      waiver_template_code TEXT,
      waiver_template_version INTEGER,
      merge_variables TEXT,
      jurisdiction TEXT,
      metadata TEXT,
      signer_name TEXT NOT NULL,
      signer_email TEXT,
      signer_phone TEXT,
      verification_method TEXT DEFAULT 'email',
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      signed_at TEXT,
      callback_url TEXT,
      created_by TEXT,
      tenant_id TEXT NOT NULL DEFAULT 'default-tenant'
    );

    CREATE INDEX IF NOT EXISTS idx_reference_code ON signature_requests(reference_code);
    CREATE INDEX IF NOT EXISTS idx_sr_tenant ON signature_requests(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_external_ref ON signature_requests(external_ref);
    CREATE INDEX IF NOT EXISTS idx_status ON signature_requests(status);
    CREATE INDEX IF NOT EXISTS idx_signer_email ON signature_requests(signer_email);
    CREATE INDEX IF NOT EXISTS idx_jurisdiction ON signature_requests(jurisdiction);

    CREATE TABLE IF NOT EXISTS signature_tokens (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      verification_code TEXT,
      code_expires_at TEXT,
      code_attempts INTEGER DEFAULT 0,
      is_verified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      verified_at TEXT,
      FOREIGN KEY (request_id) REFERENCES signature_requests(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_token ON signature_tokens(token);

    CREATE TABLE IF NOT EXISTS signatures (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE,
      signature_type TEXT NOT NULL,
      typed_name TEXT,
      signature_image TEXT,
      signer_ip TEXT,
      user_agent TEXT,
      signed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      verification_method_used TEXT,
      consent_text TEXT,
      FOREIGN KEY (request_id) REFERENCES signature_requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS waiver_templates (
      id TEXT PRIMARY KEY,
      template_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      html_content TEXT NOT NULL,
      jurisdiction TEXT,
      version INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT,
      tenant_id TEXT NOT NULL DEFAULT 'default-tenant'
    );

    CREATE INDEX IF NOT EXISTS idx_template_code ON waiver_templates(template_code);
    CREATE INDEX IF NOT EXISTS idx_wt_tenant ON waiver_templates(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_template_jurisdiction ON waiver_templates(jurisdiction);

    -- Signing packages for multi-party signing
    CREATE TABLE IF NOT EXISTS signing_packages (
      id TEXT PRIMARY KEY,
      package_code TEXT NOT NULL UNIQUE,
      external_ref TEXT,
      external_type TEXT,
      template_code TEXT,
      template_version INTEGER,
      document_name TEXT NOT NULL,
      document_content TEXT,
      jurisdiction TEXT,
      merge_variables TEXT,
      event_date TEXT,
      status TEXT DEFAULT 'pending',
      total_signers INTEGER DEFAULT 0,
      completed_signers INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      completed_at TEXT,
      callback_url TEXT,
      created_by TEXT,
      tenant_id TEXT NOT NULL DEFAULT 'default-tenant'
    );

    CREATE INDEX IF NOT EXISTS idx_pkg_package_code ON signing_packages(package_code);
    CREATE INDEX IF NOT EXISTS idx_sp_tenant ON signing_packages(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_pkg_external_ref ON signing_packages(external_ref);
    CREATE INDEX IF NOT EXISTS idx_pkg_status ON signing_packages(status);

    -- Signing roles within packages
    CREATE TABLE IF NOT EXISTS signing_roles (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL,
      role_name TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_email TEXT,
      signer_phone TEXT,
      date_of_birth TEXT,
      is_minor INTEGER DEFAULT 0,
      is_package_admin INTEGER DEFAULT 0,
      request_id TEXT,
      consolidated_group TEXT,
      status TEXT DEFAULT 'pending',
      signed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (package_id) REFERENCES signing_packages(id) ON DELETE CASCADE,
      FOREIGN KEY (request_id) REFERENCES signature_requests(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_role_package_id ON signing_roles(package_id);
    CREATE INDEX IF NOT EXISTS idx_role_consolidated_group ON signing_roles(consolidated_group);
    CREATE INDEX IF NOT EXISTS idx_role_signer_email ON signing_roles(signer_email);

    -- Jurisdiction addendums
    CREATE TABLE IF NOT EXISTS jurisdiction_addendums (
      id TEXT PRIMARY KEY,
      jurisdiction_code TEXT NOT NULL UNIQUE,
      jurisdiction_name TEXT NOT NULL,
      addendum_html TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      tenant_id TEXT NOT NULL DEFAULT 'default-tenant'
    );

    CREATE INDEX IF NOT EXISTS idx_jurisdiction_code ON jurisdiction_addendums(jurisdiction_code);
    CREATE INDEX IF NOT EXISTS idx_ja_tenant ON jurisdiction_addendums(tenant_id);

    -- API keys for multi-tenant access
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      tenant_name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      permissions TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_api_key ON api_keys(api_key);
    CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
  `);

  // Run migrations for existing databases
  migrateExistingTables(db);

  // Seed default API key
  seedDefaultApiKey(db);
}

function migrateExistingTables(db: Database.Database): void {
  // Check if reference_code column exists, add if not
  const tableInfo = db.prepare("PRAGMA table_info(signature_requests)").all() as Array<{ name: string }>;
  const columns = tableInfo.map(col => col.name);

  if (!columns.includes('reference_code')) {
    db.exec(`ALTER TABLE signature_requests ADD COLUMN reference_code TEXT`);
    // Generate reference codes for existing rows
    const rows = db.prepare("SELECT id FROM signature_requests WHERE reference_code IS NULL").all() as Array<{ id: string }>;
    const updateStmt = db.prepare("UPDATE signature_requests SET reference_code = ? WHERE id = ?");
    for (const row of rows) {
      const refCode = generateReferenceCode();
      updateStmt.run(refCode, row.id);
    }
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_reference_code ON signature_requests(reference_code)`);
  }

  if (!columns.includes('document_category')) {
    db.exec(`ALTER TABLE signature_requests ADD COLUMN document_category TEXT DEFAULT 'other'`);
  }

  if (!columns.includes('document_content_snapshot')) {
    db.exec(`ALTER TABLE signature_requests ADD COLUMN document_content_snapshot TEXT`);
  }

  if (!columns.includes('waiver_template_code')) {
    db.exec(`ALTER TABLE signature_requests ADD COLUMN waiver_template_code TEXT`);
  }

  if (!columns.includes('waiver_template_version')) {
    db.exec(`ALTER TABLE signature_requests ADD COLUMN waiver_template_version INTEGER`);
  }

  if (!columns.includes('merge_variables')) {
    db.exec(`ALTER TABLE signature_requests ADD COLUMN merge_variables TEXT`);
  }

  if (!columns.includes('jurisdiction')) {
    db.exec(`ALTER TABLE signature_requests ADD COLUMN jurisdiction TEXT`);
  }

  if (!columns.includes('metadata')) {
    db.exec(`ALTER TABLE signature_requests ADD COLUMN metadata TEXT`);
  }

  if (!columns.includes('package_id')) {
    db.exec(`ALTER TABLE signature_requests ADD COLUMN package_id TEXT`);
  }

  if (!columns.includes('roles_display')) {
    db.exec(`ALTER TABLE signature_requests ADD COLUMN roles_display TEXT`);
  }

  if (!columns.includes('decline_reason')) {
    db.exec(`ALTER TABLE signature_requests ADD COLUMN decline_reason TEXT`);
  }

  // Migration: Add tenant_id to signature_requests
  if (!columns.includes('tenant_id')) {
    db.exec(`ALTER TABLE signature_requests ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default-tenant'`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sr_tenant ON signature_requests(tenant_id)`);
  }

  // Migration: Add tenant_id to waiver_templates
  const wtTableInfo = db.prepare("PRAGMA table_info(waiver_templates)").all() as Array<{ name: string }>;
  const wtColumns = wtTableInfo.map(col => col.name);
  if (!wtColumns.includes('tenant_id')) {
    db.exec(`ALTER TABLE waiver_templates ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default-tenant'`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_wt_tenant ON waiver_templates(tenant_id)`);
  }

  // Migration: Add tenant_id to jurisdiction_addendums
  const jaTableInfo = db.prepare("PRAGMA table_info(jurisdiction_addendums)").all() as Array<{ name: string }>;
  const jaColumns = jaTableInfo.map(col => col.name);
  if (!jaColumns.includes('tenant_id')) {
    db.exec(`ALTER TABLE jurisdiction_addendums ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default-tenant'`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ja_tenant ON jurisdiction_addendums(tenant_id)`);
  }

  // Migrate signing_packages table
  migratePackagesTables(db);
}

function migratePackagesTables(db: Database.Database): void {
  // Check if signing_packages table exists
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='signing_packages'").all();
  if (tables.length === 0) return;

  // Check for event_date column in signing_packages
  const pkgTableInfo = db.prepare("PRAGMA table_info(signing_packages)").all() as Array<{ name: string }>;
  const pkgColumns = pkgTableInfo.map(col => col.name);

  if (!pkgColumns.includes('event_date')) {
    db.exec(`ALTER TABLE signing_packages ADD COLUMN event_date TEXT`);
  }

  // Check for date_of_birth column in signing_roles
  const rolesTableInfo = db.prepare("PRAGMA table_info(signing_roles)").all() as Array<{ name: string }>;
  const rolesColumns = rolesTableInfo.map(col => col.name);

  if (!rolesColumns.includes('date_of_birth')) {
    db.exec(`ALTER TABLE signing_roles ADD COLUMN date_of_birth TEXT`);
  }

  // Migration 003: Add is_package_admin column to signing_roles
  if (!rolesColumns.includes('is_package_admin')) {
    db.exec(`ALTER TABLE signing_roles ADD COLUMN is_package_admin INTEGER DEFAULT 0`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_package_admin ON signing_roles(package_id, is_package_admin)`);
  }

  // Migration: Add tenant_id to signing_packages
  if (!pkgColumns.includes('tenant_id')) {
    db.exec(`ALTER TABLE signing_packages ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default-tenant'`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sp_tenant ON signing_packages(tenant_id)`);
  }
}

function generateReferenceCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'SIG-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function seedDefaultApiKey(db: Database.Database): void {
  const defaultKey = config.apiKey || 'demo-api-key';
  const existing = db.prepare("SELECT id FROM api_keys WHERE api_key = ?").get(defaultKey) as { id: string } | undefined;
  if (!existing) {
    db.prepare(
      `INSERT INTO api_keys (id, api_key, tenant_id, tenant_name, is_active)
       VALUES (?, ?, 'default-tenant', 'Default Tenant', 1)`
    ).run(uuidv4(), defaultKey);
  }

  // Seed additional API keys from environment
  // Format: TENANT_KEYS=name1:key1,name2:key2
  const tenantKeys = process.env.TENANT_KEYS;
  if (tenantKeys) {
    for (const entry of tenantKeys.split(',')) {
      const [name, key] = entry.split(':');
      if (name && key) {
        const existingKey = db.prepare("SELECT id FROM api_keys WHERE api_key = ?").get(key.trim()) as { id: string } | undefined;
        if (!existingKey) {
          db.prepare(
            `INSERT INTO api_keys (id, api_key, tenant_id, tenant_name, is_active)
             VALUES (?, ?, ?, ?, 1)`
          ).run(uuidv4(), key.trim(), uuidv4(), name.trim());
        }
      }
    }
  }
}

export function closeSqliteDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
