# SignatureHub Quick Start Guide

## 1. Setting Up Secure API Authentication

### Configure Your API Key

The API key is set via the `API_KEY` environment variable. This key is required for all `/api/*` endpoints.

**On Railway:**
1. Go to your Railway project dashboard
2. Click on your service
3. Go to **Variables** tab
4. Add a new variable:
   - Name: `API_KEY`
   - Value: Generate a secure random string (see below)

**Generate a Secure API Key:**

```bash
# On Linux/Mac:
openssl rand -hex 32

# On Windows PowerShell:
-join ((1..32) | ForEach-Object { '{0:X2}' -f (Get-Random -Max 256) })

# Or use any password generator to create a 32+ character random string
```

**Example secure key:** `a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456`

**Important:**
- Never commit your API key to git
- Use different keys for development and production
- Rotate keys periodically

### Using the API Key

Include the key in all API requests as a header:

```
X-API-Key: your_api_key_here
```

**Example with curl:**
```bash
curl -X GET https://your-app.railway.app/api/requests \
  -H "X-API-Key: your_api_key_here"
```

**Example with JavaScript:**
```javascript
fetch('https://your-app.railway.app/api/requests', {
  headers: {
    'X-API-Key': 'your_api_key_here',
    'Content-Type': 'application/json'
  }
})
```

**Example with Java:**
```java
HttpHeaders headers = new HttpHeaders();
headers.set("X-API-Key", apiKey);
headers.setContentType(MediaType.APPLICATION_JSON);
```

---

## 2. Quick Start Testing (5 Minutes)

### Prerequisites
- Your deployed app URL (e.g., `https://your-app.railway.app`)
- Your API key

### Step 1: Verify API is Working

```bash
curl https://your-app.railway.app/api/requests \
  -H "X-API-Key: your_api_key"
```

Expected: Returns `[]` (empty array) or list of existing requests.

### Step 2: Create a Test Template

```bash
curl -X POST https://your-app.railway.app/api/templates \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{
    "templateCode": "TEST_WAIVER_001",
    "name": "Test Liability Waiver",
    "htmlContent": "<h1>Test Waiver</h1><p>I, <strong>{{participantName}}</strong>, agree to participate in <strong>{{eventName}}</strong> on {{eventDate}}.</p><p>I understand and accept all risks involved.</p>"
  }'
```

### Step 3: Create a Signature Request

```bash
curl -X POST https://your-app.railway.app/api/requests \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{
    "documentName": "Test Event Waiver",
    "signerName": "John Smith",
    "signerEmail": "john@example.com",
    "waiverTemplateCode": "TEST_WAIVER_001",
    "mergeVariables": {
      "participantName": "John Smith",
      "eventName": "Summer Horse Show 2024",
      "eventDate": "July 15, 2024"
    },
    "jurisdiction": "CA",
    "metadata": {
      "entryId": 12345,
      "showId": 100
    }
  }'
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "referenceCode": "SIG-A7K3M9X2",
  "signUrl": "https://your-app.railway.app/sign/abc123...",
  "status": "pending",
  "expiresAt": "2024-01-29T12:00:00.000Z"
}
```

**Save the `referenceCode`** - you'll use this to check status later.

### Step 4: Complete the Signature

1. Open the `signUrl` in your browser
2. Review the document (you'll see the merged content)
3. Click **"Continue to Verification"**
4. Enter verification code: **`123456`** (demo mode)
5. Choose **"Type Signature"** or **"Draw Signature"**
6. Check the consent box
7. Click **"Sign Document"**

### Step 5: Verify Signature Completed

```bash
curl https://your-app.railway.app/api/requests/ref/SIG-A7K3M9X2 \
  -H "X-API-Key: your_api_key"
```

**Response shows `status: "signed"`:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "referenceCode": "SIG-A7K3M9X2",
  "status": "signed",
  "signedAt": "2024-01-22T14:30:00.000Z",
  "signature": {
    "signatureType": "typed",
    "typedName": "John Smith",
    "verificationMethodUsed": "email"
  }
}
```

---

## 3. Environment Variables Reference

| Variable | Purpose | Example |
|----------|---------|---------|
| `API_KEY` | **Required for production** - Secures API endpoints | `a1b2c3d4e5f6...` |
| `DEMO_MODE` | Set to `false` for production (sends real emails/SMS) | `false` |
| `BASE_URL` | Your public URL | `https://your-app.railway.app` |

### Production Setup Checklist

1. [ ] Set `API_KEY` to a secure random value
2. [ ] Set `DEMO_MODE=false`
3. [ ] Configure Twilio credentials (for SMS)
4. [ ] Configure SMTP credentials (for email)
5. [ ] Set `BASE_URL` to your production domain

---

## 4. Common API Operations

### Create Request (Minimal)
```bash
curl -X POST https://your-app.railway.app/api/requests \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{
    "documentName": "Agreement",
    "signerName": "Jane Doe",
    "signerEmail": "jane@example.com",
    "documentContent": "<h1>Agreement</h1><p>Terms here...</p>"
  }'
```

### Check Status by Reference Code
```bash
curl https://your-app.railway.app/api/requests/ref/SIG-XXXXXXXX \
  -H "X-API-Key: your_api_key"
```

### List All Signed Requests
```bash
curl "https://your-app.railway.app/api/requests?status=signed" \
  -H "X-API-Key: your_api_key"
```

### List Templates
```bash
curl https://your-app.railway.app/api/templates \
  -H "X-API-Key: your_api_key"
```

### Cancel a Request
```bash
curl -X DELETE https://your-app.railway.app/api/requests/REQUEST_ID \
  -H "X-API-Key: your_api_key"
```

---

## 5. Troubleshooting

### "Unauthorized" Error (401)
- Check that `X-API-Key` header is included
- Verify the key matches what's set in Railway variables
- Keys are case-sensitive

### "Request not found" Error (404)
- Verify the request ID or reference code is correct
- Reference codes start with `SIG-`

### Verification Code Not Working
- In demo mode, always use `123456`
- In production, check email/SMS delivery
- Codes expire after 5 minutes

### Signature Drawing Not Working
- Ensure you're on the "Draw Signature" tab
- Try clicking/touching the canvas first
- Works with mouse and touch

---

## 6. Integration Checklist

When integrating with ShowConnect or another system:

1. **Store the reference code** returned when creating a request
2. **Set up webhook callback** to receive signature completion notifications
3. **Poll status** using reference code if webhooks aren't available
4. **Handle expiration** - requests expire after 7 days by default

### Webhook Setup
```bash
curl -X POST https://your-app.railway.app/api/requests \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{
    "documentName": "Entry Waiver",
    "signerName": "John Doe",
    "signerEmail": "john@example.com",
    "documentContent": "<h1>Waiver</h1><p>Content...</p>",
    "callbackUrl": "https://your-system.com/api/signature-callback"
  }'
```

When signed, your callback URL receives:
```json
{
  "event": "signature.completed",
  "referenceCode": "SIG-A7K3M9X2",
  "signedAt": "2024-01-22T14:30:00.000Z",
  "signerName": "John Doe"
}
```

---

## Need Help?

- Full API documentation: See `REFERENCE.md`
- Repository: https://github.com/USEADEV/signature-hub
