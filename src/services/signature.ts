import {
  CreateRequestInput,
  CreateRequestResponse,
  SubmitSignatureInput,
  Signature,
  SignatureRequest,
  SignatureToken,
  WebhookPayload,
  RequestStatusResponse,
} from '../types';
import {
  createRequest as dbCreateRequest,
  getRequestById,
  getRequestByReferenceCode,
  getRequestByToken,
  getTokenByValue,
  createSignature as dbCreateSignature,
  getSignatureByRequestId,
  updateRequestStatus,
} from '../db/queries';
import { config } from '../config';
import { sendSignatureRequestEmail, sendSignatureConfirmationEmail } from './email';
import { sendSignatureRequestSms as sendSmsTwilio, sendSignatureConfirmationSms as sendConfirmTwilio } from './twilio';
import { sendSignatureRequestSms as sendSmsMandrill, sendSignatureConfirmationSms as sendConfirmMandrill } from './mandrill-sms';

// Select SMS provider based on config
const sendSignatureRequestSms = config.smsProvider === 'mandrill' ? sendSmsMandrill : sendSmsTwilio;
const sendSignatureConfirmationSms = config.smsProvider === 'mandrill' ? sendConfirmMandrill : sendConfirmTwilio;

export async function createSignatureRequest(input: CreateRequestInput): Promise<CreateRequestResponse> {
  const { request, token } = await dbCreateRequest(input);

  const signUrl = `${config.baseUrl}/sign/${token.token}`;

  // Send notification to signer (skip in demo mode)
  if (!config.demoMode) {
    try {
      if (input.signerEmail && (input.verificationMethod === 'email' || input.verificationMethod === 'both' || !input.verificationMethod)) {
        await sendSignatureRequestEmail(
          input.signerEmail,
          input.signerName,
          input.documentName,
          signUrl
        );
        await updateRequestStatus(request.id, 'sent');
      } else if (input.signerPhone && input.verificationMethod === 'sms') {
        await sendSignatureRequestSms(
          input.signerPhone,
          input.signerName,
          input.documentName,
          signUrl
        );
        await updateRequestStatus(request.id, 'sent');
      }
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  return {
    id: request.id,
    referenceCode: request.reference_code,
    signUrl,
    status: request.status,
    expiresAt: request.expires_at,
  };
}

export async function getRequest(id: string): Promise<SignatureRequest | null> {
  return getRequestById(id);
}

export async function getRequestByRef(referenceCode: string): Promise<SignatureRequest | null> {
  return getRequestByReferenceCode(referenceCode);
}

export async function getRequestStatus(request: SignatureRequest): Promise<RequestStatusResponse> {
  const signature = await getSignatureByRequestId(request.id);

  const response: RequestStatusResponse = {
    id: request.id,
    referenceCode: request.reference_code,
    externalRef: request.external_ref,
    externalType: request.external_type,
    documentCategory: request.document_category,
    documentName: request.document_name,
    jurisdiction: request.jurisdiction,
    metadata: request.metadata ? JSON.parse(request.metadata) : undefined,
    waiverTemplateCode: request.waiver_template_code,
    waiverTemplateVersion: request.waiver_template_version,
    signerName: request.signer_name,
    signerEmail: request.signer_email,
    status: request.status,
    createdAt: request.created_at,
    expiresAt: request.expires_at,
    signedAt: request.signed_at,
  };

  if (signature) {
    response.signature = {
      signatureType: signature.signature_type,
      typedName: signature.typed_name,
      hasImage: !!signature.signature_image,
      verificationMethodUsed: signature.verification_method_used,
      signerIp: signature.signer_ip,
    };
  }

  return response;
}

export async function getRequestFromToken(token: string): Promise<{
  request: SignatureRequest;
  token: SignatureToken;
} | null> {
  const request = await getRequestByToken(token);
  if (!request) return null;

  const tokenRecord = await getTokenByValue(token);
  if (!tokenRecord) return null;

  // Check if expired
  if (request.expires_at && new Date() > new Date(request.expires_at)) {
    await updateRequestStatus(request.id, 'expired');
    return null;
  }

  // Update status to viewed if pending/sent
  if (request.status === 'pending' || request.status === 'sent') {
    await updateRequestStatus(request.id, 'viewed');
    request.status = 'viewed';
  }

  return { request, token: tokenRecord };
}

export async function submitSignature(
  token: string,
  input: SubmitSignatureInput,
  signerIp: string,
  userAgent: string
): Promise<{ success: boolean; signature?: Signature; error?: string }> {
  const data = await getRequestFromToken(token);
  if (!data) {
    return { success: false, error: 'Invalid or expired signature request' };
  }

  const { request, token: tokenRecord } = data;

  // Check if already signed
  if (request.status === 'signed') {
    return { success: false, error: 'Document has already been signed' };
  }

  // Check if verified
  if (!tokenRecord.is_verified) {
    return { success: false, error: 'Identity not verified' };
  }

  // Validate signature input
  if (input.signatureType === 'typed' && !input.typedName) {
    return { success: false, error: 'Typed name is required' };
  }
  if (input.signatureType === 'drawn' && !input.signatureImage) {
    return { success: false, error: 'Signature image is required' };
  }

  // Determine which verification method was used
  const verificationMethodUsed = request.signer_email ? 'email' : 'sms';

  // Create the signature
  const signature = await dbCreateSignature(
    request.id,
    input.signatureType,
    input.typedName,
    input.signatureImage,
    signerIp,
    userAgent,
    verificationMethodUsed,
    input.consentText
  );

  // Send confirmation (skip in demo mode)
  if (!config.demoMode) {
    try {
      if (request.signer_email) {
        await sendSignatureConfirmationEmail(
          request.signer_email,
          request.signer_name,
          request.document_name,
          signature.signed_at
        );
      }
      if (request.signer_phone && request.verification_method !== 'email') {
        await sendSignatureConfirmationSms(request.signer_phone, request.document_name);
      }
    } catch (error) {
      console.error('Failed to send confirmation:', error);
    }
  } else {
    console.log(`[DEMO MODE] Document signed by ${request.signer_name}`);
  }

  // Send callback to originator if configured
  if (request.callback_url) {
    try {
      await sendCallback(request, signature);
    } catch (error) {
      console.error('Failed to send callback:', error);
    }
  }

  return { success: true, signature };
}

async function sendCallback(request: SignatureRequest, signature: Signature): Promise<void> {
  if (!request.callback_url) return;

  const payload: WebhookPayload = {
    event: 'signature.completed',
    requestId: request.id,
    referenceCode: request.reference_code,
    externalRef: request.external_ref,
    externalType: request.external_type,
    documentCategory: request.document_category,
    jurisdiction: request.jurisdiction,
    metadata: request.metadata ? JSON.parse(request.metadata) : undefined,
    waiverTemplateCode: request.waiver_template_code,
    waiverTemplateVersion: request.waiver_template_version,
    signedAt: signature.signed_at,
    signatureType: signature.signature_type,
    signerName: request.signer_name,
  };

  const response = await fetch(request.callback_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature-Event': 'signature.completed',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Callback failed with status ${response.status}`);
  }
}

export async function getSignature(requestId: string): Promise<Signature | null> {
  return getSignatureByRequestId(requestId);
}
