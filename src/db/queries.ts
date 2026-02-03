import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { config } from '../config';
import {
  SignatureRequest,
  SignatureToken,
  Signature,
  WaiverTemplate,
  CreateRequestInput,
  CreateTemplateInput,
  UpdateTemplateInput,
  RequestFilters,
  RequestStatus,
} from '../types';

// Import database modules
import { query as mysqlQuery, queryOne as mysqlQueryOne } from './connection';
import { getSqliteDb } from './sqlite';

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function generateReferenceCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'SIG-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(crypto.randomInt(chars.length));
  }
  return code;
}

function generateVerificationCode(): string {
  if (config.demoMode) {
    return config.verification.demoCode;
  }
  const min = Math.pow(10, config.verification.codeLength - 1);
  const max = Math.pow(10, config.verification.codeLength);
  return crypto.randomInt(min, max).toString();
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to prevent timing leak on length check
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Helper for SQLite queries
function sqliteQuery<T>(sql: string, params: unknown[] = []): T[] {
  const db = getSqliteDb();
  const stmt = db.prepare(sql);
  return stmt.all(...params) as T[];
}

function sqliteQueryOne<T>(sql: string, params: unknown[] = []): T | null {
  const results = sqliteQuery<T>(sql, params);
  return results.length > 0 ? results[0] : null;
}

function sqliteRun(sql: string, params: unknown[] = []): void {
  const db = getSqliteDb();
  const stmt = db.prepare(sql);
  stmt.run(...params);
}

// Generic query functions that route to the right DB
async function query<T>(sql: string, params: unknown[] = []): Promise<T> {
  if (config.dbType === 'sqlite') {
    return sqliteQuery<T>(sql.replace(/NOW\(\)/g, "datetime('now')"), params) as T;
  }
  return mysqlQuery<T>(sql, params);
}

async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  if (config.dbType === 'sqlite') {
    return sqliteQueryOne<T>(sql.replace(/NOW\(\)/g, "datetime('now')"), params);
  }
  return mysqlQueryOne<T>(sql, params);
}

async function run(sql: string, params: unknown[] = []): Promise<void> {
  if (config.dbType === 'sqlite') {
    sqliteRun(sql.replace(/NOW\(\)/g, "datetime('now')"), params);
    return;
  }
  await mysqlQuery(sql, params);
}

// HTML escape for XSS prevention in merge variables
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escape regex special characters to prevent ReDoS
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Fields that are trusted HTML and should not be escaped
const HTML_FIELDS = new Set(['jurisdictionAddendum']);

// Template resolution with merge variables
function resolveTemplate(htmlContent: string, mergeVariables?: Record<string, string>): string {
  if (!mergeVariables) return htmlContent;

  let resolved = htmlContent;
  for (const [key, value] of Object.entries(mergeVariables)) {
    const escapedKey = escapeRegex(key);
    const placeholder = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g');
    // Escape HTML in values unless they're known HTML fields
    const safeValue = HTML_FIELDS.has(key) ? value : escapeHtml(value || '');
    resolved = resolved.replace(placeholder, safeValue);
  }
  return resolved;
}

// ============================================
// SIGNATURE REQUESTS
// ============================================

export async function createRequest(input: CreateRequestInput, tenantId: string): Promise<{ request: SignatureRequest; token: SignatureToken }> {
  const requestId = uuidv4();
  const tokenId = uuidv4();
  const token = generateToken();
  const referenceCode = generateReferenceCode();

  const expiresAt = input.expiresAt || new Date(Date.now() + config.request.defaultExpiryDays * 24 * 60 * 60 * 1000);
  const expiresAtStr = expiresAt.toISOString();

  // Resolve document content
  let documentContent = input.documentContent || null;
  let documentContentSnapshot = null;
  let waiverTemplateVersion = null;

  if (input.waiverTemplateCode) {
    const template = await getTemplateByCode(input.waiverTemplateCode, tenantId);
    if (template) {
      documentContent = resolveTemplate(template.html_content, input.mergeVariables);
      documentContentSnapshot = documentContent; // Store the resolved snapshot
      waiverTemplateVersion = template.version;
    }
  } else if (documentContent) {
    // If inline content provided, store snapshot
    documentContentSnapshot = documentContent;
  }

  await run(
    `INSERT INTO signature_requests
     (id, reference_code, external_ref, external_type, document_category, document_name,
      document_content, document_content_snapshot, document_url, waiver_template_code,
      waiver_template_version, merge_variables, jurisdiction, metadata, signer_name,
      signer_email, signer_phone, verification_method, status, expires_at, callback_url, created_by, tenant_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    [
      requestId,
      referenceCode,
      input.externalRef || null,
      input.externalType || null,
      input.documentCategory || 'other',
      input.documentName,
      documentContent,
      documentContentSnapshot,
      input.documentUrl || null,
      input.waiverTemplateCode || null,
      waiverTemplateVersion,
      input.mergeVariables ? JSON.stringify(input.mergeVariables) : null,
      input.jurisdiction || null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.signerName,
      input.signerEmail || null,
      input.signerPhone || null,
      input.verificationMethod || 'email',
      expiresAtStr,
      input.callbackUrl || null,
      input.createdBy || null,
      tenantId,
    ]
  );

  await run(
    `INSERT INTO signature_tokens (id, request_id, token) VALUES (?, ?, ?)`,
    [tokenId, requestId, token]
  );

  const request = await getRequestById(requestId);
  const tokenRecord = await getTokenByRequestId(requestId);

  return { request: request!, token: tokenRecord! };
}

export async function getRequestById(id: string, tenantId?: string): Promise<SignatureRequest | null> {
  if (tenantId) {
    return queryOne<SignatureRequest>(
      `SELECT * FROM signature_requests WHERE id = ? AND tenant_id = ?`,
      [id, tenantId]
    );
  }
  return queryOne<SignatureRequest>(
    `SELECT * FROM signature_requests WHERE id = ?`,
    [id]
  );
}

export async function getRequestByReferenceCode(referenceCode: string, tenantId: string): Promise<SignatureRequest | null> {
  return queryOne<SignatureRequest>(
    `SELECT * FROM signature_requests WHERE reference_code = ? AND tenant_id = ?`,
    [referenceCode, tenantId]
  );
}

export async function getRequestByToken(token: string): Promise<SignatureRequest | null> {
  return queryOne<SignatureRequest>(
    `SELECT r.* FROM signature_requests r
     JOIN signature_tokens t ON t.request_id = r.id
     WHERE t.token = ?`,
    [token]
  );
}

export async function updateRequestStatus(id: string, status: RequestStatus, tenantId?: string): Promise<void> {
  if (tenantId) {
    if (status === 'signed') {
      await run(
        `UPDATE signature_requests SET status = ?, signed_at = NOW() WHERE id = ? AND tenant_id = ?`,
        [status, id, tenantId]
      );
    } else {
      await run(
        `UPDATE signature_requests SET status = ? WHERE id = ? AND tenant_id = ?`,
        [status, id, tenantId]
      );
    }
  } else {
    if (status === 'signed') {
      await run(
        `UPDATE signature_requests SET status = ?, signed_at = NOW() WHERE id = ?`,
        [status, id]
      );
    } else {
      await run(
        `UPDATE signature_requests SET status = ? WHERE id = ?`,
        [status, id]
      );
    }
  }
}

export async function listRequests(filters: RequestFilters, tenantId: string): Promise<SignatureRequest[]> {
  const conditions: string[] = ['tenant_id = ?'];
  const params: unknown[] = [tenantId];

  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.referenceCode) {
    conditions.push('reference_code = ?');
    params.push(filters.referenceCode);
  }
  if (filters.externalRef) {
    conditions.push('external_ref = ?');
    params.push(filters.externalRef);
  }
  if (filters.externalType) {
    conditions.push('external_type = ?');
    params.push(filters.externalType);
  }
  if (filters.signerEmail) {
    conditions.push('signer_email = ?');
    params.push(filters.signerEmail);
  }
  if (filters.createdBy) {
    conditions.push('created_by = ?');
    params.push(filters.createdBy);
  }
  if (filters.jurisdiction) {
    conditions.push('jurisdiction = ?');
    params.push(filters.jurisdiction);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;

  return query<SignatureRequest[]>(
    `SELECT * FROM signature_requests ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
}

export async function deleteRequest(id: string, tenantId: string): Promise<boolean> {
  if (config.dbType === 'sqlite') {
    const db = getSqliteDb();
    const result = db.prepare('DELETE FROM signature_requests WHERE id = ? AND tenant_id = ?').run(id, tenantId);
    return result.changes > 0;
  }
  const result = await mysqlQuery<{ affectedRows: number }>(
    `DELETE FROM signature_requests WHERE id = ? AND tenant_id = ?`,
    [id, tenantId]
  );
  return result.affectedRows > 0;
}

// ============================================
// SIGNATURE TOKENS
// ============================================

export async function getTokenByRequestId(requestId: string): Promise<SignatureToken | null> {
  const token = await queryOne<SignatureToken>(
    `SELECT * FROM signature_tokens WHERE request_id = ?`,
    [requestId]
  );
  if (token && config.dbType === 'sqlite') {
    token.is_verified = Boolean(token.is_verified);
  }
  return token;
}

export async function getTokenByValue(token: string): Promise<SignatureToken | null> {
  const result = await queryOne<SignatureToken>(
    `SELECT * FROM signature_tokens WHERE token = ?`,
    [token]
  );
  if (result && config.dbType === 'sqlite') {
    result.is_verified = Boolean(result.is_verified);
  }
  return result;
}

export async function setVerificationCode(tokenId: string): Promise<string> {
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + config.verification.codeExpiryMinutes * 60 * 1000);

  await run(
    `UPDATE signature_tokens
     SET verification_code = ?, code_expires_at = ?, code_attempts = 0
     WHERE id = ?`,
    [code, expiresAt.toISOString(), tokenId]
  );

  return code;
}

export async function verifyCode(tokenId: string, code: string): Promise<{ success: boolean; error?: string }> {
  const token = await queryOne<SignatureToken>(
    `SELECT * FROM signature_tokens WHERE id = ?`,
    [tokenId]
  );

  if (!token) {
    return { success: false, error: 'Token not found' };
  }

  const isVerified = config.dbType === 'sqlite' ? Boolean(token.is_verified) : token.is_verified;

  if (isVerified) {
    return { success: true };
  }

  if (token.code_attempts >= config.verification.maxAttempts) {
    return { success: false, error: 'Too many attempts. Please request a new code.' };
  }

  await run(
    `UPDATE signature_tokens SET code_attempts = code_attempts + 1 WHERE id = ?`,
    [tokenId]
  );

  if (!token.verification_code || !token.code_expires_at) {
    return { success: false, error: 'No verification code sent' };
  }

  if (new Date() > new Date(token.code_expires_at)) {
    return { success: false, error: 'Verification code expired' };
  }

  if (!constantTimeCompare(token.verification_code, code)) {
    return { success: false, error: 'Invalid verification code' };
  }

  await run(
    `UPDATE signature_tokens SET is_verified = 1, verified_at = NOW() WHERE id = ?`,
    [tokenId]
  );

  return { success: true };
}

// ============================================
// SIGNATURES
// ============================================

export async function createSignature(
  requestId: string,
  signatureType: 'typed' | 'drawn',
  typedName: string | undefined,
  signatureImage: string | undefined,
  signerIp: string,
  userAgent: string,
  verificationMethodUsed: string,
  consentText: string
): Promise<Signature> {
  const id = uuidv4();

  await run(
    `INSERT INTO signatures
     (id, request_id, signature_type, typed_name, signature_image, signer_ip, user_agent, verification_method_used, consent_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, requestId, signatureType, typedName || null, signatureImage || null, signerIp, userAgent, verificationMethodUsed, consentText]
  );

  await updateRequestStatus(requestId, 'signed');

  return (await getSignatureByRequestId(requestId))!;
}

export async function getSignatureByRequestId(requestId: string): Promise<Signature | null> {
  return queryOne<Signature>(
    `SELECT * FROM signatures WHERE request_id = ?`,
    [requestId]
  );
}

// ============================================
// WAIVER TEMPLATES
// ============================================

export async function createTemplate(input: CreateTemplateInput, tenantId: string): Promise<WaiverTemplate> {
  const id = uuidv4();

  await run(
    `INSERT INTO waiver_templates
     (id, template_code, name, description, html_content, jurisdiction, version, is_active, created_by, tenant_id)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
    [
      id,
      input.templateCode,
      input.name,
      input.description || null,
      input.htmlContent,
      input.jurisdiction || null,
      input.createdBy || null,
      tenantId,
    ]
  );

  return (await getTemplateByCode(input.templateCode, tenantId))!;
}

export async function getTemplateByCode(templateCode: string, tenantId?: string): Promise<WaiverTemplate | null> {
  let template: WaiverTemplate | null;
  if (tenantId) {
    template = await queryOne<WaiverTemplate>(
      `SELECT * FROM waiver_templates WHERE template_code = ? AND is_active = 1 AND tenant_id = ?`,
      [templateCode, tenantId]
    );
  } else {
    template = await queryOne<WaiverTemplate>(
      `SELECT * FROM waiver_templates WHERE template_code = ? AND is_active = 1`,
      [templateCode]
    );
  }
  if (template && config.dbType === 'sqlite') {
    template.is_active = Boolean(template.is_active);
  }
  return template;
}

export async function getTemplateById(id: string, tenantId: string): Promise<WaiverTemplate | null> {
  const template = await queryOne<WaiverTemplate>(
    `SELECT * FROM waiver_templates WHERE id = ? AND tenant_id = ?`,
    [id, tenantId]
  );
  if (template && config.dbType === 'sqlite') {
    template.is_active = Boolean(template.is_active);
  }
  return template;
}

export async function updateTemplate(templateCode: string, input: UpdateTemplateInput, tenantId: string): Promise<WaiverTemplate | null> {
  const existing = await getTemplateByCode(templateCode, tenantId);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    params.push(input.name);
  }
  if (input.description !== undefined) {
    updates.push('description = ?');
    params.push(input.description);
  }
  if (input.htmlContent !== undefined) {
    updates.push('html_content = ?');
    updates.push('version = version + 1');
    params.push(input.htmlContent);
  }
  if (input.jurisdiction !== undefined) {
    updates.push('jurisdiction = ?');
    params.push(input.jurisdiction);
  }
  if (input.isActive !== undefined) {
    updates.push('is_active = ?');
    params.push(input.isActive ? 1 : 0);
  }

  updates.push("updated_at = datetime('now')");

  if (updates.length === 1) {
    return existing; // Only updated_at, no real changes
  }

  params.push(templateCode, tenantId);

  await run(
    `UPDATE waiver_templates SET ${updates.join(', ')} WHERE template_code = ? AND tenant_id = ?`,
    params
  );

  return getTemplateByCode(templateCode, tenantId);
}

export async function listTemplates(jurisdiction: string | undefined, tenantId: string): Promise<WaiverTemplate[]> {
  let sql = 'SELECT * FROM waiver_templates WHERE is_active = 1 AND tenant_id = ?';
  const params: unknown[] = [tenantId];

  if (jurisdiction) {
    sql += ' AND (jurisdiction = ? OR jurisdiction IS NULL)';
    params.push(jurisdiction);
  }

  sql += ' ORDER BY name ASC';

  const templates = await query<WaiverTemplate[]>(sql, params);
  if (config.dbType === 'sqlite') {
    return templates.map(t => ({ ...t, is_active: Boolean(t.is_active) }));
  }
  return templates;
}

export async function updateRequestDeclined(id: string, declineReason?: string): Promise<void> {
  await run(
    `UPDATE signature_requests SET status = 'declined', decline_reason = ? WHERE id = ? AND status NOT IN ('signed', 'expired', 'cancelled', 'declined')`,
    [declineReason || null, id]
  );
}

export async function updateSigningRolesStatusByRequestId(requestId: string, status: string): Promise<void> {
  await run(
    `UPDATE signing_roles SET status = ? WHERE request_id = ?`,
    [status, requestId]
  );
}

export async function getExpiredRequests(): Promise<SignatureRequest[]> {
  return query<SignatureRequest[]>(
    `SELECT * FROM signature_requests
     WHERE expires_at < NOW()
     AND status NOT IN ('signed', 'expired', 'cancelled', 'declined')`,
    []
  );
}

export async function deleteTemplate(templateCode: string, tenantId: string): Promise<boolean> {
  // Soft delete by marking inactive
  await run(
    `UPDATE waiver_templates SET is_active = 0, updated_at = datetime('now') WHERE template_code = ? AND tenant_id = ?`,
    [templateCode, tenantId]
  );
  return true;
}
