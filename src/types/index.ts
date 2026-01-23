export type VerificationMethod = 'email' | 'sms' | 'both';

export type RequestStatus = 'pending' | 'sent' | 'viewed' | 'verified' | 'signed' | 'expired' | 'cancelled';

export type SignatureType = 'typed' | 'drawn';

export type DocumentCategory = 'waiver' | 'agreement' | 'consent' | 'other';

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
