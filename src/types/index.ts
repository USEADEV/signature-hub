export type VerificationMethod = 'email' | 'sms' | 'both';

export type RequestStatus = 'pending' | 'sent' | 'viewed' | 'verified' | 'signed' | 'expired' | 'cancelled';

export type SignatureType = 'typed' | 'drawn';

export interface SignatureRequest {
  id: string;
  external_ref?: string;
  external_type?: string;
  document_name: string;
  document_content?: string;
  document_url?: string;
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

export interface CreateRequestInput {
  externalRef?: string;
  externalType?: string;
  documentName: string;
  documentContent?: string;
  documentUrl?: string;
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
  externalRef?: string;
  externalType?: string;
  signerEmail?: string;
  createdBy?: string;
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
