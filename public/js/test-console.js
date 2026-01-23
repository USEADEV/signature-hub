// SignatureHub API Test Console JavaScript
(function() {
  'use strict';

  // Saved context for reuse
  const savedContext = {
    requestId: localStorage.getItem('test_requestId') || '',
    token: localStorage.getItem('test_token') || '',
    reference: localStorage.getItem('test_reference') || ''
  };

  let fullTestToken = '';

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', function() {
    updateSavedContext();
    bindEvents();
  });

  function updateSavedContext() {
    document.getElementById('savedRequestId').textContent = savedContext.requestId || '-';
    document.getElementById('savedToken').textContent = savedContext.token || '-';
    document.getElementById('savedReference').textContent = savedContext.reference || '-';
  }

  function saveContext(key, value) {
    savedContext[key] = value;
    localStorage.setItem('test_' + key, value);
    updateSavedContext();
  }

  function getApiKey() {
    return document.getElementById('globalApiKey').value;
  }

  function showResponse(id, status, data) {
    const el = document.getElementById('response-' + id);
    el.style.display = 'block';
    const statusClass = status >= 200 && status < 300 ? 'success' : 'error';
    el.innerHTML = '<div class="response-header"><span class="response-status ' + statusClass + '">Status: ' + status + '</span></div><div class="response-body">' + JSON.stringify(data, null, 2) + '</div>';
  }

  async function apiCall(method, path, body, useApiKey) {
    if (useApiKey === undefined) useApiKey = true;
    const headers = { 'Content-Type': 'application/json' };
    if (useApiKey) {
      headers['X-API-Key'] = getApiKey();
    }

    const options = { method: method, headers: headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      console.log('API call:', method, path);
      const controller = new AbortController();
      const timeoutId = setTimeout(function() { controller.abort(); }, 30000);
      options.signal = controller.signal;

      const response = await fetch(path, options);
      clearTimeout(timeoutId);

      console.log('Response status:', response.status);
      let data;
      const text = await response.text();
      console.log('Response text:', text.substring(0, 500));
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { message: text };
      }
      return { status: response.status, data: data };
    } catch (err) {
      console.error('API call failed:', err);
      return { status: 0, data: { error: err.message || 'Request failed or timed out' } };
    }
  }

  function bindEvents() {
    // API Key bar
    document.getElementById('btn-toggle-key').addEventListener('click', function() {
      const input = document.getElementById('globalApiKey');
      input.type = input.type === 'password' ? 'text' : 'password';
      this.textContent = input.type === 'password' ? 'Show' : 'Hide';
    });

    document.getElementById('btn-test-connection').addEventListener('click', async function() {
      const statusEl = document.getElementById('connectionStatus');
      statusEl.textContent = 'Testing...';
      statusEl.className = 'status disconnected';
      try {
        const result = await apiCall('GET', '/api/requests?limit=1');
        if (result.status === 200) {
          statusEl.textContent = 'Connected';
          statusEl.className = 'status connected';
        } else if (result.status === 401 || result.status === 403) {
          statusEl.textContent = 'Invalid API Key';
          statusEl.className = 'status disconnected';
        } else {
          statusEl.textContent = 'Error: ' + result.status;
          statusEl.className = 'status disconnected';
        }
      } catch (e) {
        statusEl.textContent = 'Connection Failed';
        statusEl.className = 'status disconnected';
      }
    });

    // Tabs
    document.querySelectorAll('.tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        const panelName = this.getAttribute('data-panel');
        document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
        document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
        document.getElementById('panel-' + panelName).classList.add('active');
        this.classList.add('active');
      });
    });

    // Use Saved buttons
    document.querySelectorAll('.use-saved').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const target = this.getAttribute('data-target');
        const field = this.getAttribute('data-field');
        document.getElementById(target).value = savedContext[field] || '';
      });
    });

    // Signature Requests
    document.getElementById('btn-createRequest').addEventListener('click', createRequest);
    document.getElementById('btn-listRequests').addEventListener('click', listRequests);
    document.getElementById('btn-getRequest').addEventListener('click', getRequest);
    document.getElementById('btn-getRequestByRef').addEventListener('click', getRequestByRef);
    document.getElementById('btn-getSignature').addEventListener('click', getSignature);
    document.getElementById('btn-cancelRequest').addEventListener('click', cancelRequest);

    // Templates
    document.getElementById('btn-createTemplate').addEventListener('click', createTemplate);
    document.getElementById('btn-listTemplates').addEventListener('click', listTemplates);
    document.getElementById('btn-getTemplate').addEventListener('click', getTemplate);
    document.getElementById('btn-updateTemplate').addEventListener('click', updateTemplate);
    document.getElementById('btn-deleteTemplate').addEventListener('click', deleteTemplate);

    // Signing Flow
    document.getElementById('btn-getSigningData').addEventListener('click', getSigningData);
    document.getElementById('btn-sendVerification').addEventListener('click', sendVerification);
    document.getElementById('btn-confirmVerification').addEventListener('click', confirmVerification);
    document.getElementById('btn-submitSignature').addEventListener('click', submitSignature);
    document.getElementById('btn-openSigningPage').addEventListener('click', openSigningPage);

    // Full Test
    document.getElementById('ft-btn').addEventListener('click', runFullTest);
    document.getElementById('ft-continue-btn').addEventListener('click', continueFullTest);
  }

  // === SIGNATURE REQUESTS ===

  async function createRequest() {
    const btn = document.getElementById('btn-createRequest');

    if (!getApiKey()) {
      alert('Please enter your API key first');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const body = {
        documentName: document.getElementById('cr-documentName').value,
        signerName: document.getElementById('cr-signerName').value,
        signerEmail: document.getElementById('cr-signerEmail').value || undefined,
        signerPhone: document.getElementById('cr-signerPhone').value || undefined,
        verificationMethod: document.getElementById('cr-verificationMethod').value,
        documentContent: document.getElementById('cr-documentContent').value || undefined,
        callbackUrl: document.getElementById('cr-callbackUrl').value || undefined,
        externalRef: document.getElementById('cr-externalRef').value || undefined
      };

      console.log('Creating request with:', body);
      const result = await apiCall('POST', '/api/requests', body);
      console.log('Result:', result);
      showResponse('createRequest', result.status, result.data);

      if (result.status === 201 && result.data.requestId) {
        saveContext('requestId', result.data.requestId);
        if (result.data.signUrl) {
          const token = result.data.signUrl.split('/sign/')[1];
          if (token) saveContext('token', token);
        }
        if (result.data.referenceCode) {
          saveContext('reference', result.data.referenceCode);
        }
      }
    } catch (err) {
      console.error('Create request error:', err);
      showResponse('createRequest', 0, { error: err.message });
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Request';
    }
  }

  async function listRequests() {
    const params = new URLSearchParams();
    const status = document.getElementById('lr-status').value;
    const email = document.getElementById('lr-signerEmail').value;
    const limit = document.getElementById('lr-limit').value;

    if (status) params.append('status', status);
    if (email) params.append('signerEmail', email);
    if (limit) params.append('limit', limit);

    const result = await apiCall('GET', '/api/requests?' + params.toString());
    showResponse('listRequests', result.status, result.data);
  }

  async function getRequest() {
    const id = document.getElementById('gr-id').value;
    const result = await apiCall('GET', '/api/requests/' + id);
    showResponse('getRequest', result.status, result.data);
  }

  async function getRequestByRef() {
    const ref = document.getElementById('grr-ref').value;
    const result = await apiCall('GET', '/api/requests/ref/' + ref);
    showResponse('getRequestByRef', result.status, result.data);
  }

  async function getSignature() {
    const id = document.getElementById('gs-id').value;
    const result = await apiCall('GET', '/api/requests/' + id + '/signature');
    showResponse('getSignature', result.status, result.data);
  }

  async function cancelRequest() {
    const id = document.getElementById('dr-id').value;
    const result = await apiCall('DELETE', '/api/requests/' + id);
    showResponse('cancelRequest', result.status, result.data);
  }

  // === TEMPLATES ===

  async function createTemplate() {
    const body = {
      templateCode: document.getElementById('ct-templateCode').value,
      name: document.getElementById('ct-name').value,
      description: document.getElementById('ct-description').value || undefined,
      htmlContent: document.getElementById('ct-htmlContent').value,
      jurisdiction: document.getElementById('ct-jurisdiction').value || undefined
    };

    const result = await apiCall('POST', '/api/templates', body);
    showResponse('createTemplate', result.status, result.data);
  }

  async function listTemplates() {
    const jurisdiction = document.getElementById('lt-jurisdiction').value;
    const params = jurisdiction ? '?jurisdiction=' + jurisdiction : '';
    const result = await apiCall('GET', '/api/templates' + params);
    showResponse('listTemplates', result.status, result.data);
  }

  async function getTemplate() {
    const code = document.getElementById('gt-templateCode').value;
    const result = await apiCall('GET', '/api/templates/' + code);
    showResponse('getTemplate', result.status, result.data);
  }

  async function updateTemplate() {
    const code = document.getElementById('ut-templateCode').value;
    const body = {};

    const name = document.getElementById('ut-name').value;
    const html = document.getElementById('ut-htmlContent').value;
    const isActive = document.getElementById('ut-isActive').value;

    if (name) body.name = name;
    if (html) body.htmlContent = html;
    if (isActive) body.isActive = isActive === 'true';

    const result = await apiCall('PUT', '/api/templates/' + code, body);
    showResponse('updateTemplate', result.status, result.data);
  }

  async function deleteTemplate() {
    const code = document.getElementById('dt-templateCode').value;
    const result = await apiCall('DELETE', '/api/templates/' + code);
    showResponse('deleteTemplate', result.status, result.data);
  }

  // === SIGNING FLOW ===

  async function getSigningData() {
    const token = document.getElementById('spd-token').value;
    const result = await apiCall('GET', '/sign/' + token + '/data', null, false);
    showResponse('getSigningData', result.status, result.data);
  }

  async function sendVerification() {
    const token = document.getElementById('sv-token').value;
    const method = document.getElementById('sv-method').value;
    const result = await apiCall('POST', '/sign/' + token + '/verify', { method: method }, false);
    showResponse('sendVerification', result.status, result.data);
  }

  async function confirmVerification() {
    const token = document.getElementById('cv-token').value;
    const code = document.getElementById('cv-code').value;
    const result = await apiCall('POST', '/sign/' + token + '/confirm', { code: code }, false);
    showResponse('confirmVerification', result.status, result.data);
  }

  async function submitSignature() {
    const token = document.getElementById('ss-token').value;
    const body = {
      signatureType: document.getElementById('ss-signatureType').value,
      typedName: document.getElementById('ss-typedName').value || undefined,
      consentText: document.getElementById('ss-consentText').value
    };
    const result = await apiCall('POST', '/sign/' + token + '/submit', body, false);
    showResponse('submitSignature', result.status, result.data);
  }

  function openSigningPage() {
    const token = document.getElementById('op-token').value;
    window.open('/sign/' + token, '_blank');
  }

  // === FULL TEST ===

  function ftLog(msg) {
    const el = document.getElementById('ft-log-body');
    el.textContent += new Date().toLocaleTimeString() + ' - ' + msg + '\n';
    el.scrollTop = el.scrollHeight;
  }

  async function runFullTest() {
    const email = document.getElementById('ft-email').value;
    const phone = document.getElementById('ft-phone').value;
    const name = document.getElementById('ft-name').value;
    const method = document.getElementById('ft-method').value;

    if (!email && method === 'email') {
      alert('Email is required for email verification');
      return;
    }
    if (!phone && method === 'sms') {
      alert('Phone is required for SMS verification');
      return;
    }

    document.getElementById('ft-log').style.display = 'block';
    document.getElementById('ft-log-body').textContent = '';
    document.getElementById('ft-btn').disabled = true;

    ftLog('Starting full test...');

    // Step 1: Create request
    ftLog('Step 1: Creating signature request...');
    const createBody = {
      documentName: 'Full Test Document',
      signerName: name,
      signerEmail: email || undefined,
      signerPhone: phone || undefined,
      verificationMethod: method,
      documentContent: '<h2>Test Document</h2><p>This is a full end-to-end test.</p>'
    };

    const createResult = await apiCall('POST', '/api/requests', createBody);

    if (createResult.status !== 201) {
      ftLog('ERROR: Failed to create request - ' + JSON.stringify(createResult.data));
      document.getElementById('ft-btn').disabled = false;
      return;
    }

    ftLog('Request created! ID: ' + createResult.data.requestId);
    fullTestToken = createResult.data.signUrl.split('/sign/')[1];
    ftLog('Token: ' + fullTestToken);
    saveContext('requestId', createResult.data.requestId);
    saveContext('token', fullTestToken);

    // Step 2: Send verification
    ftLog('Step 2: Sending verification code via ' + method + '...');
    const verifyResult = await apiCall('POST', '/sign/' + fullTestToken + '/verify', { method: method }, false);

    if (verifyResult.status !== 200) {
      ftLog('ERROR: Failed to send verification - ' + JSON.stringify(verifyResult.data));
      document.getElementById('ft-btn').disabled = false;
      return;
    }

    ftLog('Verification code sent! ' + verifyResult.data.message);
    ftLog('Waiting for you to enter the code...');

    document.getElementById('ft-verify').style.display = 'block';
  }

  async function continueFullTest() {
    const code = document.getElementById('ft-code').value;

    if (!code || code.length !== 6) {
      alert('Please enter a 6-digit code');
      return;
    }

    // Step 3: Confirm code
    ftLog('Step 3: Confirming verification code...');
    const confirmResult = await apiCall('POST', '/sign/' + fullTestToken + '/confirm', { code: code }, false);

    if (confirmResult.status !== 200) {
      ftLog('ERROR: Failed to confirm code - ' + JSON.stringify(confirmResult.data));
      return;
    }

    ftLog('Code confirmed! Identity verified.');

    // Step 4: Submit signature
    ftLog('Step 4: Submitting signature...');
    const signBody = {
      signatureType: 'typed',
      typedName: document.getElementById('ft-name').value,
      consentText: 'I agree to sign this document electronically'
    };

    const signResult = await apiCall('POST', '/sign/' + fullTestToken + '/submit', signBody, false);

    if (signResult.status !== 200) {
      ftLog('ERROR: Failed to submit signature - ' + JSON.stringify(signResult.data));
      return;
    }

    ftLog('SUCCESS! Document signed at ' + signResult.data.signedAt);
    ftLog('');
    ftLog('=== FULL TEST COMPLETE ===');

    document.getElementById('ft-verify').style.display = 'none';
    document.getElementById('ft-btn').disabled = false;
  }

})();
