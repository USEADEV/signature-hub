import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';
import {
  createSignatureRequest,
  getRequest,
  getSignature,
} from '../services/signature';
import { listRequests, deleteRequest, updateRequestStatus } from '../db/queries';
import { CreateRequestInput, RequestFilters } from '../types';

const router = Router();

// Apply authentication and rate limiting to all API routes
router.use(apiKeyAuth);
router.use(apiRateLimit);

// Create a new signature request
router.post('/requests', async (req: Request, res: Response) => {
  try {
    const input: CreateRequestInput = {
      externalRef: req.body.externalRef,
      externalType: req.body.externalType,
      documentName: req.body.documentName,
      documentContent: req.body.documentContent,
      documentUrl: req.body.documentUrl,
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
    res.json(request);
  } catch (error) {
    console.error('Failed to get request:', error);
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
      externalRef: req.query.externalRef as string,
      externalType: req.query.externalType as string,
      signerEmail: req.query.signerEmail as string,
      createdBy: req.query.createdBy as string,
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

export default router;
