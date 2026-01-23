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
import { CreateRequestInput, RequestFilters, CreateTemplateInput, UpdateTemplateInput } from '../types';

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

    // Validate verification method matches available contact info
    if (input.verificationMethod === 'email' && !input.signerEmail) {
      res.status(400).json({ error: 'signerEmail is required when verificationMethod is email' });
      return;
    }
    if (input.verificationMethod === 'sms' && !input.signerPhone) {
      res.status(400).json({ error: 'signerPhone is required when verificationMethod is sms' });
      return;
    }
    if (input.verificationMethod === 'both' && (!input.signerEmail || !input.signerPhone)) {
      res.status(400).json({ error: 'Both signerEmail and signerPhone are required when verificationMethod is both' });
      return;
    }

    // Must have either documentContent, documentUrl, or waiverTemplateCode
    if (!input.documentContent && !input.documentUrl && !input.waiverTemplateCode) {
      res.status(400).json({ error: 'One of documentContent, documentUrl, or waiverTemplateCode is required' });
      return;
    }

    const result = await createSignatureRequest(input);
    res.status(201).json(result);
  } catch (error) {
    console.error('Failed to create signature request:', error);
    res.status(500).json({ error: 'Failed to create signature request' });
  }
});

// Get a signature request by ID
router.get('/requests/:id', async (req: Request, res: Response) => {
  try {
    const request = await getRequest(req.params.id);
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
    const request = await getRequestByRef(req.params.referenceCode);
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

    const requests = await listRequests(filters);
    res.json(requests);
  } catch (error) {
    console.error('Failed to list requests:', error);
    res.status(500).json({ error: 'Failed to list requests' });
  }
});

// Cancel a signature request
router.delete('/requests/:id', async (req: Request, res: Response) => {
  try {
    const request = await getRequest(req.params.id);
    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    if (request.status === 'signed') {
      res.status(400).json({ error: 'Cannot cancel a signed request' });
      return;
    }

    await updateRequestStatus(req.params.id, 'cancelled');
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
    const existing = await getTemplateByCode(input.templateCode);
    if (existing) {
      res.status(409).json({ error: 'Template with this code already exists' });
      return;
    }

    const template = await createTemplate(input);
    res.status(201).json(template);
  } catch (error) {
    console.error('Failed to create template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Get a template by code
router.get('/templates/:templateCode', async (req: Request, res: Response) => {
  try {
    const template = await getTemplateByCode(req.params.templateCode);
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

    const template = await updateTemplate(req.params.templateCode, input);
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
    const templates = await listTemplates(jurisdiction);
    res.json(templates);
  } catch (error) {
    console.error('Failed to list templates:', error);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// Delete (deactivate) a template
router.delete('/templates/:templateCode', async (req: Request, res: Response) => {
  try {
    const template = await getTemplateByCode(req.params.templateCode);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    await deleteTemplate(req.params.templateCode);
    res.json({ success: true, message: 'Template deactivated' });
  } catch (error) {
    console.error('Failed to delete template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
