import {
  CreateRequestInput,
  CreateRequestResponse,
  SubmitSignatureInput,
  Signature,
  SignatureRequest,
  SignatureToken,
  WebhookPayload,
  RequestStatusResponse,
  ContextField,
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
  updateRequestDeclined,
  updateSigningRolesStatusByRequestId,
  getTokenByRequestId,
} from '../db/queries';
import { config } from '../config';
import { sendSignatureRequestEmail, sendSignatureConfirmationEmail, sendDeclineNotificationEmail, sendCancellationNotificationEmail } from './email';
import { sendSignatureRequestSms as sendSmsTwilio, sendSignatureConfirmationSms as sendConfirmTwilio } from './twilio';
import { sendSignatureRequestSms as sendSmsMandrill, sendSignatureConfirmationSms as sendConfirmMandrill } from './mandrill-sms';
import { sendDeclineNotificationSms as sendDeclineSmsTwilio } from './twilio';
import { sendDeclineNotificationSms as sendDeclineSmsMandrill } from './mandrill-sms';
import { onSignatureCompleted, getPackageAdminContact, getRoleByRequestId } from './package';

// Select SMS provider based on config
const sendSignatureRequestSms = config.smsProvider === 'mandrill' ? sendSmsMandrill : sendSmsTwilio;
const sendSignatureConfirmationSms = config.smsProvider === 'mandrill' ? sendConfirmMandrill : sendConfirmTwilio;
const sendDeclineNotificationSms = config.smsProvider === 'mandrill' ? sendDeclineSmsMandrill : sendDeclineSmsTwilio;

const CONTEXT_FIELD_MAP: Record<string, string> = {
  eventName: 'Event',
  eventDate: 'Event Date',
  horseName: 'Horse',
  riderName: 'Rider',
  trainerName: 'Trainer',
  ownerName: 'Owner',
  competitionName: 'Competition',
  venueName: 'Venue',
  className: 'Class',
  divisionName: 'Division',
};

export function extractContextFields(request: SignatureRequest): ContextField[] | undefined {
  if (!request.merge_variables) return undefined;
  try {
    const vars = JSON.parse(request.merge_variables);
    const fields: ContextField[] = [];
    for (const [key, label] of Object.entries(CONTEXT_FIELD_MAP)) {
      if (vars[key]) {
        fields.push({ label, value: vars[key] });
      }
    }
    return fields.length > 0 ? fields : undefined;
  } catch {
    return undefined;
  }
}

export async function createSignatureRequest(input: CreateRequestInput, tenantId: string): Promise<CreateRequestResponse> {
  const { request, token } = await dbCreateRequest(input, tenantId);

  const signUrl = `${config.baseUrl}/sign/${token.token}`;

  // Send notification to signer (skip in demo mode)
  if (!config.demoMode && config.testMode) {
    console.log(`[TEST MODE] Notifications for "${input.documentName}" redirected to test accounts`);
  }
  if (!config.demoMode) {
    let notificationSent = false;
    const contextFields = extractContextFields(request);

    // Send email notification if email method is enabled
    if (input.signerEmail && (input.verificationMethod === 'email' || input.verificationMethod === 'both' || !input.verificationMethod)) {
      try {
        await sendSignatureRequestEmail(
          input.signerEmail,
          input.signerName,
          input.documentName,
          signUrl,
          contextFields
        );
        notificationSent = true;
      } catch (error) {
        console.error('Failed to send email notification:', error);
      }
    }

    // Send SMS notification if SMS method is enabled
    if (input.signerPhone && (input.verificationMethod === 'sms' || input.verificationMethod === 'both')) {
      try {
        await sendSignatureRequestSms(
          input.signerPhone,
          input.signerName,
          input.documentName,
          signUrl
        );
        notificationSent = true;
      } catch (error) {
        console.error('Failed to send SMS notification:', error);
      }
    }

    if (notificationSent) {
      await updateRequestStatus(request.id, 'sent');
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

export async function getRequest(id: string, tenantId: string): Promise<SignatureRequest | null> {
  return getRequestById(id, tenantId);
}

export async function getRequestByRef(referenceCode: string, tenantId: string): Promise<SignatureRequest | null> {
  return getRequestByReferenceCode(referenceCode, tenantId);
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
    declineReason: request.decline_reason,
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
    const contextFields = extractContextFields(request);
    try {
      if (request.signer_email) {
        await sendSignatureConfirmationEmail(
          request.signer_email,
          request.signer_name,
          request.document_name,
          signature.signed_at,
          contextFields
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
      await sendWebhookCallback(request, 'signature.completed', {
        signedAt: signature.signed_at,
        signatureType: signature.signature_type,
      });
    } catch (error) {
      console.error('Failed to send callback:', error);
    }
  }

  // Update package status if this request is part of a package
  try {
    await onSignatureCompleted(request.id);
  } catch (error) {
    console.error('Failed to update package status:', error);
  }

  return { success: true, signature };
}

// Validate callback URL to prevent SSRF attacks
function isValidCallbackUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // Only allow HTTPS (or HTTP for local development)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return false;
    }

    // Block localhost and loopback
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false;
    }

    // Block private IP ranges
    const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      // 10.x.x.x
      if (a === 10) return false;
      // 172.16.x.x - 172.31.x.x
      if (a === 172 && b >= 16 && b <= 31) return false;
      // 192.168.x.x
      if (a === 192 && b === 168) return false;
      // 169.254.x.x (link-local)
      if (a === 169 && b === 254) return false;
      // 127.x.x.x (loopback)
      if (a === 127) return false;
    }

    // Block common internal hostnames
    if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.localhost')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function sendWebhookCallback(
  request: SignatureRequest,
  event: WebhookPayload['event'],
  extra?: Partial<WebhookPayload>
): Promise<void> {
  if (!request.callback_url) return;

  // Validate callback URL to prevent SSRF
  if (!isValidCallbackUrl(request.callback_url)) {
    console.warn(`[Webhook] Blocked callback to unsafe URL: ${request.callback_url}`);
    return;
  }

  const payload: WebhookPayload = {
    event,
    requestId: request.id,
    referenceCode: request.reference_code,
    externalRef: request.external_ref,
    externalType: request.external_type,
    documentCategory: request.document_category,
    jurisdiction: request.jurisdiction,
    metadata: request.metadata ? JSON.parse(request.metadata) : undefined,
    waiverTemplateCode: request.waiver_template_code,
    waiverTemplateVersion: request.waiver_template_version,
    signerName: request.signer_name,
    ...extra,
  };

  const response = await fetch(request.callback_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature-Event': event,
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

export async function declineRequest(
  token: string,
  declineReason?: string
): Promise<{ success: boolean; error?: string }> {
  const data = await getRequestFromToken(token);
  if (!data) {
    return { success: false, error: 'Invalid or expired signature request' };
  }

  const { request } = data;

  // Check terminal states
  if (['signed', 'expired', 'cancelled', 'declined'].includes(request.status)) {
    return { success: false, error: `Request is already ${request.status}` };
  }

  // Update status to declined
  await updateRequestDeclined(request.id, declineReason);

  // Update signing_roles status if part of a package
  if (request.package_id) {
    await updateSigningRolesStatusByRequestId(request.id, 'declined');
  }

  // Send webhook if callback_url is set
  if (request.callback_url) {
    try {
      await sendWebhookCallback(request, 'signature.declined', {
        declineReason,
      });
    } catch (error) {
      console.error('Failed to send decline webhook:', error);
    }
  }

  // Notify package admin if this request is part of a package
  if (request.package_id && !config.demoMode) {
    try {
      const adminContact = await getPackageAdminContact(request.package_id);
      if (adminContact) {
        // Build replacement URL for the admin
        let replacementUrl: string | undefined;
        const declinedRole = await getRoleByRequestId(request.id);
        if (declinedRole && adminContact.adminRequestId) {
          const adminToken = await getTokenByRequestId(adminContact.adminRequestId);
          if (adminToken) {
            replacementUrl = `${config.baseUrl}/replace.html?token=${adminToken.token}&role=${declinedRole.id}`;
          }
        }

        if (adminContact.adminEmail) {
          await sendDeclineNotificationEmail(
            adminContact.adminEmail,
            adminContact.adminName,
            request.signer_name,
            request.document_name,
            declineReason,
            replacementUrl
          );
        }
        if (adminContact.adminPhone) {
          await sendDeclineNotificationSms(
            adminContact.adminPhone,
            request.signer_name,
            request.document_name,
            declineReason
          );
        }
      }
    } catch (error) {
      console.error('Failed to notify package admin of decline:', error);
    }
  }

  return { success: true };
}

export async function sendCancellationNotifications(request: SignatureRequest): Promise<void> {
  // Send webhook if callback_url is set
  if (request.callback_url) {
    try {
      await sendWebhookCallback(request, 'signature.cancelled');
    } catch (error) {
      console.error('Failed to send cancellation webhook:', error);
    }
  }

  // Notify signer via email
  if (!config.demoMode && request.signer_email) {
    const contextFields = extractContextFields(request);
    try {
      await sendCancellationNotificationEmail(
        request.signer_email,
        request.signer_name,
        request.document_name,
        contextFields
      );
    } catch (error) {
      console.error('Failed to send cancellation email:', error);
    }
  }
}
