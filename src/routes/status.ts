import { Router, Request, Response } from 'express';
import path from 'path';
import { getPackageByCode, getPackageStatus, getPackageRoles } from '../services/package';
import { getSignatureByRequestId } from '../db/queries';
import { ContextField } from '../types';

const router = Router();

// Serve the status page HTML
router.get('/:packageCode', async (req: Request, res: Response) => {
  try {
    res.sendFile(path.join(__dirname, '../../public/package-status.html'));
  } catch (error) {
    console.error('Failed to load status page:', error);
    res.status(500).send('An error occurred. Please try again later.');
  }
});

// Get status page data (called by frontend JS)
router.get('/:packageCode/data', async (req: Request, res: Response) => {
  try {
    const { packageCode } = req.params;

    // Get package by code (no tenant restriction for public access)
    const pkg = await getPackageByCode(packageCode);
    if (!pkg) {
      res.status(404).json({ error: 'Package not found' });
      return;
    }

    // Get full status with signers
    const status = await getPackageStatus(pkg.id);
    if (!status) {
      res.status(404).json({ error: 'Package status not found' });
      return;
    }

    // Parse context fields from merge_variables
    let contextFields: ContextField[] | undefined;
    if (pkg.merge_variables) {
      try {
        const vars = JSON.parse(pkg.merge_variables);
        const contextMap: Record<string, string> = {
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
        const fields: ContextField[] = [];
        for (const [key, label] of Object.entries(contextMap)) {
          if (vars[key]) {
            fields.push({ label, value: vars[key] });
          }
        }
        if (fields.length > 0) {
          contextFields = fields;
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Get signature details for each signed signer
    const signersWithDetails = await Promise.all(
      status.signers.map(async (signer) => {
        let signedAt: string | undefined;
        let verificationMethod: string | undefined;
        let declineReason: string | undefined;

        if (signer.status === 'signed' && signer.requestId) {
          const signature = await getSignatureByRequestId(signer.requestId);
          if (signature) {
            signedAt = signature.signed_at instanceof Date
              ? signature.signed_at.toISOString()
              : String(signature.signed_at);
            verificationMethod = signature.verification_method_used;
          }
        }

        return {
          name: signer.name,
          roles: signer.roles,
          status: signer.status,
          isPackageAdmin: signer.isPackageAdmin,
          signedAt,
          verificationMethod,
          declineReason,
        };
      })
    );

    // Resolve signer-specific template variables ({{signerName}}, {{signerRoles}})
    // in the stored document_content. The package stores base content with these
    // unresolved; individual signing requests get them resolved per-signer.
    // For the status page, resolve using the first signer's data.
    let resolvedContent = pkg.document_content || '';
    if (resolvedContent && signersWithDetails.length > 0) {
      const firstSigner = signersWithDetails[0];
      const roleNames = firstSigner.roles.map((r: { roleId: string; roleName: string }) =>
        r.roleName.charAt(0).toUpperCase() + r.roleName.slice(1)
      ).join(', ');
      resolvedContent = resolvedContent
        .replace(/\{\{\s*signerName\s*\}\}/g, firstSigner.name || '')
        .replace(/\{\{\s*signerRoles\s*\}\}/g, roleNames)
        .replace(/\{\{\s*signerRolesList\s*\}\}/g, firstSigner.roles.map((r: { roleName: string }) => r.roleName).join(', '));
    }

    res.json({
      packageId: status.packageId,
      packageCode: status.packageCode,
      documentName: status.documentName,
      documentContent: resolvedContent,
      jurisdiction: status.jurisdiction,
      status: status.status,
      totalSigners: status.totalSigners,
      completedSigners: status.completedSigners,
      createdAt: status.createdAt,
      expiresAt: status.expiresAt,
      completedAt: status.completedAt,
      contextFields,
      signers: signersWithDetails,
    });
  } catch (error) {
    console.error('Failed to get package status:', error);
    res.status(500).json({ error: 'Failed to load package status' });
  }
});

export default router;
