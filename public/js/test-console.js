// SignatureHub API Test Console JavaScript
(function() {
  'use strict';

  // Saved context for reuse
  const savedContext = {
    requestId: localStorage.getItem('test_requestId') || '',
    token: localStorage.getItem('test_token') || '',
    reference: localStorage.getItem('test_reference') || '',
    packageId: localStorage.getItem('test_packageId') || '',
    packageCode: localStorage.getItem('test_packageCode') || ''
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
    var pkgEl = document.getElementById('savedPackageId');
    if (pkgEl) pkgEl.textContent = savedContext.packageId || '-';
    var pkgCodeEl = document.getElementById('savedPackageCode');
    if (pkgCodeEl) pkgCodeEl.textContent = savedContext.packageCode || '-';
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
    var el = document.getElementById('response-' + id);
    el.style.display = 'block';
    var statusClass = status >= 200 && status < 300 ? 'success' : 'error';
    el.innerHTML = '<div class="response-header"><span class="response-status ' + statusClass + '">Status: ' + status + '</span></div><div class="response-body">' + JSON.stringify(data, null, 2) + '</div>';
  }

  // Helper to safely get element value (returns undefined if empty)
  function val(id) {
    var el = document.getElementById(id);
    if (!el) return undefined;
    var v = el.value;
    if (v === '' || v === null) return undefined;
    return v;
  }

  // Helper to parse JSON from a textarea (returns undefined if empty, alerts on parse error)
  function parseJsonField(id, fieldName) {
    var text = (document.getElementById(id).value || '').trim();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch (e) {
      alert('Invalid JSON in ' + fieldName + ': ' + e.message);
      return null; // null = parse error (caller should abort)
    }
  }

  async function apiCall(method, path, body, useApiKey) {
    if (useApiKey === undefined) useApiKey = true;
    var headers = { 'Content-Type': 'application/json' };
    if (useApiKey) {
      headers['X-API-Key'] = getApiKey();
    }

    var options = { method: method, headers: headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      console.log('API call:', method, path);
      if (body) console.log('Request body:', JSON.stringify(body, null, 2));
      var controller = new AbortController();
      var timeoutId = setTimeout(function() { controller.abort(); }, 30000);
      options.signal = controller.signal;

      var response = await fetch(path, options);
      clearTimeout(timeoutId);

      console.log('Response status:', response.status);
      var data;
      var text = await response.text();
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
      var input = document.getElementById('globalApiKey');
      input.type = input.type === 'password' ? 'text' : 'password';
      this.textContent = input.type === 'password' ? 'Show' : 'Hide';
    });

    document.getElementById('btn-test-connection').addEventListener('click', async function() {
      var statusEl = document.getElementById('connectionStatus');
      statusEl.textContent = 'Testing...';
      statusEl.className = 'status disconnected';
      try {
        var result = await apiCall('GET', '/api/requests?limit=1');
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
        var panelName = this.getAttribute('data-panel');
        document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
        document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
        document.getElementById('panel-' + panelName).classList.add('active');
        this.classList.add('active');
      });
    });

    // Use Saved buttons
    document.querySelectorAll('.use-saved').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = this.getAttribute('data-target');
        var field = this.getAttribute('data-field');
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

    // Packages
    document.getElementById('btn-createPackage').addEventListener('click', createPackage);
    document.getElementById('btn-getPackage').addEventListener('click', getPackage);
    document.getElementById('btn-batchPackages').addEventListener('click', batchGetPackages);
    document.getElementById('btn-listPackages').addEventListener('click', listPackages);
    document.getElementById('btn-listJurisdictions').addEventListener('click', listJurisdictions);
    document.getElementById('btn-roleRequirements').addEventListener('click', getRoleRequirements);
    document.getElementById('btn-loadPackageTemplates').addEventListener('click', loadPackageTemplates);
    document.getElementById('btn-replaceSigner').addEventListener('click', replaceSigner);
    document.getElementById('btn-createJurisdiction').addEventListener('click', createJurisdiction);

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
    var btn = document.getElementById('btn-createRequest');

    if (!getApiKey()) {
      alert('Please enter your API key first');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      // Parse optional JSON fields
      var mergeVariables = parseJsonField('cr-mergeVariables', 'Merge Variables');
      if (mergeVariables === null) { btn.disabled = false; btn.textContent = 'Create Request'; return; }

      var metadata = parseJsonField('cr-metadata', 'Metadata');
      if (metadata === null) { btn.disabled = false; btn.textContent = 'Create Request'; return; }

      // Build expiry date if set
      var expiresAtVal = val('cr-expiresAt');
      var expiresAt = expiresAtVal ? new Date(expiresAtVal).toISOString() : undefined;

      var body = {
        documentName: document.getElementById('cr-documentName').value,
        signerName: document.getElementById('cr-signerName').value,
        signerEmail: val('cr-signerEmail'),
        signerPhone: val('cr-signerPhone'),
        verificationMethod: val('cr-verificationMethod'),
        documentContent: val('cr-documentContent'),
        documentUrl: val('cr-documentUrl'),
        waiverTemplateCode: val('cr-waiverTemplateCode'),
        documentCategory: val('cr-documentCategory'),
        jurisdiction: val('cr-jurisdiction'),
        callbackUrl: val('cr-callbackUrl'),
        externalRef: val('cr-externalRef'),
        externalType: val('cr-externalType'),
        createdBy: val('cr-createdBy'),
        expiresAt: expiresAt,
        mergeVariables: mergeVariables,
        metadata: metadata
      };

      console.log('Creating request with:', body);
      var result = await apiCall('POST', '/api/requests', body);
      console.log('Result:', result);
      showResponse('createRequest', result.status, result.data);

      if (result.status === 201 && (result.data.id || result.data.requestId)) {
        saveContext('requestId', result.data.id || result.data.requestId);
        if (result.data.signUrl) {
          var token = result.data.signUrl.split('/sign/')[1];
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
    var params = new URLSearchParams();
    var status = val('lr-status');
    var referenceCode = val('lr-referenceCode');
    var signerEmail = val('lr-signerEmail');
    var externalRef = val('lr-externalRef');
    var externalType = val('lr-externalType');
    var createdBy = val('lr-createdBy');
    var jurisdiction = val('lr-jurisdiction');
    var limit = val('lr-limit');
    var offset = val('lr-offset');

    if (status) params.append('status', status);
    if (referenceCode) params.append('referenceCode', referenceCode);
    if (signerEmail) params.append('signerEmail', signerEmail);
    if (externalRef) params.append('externalRef', externalRef);
    if (externalType) params.append('externalType', externalType);
    if (createdBy) params.append('createdBy', createdBy);
    if (jurisdiction) params.append('jurisdiction', jurisdiction);
    if (limit) params.append('limit', limit);
    if (offset && offset !== '0') params.append('offset', offset);

    var result = await apiCall('GET', '/api/requests?' + params.toString());
    showResponse('listRequests', result.status, result.data);
  }

  async function getRequest() {
    var id = document.getElementById('gr-id').value;
    if (!id) { alert('Please enter a request ID'); return; }
    var result = await apiCall('GET', '/api/requests/' + id);
    showResponse('getRequest', result.status, result.data);
  }

  async function getRequestByRef() {
    var ref = document.getElementById('grr-ref').value;
    if (!ref) { alert('Please enter a reference code'); return; }
    var result = await apiCall('GET', '/api/requests/ref/' + ref);
    showResponse('getRequestByRef', result.status, result.data);
  }

  async function getSignature() {
    var id = document.getElementById('gs-id').value;
    if (!id) { alert('Please enter a request ID'); return; }
    var result = await apiCall('GET', '/api/requests/' + id + '/signature');
    showResponse('getSignature', result.status, result.data);
  }

  async function cancelRequest() {
    var id = document.getElementById('dr-id').value;
    if (!id) { alert('Please enter a request ID'); return; }
    var result = await apiCall('DELETE', '/api/requests/' + id);
    showResponse('cancelRequest', result.status, result.data);
  }

  // === TEMPLATES ===

  async function createTemplate() {
    if (!getApiKey()) { alert('Please enter your API key first'); return; }

    var body = {
      templateCode: document.getElementById('ct-templateCode').value,
      name: document.getElementById('ct-name').value,
      description: val('ct-description'),
      htmlContent: document.getElementById('ct-htmlContent').value,
      jurisdiction: val('ct-jurisdiction')
    };

    if (!body.templateCode || !body.name || !body.htmlContent) {
      alert('Template Code, Name, and HTML Content are required');
      return;
    }

    var result = await apiCall('POST', '/api/templates', body);
    showResponse('createTemplate', result.status, result.data);
  }

  async function listTemplates() {
    var jurisdiction = val('lt-jurisdiction');
    var params = jurisdiction ? '?jurisdiction=' + encodeURIComponent(jurisdiction) : '';
    var result = await apiCall('GET', '/api/templates' + params);
    showResponse('listTemplates', result.status, result.data);
  }

  async function getTemplate() {
    var code = document.getElementById('gt-templateCode').value;
    if (!code) { alert('Please enter a template code'); return; }
    var result = await apiCall('GET', '/api/templates/' + encodeURIComponent(code));
    showResponse('getTemplate', result.status, result.data);
  }

  async function updateTemplate() {
    if (!getApiKey()) { alert('Please enter your API key first'); return; }

    var code = document.getElementById('ut-templateCode').value;
    if (!code) { alert('Please enter a template code'); return; }

    var body = {};
    var name = val('ut-name');
    var html = val('ut-htmlContent');
    var isActive = val('ut-isActive');

    if (name) body.name = name;
    if (html) body.htmlContent = html;
    if (isActive) body.isActive = isActive === 'true';

    var result = await apiCall('PUT', '/api/templates/' + encodeURIComponent(code), body);
    showResponse('updateTemplate', result.status, result.data);
  }

  async function deleteTemplate() {
    var code = document.getElementById('dt-templateCode').value;
    if (!code) { alert('Please enter a template code'); return; }
    var result = await apiCall('DELETE', '/api/templates/' + encodeURIComponent(code));
    showResponse('deleteTemplate', result.status, result.data);
  }

  // === PACKAGES ===

  async function createPackage() {
    var btn = document.getElementById('btn-createPackage');

    if (!getApiKey()) {
      alert('Please enter your API key first');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      // Parse signers JSON
      var signers;
      try {
        signers = JSON.parse(document.getElementById('cp-signers').value);
      } catch (e) {
        alert('Invalid signers JSON: ' + e.message);
        btn.disabled = false;
        btn.textContent = 'Create Package';
        return;
      }

      // Parse merge variables JSON
      var mergeVariables = parseJsonField('cp-mergeVariables', 'Merge Variables');
      if (mergeVariables === null) { btn.disabled = false; btn.textContent = 'Create Package'; return; }

      // Build expiry date if set
      var expiresAtVal = val('cp-expiresAt');
      var expiresAt = expiresAtVal ? new Date(expiresAtVal).toISOString() : undefined;

      var body = {
        templateCode: val('cp-templateCode'),
        documentName: val('cp-documentName'),
        documentContent: val('cp-documentContent'),
        jurisdiction: val('cp-jurisdiction'),
        eventDate: val('cp-eventDate'),
        mergeVariables: mergeVariables,
        externalRef: val('cp-externalRef'),
        externalType: val('cp-externalType'),
        verificationMethod: val('cp-verificationMethod'),
        callbackUrl: val('cp-callbackUrl'),
        createdBy: val('cp-createdBy'),
        expiresAt: expiresAt,
        signers: signers
      };

      console.log('Creating package with:', body);
      var result = await apiCall('POST', '/api/packages', body);
      console.log('Result:', result);
      showResponse('createPackage', result.status, result.data);

      if (result.status === 201 && result.data.packageId) {
        saveContext('packageId', result.data.packageId);
        if (result.data.packageCode) {
          saveContext('packageCode', result.data.packageCode);
        }
        // Also save the first signer's token if available
        if (result.data.signatureRequests && result.data.signatureRequests.length > 0) {
          var firstReq = result.data.signatureRequests[0];
          if (firstReq.requestId) saveContext('requestId', firstReq.requestId);
          if (firstReq.signUrl) {
            var token = firstReq.signUrl.split('/sign/')[1];
            if (token) saveContext('token', token);
          }
        }
      }
    } catch (err) {
      console.error('Create package error:', err);
      showResponse('createPackage', 0, { error: err.message });
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Package';
    }
  }

  async function getPackage() {
    var id = document.getElementById('gp-id').value;
    if (!id) {
      alert('Please enter a package ID or code');
      return;
    }
    var result = await apiCall('GET', '/api/packages/' + encodeURIComponent(id));
    showResponse('getPackage', result.status, result.data);
  }

  async function batchGetPackages() {
    if (!getApiKey()) { alert('Please enter your API key first'); return; }

    var text = val('bp-ids');
    if (!text) {
      alert('Please enter at least one package ID or code');
      return;
    }
    var ids = text.split('\n').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
    if (ids.length === 0) {
      alert('Please enter at least one package ID or code');
      return;
    }

    var result = await apiCall('POST', '/api/packages/batch', { ids: ids });
    showResponse('batchPackages', result.status, result.data);
  }

  async function listPackages() {
    var params = new URLSearchParams();
    var status = val('lp-status');
    var externalRef = val('lp-externalRef');
    var limit = val('lp-limit');
    var offset = val('lp-offset');

    if (status) params.append('status', status);
    if (externalRef) params.append('externalRef', externalRef);
    if (limit) params.append('limit', limit);
    if (offset && offset !== '0') params.append('offset', offset);

    var result = await apiCall('GET', '/api/packages?' + params.toString());
    showResponse('listPackages', result.status, result.data);
  }

  async function listJurisdictions() {
    var result = await apiCall('GET', '/api/jurisdictions');
    showResponse('listJurisdictions', result.status, result.data);
  }

  async function getRoleRequirements() {
    var result = await apiCall('GET', '/api/roles/requirements');
    showResponse('roleRequirements', result.status, result.data);
  }

  async function loadPackageTemplates() {
    if (!getApiKey()) {
      alert('Please enter your API key first');
      return;
    }

    var result = await apiCall('GET', '/api/templates');
    if (result.status === 200 && Array.isArray(result.data)) {
      var select = document.getElementById('cp-templateCode');
      // Keep the first option (no template)
      select.innerHTML = '<option value="">-- No template (use custom content) --</option>';
      result.data.forEach(function(template) {
        var option = document.createElement('option');
        option.value = template.templateCode || template.template_code;
        option.textContent = (template.name || template.templateCode) +
          (template.jurisdiction ? ' (' + template.jurisdiction + ')' : '');
        select.appendChild(option);
      });
    }
  }

  async function replaceSigner() {
    if (!getApiKey()) { alert('Please enter your API key first'); return; }

    var packageId = document.getElementById('rs-packageId').value;
    var roleId = document.getElementById('rs-roleId').value;

    if (!packageId || !roleId) {
      alert('Package ID and Role ID are required');
      return;
    }

    var name = document.getElementById('rs-name').value;
    var email = document.getElementById('rs-email').value;
    var phone = document.getElementById('rs-phone').value;

    if (!name) {
      alert('New signer name is required');
      return;
    }

    if (!email && !phone) {
      alert('New signer must have either email or phone');
      return;
    }

    var body = {
      name: name,
      email: email || undefined,
      phone: phone || undefined,
      dateOfBirth: val('rs-dateOfBirth'),
      verificationMethod: val('rs-verificationMethod')
    };

    var result = await apiCall('PUT', '/api/packages/' + encodeURIComponent(packageId) + '/roles/' + encodeURIComponent(roleId), body);
    showResponse('replaceSigner', result.status, result.data);
  }

  async function createJurisdiction() {
    if (!getApiKey()) { alert('Please enter your API key first'); return; }

    var jurisdictionCode = document.getElementById('cj-jurisdictionCode').value;
    var jurisdictionName = document.getElementById('cj-jurisdictionName').value;
    var addendumHtml = document.getElementById('cj-addendumHtml').value;

    if (!jurisdictionCode || !jurisdictionName || !addendumHtml) {
      alert('Jurisdiction Code, Name, and Addendum HTML are all required');
      return;
    }

    var body = {
      jurisdictionCode: jurisdictionCode,
      jurisdictionName: jurisdictionName,
      addendumHtml: addendumHtml
    };

    var result = await apiCall('POST', '/api/jurisdictions', body);
    showResponse('createJurisdiction', result.status, result.data);
  }

  // === SIGNING FLOW ===

  async function getSigningData() {
    var token = document.getElementById('spd-token').value;
    if (!token) { alert('Please enter a signing token'); return; }
    var result = await apiCall('GET', '/sign/' + token + '/data', null, false);
    showResponse('getSigningData', result.status, result.data);
  }

  async function sendVerification() {
    var token = document.getElementById('sv-token').value;
    if (!token) { alert('Please enter a signing token'); return; }
    var method = document.getElementById('sv-method').value;
    var result = await apiCall('POST', '/sign/' + token + '/verify', { method: method }, false);
    showResponse('sendVerification', result.status, result.data);
  }

  async function confirmVerification() {
    var token = document.getElementById('cv-token').value;
    if (!token) { alert('Please enter a signing token'); return; }
    var code = document.getElementById('cv-code').value;
    if (!code) { alert('Please enter the verification code'); return; }
    var result = await apiCall('POST', '/sign/' + token + '/confirm', { code: code }, false);
    showResponse('confirmVerification', result.status, result.data);
  }

  async function submitSignature() {
    var token = document.getElementById('ss-token').value;
    if (!token) { alert('Please enter a signing token'); return; }
    var body = {
      signatureType: document.getElementById('ss-signatureType').value,
      typedName: val('ss-typedName'),
      consentText: document.getElementById('ss-consentText').value
    };
    var result = await apiCall('POST', '/sign/' + token + '/submit', body, false);
    showResponse('submitSignature', result.status, result.data);
  }

  function openSigningPage() {
    var token = document.getElementById('op-token').value;
    if (!token) { alert('Please enter a signing token'); return; }
    window.open('/sign/' + token, '_blank');
  }

  // === FULL TEST ===

  function ftLog(msg) {
    var el = document.getElementById('ft-log-body');
    el.textContent += new Date().toLocaleTimeString() + ' - ' + msg + '\n';
    el.scrollTop = el.scrollHeight;
  }

  async function runFullTest() {
    var email = document.getElementById('ft-email').value;
    var phone = document.getElementById('ft-phone').value;
    var name = document.getElementById('ft-name').value;
    var method = document.getElementById('ft-method').value;

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
    var createBody = {
      documentName: 'Full Test Document',
      signerName: name,
      signerEmail: email || undefined,
      signerPhone: phone || undefined,
      verificationMethod: method,
      documentContent: '<h2>Test Document</h2><p>This is a full end-to-end test.</p>'
    };

    var createResult = await apiCall('POST', '/api/requests', createBody);

    if (createResult.status !== 201) {
      ftLog('ERROR: Failed to create request - ' + JSON.stringify(createResult.data));
      document.getElementById('ft-btn').disabled = false;
      return;
    }

    var requestId = createResult.data.id || createResult.data.requestId;
    ftLog('Request created! ID: ' + requestId);
    fullTestToken = createResult.data.signUrl.split('/sign/')[1];
    ftLog('Token: ' + fullTestToken);
    saveContext('requestId', requestId);
    saveContext('token', fullTestToken);
    if (createResult.data.referenceCode) {
      saveContext('reference', createResult.data.referenceCode);
    }

    // Step 2: Send verification
    ftLog('Step 2: Sending verification code via ' + method + '...');
    var verifyResult = await apiCall('POST', '/sign/' + fullTestToken + '/verify', { method: method }, false);

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
    var code = document.getElementById('ft-code').value;

    if (!code || code.length !== 6) {
      alert('Please enter a 6-digit code');
      return;
    }

    // Step 3: Confirm code
    ftLog('Step 3: Confirming verification code...');
    var confirmResult = await apiCall('POST', '/sign/' + fullTestToken + '/confirm', { code: code }, false);

    if (confirmResult.status !== 200) {
      ftLog('ERROR: Failed to confirm code - ' + JSON.stringify(confirmResult.data));
      return;
    }

    ftLog('Code confirmed! Identity verified.');

    // Step 4: Submit signature
    ftLog('Step 4: Submitting signature...');
    var signBody = {
      signatureType: 'typed',
      typedName: document.getElementById('ft-name').value,
      consentText: 'I agree to sign this document electronically'
    };

    var signResult = await apiCall('POST', '/sign/' + fullTestToken + '/submit', signBody, false);

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
