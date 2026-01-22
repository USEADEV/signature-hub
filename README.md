# SignatureHub

A streamlined document signature application that integrates with ShowConnect (equestrian management system). Users receive signature requests via email/SMS, verify their identity, and sign documents with either typed or drawn signatures.

## Features

- **Email & SMS Verification**: Two-factor authentication via Twilio SMS or email
- **Dual Signature Methods**: Type your name or draw a signature on canvas
- **Mobile-Responsive**: Works on desktop and mobile devices
- **Audit Trail**: Complete logging of IP, user agent, timestamps, and consent
- **Webhook Callbacks**: Notify external systems when documents are signed
- **API-First Design**: Easy integration with existing systems like ShowConnect

## Technology Stack

- **Backend**: Node.js + TypeScript + Express.js
- **Database**: MySQL
- **SMS**: Twilio
- **Email**: Nodemailer (SMTP)
- **Frontend**: Vanilla HTML/CSS/JS

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Run Database Migrations

```bash
npm run migrate
```

### 4. Start the Server

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## API Reference

### Internal API (requires X-API-Key header)

#### Create Signature Request
```http
POST /api/requests
Content-Type: application/json
X-API-Key: your_api_key

{
  "documentName": "Entry Agreement 2024",
  "signerName": "John Doe",
  "signerEmail": "john@example.com",
  "signerPhone": "+1234567890",
  "verificationMethod": "email",
  "externalRef": "entry_123",
  "externalType": "entry_agreement",
  "callbackUrl": "https://yourapp.com/api/signatures/callback"
}
```

Response:
```json
{
  "id": "uuid",
  "signUrl": "https://yourdomain.com/sign/token",
  "status": "sent",
  "expiresAt": "2024-01-15T12:00:00Z"
}
```

#### Get Request Status
```http
GET /api/requests/:id
X-API-Key: your_api_key
```

#### Get Signature Details
```http
GET /api/requests/:id/signature
X-API-Key: your_api_key
```

#### List Requests
```http
GET /api/requests?status=signed&externalRef=entry_123
X-API-Key: your_api_key
```

#### Cancel Request
```http
DELETE /api/requests/:id
X-API-Key: your_api_key
```

### Webhook Callback

When a document is signed, SignatureHub will POST to the configured `callbackUrl`:

```json
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

## Integration with ShowConnect

Example Java/Spring integration:

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

// Store response.getBody().getSignUrl() to send to user
```

## Security

- **Token Security**: 64-character cryptographically random tokens
- **Verification Codes**: 6-digit codes with 5-minute expiry and max 3 attempts
- **Rate Limiting**: Protects against brute-force attempts
- **API Authentication**: API key required for internal endpoints
- **HTTPS**: Required for production deployment
- **Audit Trail**: Full logging of signature events

## Project Structure

```
signature-app/
├── src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Environment config
│   ├── routes/
│   │   ├── api.ts            # Internal API routes
│   │   └── sign.ts           # Public signing routes
│   ├── services/
│   │   ├── signature.ts      # Core signature logic
│   │   ├── verification.ts   # Email/SMS verification
│   │   ├── twilio.ts         # Twilio SMS service
│   │   └── email.ts          # Email service
│   ├── db/
│   │   ├── connection.ts     # MySQL connection pool
│   │   ├── queries.ts        # SQL queries
│   │   └── migrate.ts        # Migration runner
│   ├── middleware/
│   │   ├── auth.ts           # API key auth
│   │   └── rateLimit.ts      # Rate limiting
│   └── types/
│       └── index.ts          # TypeScript interfaces
├── public/
│   ├── sign.html             # Signature capture page
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── signature-pad.js  # Drawing canvas
│       └── app.js            # Page logic
├── migrations/
│   └── 001_initial.sql       # Database schema
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## License

MIT
