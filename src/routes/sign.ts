import { Router, Request, Response } from 'express';
import path from 'path';
import { verificationRateLimit, signatureRateLimit, checkDestinationLimit, checkTokenVerificationLimit } from '../middleware/rateLimit';
import { getRequestFromToken, submitSignature, declineRequest, extractContextFields } from '../services/signature';
import { sendVerificationCode, confirmVerificationCode, getAvailableMethods } from '../services/verification';
import { updateRequestStatus } from '../db/queries';
import { SigningPageData, ReplaceSignerInput } from '../types';
import { config } from '../config';
import { getRoleByRequestId, getRoleById, replaceSigner } from '../services/package';
import { getClientIp } from '../utils/ip';

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

    if (request.status === 'declined') {
      res.status(409).json({ error: 'This signature request has been declined' });
      return;
    }

    if (request.status === 'expired') {
      res.status(410).json({ error: 'This signature request has expired' });
      return;
    }

    // Extract context fields from merge_variables
    const contextFields = extractContextFields(request);

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
      // Include roles if this is part of a package (stored as comma-separated string)
      roles: request.roles_display ? request.roles_display.split(',').map((r: string) => r.trim()) : undefined,
      packageCode: request.package_id ? request.reference_code : undefined,
      contextFields,
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
    if (request.status === 'declined') {
      res.status(409).json({ error: 'This signature request has been declined' });
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

    // Per-token rate limit: max verification code requests per signing token
    if (!checkTokenVerificationLimit(token.id)) {
      res.status(429).json({
        error: 'Too many verification attempts for this document. Please contact support.',
      });
      return;
    }

    // Per-destination rate limit: max verification codes to same email/phone
    const destination = method === 'email' ? request.signer_email : request.signer_phone;
    if (destination && !checkDestinationLimit(destination)) {
      res.status(429).json({
        error: 'Too many verification requests to this address. Please try again later.',
      });
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
    if (request.status === 'declined') {
      res.status(409).json({ error: 'This signature request has been declined' });
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
    if (request.status === 'declined') {
      res.status(409).json({ error: 'This signature request has been declined' });
      return;
    }
    if (request.status === 'expired') {
      res.status(410).json({ error: 'This signature request has expired' });
      return;
    }

    const signerIp = getClientIp(req);
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

// Decline a signature request
router.post('/:token/decline', signatureRateLimit, async (req: Request, res: Response) => {
  try {
    const data = await getRequestFromToken(req.params.token);
    if (!data) {
      res.status(410).json({ error: 'This signature request has expired or is no longer available' });
      return;
    }

    const { request } = data;

    // Check for terminal states
    if (['signed', 'expired', 'cancelled', 'declined'].includes(request.status)) {
      res.status(409).json({ error: `This signature request has already been ${request.status}` });
      return;
    }

    // Accept optional reason (trimmed, max 500 chars)
    let reason: string | undefined;
    if (req.body.reason && typeof req.body.reason === 'string') {
      reason = req.body.reason.trim().substring(0, 500);
    }

    const result = await declineRequest(req.params.token, reason);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Signature request declined' });
  } catch (error) {
    console.error('Failed to decline signature request:', error);
    res.status(500).json({ error: 'Failed to decline signature request' });
  }
});

// Replace signer (admin-authenticated via sign token)
router.get('/:token/replace-info/:roleId', async (req: Request, res: Response) => {
  try {
    const data = await getRequestFromToken(req.params.token);
    if (!data) {
      res.status(410).json({ error: 'Invalid or expired link' });
      return;
    }

    const { request } = data;
    if (!request.package_id) {
      res.status(400).json({ error: 'This request is not part of a package' });
      return;
    }

    // Verify the token belongs to a package admin
    const adminRole = getRoleByRequestId(request.id);
    if (!adminRole || !adminRole.is_package_admin) {
      res.status(403).json({ error: 'Only the package admin can replace signers' });
      return;
    }

    // Get the role to be replaced
    const targetRole = await getRoleById(req.params.roleId);
    if (!targetRole) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }
    if (targetRole.package_id !== request.package_id) {
      res.status(400).json({ error: 'Role does not belong to this package' });
      return;
    }

    res.json({
      packageId: request.package_id,
      roleId: targetRole.id,
      roleName: targetRole.role_name,
      currentSignerName: targetRole.signer_name,
      currentStatus: targetRole.status,
      documentName: request.document_name,
      adminName: adminRole.signer_name,
    });
  } catch (error) {
    console.error('Failed to get replacement info:', error);
    res.status(500).json({ error: 'Failed to load replacement information' });
  }
});

router.post('/:token/replace-signer', signatureRateLimit, async (req: Request, res: Response) => {
  try {
    const data = await getRequestFromToken(req.params.token);
    if (!data) {
      res.status(410).json({ error: 'Invalid or expired link' });
      return;
    }

    const { request } = data;
    if (!request.package_id) {
      res.status(400).json({ error: 'This request is not part of a package' });
      return;
    }

    // Verify the token belongs to a package admin
    const adminRole = getRoleByRequestId(request.id);
    if (!adminRole || !adminRole.is_package_admin) {
      res.status(403).json({ error: 'Only the package admin can replace signers' });
      return;
    }

    const { roleId, name, email, phone } = req.body;
    if (!roleId || !name) {
      res.status(400).json({ error: 'roleId and name are required' });
      return;
    }
    if (!email && !phone) {
      res.status(400).json({ error: 'Either email or phone is required' });
      return;
    }

    const input: ReplaceSignerInput = {
      name: name.trim(),
      email: email?.trim() || undefined,
      phone: phone?.trim() || undefined,
    };

    const result = await replaceSigner(request.package_id!, roleId, input, request.tenant_id || '');
    res.json(result);
  } catch (error) {
    console.error('Failed to replace signer:', error);
    if (error instanceof Error) {
      if (error.message.includes('not found') ||
          error.message.includes('Cannot replace') ||
          error.message.includes('already signed') ||
          error.message.includes('required')) {
        res.status(400).json({ error: error.message });
        return;
      }
    }
    res.status(500).json({ error: 'Failed to replace signer' });
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
