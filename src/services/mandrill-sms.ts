import https from 'https';
import { config } from '../config';

const SMS_API_ENDPOINT = 'https://mandrillapp.com/api/1.1/messages/send-sms';

interface SmsResult {
  success: boolean;
  status?: string;
  id?: string;
  error?: string;
}

async function sendSms(
  to: string,
  text: string
): Promise<SmsResult> {
  const payload = {
    key: config.mandrill.apiKey,
    message: {
      sms: {
        text,
        to,
        from: config.mandrill.phoneNumber,
        consent: 'onetime',
        track_clicks: false,
      },
    },
  };

  return new Promise((resolve) => {
    const url = new URL(SMS_API_ENDPOINT);
    const postData = JSON.stringify(payload);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const result = JSON.parse(data);

          if (res.statusCode === 200) {
            if (result[0]?.status === 'rejected') {
              resolve({
                success: false,
                error: `Rejected: ${result[0].reject_reason}`,
              });
            } else {
              resolve({
                success: true,
                status: result[0]?.status,
                id: result[0]?._id,
              });
            }
          } else if (res.statusCode === 401) {
            resolve({ success: false, error: 'Invalid Mandrill API key' });
          } else if (res.statusCode === 400) {
            resolve({ success: false, error: `Bad request: ${data}` });
          } else {
            resolve({
              success: false,
              error: `HTTP ${res.statusCode}: ${data}`,
            });
          }
        } catch (e) {
          resolve({
            success: false,
            error: `Parse error: ${(e as Error).message}`,
          });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    req.setTimeout(30000, () => {
      req.destroy();
      resolve({ success: false, error: 'Request timed out' });
    });

    req.write(postData);
    req.end();
  });
}

export async function sendVerificationSms(
  to: string,
  code: string,
  documentName: string
): Promise<void> {
  const message = `[${config.smsBrand}] Your verification code for signing "${documentName}" is: ${code}. This code expires in ${config.verification.codeExpiryMinutes} minutes.`;

  const result = await sendSms(to, message);

  if (!result.success) {
    throw new Error(`Failed to send SMS: ${result.error}`);
  }

  console.log(`SMS sent via Mandrill: ${result.status} (ID: ${result.id})`);
}

export async function sendSignatureRequestSms(
  to: string,
  signerName: string,
  documentName: string,
  signUrl: string
): Promise<void> {
  const message = `[${config.smsBrand}] Hi ${signerName}, you've been requested to sign "${documentName}". Please visit: ${signUrl}`;

  const result = await sendSms(to, message);

  if (!result.success) {
    throw new Error(`Failed to send SMS: ${result.error}`);
  }
}

export async function sendSignatureConfirmationSms(
  to: string,
  documentName: string
): Promise<void> {
  const message = `[${config.smsBrand}] You have successfully signed "${documentName}". Thank you!`;

  const result = await sendSms(to, message);

  if (!result.success) {
    throw new Error(`Failed to send SMS: ${result.error}`);
  }
}
