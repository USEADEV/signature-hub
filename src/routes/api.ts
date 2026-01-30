import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';
import {
  createSignatureRequest,
  getRequest,
  getRequestByRef,
  getRequestStatus,
  getSignature,
} from '../services/signature';
import {
  listRequests,
  deleteRequest,
  updateRequestStatus,
  createTemplate,
  getTemplateByCode,
  updateTemplate,
  listTemplates,
  deleteTemplate,
} from '../db/queries';
import {
  createPackage,
  getPackageById,
  getPackageByCode,
  getPackageStatus,
  getPackageStatusBatch,
  listPackages,
  upsertJurisdictionAddendum,
  listJurisdictions,
  getRoleAgeRequirements,
  replaceSigner,
} from '../services/package';
import {
  CreateRequestInput,
  RequestFilters,
  CreateTemplateInput,
  UpdateTemplateInput,
  CreatePackageInput,
  PackageStatus,
  ReplaceSignerInput,
} from '../types';

const router = Router();

// Apply authentication and rate limiting to all API routes
router.use(apiKeyAuth);
router.use(apiRateLimit);

// ============================================
// SIGNATURE REQUESTS
// ============================================

// Create a new signature request
router.post('/requests', async (req: Request, res: Response) => {
  try {
    const input: CreateRequestInput = {
      externalRef: req.body.externalRef,
      externalType: req.body.externalType,
      documentCategory: req.body.documentCategory,
      documentName: req.body.documentName,
      documentContent: req.body.documentContent,
      documentUrl: req.body.documentUrl,
      waiverTemplateCode: req.body.waiverTemplateCode,
      mergeVariables: req.body.mergeVariables,
      jurisdiction: req.body.jurisdiction,
      metadata: req.body.metadata,
      signerName: req.body.signerName,
      signerEmail: req.body.signerEmail,
      signerPhone: req.body.signerPhone,
      verificationMethod: req.body.verificationMethod,
      expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
      callbackUrl: req.body.callbackUrl,
      createdBy: req.body.createdBy,
    };

    // Validation
    if (!input.documentName) {
      res.status(400).json({ error: 'documentName is required' });
      return;
    }
    if (!input.signerName) {
      res.status(400).json({ error: 'signerName is required' });
      return;
    }
    if (!input.signerEmail && !input.signerPhone) {
      res.status(400).json({ error: 'Either signerEmail or signerPhone is required' });
      return;
    }

    // Auto-detect verification method based on available contact info
    // If both email and phone provided, use 'both'
    // If only email, use 'email'
    // If only phone, use 'sms'
    if (!input.verificationMethod) {
      if (input.signerEmail && input.signerPhone) {
        input.verificationMethod = 'both';
      } else if (input.signerEmail) {
        input.verificationMethod = 'email';
      } else {
        input.verificationMethod = 'sms';
      }
    }

    // Must have either documentContent, documentUrl, or waiverTemplateCode
    if (!input.documentContent && !input.documentUrl && !input.waiverTemplateCode) {
      res.status(400).json({ error: 'One of documentContent, documentUrl, or waiverTemplateCode is required' });
      return;
    }

    const result = await createSignatureRequest(input, req.tenantId!);
    res.status(201).json(result);
  } catch (error) {
    console.error('Failed to create signature request:', error);
    res.status(500).json({ error: 'Failed to create signature request' });
  }
});

// Get a signature request by ID
router.get('/requests/:id', async (req: Request, res: Response) => {
  try {
    const request = await getRequest(req.params.id, req.tenantId!);
    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    const status = await getRequestStatus(request);
    res.json(status);
  } catch (error) {
    console.error('Failed to get request:', error);
    res.status(500).json({ error: 'Failed to get request' });
  }
});

// Get a signature request by reference code
router.get('/requests/ref/:referenceCode', async (req: Request, res: Response) => {
  try {
    const request = await getRequestByRef(req.params.referenceCode, req.tenantId!);
    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    const status = await getRequestStatus(request);
    res.json(status);
  } catch (error) {
    console.error('Failed to get request by reference code:', error);
    res.status(500).json({ error: 'Failed to get request' });
  }
});

// Get signature details for a request
router.get('/requests/:id/signature', async (req: Request, res: Response) => {
  try {
    // Verify tenant ownership first
    const request = await getRequest(req.params.id, req.tenantId!);
    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    const signature = await getSignature(req.params.id);
    if (!signature) {
      res.status(404).json({ error: 'Signature not found' });
      return;
    }
    res.json(signature);
  } catch (error) {
    console.error('Failed to get signature:', error);
    res.status(500).json({ error: 'Failed to get signature' });
  }
});

// List signature requests with filters
router.get('/requests', async (req: Request, res: Response) => {
  try {
    const filters: RequestFilters = {
      status: req.query.status as RequestFilters['status'],
      referenceCode: req.query.referenceCode as string,
      externalRef: req.query.externalRef as string,
      externalType: req.query.externalType as string,
      signerEmail: req.query.signerEmail as string,
      createdBy: req.query.createdBy as string,
      jurisdiction: req.query.jurisdiction as string,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    };

    const requests = await listRequests(filters, req.tenantId!);
    res.json(requests);
  } catch (error) {
    console.error('Failed to list requests:', error);
    res.status(500).json({ error: 'Failed to list requests' });
  }
});

// Cancel a signature request
router.delete('/requests/:id', async (req: Request, res: Response) => {
  try {
    const request = await getRequest(req.params.id, req.tenantId!);
    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    if (request.status === 'signed') {
      res.status(400).json({ error: 'Cannot cancel a signed request' });
      return;
    }

    await updateRequestStatus(req.params.id, 'cancelled', req.tenantId!);
    res.json({ success: true, message: 'Request cancelled' });
  } catch (error) {
    console.error('Failed to cancel request:', error);
    res.status(500).json({ error: 'Failed to cancel request' });
  }
});

// ============================================
// WAIVER TEMPLATES
// ============================================

// Create a new template
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const input: CreateTemplateInput = {
      templateCode: req.body.templateCode,
      name: req.body.name,
      description: req.body.description,
      htmlContent: req.body.htmlContent,
      jurisdiction: req.body.jurisdiction,
      createdBy: req.body.createdBy,
    };

    // Validation
    if (!input.templateCode) {
      res.status(400).json({ error: 'templateCode is required' });
      return;
    }
    if (!input.name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!input.htmlContent) {
      res.status(400).json({ error: 'htmlContent is required' });
      return;
    }

    // Check for duplicate
    const existing = await getTemplateByCode(input.templateCode, req.tenantId!);
    if (existing) {
      res.status(409).json({ error: 'Template with this code already exists' });
      return;
    }

    const template = await createTemplate(input, req.tenantId!);
    res.status(201).json(template);
  } catch (error) {
    console.error('Failed to create template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Get a template by code
router.get('/templates/:templateCode', async (req: Request, res: Response) => {
  try {
    const template = await getTemplateByCode(req.params.templateCode, req.tenantId!);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(template);
  } catch (error) {
    console.error('Failed to get template:', error);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

// Update a template
router.put('/templates/:templateCode', async (req: Request, res: Response) => {
  try {
    const input: UpdateTemplateInput = {
      name: req.body.name,
      description: req.body.description,
      htmlContent: req.body.htmlContent,
      jurisdiction: req.body.jurisdiction,
      isActive: req.body.isActive,
    };

    const template = await updateTemplate(req.params.templateCode, input, req.tenantId!);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(template);
  } catch (error) {
    console.error('Failed to update template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// List templates
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const jurisdiction = req.query.jurisdiction as string | undefined;
    const templates = await listTemplates(jurisdiction, req.tenantId!);
    res.json(templates);
  } catch (error) {
    console.error('Failed to list templates:', error);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// Delete (deactivate) a template
router.delete('/templates/:templateCode', async (req: Request, res: Response) => {
  try {
    const template = await getTemplateByCode(req.params.templateCode, req.tenantId!);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    await deleteTemplate(req.params.templateCode, req.tenantId!);
    res.json({ success: true, message: 'Template deactivated' });
  } catch (error) {
    console.error('Failed to delete template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ============================================
// SIGNING PACKAGES (Multi-party signing)
// ============================================

// Create a new signing package
router.post('/packages', async (req: Request, res: Response) => {
  try {
    const input: CreatePackageInput = {
      templateCode: req.body.templateCode,
      documentName: req.body.documentName,
      documentContent: req.body.documentContent,
      externalRef: req.body.externalRef,
      externalType: req.body.externalType,
      jurisdiction: req.body.jurisdiction,
      mergeVariables: req.body.mergeVariables,
      eventDate: req.body.eventDate,
      signers: req.body.signers,
      verificationMethod: req.body.verificationMethod,
      expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
      callbackUrl: req.body.callbackUrl,
      createdBy: req.body.createdBy,
    };

    // Validation
    if (!input.signers || !Array.isArray(input.signers) || input.signers.length === 0) {
      res.status(400).json({ error: 'signers array is required and must not be empty' });
      return;
    }

    // Validate each signer
    for (let i = 0; i < input.signers.length; i++) {
      const signer = input.signers[i];
      if (!signer.role) {
        res.status(400).json({ error: `signers[${i}].role is required` });
        return;
      }
      if (!signer.name) {
        res.status(400).json({ error: `signers[${i}].name is required` });
        return;
      }
      if (!signer.email && !signer.phone) {
        res.status(400).json({ error: `signers[${i}] must have either email or phone` });
        return;
      }
    }

    // Must have either templateCode, documentContent, or documentName with content
    if (!input.templateCode && !input.documentContent && !input.documentName) {
      res.status(400).json({ error: 'One of templateCode, documentContent, or documentName is required' });
      return;
    }

    const result = await createPackage(input, req.tenantId!);
    res.status(201).json(result);
  } catch (error) {
    console.error('Failed to create package:', error);
    // Return validation errors with 400 status
    if (error instanceof Error && error.message.startsWith('Age validation failed:')) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Failed to create signing package' });
  }
});

// Get a package by ID
router.get('/packages/:id', async (req: Request, res: Response) => {
  try {
    // Try by ID first, then by code
    let pkg = await getPackageById(req.params.id, req.tenantId!);
    if (!pkg) {
      pkg = await getPackageByCode(req.params.id, req.tenantId!);
    }
    if (!pkg) {
      res.status(404).json({ error: 'Package not found' });
      return;
    }

    const status = await getPackageStatus(pkg.id, req.tenantId!);
    res.json(status);
  } catch (error) {
    console.error('Failed to get package:', error);
    res.status(500).json({ error: 'Failed to get package' });
  }
});

// Batch get package statuses
router.post('/packages/batch', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids)) {
      res.status(400).json({ error: 'Request body must contain an "ids" array' });
      return;
    }

    if (ids.length === 0) {
      res.status(400).json({ error: 'The "ids" array must not be empty' });
      return;
    }

    const MAX_BATCH_SIZE = 50;
    if (ids.length > MAX_BATCH_SIZE) {
      res.status(400).json({
        error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}. Received ${ids.length} IDs.`
      });
      return;
    }

    if (!ids.every((id: unknown) => typeof id === 'string' && (id as string).trim().length > 0)) {
      res.status(400).json({ error: 'All elements in "ids" must be non-empty strings' });
      return;
    }

    // Deduplicate while preserving order
    const uniqueIds = [...new Set(ids.map((id: string) => id.trim()))];

    const result = await getPackageStatusBatch(uniqueIds, req.tenantId!);
    res.json(result);
  } catch (error) {
    console.error('Failed to batch get packages:', error);
    res.status(500).json({ error: 'Failed to batch get packages' });
  }
});

// List packages with filters
router.get('/packages', async (req: Request, res: Response) => {
  try {
    const filters = {
      status: req.query.status as PackageStatus | undefined,
      externalRef: req.query.externalRef as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    };

    const packages = await listPackages(filters, req.tenantId!);
    res.json(packages);
  } catch (error) {
    console.error('Failed to list packages:', error);
    res.status(500).json({ error: 'Failed to list packages' });
  }
});

// Replace a signer in a package
router.put('/packages/:id/roles/:roleId', async (req: Request, res: Response) => {
  try {
    const input: ReplaceSignerInput = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      dateOfBirth: req.body.dateOfBirth,
      verificationMethod: req.body.verificationMethod,
    };

    // Validation
    if (!input.name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!input.email && !input.phone) {
      res.status(400).json({ error: 'Either email or phone is required' });
      return;
    }

    // Try to find package by ID or code
    let pkg = await getPackageById(req.params.id, req.tenantId!);
    if (!pkg) {
      pkg = await getPackageByCode(req.params.id, req.tenantId!);
    }
    if (!pkg) {
      res.status(404).json({ error: 'Package not found' });
      return;
    }

    const result = await replaceSigner(pkg.id, req.params.roleId, input, req.tenantId!);
    res.json(result);
  } catch (error) {
    console.error('Failed to replace signer:', error);
    if (error instanceof Error) {
      // Return user-friendly errors for validation failures
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

// ============================================
// JURISDICTIONS
// ============================================

// Create or update a jurisdiction addendum
router.post('/jurisdictions', async (req: Request, res: Response) => {
  try {
    const { jurisdictionCode, jurisdictionName, addendumHtml } = req.body;

    if (!jurisdictionCode) {
      res.status(400).json({ error: 'jurisdictionCode is required' });
      return;
    }
    if (!jurisdictionName) {
      res.status(400).json({ error: 'jurisdictionName is required' });
      return;
    }
    if (!addendumHtml) {
      res.status(400).json({ error: 'addendumHtml is required' });
      return;
    }

    const addendum = await upsertJurisdictionAddendum(jurisdictionCode, jurisdictionName, addendumHtml, req.tenantId!);
    res.status(201).json(addendum);
  } catch (error) {
    console.error('Failed to create jurisdiction:', error);
    res.status(500).json({ error: 'Failed to create jurisdiction addendum' });
  }
});

// List jurisdictions
router.get('/jurisdictions', async (req: Request, res: Response) => {
  try {
    const jurisdictions = await listJurisdictions(req.tenantId!);
    res.json(jurisdictions);
  } catch (error) {
    console.error('Failed to list jurisdictions:', error);
    res.status(500).json({ error: 'Failed to list jurisdictions' });
  }
});

// ============================================
// ROLE REQUIREMENTS
// ============================================

// Get role age requirements
router.get('/roles/requirements', (_req: Request, res: Response) => {
  const requirements = getRoleAgeRequirements();
  res.json(requirements);
});

export default router;
