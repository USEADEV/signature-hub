import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import {
  SigningPackage,
  SigningRole,
  CreatePackageInput,
  CreatePackageResponse,
  ConsolidatedSigner,
  PackageStatusResponse,
  BatchPackageResponse,
  SignerInput,
  PackageStatus,
  JurisdictionAddendum,
  RoleAgeRequirement,
  ReplaceSignerInput,
  ReplaceSignerResponse,
  VerificationMethod,
} from '../types';
import { createRequest, getTemplateByCode, getRequestById, getTokenByRequestId, updateRequestStatus } from '../db/queries';
import { getSqliteDb } from '../db/sqlite';
import { sendSignatureRequestEmail } from './email';
import { sendSignatureRequestSms as sendSmsTwilio } from './twilio';
import { sendSignatureRequestSms as sendSmsMandrill } from './mandrill-sms';

// Select SMS provider based on config
const sendSignatureRequestSms = config.smsProvider === 'mandrill' ? sendSmsMandrill : sendSmsTwilio;

// Default role age requirements
// These can be overridden via configuration or API
const DEFAULT_ROLE_AGE_REQUIREMENTS: RoleAgeRequirement[] = [
  { role: 'rider', minimumAge: 0 },       // Any age (minors need guardian)
  { role: 'owner', minimumAge: 0 },       // Any age
  { role: 'trainer', minimumAge: 18 },    // Must be 18+
  { role: 'coach', minimumAge: 18 },      // Must be 18+
  { role: 'guardian', minimumAge: 18 },   // Must be 18+
  { role: 'other', minimumAge: 0 },       // Any age by default
];

// Calculate age at a given date
function calculateAgeAtDate(dateOfBirth: string, targetDate: string): number {
  const dob = new Date(dateOfBirth);
  const target = new Date(targetDate);

  let age = target.getFullYear() - dob.getFullYear();
  const monthDiff = target.getMonth() - dob.getMonth();

  // Adjust age if birthday hasn't occurred yet in the target year
  if (monthDiff < 0 || (monthDiff === 0 && target.getDate() < dob.getDate())) {
    age--;
  }

  return age;
}

// Validate signer ages against role requirements
function validateSignerAges(
  signers: SignerInput[],
  eventDate: string | undefined,
  roleRequirements: RoleAgeRequirement[] = DEFAULT_ROLE_AGE_REQUIREMENTS
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // If no event date provided, use current date
  const targetDate = eventDate || new Date().toISOString().split('T')[0];

  for (const signer of signers) {
    // Find age requirement for this role
    const requirement = roleRequirements.find(r => r.role.toLowerCase() === signer.role.toLowerCase());
    const minimumAge = requirement?.minimumAge ?? 0;

    if (minimumAge > 0) {
      if (!signer.dateOfBirth) {
        errors.push(`Date of birth is required for ${signer.name} (${signer.role}) - role requires minimum age of ${minimumAge}`);
        continue;
      }

      const ageAtEvent = calculateAgeAtDate(signer.dateOfBirth, targetDate);

      if (ageAtEvent < minimumAge) {
        errors.push(
          `${signer.name} will be ${ageAtEvent} years old on ${targetDate} but ${signer.role} requires minimum age of ${minimumAge}`
        );
      }
    }

    // Auto-detect minor status based on age if DOB is provided
    if (signer.dateOfBirth) {
      const ageAtEvent = calculateAgeAtDate(signer.dateOfBirth, targetDate);
      if (ageAtEvent < 18 && signer.isMinor === undefined) {
        signer.isMinor = true;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// Export for use in API validation
export function getRoleAgeRequirements(): RoleAgeRequirement[] {
  return [...DEFAULT_ROLE_AGE_REQUIREMENTS];
}

// Validate that exactly one signer (or consolidated group) is designated as package admin
function validatePackageAdmin(signers: SignerInput[]): { valid: boolean; error?: string } {
  const admins = signers.filter(s => s.isPackageAdmin);

  if (admins.length === 0) {
    // Auto-assign first signer as admin if none specified
    return { valid: true };
  }

  if (admins.length > 1) {
    // Check if all admins share the same email (will be consolidated)
    const adminEmails = new Set(admins.map(a => a.email?.toLowerCase()).filter(Boolean));
    const adminPhones = new Set(admins.map(a => a.phone).filter(Boolean));

    // If they all share the same email or phone, they'll be consolidated into one signer
    if (adminEmails.size <= 1 && adminPhones.size <= 1) {
      return { valid: true };
    }

    return {
      valid: false,
      error: 'Only one person can be designated as package admin. Multiple admins found with different contact info.'
    };
  }

  return { valid: true };
}

// Helper functions for database operations
function generatePackageCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PKG-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

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

// Resolve template variables
function resolveTemplate(htmlContent: string, mergeVariables?: Record<string, string>): string {
  if (!mergeVariables) return htmlContent;

  let resolved = htmlContent;
  for (const [key, value] of Object.entries(mergeVariables)) {
    const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    resolved = resolved.replace(placeholder, value || '');
  }
  return resolved;
}

// Build automatic signer variables
function buildSignerVariables(
  signer: SignerInput,
  roles: string[],
  eventDate?: string
): Record<string, string> {
  const vars: Record<string, string> = {
    signerName: signer.name,
    signerEmail: signer.email || '',
    signerPhone: signer.phone || '',
    signerRoles: roles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', '),
    signerRolesList: roles.join(', '),
  };

  // Add age at event if DOB and event date provided
  if (signer.dateOfBirth && eventDate) {
    const age = calculateAgeAtDate(signer.dateOfBirth, eventDate);
    vars.signerAge = age.toString();
    vars.signerIsMinor = age < 18 ? 'Yes' : 'No';
  }

  return vars;
}

// Get jurisdiction addendum if available
export async function getJurisdictionAddendum(jurisdictionCode: string, tenantId?: string): Promise<JurisdictionAddendum | null> {
  if (tenantId) {
    return sqliteQueryOne<JurisdictionAddendum>(
      `SELECT * FROM jurisdiction_addendums WHERE jurisdiction_code = ? AND is_active = 1 AND tenant_id = ?`,
      [jurisdictionCode, tenantId]
    );
  }
  return sqliteQueryOne<JurisdictionAddendum>(
    `SELECT * FROM jurisdiction_addendums WHERE jurisdiction_code = ? AND is_active = 1`,
    [jurisdictionCode]
  );
}

// Auto-detect verification method based on available contact info
function detectVerificationMethod(email?: string, phone?: string): VerificationMethod {
  const hasEmail = email && email.includes('@');
  const hasPhone = phone && phone.length >= 10;

  if (hasEmail && hasPhone) {
    return 'both';
  } else if (hasEmail) {
    return 'email';
  } else if (hasPhone) {
    return 'sms';
  }
  // Default to email if nothing valid (validation will catch this later)
  return 'email';
}

// Consolidate signers by email/phone - same person with multiple roles gets one signature request
function consolidateSigners(signers: SignerInput[]): Map<string, SignerInput[]> {
  const consolidated = new Map<string, SignerInput[]>();

  for (const signer of signers) {
    // Use email as primary key, fallback to phone, fallback to name
    const key = signer.email?.toLowerCase() || signer.phone || signer.name.toLowerCase();

    if (consolidated.has(key)) {
      consolidated.get(key)!.push(signer);
    } else {
      consolidated.set(key, [signer]);
    }
  }

  return consolidated;
}

// Create a signing package with multiple signers
export async function createPackage(input: CreatePackageInput, tenantId: string): Promise<CreatePackageResponse> {
  // Validate signer ages against role requirements
  const ageValidation = validateSignerAges(input.signers, input.eventDate);
  if (!ageValidation.valid) {
    throw new Error(`Age validation failed: ${ageValidation.errors.join('; ')}`);
  }

  // Validate package admin designation
  const adminValidation = validatePackageAdmin(input.signers);
  if (!adminValidation.valid) {
    throw new Error(adminValidation.error!);
  }

  // Auto-assign first signer as package admin if none specified
  const hasAdmin = input.signers.some(s => s.isPackageAdmin);
  if (!hasAdmin && input.signers.length > 0) {
    input.signers[0].isPackageAdmin = true;
  }

  const packageId = uuidv4();
  const packageCode = generatePackageCode();

  // Build base merge variables including jurisdiction
  const baseMergeVariables: Record<string, string> = { ...input.mergeVariables };

  // Get jurisdiction addendum and add as merge variable
  let jurisdictionAddendumHtml = '';
  if (input.jurisdiction) {
    const addendum = await getJurisdictionAddendum(input.jurisdiction, tenantId);
    if (addendum) {
      jurisdictionAddendumHtml = `<div class="jurisdiction-addendum">\n<h4>${addendum.jurisdiction_name} Legal Notice</h4>\n${addendum.addendum_html}\n</div>`;
      baseMergeVariables.jurisdictionAddendum = jurisdictionAddendumHtml;
      baseMergeVariables.jurisdictionName = addendum.jurisdiction_name;
      baseMergeVariables.jurisdictionCode = input.jurisdiction;
    }
  }

  // Resolve base document content (without signer-specific variables)
  let baseDocumentContent = input.documentContent || '';
  let documentName = input.documentName || '';
  let templateVersion: number | null = null;

  if (input.templateCode) {
    const template = await getTemplateByCode(input.templateCode, tenantId);
    if (template) {
      baseDocumentContent = template.html_content;
      documentName = documentName || template.name;
      templateVersion = template.version;
    }
  }

  // Resolve base template with package-level variables (not signer-specific yet)
  baseDocumentContent = resolveTemplate(baseDocumentContent, baseMergeVariables);

  // If jurisdiction addendum wasn't used as a variable, append it at the end
  if (jurisdictionAddendumHtml && !input.documentContent?.includes('{{jurisdictionAddendum}}') &&
      !(input.templateCode && baseDocumentContent.includes(jurisdictionAddendumHtml) === false)) {
    // Only append if it wasn't already included via the variable
    const hasJurisdictionVar = (input.documentContent || '').includes('{{jurisdictionAddendum}}');
    if (!hasJurisdictionVar && input.templateCode) {
      // Check if template had the variable
      const template = await getTemplateByCode(input.templateCode, tenantId);
      if (template && !template.html_content.includes('{{jurisdictionAddendum}}')) {
        baseDocumentContent += `\n${jurisdictionAddendumHtml}`;
      }
    } else if (!hasJurisdictionVar) {
      baseDocumentContent += `\n${jurisdictionAddendumHtml}`;
    }
  }

  const expiresAt = input.expiresAt || new Date(Date.now() + config.request.defaultExpiryDays * 24 * 60 * 60 * 1000);

  // Consolidate signers
  const consolidatedMap = consolidateSigners(input.signers);
  const totalUniqueSigners = consolidatedMap.size;

  // Create the package (store base content without signer-specific variables)
  sqliteRun(
    `INSERT INTO signing_packages
     (id, package_code, external_ref, external_type, template_code, template_version,
      document_name, document_content, jurisdiction, merge_variables, event_date, status,
      total_signers, completed_signers, expires_at, callback_url, created_by, tenant_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, ?, ?, ?, ?)`,
    [
      packageId,
      packageCode,
      input.externalRef || null,
      input.externalType || null,
      input.templateCode || null,
      templateVersion,
      documentName,
      baseDocumentContent,
      input.jurisdiction || null,
      input.mergeVariables ? JSON.stringify(input.mergeVariables) : null,
      input.eventDate || null,
      totalUniqueSigners,
      expiresAt.toISOString(),
      input.callbackUrl || null,
      input.createdBy || null,
      tenantId,
    ]
  );

  // Create signature requests and roles for each consolidated signer
  const signatureRequests: { requestId: string; signerName: string; roles: string[]; signUrl: string; isPackageAdmin: boolean }[] = [];

  for (const [, signerGroup] of consolidatedMap) {
    const primarySigner = signerGroup[0];
    const roles = signerGroup.map(s => s.role);
    const consolidatedGroupId = uuidv4();

    // Build signer-specific variables and resolve them in the document
    const signerVariables = buildSignerVariables(primarySigner, roles, input.eventDate);
    const signerDocumentContent = resolveTemplate(baseDocumentContent, signerVariables);

    // Auto-detect verification method based on available contact info
    const signerVerificationMethod = detectVerificationMethod(primarySigner.email, primarySigner.phone);

    // Validate signer has at least one contact method
    if (signerVerificationMethod === 'email' && !primarySigner.email) {
      throw new Error(`Signer ${primarySigner.name} must have either a valid email or phone number`);
    }

    // Create a single signature request for this consolidated signer
    const { request, token } = await createRequest({
      documentName,
      documentContent: signerDocumentContent,
      signerName: primarySigner.name,
      signerEmail: primarySigner.email,
      signerPhone: primarySigner.phone,
      verificationMethod: signerVerificationMethod,
      expiresAt,
      externalRef: input.externalRef,
      externalType: input.externalType,
      jurisdiction: input.jurisdiction,
      callbackUrl: input.callbackUrl,
      createdBy: input.createdBy,
    }, tenantId);

    // Update the request with package info and roles
    sqliteRun(
      `UPDATE signature_requests SET package_id = ?, roles_display = ? WHERE id = ?`,
      [packageId, roles.join(', '), request.id]
    );

    // Check if any signer in this group is a package admin
    const isGroupAdmin = signerGroup.some(s => s.isPackageAdmin);

    // Create role records for each role this signer has
    for (const signer of signerGroup) {
      const roleId = uuidv4();
      sqliteRun(
        `INSERT INTO signing_roles
         (id, package_id, role_name, signer_name, signer_email, signer_phone,
          date_of_birth, is_minor, is_package_admin, request_id, consolidated_group, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent')`,
        [
          roleId,
          packageId,
          signer.role,
          signer.name,
          signer.email || null,
          signer.phone || null,
          signer.dateOfBirth || null,
          signer.isMinor ? 1 : 0,
          isGroupAdmin ? 1 : 0,
          request.id,
          consolidatedGroupId,
        ]
      );
    }

    const signUrl = `${config.baseUrl}/sign/${token.token}`;

    // Send notification to signer (skip in demo mode)
    if (!config.demoMode) {
      if (config.testMode) {
        console.log(`[TEST MODE] Package notification for "${documentName}" to ${primarySigner.name} redirected to test accounts`);
      }

      let notificationSent = false;

      if (primarySigner.email && (signerVerificationMethod === 'email' || signerVerificationMethod === 'both')) {
        try {
          await sendSignatureRequestEmail(
            primarySigner.email,
            primarySigner.name,
            documentName,
            signUrl
          );
          notificationSent = true;
        } catch (error) {
          console.error(`Failed to send email notification to ${primarySigner.name}:`, error);
        }
      }

      if (primarySigner.phone && (signerVerificationMethod === 'sms' || signerVerificationMethod === 'both')) {
        try {
          await sendSignatureRequestSms(
            primarySigner.phone,
            primarySigner.name,
            documentName,
            signUrl
          );
          notificationSent = true;
        } catch (error) {
          console.error(`Failed to send SMS notification to ${primarySigner.name}:`, error);
        }
      }

      if (notificationSent) {
        await updateRequestStatus(request.id, 'sent');
      }
    }

    signatureRequests.push({
      requestId: request.id,
      signerName: primarySigner.name,
      roles,
      signUrl,
      isPackageAdmin: isGroupAdmin,
    });
  }

  // Update package status to 'pending' (all requests created)
  sqliteRun(
    `UPDATE signing_packages SET status = 'pending' WHERE id = ?`,
    [packageId]
  );

  return {
    packageId,
    packageCode,
    status: 'pending',
    documentName,
    eventDate: input.eventDate,
    totalSigners: totalUniqueSigners,
    signatureRequests,
    expiresAt,
  };
}

// Get package by ID
export async function getPackageById(id: string, tenantId?: string): Promise<SigningPackage | null> {
  if (tenantId) {
    return sqliteQueryOne<SigningPackage>(
      `SELECT * FROM signing_packages WHERE id = ? AND tenant_id = ?`,
      [id, tenantId]
    );
  }
  return sqliteQueryOne<SigningPackage>(
    `SELECT * FROM signing_packages WHERE id = ?`,
    [id]
  );
}

// Get package by code
export async function getPackageByCode(packageCode: string, tenantId?: string): Promise<SigningPackage | null> {
  if (tenantId) {
    return sqliteQueryOne<SigningPackage>(
      `SELECT * FROM signing_packages WHERE package_code = ? AND tenant_id = ?`,
      [packageCode, tenantId]
    );
  }
  return sqliteQueryOne<SigningPackage>(
    `SELECT * FROM signing_packages WHERE package_code = ?`,
    [packageCode]
  );
}

// Get roles for a package
export async function getPackageRoles(packageId: string): Promise<SigningRole[]> {
  const roles = sqliteQuery<SigningRole>(
    `SELECT * FROM signing_roles WHERE package_id = ? ORDER BY role_name`,
    [packageId]
  );
  return roles.map(r => ({
    ...r,
    is_minor: Boolean(r.is_minor),
    is_package_admin: Boolean(r.is_package_admin),
  }));
}

// Get package status with all signer details
export async function getPackageStatus(packageId: string, tenantId?: string): Promise<PackageStatusResponse | null> {
  const pkg = await getPackageById(packageId, tenantId);
  if (!pkg) return null;

  const roles = await getPackageRoles(packageId);

  // Group roles by consolidated_group to get unique signers
  const signerGroups = new Map<string, SigningRole[]>();
  for (const role of roles) {
    const groupKey = role.consolidated_group || role.id;
    if (signerGroups.has(groupKey)) {
      signerGroups.get(groupKey)!.push(role);
    } else {
      signerGroups.set(groupKey, [role]);
    }
  }

  // Build consolidated signer list
  const signers: ConsolidatedSigner[] = [];
  for (const [, roleGroup] of signerGroups) {
    const primaryRole = roleGroup[0];
    const rolesWithIds = roleGroup.map(r => ({ roleId: r.id, roleName: r.role_name }));

    // Get sign URL from request
    let signUrl = '';
    if (primaryRole.request_id) {
      const token = await getTokenByRequestId(primaryRole.request_id);
      if (token) {
        signUrl = `${config.baseUrl}/sign/${token.token}`;
      }
    }

    // Determine status - signed if any role in group is signed
    const isSigned = roleGroup.some(r => r.status === 'signed');

    // Check if any role in this group is a package admin
    const isPackageAdmin = roleGroup.some(r => r.is_package_admin);

    signers.push({
      email: primaryRole.signer_email,
      phone: primaryRole.signer_phone,
      name: primaryRole.signer_name,
      roles: rolesWithIds,
      signUrl,
      requestId: primaryRole.request_id || '',
      status: isSigned ? 'signed' : primaryRole.status,
      isPackageAdmin,
    });
  }

  return {
    packageId: pkg.id,
    packageCode: pkg.package_code,
    externalRef: pkg.external_ref,
    externalType: pkg.external_type,
    documentName: pkg.document_name,
    jurisdiction: pkg.jurisdiction,
    status: pkg.status,
    totalSigners: pkg.total_signers,
    completedSigners: pkg.completed_signers,
    createdAt: pkg.created_at,
    expiresAt: pkg.expires_at,
    completedAt: pkg.completed_at,
    signers,
  };
}

// Get package status for multiple packages at once
export async function getPackageStatusBatch(
  ids: string[],
  tenantId?: string
): Promise<BatchPackageResponse> {
  const results: PackageStatusResponse[] = [];
  const notFound: string[] = [];

  for (const id of ids) {
    // Dual resolution: try by ID first, then by code (mirrors single endpoint)
    let pkg = await getPackageById(id, tenantId);
    if (!pkg) {
      pkg = await getPackageByCode(id, tenantId);
    }

    if (!pkg) {
      notFound.push(id);
      continue;
    }

    const status = await getPackageStatus(pkg.id, tenantId);
    if (status) {
      results.push(status);
    } else {
      notFound.push(id);
    }
  }

  return { results, notFound };
}

// Update package when a signature is completed
export async function onSignatureCompleted(requestId: string): Promise<void> {
  // Check if this request is part of a package
  const request = await getRequestById(requestId);
  if (!request?.package_id) return;

  const packageId = request.package_id;

  // Update all roles associated with this request
  sqliteRun(
    `UPDATE signing_roles SET status = 'signed', signed_at = datetime('now') WHERE request_id = ?`,
    [requestId]
  );

  // Count completed unique signers (by consolidated_group)
  const completedGroups = sqliteQuery<{ count: number }>(
    `SELECT COUNT(DISTINCT consolidated_group) as count
     FROM signing_roles
     WHERE package_id = ? AND status = 'signed'`,
    [packageId]
  );
  const completedCount = completedGroups[0]?.count || 0;

  // Get total signers
  const pkg = await getPackageById(packageId);
  if (!pkg) return;

  // Update package
  const newStatus: PackageStatus = completedCount >= pkg.total_signers ? 'complete' : 'partial';
  const completedAt = newStatus === 'complete' ? new Date().toISOString() : null;

  sqliteRun(
    `UPDATE signing_packages
     SET completed_signers = ?, status = ?, completed_at = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [completedCount, newStatus, completedAt, packageId]
  );

  // TODO: Send package webhook if callback_url is set
}

// List packages with optional filters
export async function listPackages(filters: {
  status?: PackageStatus;
  externalRef?: string;
  limit?: number;
  offset?: number;
} | undefined, tenantId: string): Promise<SigningPackage[]> {
  const conditions: string[] = ['tenant_id = ?'];
  const params: unknown[] = [tenantId];

  if (filters?.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters?.externalRef) {
    conditions.push('external_ref = ?');
    params.push(filters.externalRef);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters?.limit || 100;
  const offset = filters?.offset || 0;

  return sqliteQuery<SigningPackage>(
    `SELECT * FROM signing_packages ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
}

// Create or update jurisdiction addendum
export async function upsertJurisdictionAddendum(
  jurisdictionCode: string,
  jurisdictionName: string,
  addendumHtml: string,
  tenantId: string
): Promise<JurisdictionAddendum> {
  const existing = await getJurisdictionAddendum(jurisdictionCode, tenantId);

  if (existing) {
    sqliteRun(
      `UPDATE jurisdiction_addendums
       SET jurisdiction_name = ?, addendum_html = ?, updated_at = datetime('now')
       WHERE jurisdiction_code = ? AND tenant_id = ?`,
      [jurisdictionName, addendumHtml, jurisdictionCode, tenantId]
    );
  } else {
    const id = uuidv4();
    sqliteRun(
      `INSERT INTO jurisdiction_addendums (id, jurisdiction_code, jurisdiction_name, addendum_html, tenant_id)
       VALUES (?, ?, ?, ?, ?)`,
      [id, jurisdictionCode, jurisdictionName, addendumHtml, tenantId]
    );
  }

  return (await getJurisdictionAddendum(jurisdictionCode, tenantId))!;
}

// List jurisdiction addendums
export async function listJurisdictions(tenantId: string): Promise<JurisdictionAddendum[]> {
  const addendums = sqliteQuery<JurisdictionAddendum>(
    `SELECT * FROM jurisdiction_addendums WHERE is_active = 1 AND tenant_id = ? ORDER BY jurisdiction_name`,
    [tenantId]
  );
  return addendums.map(a => ({
    ...a,
    is_active: Boolean(a.is_active),
  }));
}

// Get a specific role by ID
export async function getRoleById(roleId: string): Promise<SigningRole | null> {
  const role = sqliteQueryOne<SigningRole>(
    `SELECT * FROM signing_roles WHERE id = ?`,
    [roleId]
  );
  return role ? {
    ...role,
    is_minor: Boolean(role.is_minor),
    is_package_admin: Boolean(role.is_package_admin),
  } : null;
}

// Replace a signer in a package (before they've signed)
export async function replaceSigner(
  packageId: string,
  roleId: string,
  input: ReplaceSignerInput,
  tenantId: string
): Promise<ReplaceSignerResponse> {
  // Get the package
  const pkg = await getPackageById(packageId, tenantId);
  if (!pkg) {
    throw new Error('Package not found');
  }

  // Check package status - can't replace signers on completed/cancelled packages
  if (pkg.status === 'complete' || pkg.status === 'cancelled') {
    throw new Error(`Cannot replace signer on a ${pkg.status} package`);
  }

  // Get the role
  const role = await getRoleById(roleId);
  if (!role) {
    throw new Error('Role not found');
  }

  // Verify the role belongs to this package
  if (role.package_id !== pkg.id) {
    throw new Error('Role does not belong to this package');
  }

  // Check if role has already been signed
  if (role.status === 'signed') {
    throw new Error(`Cannot replace signer - ${role.signer_name} has already signed as ${role.role_name}`);
  }

  // Validate new signer has at least one contact method and auto-detect verification
  if (!input.email && !input.phone) {
    throw new Error('New signer must have either email or phone');
  }
  const verificationMethod = detectVerificationMethod(input.email, input.phone);

  const previousSigner = role.signer_name;

  // Check if there are other roles with the same consolidated_group
  // If so, we need to handle them together
  const consolidatedRoles = sqliteQuery<SigningRole>(
    `SELECT * FROM signing_roles WHERE consolidated_group = ? AND id != ?`,
    [role.consolidated_group, roleId]
  );

  // Get the old request to cancel it
  const oldRequestId = role.request_id;

  // Build document content for new signer
  const roles = [role.role_name, ...consolidatedRoles.map(r => r.role_name)];

  // Build merge variables
  const baseMergeVariables: Record<string, string> = pkg.merge_variables
    ? JSON.parse(pkg.merge_variables)
    : {};

  // Get jurisdiction addendum if applicable
  if (pkg.jurisdiction) {
    const addendum = await getJurisdictionAddendum(pkg.jurisdiction, tenantId);
    if (addendum) {
      baseMergeVariables.jurisdictionAddendum = `<div class="jurisdiction-addendum">\n<h4>${addendum.jurisdiction_name} Legal Notice</h4>\n${addendum.addendum_html}\n</div>`;
      baseMergeVariables.jurisdictionName = addendum.jurisdiction_name;
      baseMergeVariables.jurisdictionCode = pkg.jurisdiction;
    }
  }

  // Build signer-specific variables
  const signerVariables: Record<string, string> = {
    ...baseMergeVariables,
    signerName: input.name,
    signerEmail: input.email || '',
    signerPhone: input.phone || '',
    signerRoles: roles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', '),
    signerRolesList: roles.join(', '),
  };

  // Resolve document content
  let documentContent = pkg.document_content || '';
  for (const [key, value] of Object.entries(signerVariables)) {
    const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    documentContent = documentContent.replace(placeholder, value || '');
  }

  // Calculate expiration
  const expiresAt = pkg.expires_at ? new Date(pkg.expires_at) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Create new signature request
  const { request: newRequest, token: newToken } = await createRequest({
    documentName: pkg.document_name,
    documentContent,
    signerName: input.name,
    signerEmail: input.email,
    signerPhone: input.phone,
    verificationMethod,
    expiresAt,
    externalRef: pkg.external_ref || undefined,
    externalType: pkg.external_type || undefined,
    jurisdiction: pkg.jurisdiction || undefined,
    callbackUrl: pkg.callback_url || undefined,
  }, tenantId);

  // Update request with package info
  sqliteRun(
    `UPDATE signature_requests SET package_id = ?, roles_display = ? WHERE id = ?`,
    [pkg.id, roles.join(', '), newRequest.id]
  );

  // Update the role with new signer info
  sqliteRun(
    `UPDATE signing_roles
     SET signer_name = ?, signer_email = ?, signer_phone = ?, date_of_birth = ?,
         request_id = ?, status = 'sent'
     WHERE id = ?`,
    [
      input.name,
      input.email || null,
      input.phone || null,
      input.dateOfBirth || null,
      newRequest.id,
      roleId,
    ]
  );

  // Update any other roles in the same consolidated group
  for (const consolidatedRole of consolidatedRoles) {
    sqliteRun(
      `UPDATE signing_roles
       SET signer_name = ?, signer_email = ?, signer_phone = ?, request_id = ?, status = 'sent'
       WHERE id = ?`,
      [
        input.name,
        input.email || null,
        input.phone || null,
        newRequest.id,
        consolidatedRole.id,
      ]
    );
  }

  // Cancel the old request if it exists
  if (oldRequestId) {
    sqliteRun(
      `UPDATE signature_requests SET status = 'cancelled' WHERE id = ?`,
      [oldRequestId]
    );
  }

  const signUrl = `${config.baseUrl}/sign/${newToken.token}`;

  // Send notification to the replacement signer (skip in demo mode)
  if (!config.demoMode) {
    if (config.testMode) {
      console.log(`[TEST MODE] Replacement signer notification for "${pkg.document_name}" to ${input.name} redirected to test accounts`);
    }

    let notificationSent = false;

    if (input.email && (verificationMethod === 'email' || verificationMethod === 'both')) {
      try {
        await sendSignatureRequestEmail(
          input.email,
          input.name,
          pkg.document_name,
          signUrl
        );
        notificationSent = true;
      } catch (error) {
        console.error(`Failed to send email notification to replacement signer ${input.name}:`, error);
      }
    }

    if (input.phone && (verificationMethod === 'sms' || verificationMethod === 'both')) {
      try {
        await sendSignatureRequestSms(
          input.phone,
          input.name,
          pkg.document_name,
          signUrl
        );
        notificationSent = true;
      } catch (error) {
        console.error(`Failed to send SMS notification to replacement signer ${input.name}:`, error);
      }
    }

    if (notificationSent) {
      await updateRequestStatus(newRequest.id, 'sent');
    }
  }

  return {
    roleId,
    roleName: role.role_name,
    previousSigner,
    newSigner: input.name,
    signUrl,
  };
}
