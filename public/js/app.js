(function() {
  'use strict';

  // State
  let pageData = null;
  let signaturePad = null;
  let currentVerificationMethod = null;
  let signatureType = 'typed';

  // Elements
  const elements = {
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    errorMessage: document.getElementById('error-message'),
    stepDocument: document.getElementById('step-document'),
    stepVerify: document.getElementById('step-verify'),
    stepSign: document.getElementById('step-sign'),
    stepSuccess: document.getElementById('step-success'),
    documentName: document.getElementById('document-name'),
    signerName: document.getElementById('signer-name'),
    signerRoles: document.getElementById('signer-roles'),
    documentContent: document.getElementById('document-content'),
    documentUrl: document.getElementById('document-url'),
    documentLink: document.getElementById('document-link'),
    btnContinueToVerify: document.getElementById('btn-continue-to-verify'),
    btnVerifyEmail: document.getElementById('btn-verify-email'),
    btnVerifySms: document.getElementById('btn-verify-sms'),
    verificationOptions: document.getElementById('verification-options'),
    verificationCodeSection: document.getElementById('verification-code-section'),
    verificationSentMessage: document.getElementById('verification-sent-message'),
    verificationCode: document.getElementById('verification-code'),
    btnConfirmCode: document.getElementById('btn-confirm-code'),
    btnResendCode: document.getElementById('btn-resend-code'),
    btnTryDifferent: document.getElementById('btn-try-different'),
    tabType: document.getElementById('tab-type'),
    tabDraw: document.getElementById('tab-draw'),
    signatureTypePanel: document.getElementById('signature-type'),
    signatureDrawPanel: document.getElementById('signature-draw'),
    typedSignature: document.getElementById('typed-signature'),
    typedPreview: document.getElementById('typed-preview'),
    signatureCanvas: document.getElementById('signature-canvas'),
    btnClearCanvas: document.getElementById('btn-clear-canvas'),
    consentCheckbox: document.getElementById('consent-checkbox'),
    consentText: document.getElementById('consent-text'),
    btnSubmit: document.getElementById('btn-submit'),
    signedAt: document.getElementById('signed-at'),
    demoHint: document.getElementById('demo-hint'),
  };

  // Get token from URL
  function getToken() {
    const path = window.location.pathname;
    const parts = path.split('/');
    return parts[parts.length - 1];
  }

  // Show section
  function showSection(section) {
    ['loading', 'error', 'stepDocument', 'stepVerify', 'stepSign', 'stepSuccess'].forEach(s => {
      elements[s].classList.add('hidden');
    });
    elements[section].classList.remove('hidden');
  }

  // Show error
  function showError(message) {
    elements.errorMessage.textContent = message;
    showSection('error');
  }

  // API helper
  async function api(endpoint, options = {}) {
    const token = getToken();
    const url = `/sign/${token}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }

  // Load page data
  async function loadPageData() {
    try {
      pageData = await api('/data');

      elements.documentName.textContent = pageData.documentName;
      elements.signerName.textContent = pageData.signerName;

      // Display roles if this is a package signing with multiple roles
      if (pageData.roles && pageData.roles.length > 0 && elements.signerRoles) {
        const roleNames = pageData.roles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ');
        elements.signerRoles.innerHTML = `<strong>Role(s):</strong> ${roleNames}`;
        elements.signerRoles.classList.remove('hidden');
      }

      if (pageData.documentContent) {
        elements.documentContent.innerHTML = pageData.documentContent;
        elements.documentContent.classList.remove('hidden');
      }

      if (pageData.documentUrl) {
        elements.documentLink.href = pageData.documentUrl;
        elements.documentUrl.classList.remove('hidden');
      }

      // Set up verification options
      if (pageData.hasEmail && (pageData.verificationMethod === 'email' || pageData.verificationMethod === 'both')) {
        elements.btnVerifyEmail.classList.remove('hidden');
      }
      if (pageData.hasPhone && (pageData.verificationMethod === 'sms' || pageData.verificationMethod === 'both')) {
        elements.btnVerifySms.classList.remove('hidden');
      }

      // Show/hide demo hint based on demo mode
      if (elements.demoHint) {
        if (pageData.demoMode) {
          elements.demoHint.classList.remove('hidden');
        } else {
          elements.demoHint.classList.add('hidden');
        }
      }

      // Check if already verified
      if (pageData.isVerified) {
        showSection('stepSign');
        initSignaturePad();
      } else {
        showSection('stepDocument');
      }
    } catch (error) {
      showError(error.message);
    }
  }

  // Send verification code
  async function sendVerificationCode(method) {
    try {
      elements.btnVerifyEmail.disabled = true;
      elements.btnVerifySms.disabled = true;

      const result = await api('/verify', {
        method: 'POST',
        body: JSON.stringify({ method }),
      });

      currentVerificationMethod = method;
      elements.verificationSentMessage.textContent = result.message;
      elements.verificationOptions.classList.add('hidden');
      elements.verificationCodeSection.classList.remove('hidden');
      elements.verificationCode.focus();

      // Show "Try Different Method" if both methods are available
      const hasBothMethods = pageData.hasEmail && pageData.hasPhone && pageData.verificationMethod === 'both';
      if (hasBothMethods && elements.btnTryDifferent) {
        elements.btnTryDifferent.classList.remove('hidden');
      }
    } catch (error) {
      alert(error.message);
    } finally {
      elements.btnVerifyEmail.disabled = false;
      elements.btnVerifySms.disabled = false;
    }
  }

  // Reset verification to try different method
  function resetVerificationMethod() {
    currentVerificationMethod = null;
    elements.verificationCode.value = '';
    elements.verificationCodeSection.classList.add('hidden');
    elements.verificationOptions.classList.remove('hidden');
    if (elements.btnTryDifferent) {
      elements.btnTryDifferent.classList.add('hidden');
    }
  }

  // Confirm verification code
  async function confirmVerificationCode() {
    const code = elements.verificationCode.value.trim();
    if (code.length !== 6) {
      alert('Please enter a 6-digit code');
      return;
    }

    try {
      elements.btnConfirmCode.disabled = true;
      await api('/confirm', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });

      pageData.isVerified = true;
      showSection('stepSign');
      initSignaturePad();
    } catch (error) {
      alert(error.message);
      elements.verificationCode.value = '';
      elements.verificationCode.focus();
    } finally {
      elements.btnConfirmCode.disabled = false;
    }
  }

  // Initialize signature pad
  function initSignaturePad() {
    if (!signaturePad) {
      signaturePad = new SignaturePad(elements.signatureCanvas);
    }
    elements.typedSignature.value = pageData.signerName;
    updateTypedPreview();
  }

  // Update typed preview
  function updateTypedPreview() {
    elements.typedPreview.textContent = elements.typedSignature.value || '';
  }

  // Switch signature type
  function switchSignatureType(type) {
    signatureType = type;

    elements.tabType.classList.toggle('active', type === 'typed');
    elements.tabDraw.classList.toggle('active', type === 'drawn');
    elements.signatureTypePanel.classList.toggle('hidden', type !== 'typed');
    elements.signatureDrawPanel.classList.toggle('hidden', type !== 'drawn');

    // Initialize signature pad when draw tab is shown
    if (type === 'drawn' && signaturePad) {
      // Use setTimeout to ensure the canvas is visible before initializing
      setTimeout(() => {
        signaturePad.init();
      }, 50);
    }
  }

  // Validate form
  function validateForm() {
    const hasSignature = signatureType === 'typed'
      ? elements.typedSignature.value.trim().length > 0
      : !signaturePad.isEmpty();
    const hasConsent = elements.consentCheckbox.checked;

    elements.btnSubmit.disabled = !(hasSignature && hasConsent);
  }

  // Submit signature
  async function submitSignature() {
    if (!elements.consentCheckbox.checked) {
      alert('Please agree to the consent statement');
      return;
    }

    const payload = {
      signatureType,
      consentText: elements.consentText.textContent,
    };

    if (signatureType === 'typed') {
      payload.typedName = elements.typedSignature.value.trim();
      if (!payload.typedName) {
        alert('Please type your signature');
        return;
      }
    } else {
      if (signaturePad.isEmpty()) {
        alert('Please draw your signature');
        return;
      }
      payload.signatureImage = signaturePad.toDataURL();
    }

    try {
      elements.btnSubmit.disabled = true;
      elements.btnSubmit.textContent = 'Signing...';

      const result = await api('/submit', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      elements.signedAt.textContent = new Date(result.signedAt).toLocaleString();
      showSection('stepSuccess');
    } catch (error) {
      alert(error.message);
    } finally {
      elements.btnSubmit.disabled = false;
      elements.btnSubmit.textContent = 'Sign Document';
    }
  }

  // Event listeners
  function bindEvents() {
    elements.btnContinueToVerify.addEventListener('click', () => {
      showSection('stepVerify');
    });

    elements.btnVerifyEmail.addEventListener('click', () => sendVerificationCode('email'));
    elements.btnVerifySms.addEventListener('click', () => sendVerificationCode('sms'));

    elements.btnConfirmCode.addEventListener('click', confirmVerificationCode);

    elements.verificationCode.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        confirmVerificationCode();
      }
    });

    elements.btnResendCode.addEventListener('click', () => {
      if (currentVerificationMethod) {
        sendVerificationCode(currentVerificationMethod);
      }
    });

    if (elements.btnTryDifferent) {
      elements.btnTryDifferent.addEventListener('click', resetVerificationMethod);
    }

    elements.tabType.addEventListener('click', () => switchSignatureType('typed'));
    elements.tabDraw.addEventListener('click', () => switchSignatureType('drawn'));

    elements.typedSignature.addEventListener('input', () => {
      updateTypedPreview();
      validateForm();
    });

    elements.btnClearCanvas.addEventListener('click', () => {
      signaturePad.clear();
      validateForm();
    });

    elements.signatureCanvas.addEventListener('mouseup', validateForm);
    elements.signatureCanvas.addEventListener('touchend', validateForm);

    elements.consentCheckbox.addEventListener('change', validateForm);

    elements.btnSubmit.addEventListener('click', submitSignature);
  }

  // Initialize
  function init() {
    bindEvents();
    loadPageData();
  }

  // Start app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
