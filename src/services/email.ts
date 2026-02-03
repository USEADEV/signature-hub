import nodemailer from 'nodemailer';
import { config } from '../config';
import { ContextField } from '../types';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildContextBlock(contextFields?: ContextField[]): string {
  if (!contextFields || contextFields.length === 0) return '';
  const rows = contextFields
    .map(f => `<tr>
      <td style="padding: 4px 12px 4px 0; color: #636e72; font-size: 13px; white-space: nowrap;">${escapeHtml(f.label)}:</td>
      <td style="padding: 4px 0; color: #2d3436; font-size: 13px; font-weight: 600;">${escapeHtml(f.value)}</td>
    </tr>`)
    .join('');
  return `<table style="margin: 12px 0 0; border-collapse: collapse;">${rows}</table>`;
}

function resolveEmailRecipient(originalTo: string): string {
  if (!config.demoMode && config.testMode && config.testEmail) {
    console.log(`[TEST MODE] Email redirected: ${originalTo} → ${config.testEmail}`);
    return config.testEmail;
  }
  return originalTo;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
    });
  }
  return transporter;
}

export async function sendVerificationEmail(
  to: string,
  signerName: string,
  code: string,
  documentName: string,
  contextFields?: ContextField[]
): Promise<void> {
  const contextHtml = buildContextBlock(contextFields);
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Verification Code</h2>
      <p>Hello ${escapeHtml(signerName)},</p>
      <p>Your verification code for signing <strong>${escapeHtml(documentName)}</strong> is:</p>
      ${contextHtml}
      <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #333;">${code}</span>
      </div>
      <p>This code will expire in ${config.verification.codeExpiryMinutes} minutes.</p>
      <p>If you did not request this code, please ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">This is an automated message from SignatureHub.</p>
    </div>
  `;

  await getTransporter().sendMail({
    from: config.email.from,
    to: resolveEmailRecipient(to),
    subject: `Your verification code for ${escapeHtml(documentName)}`,
    html,
  });
}

export async function sendSignatureRequestEmail(
  to: string,
  signerName: string,
  documentName: string,
  signUrl: string,
  contextFields?: ContextField[]
): Promise<void> {
  const contextHtml = buildContextBlock(contextFields);
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Document Signature Requested</h2>
      <p>Hello ${escapeHtml(signerName)},</p>
      <p>You have been requested to sign the following document:</p>
      <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0;">
        <strong>${escapeHtml(documentName)}</strong>
        ${contextHtml}
      </div>
      <p>Please click the button below to review and sign the document:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${signUrl}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Review & Sign Document
        </a>
      </div>
      <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
      <p style="color: #666; font-size: 12px; word-break: break-all;">${signUrl}</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">This is an automated message from SignatureHub.</p>
    </div>
  `;

  await getTransporter().sendMail({
    from: config.email.from,
    to: resolveEmailRecipient(to),
    subject: `Signature requested: ${documentName}`,
    html,
  });
}

export async function sendSignatureConfirmationEmail(
  to: string,
  signerName: string,
  documentName: string,
  signedAt: Date,
  contextFields?: ContextField[]
): Promise<void> {
  const contextHtml = buildContextBlock(contextFields);
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #28a745;">Document Signed Successfully</h2>
      <p>Hello ${escapeHtml(signerName)},</p>
      <p>You have successfully signed the following document:</p>
      <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0;">
        <strong>${escapeHtml(documentName)}</strong>
        <br>
        <span style="color: #666; font-size: 14px;">Signed on: ${signedAt.toLocaleString()}</span>
        ${contextHtml}
      </div>
      <p>A copy of the signed document has been recorded for your records.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">This is an automated message from SignatureHub.</p>
    </div>
  `;

  await getTransporter().sendMail({
    from: config.email.from,
    to: resolveEmailRecipient(to),
    subject: `Document signed: ${documentName}`,
    html,
  });
}

export async function sendDeclineNotificationEmail(
  to: string,
  adminName: string,
  signerName: string,
  documentName: string,
  declineReason?: string,
  replacementUrl?: string
): Promise<void> {
  const reasonHtml = declineReason
    ? `<div style="background-color: #fff3cd; padding: 15px; margin: 20px 0; border-left: 4px solid #ffc107;">
        <strong>Reason provided:</strong><br>${escapeHtml(declineReason)}
      </div>`
    : '<p style="color: #666;">No reason was provided.</p>';

  const replacementHtml = replacementUrl
    ? `<div style="text-align: center; margin: 24px 0;">
        <a href="${replacementUrl}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Replace Signer
        </a>
      </div>
      <p style="color: #666; font-size: 14px;">Click the button above to assign a replacement signer for this document.</p>`
    : '<p>You may need to contact the signer or arrange for a replacement.</p>';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc3545;">Signature Declined</h2>
      <p>Hello ${adminName},</p>
      <p><strong>${escapeHtml(signerName)}</strong> has declined to sign the following document:</p>
      <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0;">
        <strong>${escapeHtml(documentName)}</strong>
      </div>
      ${reasonHtml}
      ${replacementHtml}
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">This is an automated message from SignatureHub.</p>
    </div>
  `;

  await getTransporter().sendMail({
    from: config.email.from,
    to: resolveEmailRecipient(to),
    subject: `Signature declined: ${documentName}`,
    html,
  });
}

export async function sendExpirationNotificationEmail(
  to: string,
  signerName: string,
  documentName: string,
  contextFields?: ContextField[]
): Promise<void> {
  const contextHtml = buildContextBlock(contextFields);
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #856404;">Signature Request Expired</h2>
      <p>Hello ${escapeHtml(signerName)},</p>
      <p>Your signature request for the following document has expired:</p>
      <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0;">
        <strong>${escapeHtml(documentName)}</strong>
        ${contextHtml}
      </div>
      <p>If you still need to sign this document, please contact the requesting party to send a new signature request.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">This is an automated message from SignatureHub.</p>
    </div>
  `;

  await getTransporter().sendMail({
    from: config.email.from,
    to: resolveEmailRecipient(to),
    subject: `Signature request expired: ${documentName}`,
    html,
  });
}

export async function sendCancellationNotificationEmail(
  to: string,
  signerName: string,
  documentName: string,
  contextFields?: ContextField[]
): Promise<void> {
  const contextHtml = buildContextBlock(contextFields);
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #6c757d;">Signature Request Cancelled</h2>
      <p>Hello ${escapeHtml(signerName)},</p>
      <p>The signature request for the following document has been cancelled:</p>
      <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0;">
        <strong>${escapeHtml(documentName)}</strong>
        ${contextHtml}
      </div>
      <p>No further action is required from you. If you have questions, please contact the requesting party.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">This is an automated message from SignatureHub.</p>
    </div>
  `;

  await getTransporter().sendMail({
    from: config.email.from,
    to: resolveEmailRecipient(to),
    subject: `Signature request cancelled: ${documentName}`,
    html,
  });
}
