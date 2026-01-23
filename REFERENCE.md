# SignatureHub - Complete Reference Document

## Overview

SignatureHub is a document signature application designed to integrate with ShowConnect (equestrian management system). It enables users to receive signature requests via email or SMS, verify their identity through a verification code, and sign documents using either a typed or drawn signature.

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
| `external_ref` | VARCHAR(100) | ShowConnect reference (e.g., entry_id) |
| `external_type` | VARCHAR(50) | Document type (e.g., 'waiver', 'entry_agreement') |
| `document_name` | VARCHAR(255) | Human-readable document name |
| `document_content` | TEXT | HTML content to display (optional) |
| `document_url` | VARCHAR(500) | URL to PDF if applicable |
| `signer_name` | VARCHAR(255) | Expected signer's name |
| `signer_email` | VARCHAR(255) | Email for verification |
| `signer_phone` | VARCHAR(20) | Phone for SMS verification |
| `verification_method` | ENUM | 'email', 'sms', or 'both' |
| `status` | ENUM | 'pending', 'sent', 'viewed', 'verified', 'signed', 'expired', 'cancelled' |
| `created_at` | TIMESTAMP | When request was created |
| `expires_at` | TIMESTAMP | Link expiration time |
| `signed_at` | TIMESTAMP | When document was signed |
| `callback_url` | VARCHAR(500) | Webhook URL for ShowConnect notification |
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

---

## API Reference

### Internal API (requires `X-API-Key` header)

#### Create Signature Request
```
POST /api/requests
Content-Type: application/json
X-API-Key: your_api_key

Request Body:
{
  "documentName": "Entry Agreement 2024",      // Required
  "signerName": "John Doe",                    // Required
  "signerEmail": "john@example.com",           // Required if verificationMethod is 'email'
  "signerPhone": "+1234567890",                // Required if verificationMethod is 'sms'
  "verificationMethod": "email",               // 'email', 'sms', or 'both' (default: 'email')
  "documentContent": "<h1>Agreement</h1>...",  // Optional: HTML content
  "documentUrl": "https://example.com/doc.pdf",// Optional: PDF link
  "externalRef": "entry_123",                  // Optional: ShowConnect reference
  "externalType": "entry_agreement",           // Optional: Document type
  "expiresAt": "2024-12-31T23:59:59Z",        // Optional: Custom expiry
  "callbackUrl": "https://showconnect.com/cb", // Optional: Webhook URL
  "createdBy": "admin@showconnect.com"         // Optional: Creator identifier
}

Response (201 Created):
{
  "id": "uuid-of-request",
  "signUrl": "https://yourdomain.com/sign/abc123...",
  "status": "pending",
  "expiresAt": "2024-01-15T12:00:00Z"
}
```

#### Get Request Status
```
GET /api/requests/:id
X-API-Key: your_api_key

Response (200 OK):
{
  "id": "uuid",
  "document_name": "Entry Agreement 2024",
  "signer_name": "John Doe",
  "signer_email": "john@example.com",
  "status": "signed",
  "created_at": "2024-01-08T10:00:00Z",
  "signed_at": "2024-01-08T15:30:00Z",
  ...
}
```

#### Get Signature Details
```
GET /api/requests/:id/signature
X-API-Key: your_api_key

Response (200 OK):
{
  "id": "uuid",
  "request_id": "uuid",
  "signature_type": "typed",
  "typed_name": "John Doe",
  "signer_ip": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "signed_at": "2024-01-08T15:30:00Z",
  "verification_method_used": "email",
  "consent_text": "I agree that my signature..."
}
```

#### List Requests (with filters)
```
GET /api/requests?status=signed&externalRef=entry_123&limit=50
X-API-Key: your_api_key

Query Parameters:
- status: Filter by status
- externalRef: Filter by external reference
- externalType: Filter by document type
- signerEmail: Filter by signer email
- createdBy: Filter by creator
- limit: Max results (default 100)
- offset: Pagination offset

Response (200 OK):
[
  { ...request1 },
  { ...request2 }
]
```

#### Cancel Request
```
DELETE /api/requests/:id
X-API-Key: your_api_key

Response (200 OK):
{
  "success": true,
  "message": "Request cancelled"
}
```

### Public API (signer-facing, no auth required)

#### Load Signing Page
```
GET /sign/:token

Returns: HTML signing page
```

#### Get Page Data
```
GET /sign/:token/data

Response (200 OK):
{
  "requestId": "uuid",
  "documentName": "Entry Agreement 2024",
  "documentContent": "<h1>Agreement</h1>...",
  "documentUrl": null,
  "signerName": "John Doe",
  "isVerified": false,
  "verificationMethod": "email",
  "hasEmail": true,
  "hasPhone": false
}
```

#### Send Verification Code
```
POST /sign/:token/verify
Content-Type: application/json

Request Body:
{
  "method": "email"  // or "sms"
}

Response (200 OK):
{
  "success": true,
  "message": "Verification code sent to jo***@example.com"
}
```

#### Confirm Verification Code
```
POST /sign/:token/confirm
Content-Type: application/json

Request Body:
{
  "code": "123456"
}

Response (200 OK):
{
  "success": true,
  "message": "Identity verified"
}
```

#### Submit Signature
```
POST /sign/:token/submit
Content-Type: application/json

Request Body:
{
  "signatureType": "typed",           // or "drawn"
  "typedName": "John Doe",            // Required if typed
  "signatureImage": "data:image/png;base64,...", // Required if drawn
  "consentText": "I agree that my signature..."
}

Response (200 OK):
{
  "success": true,
  "message": "Document signed successfully",
  "signedAt": "2024-01-08T15:30:00Z"
}
```

---

## Webhook Callback

When a document is signed, SignatureHub sends a POST request to the configured `callbackUrl`:

```
POST {callbackUrl}
Content-Type: application/json
X-Signature-Event: signature.completed

{
  "event": "signature.completed",
  "requestId": "uuid",
  "externalRef": "entry_123",
  "externalType": "entry_agreement",
  "signedAt": "2024-01-08T15:30:00Z",
  "signatureType": "typed",
  "signerName": "John Doe"
}
```

---

## Frontend Pages

### 1. Demo Landing Page (`/`)

A demo page for testing that allows creating signature requests via a form.

**Features:**
- Form to enter document name, signer name, email, and content
- Creates request via API and displays the sign URL
- Shows demo mode hint (code: 123456)

### 2. Signing Page (`/sign/:token`)

Multi-step signature capture flow.

**Step 1: Document Review**
- Displays document name
- Shows signer name
- Renders HTML document content (if provided)
- Link to PDF (if provided)
- "Continue to Verification" button

**Step 2: Identity Verification**
- Choose verification method (email or SMS)
- Enter 6-digit verification code
- Shows demo hint in demo mode
- Resend code option

**Step 3: Signature Capture**
- Two tabs: "Type Signature" and "Draw Signature"
- Type: Text input with cursive preview
- Draw: Canvas for mouse/touch drawing
- Consent checkbox with legal text
- "Sign Document" button (disabled until consent checked)

**Step 4: Success**
- Confirmation message
- Timestamp of signature

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
│   │   ├── queries.ts           # Database operations (supports both DBs)
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
├── data/                        # SQLite database directory (created at runtime)
├── package.json
├── tsconfig.json
├── railway.json                 # Railway deployment config
├── Procfile                     # Process definition
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

## Integration Example (Java/Spring)

```java
RestTemplate restTemplate = new RestTemplate();
HttpHeaders headers = new HttpHeaders();
headers.set("X-API-Key", signatureApiKey);
headers.setContentType(MediaType.APPLICATION_JSON);

Map<String, Object> request = Map.of(
    "externalRef", entryId.toString(),
    "externalType", "entry_agreement",
    "documentName", "Entry Agreement 2024",
    "signerName", participant.getName(),
    "signerEmail", participant.getEmail(),
    "signerPhone", participant.getPhone(),
    "verificationMethod", "email",
    "callbackUrl", baseUrl + "/api/signatures/callback"
);

HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);
ResponseEntity<SignatureResponse> response = restTemplate.postForEntity(
    signatureServiceUrl + "/api/requests",
    entity,
    SignatureResponse.class
);

String signUrl = response.getBody().getSignUrl();
// Send signUrl to participant or embed in your UI
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
| 1.1.0 | Current | Added SQLite support, demo mode, Twilio & Mandrill integration |
