export type VerificationMethod = 'email' | 'sms' | 'both';

export type RequestStatus = 'pending' | 'sent' | 'viewed' | 'verified' | 'signed' | 'expired' | 'cancelled';

export type SignatureType = 'typed' | 'drawn';

export type DocumentCategory = 'waiver' | 'agreement' | 'consent' | 'other';

export type PackageStatus = 'pending' | 'partial' | 'complete' | 'expired' | 'cancelled';

export type RoleStatus = 'pending' | 'sent' | 'signed';

export interface SignatureRequest {
  id: string;
  reference_code: string;
  external_ref?: string;
  external_type?: string;
  document_category?: DocumentCategory;
  document_name: string;
  document_content?: string;
  document_content_snapshot?: string;
  document_url?: string;
  waiver_template_code?: string;
  waiver_template_version?: number;
  merge_variables?: string;
  jurisdiction?: string;
  metadata?: string;
  signer_name: string;
  signer_email?: string;
  signer_phone?: string;
  verification_method: VerificationMethod;
  status: RequestStatus;
  created_at: Date;
  expires_at?: Date;
  signed_at?: Date;
  callback_url?: string;
  created_by?: string;
  package_id?: string;
  roles_display?: string;
}

export interface SignatureToken {
  id: string;
  request_id: string;
  token: string;
  verification_code?: string;
  code_expires_at?: Date;
  code_attempts: number;
  is_verified: boolean;
  created_at: Date;
  verified_at?: Date;
}

export interface Signature {
  id: string;
  request_id: string;
  signature_type: SignatureType;
  typed_name?: string;
  signature_image?: string;
  signer_ip?: string;
  user_agent?: string;
  signed_at: Date;
  verification_method_used?: string;
  consent_text?: string;
}

export interface WaiverTemplate {
  id: string;
  template_code: string;
  name: string;
  description?: string;
  html_content: string;
  jurisdiction?: string;
  version: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
}

export interface CreateRequestInput {
  externalRef?: string;
  externalType?: string;
  documentCategory?: DocumentCategory;
  documentName: string;
  documentContent?: string;
  documentUrl?: string;
  waiverTemplateCode?: string;
  mergeVariables?: Record<string, string>;
  jurisdiction?: string;
  metadata?: Record<string, unknown>;
  signerName: string;
  signerEmail?: string;
  signerPhone?: string;
  verificationMethod?: VerificationMethod;
  expiresAt?: Date;
  callbackUrl?: string;
  createdBy?: string;
}

export interface CreateRequestResponse {
  id: string;
  referenceCode: string;
  signUrl: string;
  status: RequestStatus;
  expiresAt?: Date;
}

export interface SubmitSignatureInput {
  signatureType: SignatureType;
  typedName?: string;
  signatureImage?: string;
  consentText: string;
}

export interface RequestFilters {
  status?: RequestStatus;
  referenceCode?: string;
  externalRef?: string;
  externalType?: string;
  signerEmail?: string;
  createdBy?: string;
  jurisdiction?: string;
  limit?: number;
  offset?: number;
}

export interface SigningPageData {
  requestId: string;
  documentName: string;
  documentContent?: string;
  documentUrl?: string;
  signerName: string;
  isVerified: boolean;
  verificationMethod: VerificationMethod;
  hasEmail: boolean;
  hasPhone: boolean;
  demoMode: boolean;
  roles?: string[];
  packageCode?: string;
}

export interface CreateTemplateInput {
  templateCode: string;
  name: string;
  description?: string;
  htmlContent: string;
  jurisdiction?: string;
  createdBy?: string;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  htmlContent?: string;
  jurisdiction?: string;
  isActive?: boolean;
}

export interface WebhookPayload {
  event: 'signature.completed' | 'signature.expired' | 'signature.cancelled';
  requestId: string;
  referenceCode: string;
  externalRef?: string;
  externalType?: string;
  documentCategory?: DocumentCategory;
  jurisdiction?: string;
  metadata?: Record<string, unknown>;
  waiverTemplateCode?: string;
  waiverTemplateVersion?: number;
  signedAt?: Date;
  signatureType?: SignatureType;
  signerName: string;
}

export interface RequestStatusResponse {
  id: string;
  referenceCode: string;
  externalRef?: string;
  externalType?: string;
  documentCategory?: DocumentCategory;
  documentName: string;
  jurisdiction?: string;
  metadata?: Record<string, unknown>;
  waiverTemplateCode?: string;
  waiverTemplateVersion?: number;
  signerName: string;
  signerEmail?: string;
  status: RequestStatus;
  createdAt: Date;
  expiresAt?: Date;
  signedAt?: Date;
  signature?: {
    signatureType: SignatureType;
    typedName?: string;
    hasImage: boolean;
    verificationMethodUsed?: string;
    signerIp?: string;
  };
}

// ============================================
// SIGNING PACKAGES (Multi-party signing)
// ============================================

export interface SigningPackage {
  id: string;
  package_code: string;
  external_ref?: string;
  external_type?: string;
  template_code?: string;
  template_version?: number;
  document_name: string;
  document_content?: string;
  jurisdiction?: string;
  merge_variables?: string;
  event_date?: string;
  status: PackageStatus;
  total_signers: number;
  completed_signers: number;
  created_at: Date;
  updated_at: Date;
  expires_at?: Date;
  completed_at?: Date;
  callback_url?: string;
  created_by?: string;
}

export interface SigningRole {
  id: string;
  package_id: string;
  role_name: string;
  signer_name: string;
  signer_email?: string;
  signer_phone?: string;
  date_of_birth?: string;
  is_minor: boolean;
  is_package_admin: boolean;
  request_id?: string;
  consolidated_group?: string;
  status: RoleStatus;
  signed_at?: Date;
  created_at: Date;
}

export interface JurisdictionAddendum {
  id: string;
  jurisdiction_code: string;
  jurisdiction_name: string;
  addendum_html: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SignerInput {
  role: string;
  name: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  isMinor?: boolean;
  verificationMethod?: VerificationMethod;
  isPackageAdmin?: boolean;
}

export interface ReplaceSignerInput {
  name: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  verificationMethod?: VerificationMethod;
}

export interface ReplaceSignerResponse {
  roleId: string;
  roleName: string;
  previousSigner: string;
  newSigner: string;
  signUrl: string;
}

export interface CreatePackageInput {
  templateCode?: string;
  documentName?: string;
  documentContent?: string;
  externalRef?: string;
  externalType?: string;
  jurisdiction?: string;
  mergeVariables?: Record<string, string>;
  eventDate?: string;
  signers: SignerInput[];
  verificationMethod?: VerificationMethod;
  expiresAt?: Date;
  callbackUrl?: string;
  createdBy?: string;
}

// Role age requirements - minimum age required to sign for each role
export interface RoleAgeRequirement {
  role: string;
  minimumAge: number;
}

export interface ConsolidatedSigner {
  email?: string;
  phone?: string;
  name: string;
  roles: { roleId: string; roleName: string }[];
  signUrl: string;
  requestId: string;
  status: RoleStatus;
  isPackageAdmin: boolean;
}

export interface CreatePackageResponse {
  packageId: string;
  packageCode: string;
  status: PackageStatus;
  documentName: string;
  eventDate?: string;
  totalSigners: number;
  signatureRequests: {
    signerName: string;
    roles: string[];
    signUrl: string;
    isPackageAdmin: boolean;
  }[];
  expiresAt?: Date;
}

export interface PackageStatusResponse {
  packageId: string;
  packageCode: string;
  externalRef?: string;
  externalType?: string;
  documentName: string;
  jurisdiction?: string;
  status: PackageStatus;
  totalSigners: number;
  completedSigners: number;
  createdAt: Date;
  expiresAt?: Date;
  completedAt?: Date;
  signers: ConsolidatedSigner[];
}

export interface PackageWebhookPayload {
  event: 'package.completed' | 'package.partial' | 'signer.completed';
  packageId: string;
  packageCode: string;
  externalRef?: string;
  externalType?: string;
  jurisdiction?: string;
  documentName: string;
  completedSigners: number;
  totalSigners: number;
  signer?: {
    name: string;
    email?: string;
    roles: string[];
    signedAt: Date;
  };
}
