import { Router, Request, Response } from 'express';
import path from 'path';
import { verificationRateLimit, signatureRateLimit } from '../middleware/rateLimit';
import { getRequestFromToken, submitSignature } from '../services/signature';
import { sendVerificationCode, confirmVerificationCode, getAvailableMethods } from '../services/verification';
import { updateRequestStatus } from '../db/queries';
import { SigningPageData } from '../types';
import { config } from '../config';

const router = Router();

// Get signing page - always serve the HTML page, let frontend handle states
router.get('/:token', async (req: Request, res: Response) => {
  try {
    // Always serve the signing page - the frontend will call /data
    // and handle the different states (expired, cancelled, signed, etc.)
    res.sendFile(path.join(__dirname, '../../public/sign.html'));
  } catch (error) {
    console.error('Failed to load signing page:', error);
    res.status(500).send('An error occurred. Please try again later.');
  }
});

// Get signing page data (called by frontend JS)
router.get('/:token/data', async (req: Request, res: Response) => {
  try {
    const data = await getRequestFromToken(req.params.token);
    if (!data) {
      // 410 Gone - the resource existed but is no longer available
      res.status(410).json({ error: 'This signature request has expired or is no longer available' });
      return;
    }

    const { request, token } = data;

    // Handle terminal states with appropriate status codes
    if (request.status === 'signed') {
      // 409 Conflict - request is in a state that conflicts with the action
      res.status(409).json({ error: 'This document has already been signed' });
      return;
    }

    if (request.status === 'cancelled') {
      res.status(409).json({ error: 'This signature request has been cancelled' });
      return;
    }

    if (request.status === 'expired') {
      res.status(410).json({ error: 'This signature request has expired' });
      return;
    }

    const pageData: SigningPageData = {
      requestId: request.id,
      documentName: request.document_name,
      // Use snapshot for audit trail integrity (exact content at request creation)
      documentContent: request.document_content_snapshot || request.document_content,
      documentUrl: request.document_url,
      signerName: request.signer_name,
      isVerified: token.is_verified,
      verificationMethod: request.verification_method,
      hasEmail: !!request.signer_email,
      hasPhone: !!request.signer_phone,
      demoMode: config.demoMode,
      // Include roles if this is part of a package
      roles: request.roles_display ? JSON.parse(request.roles_display) : undefined,
      packageCode: request.package_id ? request.reference_code : undefined,
    };

    res.json(pageData);
  } catch (error) {
    console.error('Failed to get page data:', error);
    res.status(500).json({ error: 'Failed to load data' });
  }
});

// Send verification code
router.post('/:token/verify', verificationRateLimit, async (req: Request, res: Response) => {
  try {
    const data = await getRequestFromToken(req.params.token);
    if (!data) {
      res.status(410).json({ error: 'This signature request has expired or is no longer available' });
      return;
    }

    const { request, token } = data;

    // Check for terminal states
    if (request.status === 'signed') {
      res.status(409).json({ error: 'This document has already been signed' });
      return;
    }
    if (request.status === 'cancelled') {
      res.status(409).json({ error: 'This signature request has been cancelled' });
      return;
    }
    if (request.status === 'expired') {
      res.status(410).json({ error: 'This signature request has expired' });
      return;
    }

    if (token.is_verified) {
      res.json({ success: true, message: 'Already verified' });
      return;
    }

    const method = req.body.method as 'email' | 'sms';
    const availableMethods = getAvailableMethods(request);

    if (!availableMethods.includes(method)) {
      res.status(400).json({ error: `${method} verification not available` });
      return;
    }

    const result = await sendVerificationCode(request, token, method);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    // Update status to show verification is in progress
    if (request.status === 'viewed') {
      await updateRequestStatus(request.id, 'verified');
    }

    const maskedDestination = method === 'email'
      ? maskEmail(request.signer_email!)
      : maskPhone(request.signer_phone!);

    res.json({
      success: true,
      message: `Verification code sent to ${maskedDestination}`,
    });
  } catch (error) {
    console.error('Failed to send verification code:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// Confirm verification code
router.post('/:token/confirm', verificationRateLimit, async (req: Request, res: Response) => {
  try {
    const data = await getRequestFromToken(req.params.token);
    if (!data) {
      res.status(410).json({ error: 'This signature request has expired or is no longer available' });
      return;
    }

    const { request, token } = data;

    // Check for terminal states
    if (request.status === 'signed') {
      res.status(409).json({ error: 'This document has already been signed' });
      return;
    }
    if (request.status === 'cancelled') {
      res.status(409).json({ error: 'This signature request has been cancelled' });
      return;
    }
    if (request.status === 'expired') {
      res.status(410).json({ error: 'This signature request has expired' });
      return;
    }

    const code = req.body.code as string;

    if (!code || code.length !== 6) {
      res.status(400).json({ error: 'Invalid verification code format' });
      return;
    }

    const result = await confirmVerificationCode(token.id, code);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Identity verified' });
  } catch (error) {
    console.error('Failed to confirm verification code:', error);
    res.status(500).json({ error: 'Failed to verify code' });
  }
});

// Submit signature
router.post('/:token/submit', signatureRateLimit, async (req: Request, res: Response) => {
  try {
    // Pre-check request state before processing signature
    const data = await getRequestFromToken(req.params.token);
    if (!data) {
      res.status(410).json({ error: 'This signature request has expired or is no longer available' });
      return;
    }

    const { request } = data;

    // Check for terminal states
    if (request.status === 'signed') {
      res.status(409).json({ error: 'This document has already been signed' });
      return;
    }
    if (request.status === 'cancelled') {
      res.status(409).json({ error: 'This signature request has been cancelled' });
      return;
    }
    if (request.status === 'expired') {
      res.status(410).json({ error: 'This signature request has expired' });
      return;
    }

    const signerIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
      || req.socket.remoteAddress
      || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const result = await submitSignature(
      req.params.token,
      {
        signatureType: req.body.signatureType,
        typedName: req.body.typedName,
        signatureImage: req.body.signatureImage,
        consentText: req.body.consentText,
      },
      signerIp,
      userAgent
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      message: 'Document signed successfully',
      signedAt: result.signature?.signed_at,
    });
  } catch (error) {
    console.error('Failed to submit signature:', error);
    res.status(500).json({ error: 'Failed to submit signature' });
  }
});

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const masked = local.substring(0, 2) + '***';
  return `${masked}@${domain}`;
}

function maskPhone(phone: string): string {
  return '***' + phone.slice(-4);
}

export default router;
