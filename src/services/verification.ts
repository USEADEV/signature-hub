import { SignatureRequest, SignatureToken } from '../types';
import { setVerificationCode, verifyCode } from '../db/queries';
import { sendVerificationEmail } from './email';
import { sendVerificationSms as sendViaTwilio } from './twilio';
import { sendVerificationSms as sendViaMandrill } from './mandrill-sms';
import { config } from '../config';
import { extractContextFields } from './signature';

// Select SMS provider based on config
const sendVerificationSms = config.smsProvider === 'mandrill' ? sendViaMandrill : sendViaTwilio;

export type SendMethod = 'email' | 'sms';

export async function sendVerificationCode(
  request: SignatureRequest,
  token: SignatureToken,
  method: SendMethod
): Promise<{ success: boolean; error?: string }> {
  // Validate we can send via the requested method
  if (method === 'email' && !request.signer_email) {
    return { success: false, error: 'No email address available' };
  }
  if (method === 'sms' && !request.signer_phone) {
    return { success: false, error: 'No phone number available' };
  }

  // Check if the verification method is allowed
  if (request.verification_method === 'email' && method === 'sms') {
    return { success: false, error: 'SMS verification not allowed for this request' };
  }
  if (request.verification_method === 'sms' && method === 'email') {
    return { success: false, error: 'Email verification not allowed for this request' };
  }

  try {
    // Generate and store the code
    const code = await setVerificationCode(token.id);

    // Log test mode redirect info
    if (config.testMode && !config.demoMode) {
      const originalDest = method === 'email' ? request.signer_email : request.signer_phone;
      console.log(`[TEST MODE] Verification for ${request.signer_name} (original: ${originalDest})`);
    }

    // In demo mode, just log the code and skip actual sending
    if (config.demoMode) {
      console.log(`[DEMO MODE] Verification code for ${request.signer_name}: ${code}`);
      console.log(`[DEMO MODE] Would send to: ${method === 'email' ? request.signer_email : request.signer_phone}`);
      return { success: true };
    }

    // Send via the appropriate channel
    if (method === 'email') {
      await sendVerificationEmail(
        request.signer_email!,
        request.signer_name,
        code,
        request.document_name,
        extractContextFields(request)
      );
    } else {
      await sendVerificationSms(
        request.signer_phone!,
        code,
        request.document_name
      );
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to send verification code:', error);
    return { success: false, error: 'Failed to send verification code' };
  }
}

export async function confirmVerificationCode(
  tokenId: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  return verifyCode(tokenId, code);
}

export function getAvailableMethods(request: SignatureRequest): SendMethod[] {
  const methods: SendMethod[] = [];

  if (request.verification_method === 'email' || request.verification_method === 'both') {
    if (request.signer_email) {
      methods.push('email');
    }
  }

  if (request.verification_method === 'sms' || request.verification_method === 'both') {
    if (request.signer_phone) {
      methods.push('sms');
    }
  }

  return methods;
}
