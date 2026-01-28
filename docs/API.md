# SignatureHub API Documentation

## Overview

SignatureHub provides a comprehensive API for electronic signature collection with support for:
- Single signer signature requests
- Multi-party signing packages with role consolidation
- Waiver templates with merge variables
- Jurisdiction-specific addendums
- Age validation for role-based requirements
- Package admin designation for signer replacement
- Real-time webhooks for status updates

**Getting Started:** See the [Interactive Guide](/) for a walkthrough with common scenarios.

---

## Authentication

All API requests require an API key passed in the `X-API-Key` header:

```
X-API-Key: your-api-key-here
```

## Base URL

```
https://your-domain.com/api
```

---

## Single Signer Requests

### Create Signature Request

**POST** `/api/requests`

Create a signature request for a single signer.

**Request Body:**

```json
{
  "documentName": "Liability Waiver",
  "signerName": "John Doe",
  "signerEmail": "john@example.com",
  "signerPhone": "+15551234567",
  "verificationMethod": "email",
  "documentContent": "<h2>Waiver Agreement</h2><p>Terms here...</p>",
  "waiverTemplateCode": "LIABILITY_WAIVER_2024",
  "mergeVariables": {
    "organizationName": "Sports Academy"
  },
  "jurisdiction": "US-VA",
  "metadata": { "category": "registration" },
  "externalRef": "your-system-id",
  "externalType": "registration",
  "callbackUrl": "https://your-server.com/webhook"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| documentName | string | Yes | Name of the document |
| signerName | string | Yes | Full name of the signer |
| signerEmail | string | Conditional | Required if verificationMethod is `email` or `both` |
| signerPhone | string | Conditional | Required if verificationMethod is `sms` or `both` |
| verificationMethod | string | No | `email`, `sms`, or `both` — auto-detected from contact info if omitted |
| documentContent | string | Conditional | HTML content (required if no template or URL) |
| documentUrl | string | Conditional | URL to document (alternative to inline content) |
| waiverTemplateCode | string | Conditional | Use a pre-defined template instead of inline content |
| mergeVariables | object | No | Key-value pairs for template variable substitution |
| jurisdiction | string | No | Jurisdiction code (e.g., `US-VA`) for addendum inclusion |
| metadata | object | No | Arbitrary metadata to attach to the request |
| externalRef | string | No | Your system's reference ID |
| externalType | string | No | Type label for the external reference |
| documentCategory | string | No | Category: `waiver`, `agreement`, `consent`, or `other` |
| expiresAt | string | No | Expiration date (ISO 8601) |
| callbackUrl | string | No | Webhook URL for status updates |
| createdBy | string | No | Identifier of the user/system creating the request |

> **Note:** At least one of `documentContent`, `documentUrl`, or `waiverTemplateCode` is required.

**Response (201):**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "referenceCode": "SIG-ABC12345",
  "signUrl": "https://your-domain.com/sign/token123abc...",
  "status": "pending",
  "expiresAt": "2024-02-15T00:00:00.000Z"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique request ID — use with `GET /api/requests/:id` to check status |
| referenceCode | string | Human-readable reference code (e.g., `SIG-ABC12345`) |
| signUrl | string | Unique signing URL to send to the signer |
| status | string | Initial status (typically `pending`) |
| expiresAt | string | Expiration date (ISO 8601) |

---

### Get Request Status

**GET** `/api/requests/:id`

Returns detailed status for a signature request, including signature details if signed.

**Response (200):**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "referenceCode": "SIG-ABC12345",
  "externalRef": "your-system-id",
  "externalType": "registration",
  "documentCategory": "waiver",
  "documentName": "Liability Waiver",
  "jurisdiction": "US-VA",
  "metadata": { "category": "registration" },
  "waiverTemplateCode": "LIABILITY_WAIVER_2024",
  "waiverTemplateVersion": 1,
  "signerName": "John Doe",
  "signerEmail": "john@example.com",
  "status": "signed",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "expiresAt": "2024-02-15T00:00:00.000Z",
  "signedAt": "2024-01-16T14:30:00.000Z",
  "signature": {
    "signatureType": "typed",
    "typedName": "John Doe",
    "hasImage": false,
    "verificationMethodUsed": "email",
    "signerIp": "192.168.1.1"
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique request ID |
| referenceCode | string | Human-readable reference code |
| externalRef | string | Your system's reference ID (if provided) |
| externalType | string | Type label for external reference (if provided) |
| documentCategory | string | Document category |
| documentName | string | Name of the document |
| jurisdiction | string | Jurisdiction code (if provided) |
| metadata | object | Attached metadata (if provided) |
| waiverTemplateCode | string | Template code used (if applicable) |
| waiverTemplateVersion | number | Template version used (if applicable) |
| signerName | string | Name of the signer |
| signerEmail | string | Email of the signer (if provided) |
| status | string | Current status (see Request Status Values below) |
| createdAt | string | Creation timestamp |
| expiresAt | string | Expiration timestamp (if set) |
| signedAt | string | Signing timestamp (only if signed) |
| signature | object | Signature details (only present if signed — see below) |

**signature Object (present only when status is `signed`):**

| Field | Type | Description |
|-------|------|-------------|
| signatureType | string | `typed` or `drawn` |
| typedName | string | Typed name (if type is `typed`) |
| hasImage | boolean | Whether a drawn signature image exists |
| verificationMethodUsed | string | `email` or `sms` |
| signerIp | string | IP address of the signer |

---

### Get Request by Reference Code

**GET** `/api/requests/ref/:referenceCode`

Returns the same response as [Get Request Status](#get-request-status), looked up by reference code instead of ID.

---

### List Requests

**GET** `/api/requests`

Returns an array of signature requests matching the given filters.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | Filter by status: `pending`, `sent`, `viewed`, `verified`, `signed`, `expired`, `cancelled` |
| signerEmail | string | Filter by signer email address |
| externalRef | string | Filter by your external reference ID |
| externalType | string | Filter by external type |
| referenceCode | string | Filter by reference code |
| jurisdiction | string | Filter by jurisdiction code |
| createdBy | string | Filter by creator |
| limit | number | Max results to return (default: 100) |
| offset | number | Number of results to skip for pagination |

**Response (200):**

```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "reference_code": "SIG-ABC12345",
    "external_ref": "your-system-id",
    "document_name": "Liability Waiver",
    "signer_name": "John Doe",
    "signer_email": "john@example.com",
    "status": "signed",
    "created_at": "2024-01-15T10:00:00.000Z",
    "expires_at": "2024-02-15T00:00:00.000Z",
    "signed_at": "2024-01-16T14:30:00.000Z"
  }
]
```

> **Note:** List responses use `snake_case` field names (matching the database schema), while individual request status responses use `camelCase`.

---

### Request Status Values

| Status | Description |
|--------|-------------|
| pending | Request created, notification not yet sent |
| sent | Notification (email/SMS) sent to signer |
| viewed | Signer opened the signing page |
| verified | Signer completed identity verification |
| signed | Document has been signed |
| expired | Request expired before signing |
| cancelled | Request was cancelled |

---

### Cancel Request

**DELETE** `/api/requests/:id`

Cancel a pending signature request. Cannot cancel requests that are already signed.

**Response (200):**

```json
{
  "success": true,
  "message": "Request cancelled"
}
```

**Error (400) — already signed:**

```json
{
  "error": "Cannot cancel a signed request"
}
```

---

## Multi-Party Signing Packages

Multi-party packages allow collecting signatures from multiple people with automatic role consolidation. When multiple signers share the same email address, they are consolidated into a single signature request.

### Create Package

**POST** `/api/packages`

**Request Body:**

```json
{
  "templateCode": "TEAM_WAIVER_2024",
  "documentName": "Team Registration Waiver",
  "jurisdiction": "US-VA",
  "eventDate": "2024-06-15",
  "mergeVariables": {
    "organizationName": "Sports Academy",
    "eventName": "Summer Training Camp",
    "teamName": "Junior Eagles"
  },
  "signers": [
    {
      "role": "participant",
      "name": "John Smith Jr",
      "email": "parent@example.com",
      "dateOfBirth": "2012-05-15",
      "isMinor": true
    },
    {
      "role": "guardian",
      "name": "John Smith Sr",
      "email": "parent@example.com",
      "dateOfBirth": "1980-03-20",
      "isPackageAdmin": true
    },
    {
      "role": "coach",
      "name": "Mike Wilson",
      "email": "coach@example.com",
      "dateOfBirth": "1985-01-10"
    }
  ],
  "externalRef": "registration-2024-001",
  "callbackUrl": "https://your-server.com/webhook"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| templateCode | string | Conditional | Template to use (required if no `documentContent`) |
| documentName | string | Conditional | Name of the document |
| documentContent | string | Conditional | HTML content (required if no template) |
| jurisdiction | string | No | Jurisdiction code for addendum inclusion |
| eventDate | string | No | Event date for age validation (YYYY-MM-DD) |
| mergeVariables | object | No | Key-value pairs for template variable substitution |
| signers | array | Yes | Array of signer objects (see below) |
| externalRef | string | No | Your system's reference ID |
| externalType | string | No | Type label for the external reference |
| expiresAt | string | No | Expiration date (ISO 8601) |
| callbackUrl | string | No | Webhook URL for status updates |
| createdBy | string | No | Identifier of the user/system creating the package |

**Signer Object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| role | string | Yes | Role name: `participant`, `guardian`, `trainer`, `coach`, `witness`, or custom |
| name | string | Yes | Full name |
| email | string | Conditional | At least `email` OR `phone` required |
| phone | string | Conditional | At least `email` OR `phone` required |
| dateOfBirth | string | No | Date of birth for age validation (YYYY-MM-DD) |
| isMinor | boolean | No | Flag indicating if signer is a minor |
| isPackageAdmin | boolean | No | Designates this signer as the package admin (see below) |

---

**Package Admin:**

One signer per package can be designated as the "package admin" who can:
- Replace signers who refuse or are unable to sign
- Receive notifications about signature status updates

If no signer is explicitly marked as `isPackageAdmin: true`, the first signer is automatically designated as admin. Only one person (or consolidated signer group) can be the package admin.

---

**Automatic Verification Method Detection:**

The verification method is automatically determined from the contact information provided — no need to specify it:

| Contact Info Provided | Verification Used |
|----------------------|-------------------|
| Email only | Email verification |
| Phone only | SMS verification |
| Both email and phone | Both methods |

```json
{
  "signers": [
    { "role": "participant", "name": "John Doe", "email": "john@example.com" },
    { "role": "coach", "name": "Mike Wilson", "phone": "+15551234567" },
    { "role": "guardian", "name": "Jane Doe", "email": "jane@example.com", "phone": "+15559876543" }
  ]
}
```

In this example: John uses email, Mike uses SMS, Jane uses both.

---

**Response (201):**

```json
{
  "packageId": "pkg_abc123",
  "packageCode": "PKG-ABC12345",
  "status": "pending",
  "documentName": "Team Registration Waiver",
  "eventDate": "2024-06-15",
  "totalSigners": 2,
  "signatureRequests": [
    {
      "requestId": "req_def456",
      "signerName": "John Smith Sr",
      "roles": ["participant", "guardian"],
      "signUrl": "https://your-domain.com/sign/token456...",
      "isPackageAdmin": true
    },
    {
      "requestId": "req_ghi789",
      "signerName": "Mike Wilson",
      "roles": ["coach"],
      "signUrl": "https://your-domain.com/sign/token789...",
      "isPackageAdmin": false
    }
  ],
  "expiresAt": "2024-02-15T00:00:00.000Z"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| packageId | string | Unique package identifier |
| packageCode | string | Human-readable package reference code |
| status | string | Package status (initially `pending`) |
| documentName | string | Name of the document |
| eventDate | string | Event date if provided |
| totalSigners | number | Number of unique signers (after consolidation) |
| signatureRequests | array | One entry per unique signer (see below) |
| expiresAt | string | Expiration date (ISO 8601) |

**signatureRequests[] Fields:**

| Field | Type | Description |
|-------|------|-------------|
| requestId | string | **Unique request ID** — use with `GET /api/requests/:id` to check individual signer status |
| signerName | string | Name of the signer |
| roles | string[] | All roles this signer is signing for (consolidated) |
| signUrl | string | Unique signing URL for this signer |
| isPackageAdmin | boolean | Whether this signer is the package admin |

---

### Role Consolidation

When multiple signers share the same email address, they are automatically consolidated:
- A single signature request is created
- All roles are listed on the signing page
- One signature covers all assigned roles
- The consolidated signer receives one `requestId` and one `signUrl`

---

### Age Validation

Certain roles have minimum age requirements validated against the event date:

| Role | Minimum Age |
|------|-------------|
| trainer | 18 |
| coach | 18 |
| guardian | 18 |
| witness | 18 |
| participant | None |

If `eventDate` is provided and a signer's `dateOfBirth` indicates they won't meet the minimum age at the event, the request is rejected with a `400` validation error.

---

### Get Package Status

**GET** `/api/packages/:id`

Retrieve by package ID or package code. Returns detailed status including all signers and their completion status.

**Response (200):**

```json
{
  "packageId": "pkg_abc123",
  "packageCode": "PKG-ABC12345",
  "externalRef": "registration-2024-001",
  "documentName": "Team Registration Waiver",
  "jurisdiction": "US-VA",
  "status": "partial",
  "totalSigners": 2,
  "completedSigners": 1,
  "createdAt": "2024-01-15T10:00:00.000Z",
  "expiresAt": "2024-02-15T00:00:00.000Z",
  "signers": [
    {
      "name": "John Smith Sr",
      "email": "parent@example.com",
      "roles": [
        { "roleId": "role_abc1", "roleName": "participant" },
        { "roleId": "role_abc2", "roleName": "guardian" }
      ],
      "signUrl": "https://your-domain.com/sign/token456...",
      "requestId": "req_def456",
      "status": "signed",
      "isPackageAdmin": true
    },
    {
      "name": "Mike Wilson",
      "email": "coach@example.com",
      "roles": [
        { "roleId": "role_abc3", "roleName": "coach" }
      ],
      "signUrl": "https://your-domain.com/sign/token789...",
      "requestId": "req_ghi789",
      "status": "pending",
      "isPackageAdmin": false
    }
  ]
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| packageId | string | Unique package identifier |
| packageCode | string | Human-readable package reference code |
| externalRef | string | Your external reference (if provided) |
| externalType | string | External type label (if provided) |
| documentName | string | Name of the document |
| jurisdiction | string | Jurisdiction code (if provided) |
| status | string | Current package status (see Package Status Values) |
| totalSigners | number | Total unique signers |
| completedSigners | number | Number of signers who have signed |
| createdAt | string | Creation timestamp |
| expiresAt | string | Expiration timestamp (if set) |
| completedAt | string | Completion timestamp (only if all signed) |
| signers | array | Array of signer status objects (see below) |

**signers[] Fields:**

| Field | Type | Description |
|-------|------|-------------|
| name | string | Signer name |
| email | string | Signer email (if provided) |
| phone | string | Signer phone (if provided) |
| roles | array | Array of `{ roleId, roleName }` objects |
| roles[].roleId | string | Unique role ID — needed for the [Replace Signer](#replace-signer) endpoint |
| roles[].roleName | string | Role name (e.g., `participant`, `guardian`, `coach`) |
| signUrl | string | Signing URL for this signer |
| requestId | string | Request ID — use with `GET /api/requests/:id` |
| status | string | Signer status: `pending`, `sent`, or `signed` |
| isPackageAdmin | boolean | Whether this signer is the package admin |

---

### Package Status Values

| Status | Description |
|--------|-------------|
| pending | Package created, no signatures yet |
| partial | Some signers have signed |
| complete | All signers have signed |
| expired | Package expired before completion |
| cancelled | Package was cancelled |

---

### List Packages

**GET** `/api/packages`

Returns an array of packages matching the given filters.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | Filter by status: `pending`, `partial`, `complete`, `expired`, `cancelled` |
| externalRef | string | Filter by your external reference ID |
| limit | number | Max results to return (default: 100) |
| offset | number | Number of results to skip for pagination |

**Response (200):**

```json
[
  {
    "id": "pkg_abc123",
    "package_code": "PKG-ABC12345",
    "external_ref": "registration-2024-001",
    "document_name": "Team Registration Waiver",
    "jurisdiction": "US-VA",
    "status": "partial",
    "total_signers": 2,
    "completed_signers": 1,
    "created_at": "2024-01-15T10:00:00.000Z",
    "expires_at": "2024-02-15T00:00:00.000Z"
  }
]
```

> **Note:** List responses use `snake_case` field names (matching the database schema).

---

### Replace Signer

**PUT** `/api/packages/:id/roles/:roleId`

Replace a signer who hasn't signed yet. The `:id` parameter accepts either a package ID or package code. The `:roleId` comes from the [Get Package Status](#get-package-status) response.

**Request Body:**

```json
{
  "name": "New Signer Name",
  "email": "newsigner@example.com",
  "phone": "+15551234567",
  "dateOfBirth": "1990-04-15"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Full name of the new signer |
| email | string | Conditional | At least `email` OR `phone` required |
| phone | string | Conditional | At least `email` OR `phone` required |
| dateOfBirth | string | No | Date of birth for age validation (YYYY-MM-DD) |

> Verification method is auto-detected based on the contact info provided.

**Response (200):**

```json
{
  "roleId": "role_abc123",
  "roleName": "guardian",
  "previousSigner": "Jane Smith",
  "newSigner": "Bob Smith",
  "signUrl": "https://your-domain.com/sign/newtoken789..."
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| roleId | string | The role that was updated |
| roleName | string | Name of the role (e.g., `guardian`, `coach`) |
| previousSigner | string | Name of the replaced signer |
| newSigner | string | Name of the new signer |
| signUrl | string | New signing URL for the replacement signer |

**Important Notes:**
- Can only replace signers who haven't signed yet
- The role name stays the same — only the person changes
- If roles were consolidated (same email), all consolidated roles are updated
- The original signing link is invalidated immediately
- A new signing link is generated and sent to the replacement signer

---

## Templates

### Create Template

**POST** `/api/templates`

**Request Body:**

```json
{
  "templateCode": "LIABILITY_WAIVER_2024",
  "name": "Standard Liability Waiver",
  "description": "General liability waiver for events",
  "htmlContent": "<h2>{{documentName}}</h2><p>I, {{signerName}}, agree...</p>{{jurisdictionAddendum}}",
  "jurisdiction": "US-VA"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| templateCode | string | Yes | Unique template identifier (e.g., `LIABILITY_WAIVER_2024`) |
| name | string | Yes | Display name for the template |
| description | string | No | Description of the template's purpose |
| htmlContent | string | Yes | HTML content with merge variable placeholders |
| jurisdiction | string | No | Default jurisdiction code |
| createdBy | string | No | Identifier of the creator |

**Response (201):**

```json
{
  "id": "tmpl_abc123",
  "template_code": "LIABILITY_WAIVER_2024",
  "name": "Standard Liability Waiver",
  "description": "General liability waiver for events",
  "html_content": "<h2>{{documentName}}</h2>...",
  "jurisdiction": "US-VA",
  "version": 1,
  "is_active": true,
  "created_at": "2024-01-15T10:00:00.000Z",
  "updated_at": "2024-01-15T10:00:00.000Z"
}
```

**Error (409) — duplicate template code:**

```json
{
  "error": "Template with this code already exists"
}
```

---

### Available Merge Variables

Templates support placeholder variables using `{{variableName}}` syntax:

| Variable | Description |
|----------|-------------|
| `{{documentName}}` | Name of the document |
| `{{signerName}}` | Name of the current signer |
| `{{signerRoles}}` | Comma-separated list of roles (for packages) |
| `{{eventDate}}` | Event date if provided |
| `{{eventName}}` | Event name from merge variables |
| `{{organizationName}}` | Organization name from merge variables |
| `{{jurisdictionAddendum}}` | Auto-inserted jurisdiction-specific legal content |
| `{{currentDate}}` | Current date |
| `{{*}}` | Any custom key from `mergeVariables` |

---

### Get Template

**GET** `/api/templates/:templateCode`

**Response (200):**

```json
{
  "id": "tmpl_abc123",
  "template_code": "LIABILITY_WAIVER_2024",
  "name": "Standard Liability Waiver",
  "description": "General liability waiver for events",
  "html_content": "<h2>{{documentName}}</h2>...",
  "jurisdiction": "US-VA",
  "version": 1,
  "is_active": true,
  "created_at": "2024-01-15T10:00:00.000Z",
  "updated_at": "2024-01-15T10:00:00.000Z"
}
```

---

### Update Template

**PUT** `/api/templates/:templateCode`

**Request Body (all fields optional):**

```json
{
  "name": "Updated Waiver Name",
  "description": "Updated description",
  "htmlContent": "<h2>Updated Content</h2>...",
  "jurisdiction": "US-CA",
  "isActive": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | No | Updated display name |
| description | string | No | Updated description |
| htmlContent | string | No | Updated HTML content |
| jurisdiction | string | No | Updated jurisdiction |
| isActive | boolean | No | Set to `false` to deactivate |

**Response (200):** Returns the updated template object (same format as Get Template).

---

### List Templates

**GET** `/api/templates`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| jurisdiction | string | Filter by jurisdiction code |

**Response (200):** Returns an array of active template objects.

```json
[
  {
    "id": "tmpl_abc123",
    "template_code": "LIABILITY_WAIVER_2024",
    "name": "Standard Liability Waiver",
    "description": "General liability waiver for events",
    "html_content": "<h2>{{documentName}}</h2>...",
    "jurisdiction": "US-VA",
    "version": 1,
    "is_active": true,
    "created_at": "2024-01-15T10:00:00.000Z",
    "updated_at": "2024-01-15T10:00:00.000Z"
  }
]
```

---

### Delete Template

**DELETE** `/api/templates/:templateCode`

Deactivates the template (soft delete). Existing signature requests using this template are not affected.

**Response (200):**

```json
{
  "success": true,
  "message": "Template deactivated"
}
```

---

## Jurisdictions

### Create/Update Jurisdiction Addendum

**POST** `/api/jurisdictions`

Creates a new jurisdiction addendum or updates an existing one (upsert).

**Request Body:**

```json
{
  "jurisdictionCode": "US-VA",
  "jurisdictionName": "Virginia",
  "addendumHtml": "<h3>Virginia-Specific Terms</h3><p>Additional legal text...</p>"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| jurisdictionCode | string | Yes | Unique jurisdiction code (e.g., `US-VA`, `US-CA`) |
| jurisdictionName | string | Yes | Display name (e.g., `Virginia`) |
| addendumHtml | string | Yes | HTML content appended to documents using this jurisdiction |

**Response (201):**

```json
{
  "id": "jur_abc123",
  "jurisdiction_code": "US-VA",
  "jurisdiction_name": "Virginia",
  "addendum_html": "<h3>Virginia-Specific Terms</h3>...",
  "is_active": true,
  "created_at": "2024-01-15T10:00:00.000Z",
  "updated_at": "2024-01-15T10:00:00.000Z"
}
```

---

### List Jurisdictions

**GET** `/api/jurisdictions`

**Response (200):**

```json
[
  {
    "id": "jur_abc123",
    "jurisdiction_code": "US-VA",
    "jurisdiction_name": "Virginia",
    "addendum_html": "<h3>Virginia-Specific Terms</h3>...",
    "is_active": true,
    "created_at": "2024-01-15T10:00:00.000Z",
    "updated_at": "2024-01-15T10:00:00.000Z"
  }
]
```

---

## Role Requirements

### Get Role Age Requirements

**GET** `/api/roles/requirements`

Returns the minimum age requirements for each role.

**Response (200):**

```json
[
  { "role": "trainer", "minimumAge": 18 },
  { "role": "coach", "minimumAge": 18 },
  { "role": "guardian", "minimumAge": 18 },
  { "role": "witness", "minimumAge": 18 }
]
```

---

## Webhooks

When a `callbackUrl` is provided, the system sends `POST` requests with status updates.

**Headers sent with all webhooks:**

```
Content-Type: application/json
X-Signature-Event: <event-name>
```

### Single Request Webhook

Sent when a single signature request is completed:

```json
{
  "event": "signature.completed",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "referenceCode": "SIG-ABC12345",
  "externalRef": "your-system-id",
  "externalType": "registration",
  "documentCategory": "waiver",
  "jurisdiction": "US-VA",
  "metadata": { "category": "registration" },
  "waiverTemplateCode": "LIABILITY_WAIVER_2024",
  "waiverTemplateVersion": 1,
  "signedAt": "2024-01-15T15:30:00.000Z",
  "signatureType": "typed",
  "signerName": "John Doe"
}
```

**Single Request Webhook Fields:**

| Field | Type | Description |
|-------|------|-------------|
| event | string | Event type (see Webhook Events below) |
| requestId | string | The request ID |
| referenceCode | string | Human-readable reference code |
| externalRef | string | Your external reference (if provided) |
| externalType | string | External type label (if provided) |
| documentCategory | string | Document category (if provided) |
| jurisdiction | string | Jurisdiction code (if provided) |
| metadata | object | Attached metadata (if provided) |
| waiverTemplateCode | string | Template code (if applicable) |
| waiverTemplateVersion | number | Template version (if applicable) |
| signedAt | string | Signing timestamp |
| signatureType | string | `typed` or `drawn` |
| signerName | string | Name of the signer |

---

### Package Webhook

Sent when a signer in a package completes, or when the entire package is complete:

```json
{
  "event": "package.completed",
  "packageId": "pkg_abc123",
  "packageCode": "PKG-ABC12345",
  "externalRef": "registration-2024-001",
  "jurisdiction": "US-VA",
  "documentName": "Team Registration Waiver",
  "completedSigners": 2,
  "totalSigners": 2,
  "signer": {
    "name": "Mike Wilson",
    "email": "coach@example.com",
    "roles": ["coach"],
    "signedAt": "2024-01-15T15:30:00.000Z"
  }
}
```

**Package Webhook Fields:**

| Field | Type | Description |
|-------|------|-------------|
| event | string | `signer.completed`, `package.partial`, or `package.completed` |
| packageId | string | Package identifier |
| packageCode | string | Human-readable package code |
| externalRef | string | Your external reference (if provided) |
| externalType | string | External type label (if provided) |
| jurisdiction | string | Jurisdiction code (if provided) |
| documentName | string | Name of the document |
| completedSigners | number | Number of signers who have completed |
| totalSigners | number | Total number of signers |
| signer | object | Details of the signer who just completed (see below) |

**signer Object:**

| Field | Type | Description |
|-------|------|-------------|
| name | string | Signer name |
| email | string | Signer email (if provided) |
| roles | string[] | Roles this signer signed for |
| signedAt | string | Signing timestamp |

---

### Webhook Events

| Event | Description |
|-------|-------------|
| `signature.completed` | Single request signed |
| `signature.expired` | Single request expired |
| `signature.cancelled` | Single request cancelled |
| `signer.completed` | One signer in a package signed |
| `package.partial` | Package has partial signatures |
| `package.completed` | All signers in the package completed |

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message description"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request — validation error, missing required fields, age validation failure |
| 401 | Unauthorized — missing API key |
| 403 | Forbidden — invalid API key |
| 404 | Not Found — resource doesn't exist |
| 409 | Conflict — duplicate template code, already signed, or cancelled |
| 410 | Gone — expired or no longer available |
| 429 | Too Many Requests — rate limited |
| 500 | Internal Server Error |

### Signing Page Status Codes

When a signer accesses their signing URL, the frontend receives these status codes:

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | Active | Request is valid and ready for signing |
| 409 | Signed | Document has already been signed |
| 409 | Cancelled | Request was cancelled |
| 410 | Expired | Request has expired |
| 410 | Not Found | Invalid or unknown signing token |

---

## Rate Limiting

API requests are rate limited. If you exceed the limit, you'll receive a `429` response. Implement exponential backoff for retries.

---

## Complete Example: Multi-Party Signing Package

This end-to-end example shows how to create a signing package for an equestrian event with a rider, owner, trainer, and guardian (parent of a minor rider). It covers the full lifecycle from setup to completion.

### Step 1: Create a Template

```
POST /api/templates
X-API-Key: your-api-key
Content-Type: application/json
```

```json
{
  "templateCode": "ENTRY_AGREEMENT_2024",
  "name": "Event Entry Agreement",
  "description": "Standard entry agreement for equestrian competitions",
  "htmlContent": "<h2>{{documentName}}</h2><p><strong>Event:</strong> {{eventName}}</p><p><strong>Event Date:</strong> {{eventDate}}</p><p><strong>Horse:</strong> {{horseName}}</p><p><strong>Rider:</strong> {{riderName}}</p><p><strong>Competition Level:</strong> {{competitionLevel}}</p><h3>Terms and Conditions</h3><p>I, {{signerName}}, signing as <strong>{{signerRoles}}</strong>, hereby agree to the following:</p><ul><li>I understand and accept all risks associated with equestrian activities</li><li>I agree to follow all safety rules and guidelines</li><li>I confirm that all information provided is accurate</li><li>I acknowledge that this agreement is legally binding</li></ul>{{jurisdictionAddendum}}<p><em>Signed on {{currentDate}}</em></p>",
  "jurisdiction": "US-VA"
}
```

### Step 2: Create a Jurisdiction Addendum (Optional)

```
POST /api/jurisdictions
X-API-Key: your-api-key
Content-Type: application/json
```

```json
{
  "jurisdictionCode": "US-VA",
  "jurisdictionName": "Virginia",
  "addendumHtml": "<h4>Virginia Equine Activity Liability Act</h4><p>Under Virginia Code Section 3.2-6202, an equine activity sponsor is not liable for injury or death of a participant resulting from the inherent risks of equine activities.</p>"
}
```

### Step 3: Create the Signing Package

This example has 4 signers with consolidation and age validation:
- **Emily (rider, age 15)** — minor participant
- **Sarah (owner)** — horse owner, same email as Emily's parent
- **Sarah (guardian)** — Emily's mother, consolidated with owner role
- **David (trainer)** — must be 18+
- Sarah is designated as the package admin

```
POST /api/packages
X-API-Key: your-api-key
Content-Type: application/json
```

```json
{
  "templateCode": "ENTRY_AGREEMENT_2024",
  "documentName": "Spring Horse Trials - Entry Agreement",
  "jurisdiction": "US-VA",
  "eventDate": "2024-06-15",
  "mergeVariables": {
    "eventName": "Spring Horse Trials 2024",
    "eventDate": "June 15-17, 2024",
    "horseName": "Midnight Star",
    "riderName": "Emily Johnson",
    "competitionLevel": "Training Level"
  },
  "signers": [
    {
      "role": "participant",
      "name": "Emily Johnson",
      "email": "sarah.johnson@example.com",
      "dateOfBirth": "2009-03-22",
      "isMinor": true
    },
    {
      "role": "owner",
      "name": "Sarah Johnson",
      "email": "sarah.johnson@example.com",
      "dateOfBirth": "1982-07-10",
      "isPackageAdmin": true
    },
    {
      "role": "guardian",
      "name": "Sarah Johnson",
      "email": "sarah.johnson@example.com",
      "dateOfBirth": "1982-07-10"
    },
    {
      "role": "trainer",
      "name": "David Miller",
      "email": "david.miller@example.com",
      "phone": "+15551234567",
      "dateOfBirth": "1975-11-03"
    }
  ],
  "externalRef": "entry-2024-spring-001",
  "callbackUrl": "https://your-server.com/webhooks/signatures"
}
```

**Response (201):**

Because Emily, Sarah (owner), and Sarah (guardian) all share `sarah.johnson@example.com`, they are **consolidated into one signer** with three roles. David is a separate signer.

```json
{
  "packageId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "packageCode": "PKG-4K7NW2XR",
  "status": "pending",
  "documentName": "Spring Horse Trials - Entry Agreement",
  "eventDate": "2024-06-15",
  "totalSigners": 2,
  "signatureRequests": [
    {
      "requestId": "f1e2d3c4-b5a6-7890-abcd-ef0987654321",
      "signerName": "Emily Johnson",
      "roles": ["participant", "owner", "guardian"],
      "signUrl": "https://your-domain.com/sign/a3f8c91b2e4d...",
      "isPackageAdmin": true
    },
    {
      "requestId": "b9a8c7d6-e5f4-3210-abcd-ef1122334455",
      "signerName": "David Miller",
      "roles": ["trainer"],
      "signUrl": "https://your-domain.com/sign/7d2e5f8a1b3c...",
      "isPackageAdmin": false
    }
  ],
  "expiresAt": "2024-01-29T15:30:00.000Z"
}
```

**What happened:**
- 4 signers became **2 signature requests** (Sarah consolidated 3 roles)
- Sarah is the package admin and signs for: participant, owner, guardian
- David signs for: trainer (verified via both email + SMS since both were provided)
- Each `requestId` can be used to check individual signer status via `GET /api/requests/:id`

### Step 4: Check Package Status

```
GET /api/packages/a1b2c3d4-e5f6-7890-abcd-ef1234567890
X-API-Key: your-api-key
```

**Response after Sarah signs:**

```json
{
  "packageId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "packageCode": "PKG-4K7NW2XR",
  "externalRef": "entry-2024-spring-001",
  "documentName": "Spring Horse Trials - Entry Agreement",
  "jurisdiction": "US-VA",
  "status": "partial",
  "totalSigners": 2,
  "completedSigners": 1,
  "createdAt": "2024-01-22T15:30:00.000Z",
  "expiresAt": "2024-01-29T15:30:00.000Z",
  "signers": [
    {
      "name": "Emily Johnson",
      "email": "sarah.johnson@example.com",
      "roles": [
        { "roleId": "r1a2b3c4-0001", "roleName": "participant" },
        { "roleId": "r1a2b3c4-0002", "roleName": "owner" },
        { "roleId": "r1a2b3c4-0003", "roleName": "guardian" }
      ],
      "signUrl": "https://your-domain.com/sign/a3f8c91b2e4d...",
      "requestId": "f1e2d3c4-b5a6-7890-abcd-ef0987654321",
      "status": "signed",
      "isPackageAdmin": true
    },
    {
      "name": "David Miller",
      "email": "david.miller@example.com",
      "roles": [
        { "roleId": "r1a2b3c4-0004", "roleName": "trainer" }
      ],
      "signUrl": "https://your-domain.com/sign/7d2e5f8a1b3c...",
      "requestId": "b9a8c7d6-e5f4-3210-abcd-ef1122334455",
      "status": "pending",
      "isPackageAdmin": false
    }
  ]
}
```

### Step 5: Replace a Signer (If Needed)

If David can't sign, Sarah (as package admin) can replace him. Use a `roleId` from the status response:

```
PUT /api/packages/a1b2c3d4-e5f6-7890-abcd-ef1234567890/roles/r1a2b3c4-0004
X-API-Key: your-api-key
Content-Type: application/json
```

```json
{
  "name": "Lisa Chen",
  "email": "lisa.chen@example.com",
  "dateOfBirth": "1990-04-15"
}
```

**Response:**

```json
{
  "roleId": "r1a2b3c4-0004",
  "roleName": "trainer",
  "previousSigner": "David Miller",
  "newSigner": "Lisa Chen",
  "signUrl": "https://your-domain.com/sign/9x8w7v6u5t4s..."
}
```

David's old link is immediately invalidated. Lisa receives a new signing link.

### Step 6: Webhook Notifications

As each signer completes, your `callbackUrl` receives POST requests:

**When Sarah signs (partial):**

```json
{
  "event": "signer.completed",
  "packageId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "packageCode": "PKG-4K7NW2XR",
  "externalRef": "entry-2024-spring-001",
  "jurisdiction": "US-VA",
  "documentName": "Spring Horse Trials - Entry Agreement",
  "completedSigners": 1,
  "totalSigners": 2,
  "signer": {
    "name": "Emily Johnson",
    "email": "sarah.johnson@example.com",
    "roles": ["participant", "owner", "guardian"],
    "signedAt": "2024-01-22T16:45:00.000Z"
  }
}
```

**When Lisa signs (complete):**

```json
{
  "event": "package.completed",
  "packageId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "packageCode": "PKG-4K7NW2XR",
  "externalRef": "entry-2024-spring-001",
  "jurisdiction": "US-VA",
  "documentName": "Spring Horse Trials - Entry Agreement",
  "completedSigners": 2,
  "totalSigners": 2,
  "signer": {
    "name": "Lisa Chen",
    "email": "lisa.chen@example.com",
    "roles": ["trainer"],
    "signedAt": "2024-01-23T09:15:00.000Z"
  }
}
```
