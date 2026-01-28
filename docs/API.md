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
  "externalRef": "your-system-id",
  "callbackUrl": "https://your-server.com/webhook"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| documentName | string | Yes | Name of the document |
| signerName | string | Yes | Full name of the signer |
| signerEmail | string | Conditional | Required if verificationMethod is "email" or "both" |
| signerPhone | string | Conditional | Required if verificationMethod is "sms" or "both" |
| verificationMethod | string | No | "email", "sms", or "both" (default: "email") |
| documentContent | string | Conditional | HTML content (required if no template) |
| waiverTemplateCode | string | No | Use a pre-defined template |
| mergeVariables | object | No | Key-value pairs for template variables |
| jurisdiction | string | No | Jurisdiction code (e.g., "US-VA") |
| externalRef | string | No | Your system's reference ID |
| callbackUrl | string | No | Webhook URL for status updates |

**Response (201):**
```json
{
  "requestId": "req_abc123",
  "referenceCode": "SIG-ABC123",
  "signUrl": "https://your-domain.com/sign/token123",
  "status": "pending",
  "expiresAt": "2024-02-15T00:00:00.000Z"
}
```

### Get Request by ID

**GET** `/api/requests/:id`

### Get Request by Reference

**GET** `/api/requests/ref/:referenceCode`

### List Requests

**GET** `/api/requests`

Query parameters: `status`, `signerEmail`, `externalRef`, `jurisdiction`, `limit`, `offset`

### Cancel Request

**DELETE** `/api/requests/:id`

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
      "dateOfBirth": "1980-03-20"
    },
    {
      "role": "coach",
      "name": "Mike Wilson",
      "email": "coach@example.com",
      "dateOfBirth": "1985-01-10"
    }
  ],
  "verificationMethod": "email",
  "externalRef": "registration-2024-001",
  "callbackUrl": "https://your-server.com/webhook"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| templateCode | string | Conditional | Template to use (required if no documentContent) |
| documentName | string | Conditional | Name of the document |
| documentContent | string | Conditional | HTML content (required if no template) |
| jurisdiction | string | No | Jurisdiction code for addendum |
| eventDate | string | No | Event date for age validation (YYYY-MM-DD) |
| mergeVariables | object | No | Variables for template substitution |
| signers | array | Yes | Array of signer objects |
| verificationMethod | string | No | Auto-detected from contact info (optional override) |
| externalRef | string | No | Your system's reference ID |
| callbackUrl | string | No | Webhook URL for status updates |
| expiresAt | string | No | Expiration date (ISO 8601) |

**Signer Object:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| role | string | Yes | Role name (participant, guardian, trainer, coach, witness) |
| name | string | Yes | Full name |
| email | string | Conditional | At least email OR phone required |
| phone | string | Conditional | At least email OR phone required |
| dateOfBirth | string | No | Date of birth for age validation (YYYY-MM-DD) |
| isMinor | boolean | No | Flag indicating if signer is a minor |
| isPackageAdmin | boolean | No | Designates this signer as the package admin (see below) |

**Package Admin:**

One signer per package can be designated as the "package admin" - the decision maker who can:
- Replace signers who refuse or are unable to sign
- Receive notifications about signature status updates
- Make changes to the package as needed

If no signer is explicitly marked as `isPackageAdmin: true`, the first signer will be automatically designated as the admin. Only one person (or consolidated signer group) can be the package admin.

**Automatic Verification Method Detection:**

The verification method is automatically determined based on provided contact information - no need to specify it:

| Contact Info Provided | Verification Used |
|----------------------|-------------------|
| Email only | Email verification |
| Phone only | SMS verification |
| Both email and phone | Both methods |

```json
{
  "signers": [
    {
      "role": "participant",
      "name": "John Doe",
      "email": "john@example.com"
    },
    {
      "role": "coach",
      "name": "Mike Wilson",
      "phone": "+15551234567"
    },
    {
      "role": "guardian",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+15559876543"
    }
  ]
}
```

In this example: John uses email, Mike uses SMS, Jane uses both.

**Response (201):**
```json
{
  "packageId": "pkg_abc123",
  "packageCode": "PKG-ABC123",
  "status": "pending",
  "documentName": "Team Registration Waiver",
  "eventDate": "2024-06-15",
  "totalSigners": 2,
  "signatureRequests": [
    {
      "requestId": "req_def456",
      "signerName": "John Smith Sr",
      "roles": ["participant", "guardian"],
      "signUrl": "https://your-domain.com/sign/token456",
      "isPackageAdmin": true
    },
    {
      "requestId": "req_ghi789",
      "signerName": "Mike Wilson",
      "roles": ["coach"],
      "signUrl": "https://your-domain.com/sign/token789",
      "isPackageAdmin": false
    }
  ],
  "expiresAt": "2024-02-15T00:00:00.000Z"
}
```

### Role Consolidation

When multiple signers share the same email address, they are automatically consolidated:
- A single signature request is created
- All roles are listed on the signing page
- One signature covers all assigned roles

### Age Validation

Certain roles have minimum age requirements validated against the event date:

| Role | Minimum Age |
|------|-------------|
| trainer | 18 |
| coach | 18 |
| guardian | 18 |
| witness | 18 |
| participant | None |

If `eventDate` is provided and a signer's `dateOfBirth` indicates they won't meet the minimum age at the event, the request will be rejected with a validation error.

### Get Package Status

**GET** `/api/packages/:id`

Returns detailed status including all signers and their completion status.

**Response:**
```json
{
  "packageId": "pkg_abc123",
  "packageCode": "PKG-ABC123",
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
      "signUrl": "https://your-domain.com/sign/token456",
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
      "signUrl": "https://your-domain.com/sign/token789",
      "requestId": "req_ghi789",
      "status": "pending",
      "isPackageAdmin": false
    }
  ]
}
```

**Note:** The `roles` array in the status response includes `roleId` for each role, which is needed when using the [Replace Signer](#replace-signer) endpoint.

### Package Status Values

| Status | Description |
|--------|-------------|
| pending | Package created, no signatures yet |
| partial | Some signers have signed |
| complete | All signers have signed |
| expired | Package expired before completion |
| cancelled | Package was cancelled |

### List Packages

**GET** `/api/packages`

Query parameters: `status`, `externalRef`, `limit`, `offset`

### Replace Signer

**PUT** `/api/packages/:id/roles/:roleId`

Replace a signer who hasn't signed yet. Use this when someone refuses to sign or needs to be replaced with a different person.

**Request Body:**
```json
{
  "name": "New Signer Name",
  "email": "newsigner@example.com",
  "phone": "+15551234567",
  "verificationMethod": "email"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Full name of the new signer |
| email | string | Conditional | At least email OR phone required |
| phone | string | Conditional | At least email OR phone required |
| dateOfBirth | string | No | Date of birth (YYYY-MM-DD) |

Verification method is auto-detected based on contact info provided.

**Response (200):**
```json
{
  "roleId": "role_abc123",
  "roleName": "guardian",
  "previousSigner": "Jane Smith",
  "newSigner": "Bob Smith",
  "signUrl": "https://your-domain.com/sign/newtoken789"
}
```

**Use Case: Signer Refusal Flow**

1. A signing package is created with multiple signers
2. One signer (e.g., guardian) refuses to sign
3. The participant calls the API to replace the guardian
4. The old signing link is invalidated
5. A new signing link is generated for the replacement signer
6. The new signer receives their invitation to sign

**Notes:**
- Can only replace signers who haven't signed yet
- The role name (e.g., "guardian", "coach") stays the same
- If roles were consolidated (same email), all consolidated roles are updated
- The original signing link becomes invalid immediately

---

## Templates

### Create Template

**POST** `/api/templates`

```json
{
  "templateCode": "LIABILITY_WAIVER_2024",
  "name": "Standard Liability Waiver",
  "description": "General liability waiver for events",
  "htmlContent": "<h2>{{documentName}}</h2><p>I, {{signerName}}, agree...</p>{{jurisdictionAddendum}}",
  "jurisdiction": "US-VA"
}
```

### Available Merge Variables

| Variable | Description |
|----------|-------------|
| `{{documentName}}` | Name of the document |
| `{{signerName}}` | Name of the current signer |
| `{{signerRoles}}` | Comma-separated list of roles (for packages) |
| `{{eventDate}}` | Event date if provided |
| `{{eventName}}` | Event name from merge variables |
| `{{organizationName}}` | Organization name from merge variables |
| `{{jurisdictionAddendum}}` | Auto-inserted jurisdiction-specific content |
| `{{currentDate}}` | Current date |
| `{{*}}` | Any custom merge variable |

### Get Template

**GET** `/api/templates/:templateCode`

### Update Template

**PUT** `/api/templates/:templateCode`

### List Templates

**GET** `/api/templates`

Query parameter: `jurisdiction`

### Delete Template

**DELETE** `/api/templates/:templateCode`

---

## Jurisdictions

### Create/Update Jurisdiction Addendum

**POST** `/api/jurisdictions`

```json
{
  "jurisdictionCode": "US-VA",
  "jurisdictionName": "Virginia",
  "addendumHtml": "<h3>Virginia-Specific Terms</h3><p>Additional legal text...</p>"
}
```

### List Jurisdictions

**GET** `/api/jurisdictions`

---

## Role Requirements

### Get Role Age Requirements

**GET** `/api/roles/requirements`

**Response:**
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

When a `callbackUrl` is provided, the system will POST status updates:

### Single Request Webhook

```json
{
  "event": "signature.completed",
  "requestId": "req_abc123",
  "referenceCode": "SIG-ABC123",
  "externalRef": "your-id",
  "signedAt": "2024-01-15T15:30:00.000Z",
  "signatureType": "typed",
  "signerName": "John Doe"
}
```

### Package Webhook

```json
{
  "event": "package.completed",
  "packageId": "pkg_abc123",
  "packageCode": "PKG-ABC123",
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

### Webhook Events

| Event | Description |
|-------|-------------|
| signature.completed | Single request signed |
| signature.expired | Single request expired |
| signature.cancelled | Single request cancelled |
| signer.completed | One signer in a package signed |
| package.partial | Package has partial signatures |
| package.completed | All signers completed |

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message description"
}
```

### Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing API key) |
| 403 | Forbidden (invalid API key) |
| 404 | Not Found |
| 409 | Conflict (e.g., already signed, cancelled, duplicate template) |
| 410 | Gone (expired or no longer available) |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |

### Signing Page Status Codes

When a signer accesses their signing URL, the frontend receives these status codes:

| Code | Status | Description |
|------|--------|-------------|
| 200 | Active | Request is valid and ready for signing |
| 409 | Signed | Document has already been signed |
| 409 | Cancelled | Request was cancelled by the sender |
| 410 | Expired | Request has expired |
| 410 | Not Found | Invalid or unknown signing token |

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
  "htmlContent": "<h2>{{documentName}}</h2><p><strong>Event:</strong> {{eventName}}</p><p><strong>Event Date:</strong> {{eventDate}}</p><p><strong>Horse:</strong> {{horseName}}</p><p><strong>Rider:</strong> {{riderName}}</p><p><strong>Competition Level:</strong> {{competitionLevel}}</p><h3>Terms and Conditions</h3><p>I, {{signerName}}, signing as <strong>{{signerRoles}}</strong>, hereby agree to the following:</p><ul><li>I understand and accept all risks associated with equestrian activities</li><li>I agree to follow all safety rules and guidelines established by the organizers</li><li>I confirm that all information provided is accurate and complete</li><li>I acknowledge that this agreement is legally binding</li></ul>{{jurisdictionAddendum}}<p><em>Signed on {{currentDate}}</em></p>",
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
  "addendumHtml": "<h4>Virginia Equine Activity Liability Act</h4><p>Under Virginia Code § 3.2-6202, an equine activity sponsor is not liable for injury or death of a participant resulting from the inherent risks of equine activities.</p>"
}
```

### Step 3: Create the Signing Package

This example has 4 signers with consolidation and age validation:
- **Emily (rider, age 15)** - minor participant
- **Sarah (owner)** - horse owner, same email as Emily's parent
- **Sarah (guardian)** - Emily's mother, consolidated with owner role
- **David (trainer)** - must be 18+
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

Because Emily, Sarah (owner), and Sarah (guardian) all share `sarah.johnson@example.com`, they are **consolidated into one signer** with three roles. David is a separate signer. Sarah's verification is email-only; David has both email and phone so he gets both methods.

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

As each signer completes, your `callbackUrl` receives updates:

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

---

## Rate Limiting

API requests are rate limited. If you exceed the limit, you'll receive a 429 response. Consider implementing exponential backoff for retries.
