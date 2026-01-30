# SignatureHub - Complete Reference Document

## Overview

SignatureHub is a document signature application designed to integrate with ShowConnect (equestrian management system). It enables users to receive signature requests via email or SMS, verify their identity through a verification code, and sign documents using either a typed or drawn signature.

**Key Features:**
- API-first design with stable reference codes for tracking
- Waiver template system with merge variables
- Email and SMS verification
- Typed or drawn signature capture
- Full audit trail
- Webhook callbacks on completion

---

## Quick Start for Testing

### Demo Mode

The application runs in **demo mode** by default, which:
- Skips sending real emails/SMS
- Uses verification code `123456` for all requests
- Uses SQLite database (no setup required)

### Test URL

Access the demo page at your deployed URL (e.g., `https://your-app.railway.app/`)

### API Key

Default API key for testing: `demo-api-key`

Include in all API requests as header: `X-API-Key: demo-api-key`

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js + TypeScript + Express.js |
| Database | SQLite (default) or MySQL |
| SMS | Twilio |
| Email | Nodemailer with SMTP (Mandrill) |
| Frontend | Vanilla HTML/CSS/JavaScript |

---

## Application Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SIGNATURE FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. ShowConnect ──► API Request ──► SignatureHub creates request            │
│                                              │                              │
│                                              ▼                              │
│                              Returns: referenceCode + signUrl               │
│                                              │                              │
│                                              ▼                              │
│                                   Email/SMS sent with unique link           │
│                                              │                              │
│                                              ▼                              │
│                                   Signer clicks link                        │
│                                              │                              │
│                                              ▼                              │
│                                   Document displayed for review             │
│                                              │                              │
│                                              ▼                              │
│                                   Verification code sent (email or SMS)     │
│                                              │                              │
│                                              ▼                              │
│                                   Signer enters 6-digit code                │
│                                              │                              │
│                                              ▼                              │
│                                   Signature captured (typed or drawn)       │
│                                              │                              │
│                                              ▼                              │
│                                   Record saved with full audit trail        │
│                                              │                              │
│                                              ▼                              │
│                                   Confirmation sent + webhook callback      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Table: `signature_requests`

Stores all signature request records.

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR(36) | Primary key (UUID) |
| `reference_code` | VARCHAR(20) | **Stable reference code (SIG-XXXXXXXX)** |
| `external_ref` | VARCHAR(100) | ShowConnect reference (e.g., entry_id) |
| `external_type` | VARCHAR(50) | Document type (e.g., 'waiver', 'entry_agreement') |
| `document_category` | VARCHAR(50) | Category: 'waiver', 'agreement', 'consent', 'other' |
| `document_name` | VARCHAR(255) | Human-readable document name |
| `document_content` | TEXT | HTML content to display |
| `document_content_snapshot` | TEXT | **Frozen copy of content at signing time** |
| `document_url` | VARCHAR(500) | URL to PDF if applicable |
| `waiver_template_code` | VARCHAR(100) | **Template code if using templates** |
| `waiver_template_version` | INTEGER | **Version of template used** |
| `merge_variables` | TEXT | **JSON of merge variables used** |
| `jurisdiction` | VARCHAR(10) | **State/jurisdiction code (e.g., 'CA', 'TX')** |
| `metadata` | TEXT | **JSON for custom tracking data** |
| `signer_name` | VARCHAR(255) | Expected signer's name |
| `signer_email` | VARCHAR(255) | Email for verification |
| `signer_phone` | VARCHAR(20) | Phone for SMS verification |
| `verification_method` | ENUM | 'email', 'sms', or 'both' |
| `status` | ENUM | 'pending', 'sent', 'viewed', 'verified', 'signed', 'expired', 'cancelled' |
| `created_at` | TIMESTAMP | When request was created |
| `expires_at` | TIMESTAMP | Link expiration time |
| `signed_at` | TIMESTAMP | When document was signed |
| `callback_url` | VARCHAR(500) | Webhook URL for notification |
| `created_by` | VARCHAR(100) | Who created the request |

### Table: `signature_tokens`

Stores unique URL tokens and verification codes.

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR(36) | Primary key (UUID) |
| `request_id` | VARCHAR(36) | Foreign key to signature_requests |
| `token` | VARCHAR(64) | Unique URL token (64-char random hex) |
| `verification_code` | VARCHAR(6) | 6-digit verification code |
| `code_expires_at` | TIMESTAMP | When code expires (5 minutes) |
| `code_attempts` | INT | Number of failed attempts (max 3) |
| `is_verified` | BOOLEAN | Whether identity is verified |
| `created_at` | TIMESTAMP | When token was created |
| `verified_at` | TIMESTAMP | When verification succeeded |

### Table: `signatures`

Stores completed signatures with audit trail.

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR(36) | Primary key (UUID) |
| `request_id` | VARCHAR(36) | Foreign key to signature_requests (unique) |
| `signature_type` | ENUM | 'typed' or 'drawn' |
| `typed_name` | VARCHAR(255) | Typed signature text |
| `signature_image` | MEDIUMTEXT | Base64 PNG of drawn signature |
| `signer_ip` | VARCHAR(45) | IP address (IPv4 or IPv6) |
| `user_agent` | TEXT | Browser/device information |
| `signed_at` | TIMESTAMP | When signature was captured |
| `verification_method_used` | VARCHAR(20) | 'email' or 'sms' |
| `consent_text` | TEXT | Legal text user agreed to |

### Table: `waiver_templates`

Stores reusable document templates.

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR(36) | Primary key (UUID) |
| `template_code` | VARCHAR(100) | **Unique template identifier** |
| `name` | VARCHAR(255) | Human-readable template name |
| `description` | TEXT | Template description |
| `html_content` | TEXT | **HTML with merge variables** |
| `jurisdiction` | VARCHAR(10) | State/jurisdiction this applies to |
| `version` | INTEGER | Auto-incremented on content updates |
| `is_active` | BOOLEAN | Whether template is active |
| `created_at` | TIMESTAMP | When template was created |
| `updated_at` | TIMESTAMP | When template was last updated |
| `created_by` | VARCHAR(100) | Who created the template |

---

## API Reference

### Authentication

All internal API endpoints require the `X-API-Key` header:

```
X-API-Key: your_api_key
```

### Base URL

Use your deployed URL (e.g., `https://your-app.railway.app`)

---

## Signature Request Endpoints

### Create Signature Request

Creates a new signature request and sends notification to signer.

```http
POST /api/requests
Content-Type: application/json
X-API-Key: your_api_key
```

**Request Body:**

```json
{
  "documentName": "Entry Agreement 2024",
  "signerName": "John Doe",
  "signerEmail": "john@example.com",
  "signerPhone": "+1234567890",
  "verificationMethod": "email",
  "documentContent": "<h1>Agreement</h1><p>Terms here...</p>",
  "documentUrl": "https://example.com/doc.pdf",
  "waiverTemplateCode": "GENERAL_WAIVER_2024",
  "mergeVariables": {
    "participantName": "John Doe",
    "eventName": "Summer Classic 2024",
    "eventDate": "July 15, 2024"
  },
  "documentCategory": "waiver",
  "jurisdiction": "CA",
  "metadata": {
    "entryId": 12345,
    "showId": 678,
    "customField": "any value"
  },
  "externalRef": "entry_123",
  "externalType": "entry_agreement",
  "expiresAt": "2024-12-31T23:59:59Z",
  "callbackUrl": "https://showconnect.com/api/signatures/callback",
  "createdBy": "admin@showconnect.com"
}
```

**Field Requirements:**

| Field | Required | Description |
|-------|----------|-------------|
| `documentName` | Yes | Human-readable document name |
| `signerName` | Yes | Name of person signing |
| `signerEmail` | Conditional | Required if verificationMethod is 'email' or 'both' |
| `signerPhone` | Conditional | Required if verificationMethod is 'sms' or 'both' |
| `verificationMethod` | No | 'email' (default), 'sms', or 'both' |
| `documentContent` | Conditional | HTML content (required if no documentUrl or waiverTemplateCode) |
| `documentUrl` | Conditional | PDF URL (required if no documentContent or waiverTemplateCode) |
| `waiverTemplateCode` | Conditional | Template code (required if no documentContent or documentUrl) |
| `mergeVariables` | No | Variables to merge into template |
| `documentCategory` | No | 'waiver', 'agreement', 'consent', 'other' |
| `jurisdiction` | No | State code (e.g., 'CA', 'TX') |
| `metadata` | No | Custom JSON data for tracking |
| `externalRef` | No | Your system's reference ID |
| `externalType` | No | Document type in your system |
| `expiresAt` | No | Custom expiration (default: 7 days) |
| `callbackUrl` | No | Webhook URL for completion notification |
| `createdBy` | No | Creator identifier |

**Response (201 Created):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "referenceCode": "SIG-A7K3M9X2",
  "signUrl": "https://your-app.railway.app/sign/abc123def456...",
  "status": "pending",
  "expiresAt": "2024-01-22T12:00:00.000Z"
}
```

**Important:** Store the `referenceCode` - this is the stable identifier for tracking this request.

---

### Get Request by ID

```http
GET /api/requests/:id
X-API-Key: your_api_key
```

**Response (200 OK):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "referenceCode": "SIG-A7K3M9X2",
  "externalRef": "entry_123",
  "externalType": "entry_agreement",
  "documentCategory": "waiver",
  "documentName": "Entry Agreement 2024",
  "jurisdiction": "CA",
  "metadata": {
    "entryId": 12345,
    "showId": 678
  },
  "waiverTemplateCode": "GENERAL_WAIVER_2024",
  "waiverTemplateVersion": 3,
  "signerName": "John Doe",
  "signerEmail": "john@example.com",
  "status": "signed",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "expiresAt": "2024-01-22T10:00:00.000Z",
  "signedAt": "2024-01-15T14:30:00.000Z",
  "signature": {
    "signatureType": "typed",
    "typedName": "John Doe",
    "hasImage": false,
    "verificationMethodUsed": "email",
    "signerIp": "192.168.1.100"
  }
}
```

---

### Get Request by Reference Code

Use this to check status using the stable reference code.

```http
GET /api/requests/ref/:referenceCode
X-API-Key: your_api_key
```

**Example:**
```http
GET /api/requests/ref/SIG-A7K3M9X2
```

**Response:** Same as Get Request by ID

---

### Get Signature Details

```http
GET /api/requests/:id/signature
X-API-Key: your_api_key
```

**Response (200 OK):**

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "signature_type": "typed",
  "typed_name": "John Doe",
  "signature_image": null,
  "signer_ip": "192.168.1.100",
  "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
  "signed_at": "2024-01-15T14:30:00.000Z",
  "verification_method_used": "email",
  "consent_text": "I agree that my electronic signature is legally binding..."
}
```

---

### List Requests

```http
GET /api/requests
X-API-Key: your_api_key
```

**Query Parameters:**

| Parameter | Description |
|-----------|-------------|
| `status` | Filter by status |
| `referenceCode` | Filter by reference code |
| `externalRef` | Filter by external reference |
| `externalType` | Filter by document type |
| `signerEmail` | Filter by signer email |
| `createdBy` | Filter by creator |
| `jurisdiction` | Filter by jurisdiction |
| `limit` | Max results (default: 100) |
| `offset` | Pagination offset |

**Example:**
```http
GET /api/requests?status=signed&jurisdiction=CA&limit=50
```

**Response (200 OK):**

```json
[
  {
    "id": "...",
    "reference_code": "SIG-A7K3M9X2",
    "document_name": "Entry Agreement 2024",
    "signer_name": "John Doe",
    "status": "signed",
    ...
  },
  ...
]
```

---

### Cancel Request

```http
DELETE /api/requests/:id
X-API-Key: your_api_key
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Request cancelled"
}
```

**Note:** Cannot cancel requests that are already signed.

---

## Multi-Party Package Endpoints

### Create Package

```http
POST /api/packages
Content-Type: application/json
X-API-Key: your_api_key
```

Creates a signing package for multiple signers with automatic role consolidation (signers sharing an email receive a single signing link).

**Request Body:**

```json
{
  "templateCode": "LIABILITY_WAIVER_2024",
  "documentName": "Team Waiver Agreement",
  "jurisdiction": "US-VA",
  "eventDate": "2024-07-01",
  "mergeVariables": { "organizationName": "Sports Academy" },
  "externalRef": "registration-001",
  "callbackUrl": "https://your-server.com/webhook",
  "signers": [
    {
      "role": "participant",
      "name": "John Athlete",
      "email": "john@example.com",
      "dateOfBirth": "2010-05-15",
      "isMinor": true,
      "isPackageAdmin": true
    },
    {
      "role": "guardian",
      "name": "Jane Parent",
      "email": "jane@example.com",
      "dateOfBirth": "1985-03-20"
    }
  ]
}
```

---

### Get Package Status

```http
GET /api/packages/:id
X-API-Key: your_api_key
```

Retrieve by package ID or package code. Returns detailed status including all signers and their completion status.

> **Need multiple packages?** Use [Batch Get Package Status](#batch-get-package-status) to retrieve up to 50 packages in a single `POST /api/packages/batch` request.

---

### Batch Get Package Status

```http
POST /api/packages/batch
Content-Type: application/json
X-API-Key: your_api_key
```

Retrieve enriched status for multiple packages in a single request. Each ID can be a package UUID or package code.

**Request Body:**

```json
{
  "ids": [
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "PKG-ABC12345",
    "nonexistent-id"
  ]
}
```

**Response (200):**

```json
{
  "results": [
    {
      "packageId": "a1b2c3d4-...",
      "packageCode": "PKG-ABC12345",
      "status": "partial",
      "totalSigners": 2,
      "completedSigners": 1,
      "signers": [...]
    }
  ],
  "notFound": ["nonexistent-id"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `results` | array | Array of package status objects (same as Get Package Status) |
| `notFound` | string[] | IDs/codes that could not be resolved |

**Validation:**
- `ids` must be a non-empty array of strings
- Maximum 50 IDs per request
- Duplicates are automatically deduplicated
- Always returns 200; check `notFound` for unresolved IDs

---

### List Packages

```http
GET /api/packages
X-API-Key: your_api_key
```

**Query Parameters:**

| Parameter | Description |
|-----------|-------------|
| `status` | Filter: pending, partial, complete, expired, cancelled |
| `externalRef` | Filter by external reference |
| `limit` | Max results (default: 100) |
| `offset` | Pagination offset |

---

### Replace Signer

```http
PUT /api/packages/:id/roles/:roleId
Content-Type: application/json
X-API-Key: your_api_key
```

Replace a signer who hasn't signed yet. The role ID can be found in the Get Package Status response.

```json
{
  "name": "New Signer Name",
  "email": "new@example.com",
  "dateOfBirth": "1990-01-15"
}
```

---

## Template Endpoints

### Create Template

```http
POST /api/templates
Content-Type: application/json
X-API-Key: your_api_key
```

**Request Body:**

```json
{
  "templateCode": "GENERAL_WAIVER_2024",
  "name": "General Liability Waiver 2024",
  "description": "Standard waiver for all events",
  "htmlContent": "<h1>Liability Waiver</h1><p>I, {{participantName}}, agree to participate in {{eventName}} on {{eventDate}}...</p>",
  "jurisdiction": "CA",
  "createdBy": "admin@showconnect.com"
}
```

**Field Requirements:**

| Field | Required | Description |
|-------|----------|-------------|
| `templateCode` | Yes | Unique identifier (e.g., GENERAL_WAIVER_2024) |
| `name` | Yes | Human-readable name |
| `htmlContent` | Yes | HTML with merge variables |
| `description` | No | Template description |
| `jurisdiction` | No | State code this template applies to |
| `createdBy` | No | Creator identifier |

**Response (201 Created):**

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "template_code": "GENERAL_WAIVER_2024",
  "name": "General Liability Waiver 2024",
  "description": "Standard waiver for all events",
  "html_content": "<h1>Liability Waiver</h1>...",
  "jurisdiction": "CA",
  "version": 1,
  "is_active": true,
  "created_at": "2024-01-15T10:00:00.000Z",
  "updated_at": "2024-01-15T10:00:00.000Z",
  "created_by": "admin@showconnect.com"
}
```

---

### Get Template

```http
GET /api/templates/:templateCode
X-API-Key: your_api_key
```

**Example:**
```http
GET /api/templates/GENERAL_WAIVER_2024
```

---

### Update Template

```http
PUT /api/templates/:templateCode
Content-Type: application/json
X-API-Key: your_api_key
```

**Request Body (all fields optional):**

```json
{
  "name": "Updated Waiver Name",
  "description": "Updated description",
  "htmlContent": "<h1>Updated Content</h1>...",
  "jurisdiction": "TX",
  "isActive": true
}
```

**Note:** Updating `htmlContent` automatically increments the version number.

---

### List Templates

```http
GET /api/templates
X-API-Key: your_api_key
```

**Query Parameters:**

| Parameter | Description |
|-----------|-------------|
| `jurisdiction` | Filter by jurisdiction (also returns templates with no jurisdiction) |

**Example:**
```http
GET /api/templates?jurisdiction=CA
```

---

### Delete (Deactivate) Template

```http
DELETE /api/templates/:templateCode
X-API-Key: your_api_key
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Template deactivated"
}
```

**Note:** Templates are soft-deleted (marked inactive) to preserve audit trail.

---

## Merge Variables

Templates support merge variables using `{{variableName}}` syntax.

**Example Template:**

```html
<h1>Liability Waiver</h1>
<p>Event: {{eventName}}</p>
<p>Date: {{eventDate}}</p>
<p>I, {{participantName}}, acknowledge the risks involved...</p>
<p>Emergency Contact: {{emergencyContact}} - {{emergencyPhone}}</p>
```

**Using with Request:**

```json
{
  "waiverTemplateCode": "GENERAL_WAIVER_2024",
  "mergeVariables": {
    "eventName": "Summer Classic 2024",
    "eventDate": "July 15, 2024",
    "participantName": "John Doe",
    "emergencyContact": "Jane Doe",
    "emergencyPhone": "(555) 123-4567"
  },
  "signerName": "John Doe",
  "signerEmail": "john@example.com",
  "documentName": "Summer Classic 2024 Waiver"
}
```

**Result:** The template is resolved with all variables replaced, and the resolved content is stored in `document_content_snapshot` for audit purposes.

---

## Webhook Callback

When a document is signed, SignatureHub sends a POST request to the configured `callbackUrl`:

```http
POST {callbackUrl}
Content-Type: application/json
X-Signature-Event: signature.completed
```

**Payload:**

```json
{
  "event": "signature.completed",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "referenceCode": "SIG-A7K3M9X2",
  "externalRef": "entry_123",
  "externalType": "entry_agreement",
  "documentCategory": "waiver",
  "jurisdiction": "CA",
  "metadata": {
    "entryId": 12345,
    "showId": 678
  },
  "waiverTemplateCode": "GENERAL_WAIVER_2024",
  "waiverTemplateVersion": 3,
  "signedAt": "2024-01-15T14:30:00.000Z",
  "signatureType": "typed",
  "signerName": "John Doe"
}
```

---

## Testing Guide

### Step 1: Create a Template (Optional)

```bash
curl -X POST https://your-app.railway.app/api/templates \
  -H "Content-Type: application/json" \
  -H "X-API-Key: demo-api-key" \
  -d '{
    "templateCode": "TEST_WAIVER",
    "name": "Test Waiver",
    "htmlContent": "<h1>Test Waiver</h1><p>I, {{participantName}}, agree to participate in {{eventName}}.</p>",
    "jurisdiction": "CA"
  }'
```

### Step 2: Create a Signature Request

**Using template:**

```bash
curl -X POST https://your-app.railway.app/api/requests \
  -H "Content-Type: application/json" \
  -H "X-API-Key: demo-api-key" \
  -d '{
    "documentName": "Test Event Waiver",
    "signerName": "Test User",
    "signerEmail": "test@example.com",
    "waiverTemplateCode": "TEST_WAIVER",
    "mergeVariables": {
      "participantName": "Test User",
      "eventName": "Test Event 2024"
    },
    "jurisdiction": "CA",
    "metadata": {
      "testId": 123
    }
  }'
```

**Using inline content:**

```bash
curl -X POST https://your-app.railway.app/api/requests \
  -H "Content-Type: application/json" \
  -H "X-API-Key: demo-api-key" \
  -d '{
    "documentName": "Test Agreement",
    "signerName": "Test User",
    "signerEmail": "test@example.com",
    "documentContent": "<h1>Agreement</h1><p>I agree to the terms.</p>"
  }'
```

### Step 3: Open the Sign URL

1. Copy the `signUrl` from the response
2. Open it in a browser
3. Review the document
4. Click "Continue to Verification"
5. In demo mode, enter code: `123456`
6. Sign using typed or drawn signature
7. Click "Sign Document"

### Step 4: Check Status

```bash
curl https://your-app.railway.app/api/requests/ref/SIG-XXXXXXXX \
  -H "X-API-Key: demo-api-key"
```

---

## Request Status Lifecycle

```
pending → sent → viewed → verified → signed
                    ↓
                expired (if link expires)
                    ↓
               cancelled (via API)
```

| Status | Description |
|--------|-------------|
| `pending` | Request created, notification not yet sent |
| `sent` | Email/SMS notification sent to signer |
| `viewed` | Signer opened the signing page |
| `verified` | Signer passed identity verification |
| `signed` | Document successfully signed |
| `expired` | Link expired before signing |
| `cancelled` | Request cancelled via API |

---

## How to Add Templates

### Method 1: Via API (Recommended)

Use the template endpoints to create and manage templates programmatically.

### Method 2: Direct Database Insert

For bulk template creation, you can insert directly into the database:

```sql
INSERT INTO waiver_templates (
  id, template_code, name, description, html_content,
  jurisdiction, version, is_active, created_by
) VALUES (
  'unique-uuid-here',
  'TEMPLATE_CODE',
  'Template Name',
  'Description of template',
  '<h1>Waiver Title</h1><p>Content with {{mergeVariable}}...</p>',
  'CA',
  1,
  1,
  'admin@showconnect.com'
);
```

### Template Best Practices

1. **Use descriptive template codes**: `GENERAL_WAIVER_2024`, `ENTRY_AGREEMENT_CA`, etc.
2. **Version by year**: Create new templates each year rather than modifying old ones
3. **Use merge variables** for dynamic content: `{{participantName}}`, `{{eventDate}}`, etc.
4. **Set jurisdiction** for state-specific waivers
5. **Test templates** before using in production by creating a test signature request

### Sample Template HTML

```html
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
  <h1 style="text-align: center;">RELEASE AND WAIVER OF LIABILITY</h1>
  <h2 style="text-align: center;">{{eventName}}</h2>

  <p><strong>Event Date:</strong> {{eventDate}}</p>
  <p><strong>Location:</strong> {{eventLocation}}</p>

  <p>I, <strong>{{participantName}}</strong>, in consideration of being permitted to
  participate in the above event, hereby agree to the following:</p>

  <ol>
    <li>I acknowledge that equestrian activities involve inherent risks...</li>
    <li>I release and hold harmless {{organizationName}} from any claims...</li>
    <li>I agree to follow all safety rules and regulations...</li>
  </ol>

  <p><strong>Emergency Contact:</strong> {{emergencyName}} - {{emergencyPhone}}</p>

  <p style="margin-top: 30px;">
    By signing below, I acknowledge that I have read and understand this waiver.
  </p>
</div>
```

---

## Project Structure

```
signature-app/
├── src/
│   ├── index.ts                 # Express app entry point
│   ├── config.ts                # Environment configuration
│   ├── types/
│   │   └── index.ts             # TypeScript interfaces
│   ├── db/
│   │   ├── connection.ts        # MySQL connection pool
│   │   ├── sqlite.ts            # SQLite connection and schema
│   │   ├── queries.ts           # Database operations
│   │   └── migrate.ts           # MySQL migration runner
│   ├── middleware/
│   │   ├── auth.ts              # API key authentication
│   │   └── rateLimit.ts         # Rate limiting middleware
│   ├── services/
│   │   ├── email.ts             # Nodemailer email service
│   │   ├── twilio.ts            # Twilio SMS service
│   │   ├── verification.ts      # Verification code logic
│   │   └── signature.ts         # Core signature operations
│   └── routes/
│       ├── api.ts               # Internal API routes
│       └── sign.ts              # Public signing routes
├── public/
│   ├── index.html               # Demo landing page
│   ├── sign.html                # Signature capture page
│   ├── css/
│   │   └── style.css            # Responsive styles
│   └── js/
│       ├── signature-pad.js     # Canvas drawing class
│       └── app.js               # Signing page logic
├── migrations/
│   └── 001_initial.sql          # MySQL schema
├── data/                        # SQLite database directory
├── package.json
├── tsconfig.json
├── railway.json                 # Railway deployment config
├── .env.example                 # Environment template
└── README.md
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3000 | Server port |
| `BASE_URL` | No | http://localhost:3000 | Public URL for sign links |
| `NODE_ENV` | No | development | Environment mode |
| `DEMO_MODE` | No | true | Skip real email/SMS, use code 123456 |
| `DB_TYPE` | No | sqlite | Database type: 'sqlite' or 'mysql' |
| `API_KEY` | No | demo-api-key | API key for internal endpoints |
| `DB_HOST` | If MySQL | localhost | MySQL host |
| `DB_PORT` | If MySQL | 3306 | MySQL port |
| `DB_USER` | If MySQL | root | MySQL user |
| `DB_PASSWORD` | If MySQL | - | MySQL password |
| `DB_NAME` | If MySQL | showconnect | MySQL database |
| `TWILIO_ACCOUNT_SID` | If SMS | - | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | If SMS | - | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | If SMS | - | Twilio phone number |
| `SMTP_HOST` | If Email | - | SMTP server host |
| `SMTP_PORT` | If Email | 587 | SMTP port |
| `SMTP_SECURE` | No | false | Use TLS |
| `SMTP_USER` | If Email | - | SMTP username |
| `SMTP_PASSWORD` | If Email | - | SMTP password |
| `EMAIL_FROM` | If Email | - | From email address |

---

## Security Features

1. **Token Security**: 64-character cryptographically random URL tokens
2. **Verification Codes**: 6-digit codes with 5-minute expiry
3. **Rate Limiting**:
   - Verification: 10 requests per 15 minutes per IP
   - Signature submission: 20 per hour per IP
   - API: 100 requests per minute
4. **Attempt Limiting**: Max 3 verification code attempts per token
5. **API Authentication**: X-API-Key header required for internal endpoints
6. **Security Headers**: Helmet.js for CSP, XSS protection, etc.
7. **Audit Trail**: Full logging of IP, user agent, timestamps, consent text
8. **Content Snapshots**: Exact signed content preserved for audit

---

## Integration Example (Java/Spring)

```java
RestTemplate restTemplate = new RestTemplate();
HttpHeaders headers = new HttpHeaders();
headers.set("X-API-Key", signatureApiKey);
headers.setContentType(MediaType.APPLICATION_JSON);

Map<String, Object> request = Map.of(
    "documentName", "Entry Agreement 2024",
    "signerName", participant.getName(),
    "signerEmail", participant.getEmail(),
    "signerPhone", participant.getPhone(),
    "verificationMethod", "email",
    "waiverTemplateCode", "ENTRY_WAIVER_2024",
    "mergeVariables", Map.of(
        "participantName", participant.getName(),
        "eventName", event.getName(),
        "eventDate", event.getDate().toString()
    ),
    "jurisdiction", event.getState(),
    "metadata", Map.of(
        "entryId", entry.getId(),
        "showId", event.getShowId()
    ),
    "externalRef", entry.getId().toString(),
    "externalType", "entry_agreement",
    "callbackUrl", baseUrl + "/api/signatures/callback"
);

HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);
ResponseEntity<SignatureResponse> response = restTemplate.postForEntity(
    signatureServiceUrl + "/api/requests",
    entity,
    SignatureResponse.class
);

// Store the reference code for status tracking
String referenceCode = response.getBody().getReferenceCode();
entry.setSignatureReferenceCode(referenceCode);

// The signUrl can be sent to the participant
String signUrl = response.getBody().getSignUrl();
```

---

## Current Deployment

- **Repository**: https://github.com/USEADEV/signature-hub
- **Hosting**: Railway
- **Database**: SQLite (embedded)
- **SMS**: Twilio (configured)
- **Email**: Mandrill/SMTP (configured)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Initial | Core signature flow with MySQL |
| 1.1.0 | - | Added SQLite support, demo mode |
| 1.2.0 | Current | Added waiver templates, reference codes, jurisdiction, metadata |
