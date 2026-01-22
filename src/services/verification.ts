import { SignatureRequest, SignatureToken, VerificationMethod } from '../types';
import { setVerificationCode, verifyCode } from '../db/queries';
import { sendVerificationEmail } from './email';
import { sendVerificationSms } from './twilio';

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

    // Send via the appropriate channel
    if (method === 'email') {
      await sendVerificationEmail(
        request.signer_email!,
        request.signer_name,
        code,
        request.document_name
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
