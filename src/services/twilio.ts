import twilio from 'twilio';
import { config } from '../config';

function resolveSmsRecipient(originalTo: string): string {
  if (!config.demoMode && config.testMode && config.testPhone) {
    console.log(`[TEST MODE] SMS redirected: ${originalTo} → ${config.testPhone}`);
    return config.testPhone;
  }
  return originalTo;
}

let client: twilio.Twilio | null = null;

function getClient(): twilio.Twilio {
  if (!client) {
    if (!config.twilio.accountSid || !config.twilio.authToken) {
      throw new Error('Twilio credentials not configured');
    }
    client = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return client;
}

export async function sendVerificationSms(
  to: string,
  code: string,
  documentName: string
): Promise<void> {
  const message = `Your verification code for signing "${documentName}" is: ${code}. This code expires in ${config.verification.codeExpiryMinutes} minutes.`;

  await getClient().messages.create({
    body: message,
    from: config.twilio.phoneNumber,
    to: resolveSmsRecipient(to),
  });
}

export async function sendSignatureRequestSms(
  to: string,
  signerName: string,
  documentName: string,
  signUrl: string
): Promise<void> {
  const message = `Hi ${signerName}, you've been requested to sign "${documentName}". Please visit: ${signUrl}`;

  await getClient().messages.create({
    body: message,
    from: config.twilio.phoneNumber,
    to: resolveSmsRecipient(to),
  });
}

export async function sendSignatureConfirmationSms(
  to: string,
  documentName: string
): Promise<void> {
  const message = `You have successfully signed "${documentName}". Thank you!`;

  await getClient().messages.create({
    body: message,
    from: config.twilio.phoneNumber,
    to: resolveSmsRecipient(to),
  });
}
