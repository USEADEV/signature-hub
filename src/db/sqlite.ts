import Database from 'better-sqlite3';
import path from 'path';

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
      created_by TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_reference_code ON signature_requests(reference_code);
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
      created_by TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_template_code ON waiver_templates(template_code);
    CREATE INDEX IF NOT EXISTS idx_template_jurisdiction ON waiver_templates(jurisdiction);
  `);

  // Run migrations for existing databases
  migrateExistingTables(db);
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
}

function generateReferenceCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'SIG-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function closeSqliteDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
