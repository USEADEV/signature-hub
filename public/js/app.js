(function() {
  'use strict';

  // State
  let pageData = null;
  let signaturePad = null;
  let currentVerificationMethod = null;
  let signatureType = 'typed';
  let codeExpiryTimer = null;
  let codeExpiresAt = null;

  // Elements
  const elements = {
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    errorTitle: document.getElementById('error-title'),
    errorMessage: document.getElementById('error-message'),
    btnRetry: document.getElementById('btn-retry'),
    expired: document.getElementById('expired'),
    cancelled: document.getElementById('cancelled'),
    alreadySigned: document.getElementById('already-signed'),
    progressSteps: document.getElementById('progress-steps'),
    toastContainer: document.getElementById('toast-container'),
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
    inlineErrorVerify: document.getElementById('inline-error-verify'),
    inlineErrorSign: document.getElementById('inline-error-sign'),
    codeTimer: document.getElementById('code-timer'),
    timerValue: document.getElementById('timer-value'),
    resendSuccess: document.getElementById('resend-success'),
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

  // Toast notification system
  function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Inline error display
  function showInlineError(element, message) {
    if (element) {
      element.textContent = message;
      element.classList.add('visible');
    }
  }

  function hideInlineError(element) {
    if (element) {
      element.classList.remove('visible');
    }
  }

  // Button loading state
  function setButtonLoading(button, loading) {
    if (loading) {
      button.classList.add('loading');
      button.disabled = true;
    } else {
      button.classList.remove('loading');
      button.disabled = false;
    }
  }

  // Progress steps management
  function setProgress(step) {
    if (!elements.progressSteps) return;

    elements.progressSteps.classList.remove('hidden');

    // Update step states
    document.querySelectorAll('.progress-step').forEach(el => {
      const stepNum = parseInt(el.dataset.step);
      el.classList.remove('active', 'completed');
      if (stepNum < step) {
        el.classList.add('completed');
      } else if (stepNum === step) {
        el.classList.add('active');
      }
    });

    // Update line states
    document.querySelectorAll('.progress-line').forEach(el => {
      const lineNum = parseInt(el.dataset.line);
      el.classList.toggle('completed', lineNum < step);
    });
  }

  function hideProgress() {
    if (elements.progressSteps) {
      elements.progressSteps.classList.add('hidden');
    }
  }

  // Get token from URL
  function getToken() {
    const path = window.location.pathname;
    const parts = path.split('/');
    return parts[parts.length - 1];
  }

  // Hide all sections
  function hideAllSections() {
    const sections = ['loading', 'error', 'expired', 'cancelled', 'alreadySigned',
                      'stepDocument', 'stepVerify', 'stepSign', 'stepSuccess'];
    sections.forEach(s => {
      if (elements[s]) {
        elements[s].classList.add('hidden');
      }
    });
  }

  // Show section
  function showSection(section, progressStep = null) {
    hideAllSections();
    if (elements[section]) {
      elements[section].classList.remove('hidden');
    }

    if (progressStep) {
      setProgress(progressStep);
    } else if (['expired', 'cancelled', 'alreadySigned', 'error', 'loading'].includes(section)) {
      hideProgress();
    }
  }

  // Show error with customizable title
  function showError(message, title = 'Something went wrong') {
    if (elements.errorTitle) {
      elements.errorTitle.textContent = title;
    }
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

    // Handle specific status codes
    if (response.status === 410) {
      // Gone - expired
      throw { type: 'expired', message: data.error || 'This request has expired' };
    }
    if (response.status === 409) {
      // Conflict - already signed or cancelled
      if (data.error && data.error.toLowerCase().includes('cancel')) {
        throw { type: 'cancelled', message: data.error };
      }
      if (data.error && data.error.toLowerCase().includes('sign')) {
        throw { type: 'signed', message: data.error };
      }
    }

    if (!response.ok) {
      throw { type: 'error', message: data.error || 'Request failed' };
    }
    return data;
  }

  // Code expiry timer
  function startCodeTimer(expiresAt) {
    if (codeExpiryTimer) {
      clearInterval(codeExpiryTimer);
    }

    codeExpiresAt = new Date(expiresAt);

    function updateTimer() {
      const now = new Date();
      const diff = codeExpiresAt - now;

      if (diff <= 0) {
        clearInterval(codeExpiryTimer);
        elements.timerValue.textContent = '0:00';
        elements.codeTimer.classList.remove('warning');
        elements.codeTimer.classList.add('expired');
        showInlineError(elements.inlineErrorVerify, 'Code expired. Please request a new one.');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      elements.timerValue.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      // Warning state when less than 1 minute
      elements.codeTimer.classList.toggle('warning', minutes < 1);
      elements.codeTimer.classList.remove('expired');
    }

    updateTimer();
    codeExpiryTimer = setInterval(updateTimer, 1000);
    elements.codeTimer.classList.remove('hidden');
  }

  function stopCodeTimer() {
    if (codeExpiryTimer) {
      clearInterval(codeExpiryTimer);
      codeExpiryTimer = null;
    }
    if (elements.codeTimer) {
      elements.codeTimer.classList.add('hidden');
    }
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
        showSection('stepSign', 3);
        initSignaturePad();
      } else {
        showSection('stepDocument', 1);
      }
    } catch (error) {
      handleError(error);
    }
  }

  // Handle errors based on type
  function handleError(error) {
    if (error.type === 'expired') {
      showSection('expired');
    } else if (error.type === 'cancelled') {
      showSection('cancelled');
    } else if (error.type === 'signed') {
      showSection('alreadySigned');
    } else {
      showError(error.message || 'An unexpected error occurred');
    }
  }

  // Send verification code
  async function sendVerificationCode(method, isResend = false) {
    try {
      hideInlineError(elements.inlineErrorVerify);

      if (isResend) {
        setButtonLoading(elements.btnResendCode, true);
      } else {
        setButtonLoading(elements.btnVerifyEmail, true);
        setButtonLoading(elements.btnVerifySms, true);
      }

      const result = await api('/verify', {
        method: 'POST',
        body: JSON.stringify({ method }),
      });

      currentVerificationMethod = method;
      elements.verificationSentMessage.textContent = result.message;
      elements.verificationOptions.classList.add('hidden');
      elements.verificationCodeSection.classList.remove('hidden');
      elements.verificationCode.value = '';
      elements.verificationCode.focus();

      // Start the code timer (codes expire in 5 minutes)
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      startCodeTimer(expiresAt);

      // Show "Try Different Method" if both methods are available
      const hasBothMethods = pageData.hasEmail && pageData.hasPhone && pageData.verificationMethod === 'both';
      if (hasBothMethods && elements.btnTryDifferent) {
        elements.btnTryDifferent.classList.remove('hidden');
      }

      // Show resend success message briefly
      if (isResend && elements.resendSuccess) {
        elements.resendSuccess.classList.add('visible');
        setTimeout(() => {
          elements.resendSuccess.classList.remove('visible');
        }, 3000);
      }
    } catch (error) {
      if (error.type) {
        handleError(error);
      } else {
        showInlineError(elements.inlineErrorVerify, error.message || 'Failed to send verification code');
      }
    } finally {
      setButtonLoading(elements.btnVerifyEmail, false);
      setButtonLoading(elements.btnVerifySms, false);
      setButtonLoading(elements.btnResendCode, false);
    }
  }

  // Reset verification to try different method
  function resetVerificationMethod() {
    currentVerificationMethod = null;
    elements.verificationCode.value = '';
    elements.verificationCodeSection.classList.add('hidden');
    elements.verificationOptions.classList.remove('hidden');
    hideInlineError(elements.inlineErrorVerify);
    stopCodeTimer();
    if (elements.btnTryDifferent) {
      elements.btnTryDifferent.classList.add('hidden');
    }
  }

  // Confirm verification code
  async function confirmVerificationCode() {
    const code = elements.verificationCode.value.trim();
    if (code.length !== 6) {
      showInlineError(elements.inlineErrorVerify, 'Please enter a 6-digit code');
      elements.verificationCode.focus();
      return;
    }

    try {
      hideInlineError(elements.inlineErrorVerify);
      setButtonLoading(elements.btnConfirmCode, true);

      await api('/confirm', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });

      stopCodeTimer();
      pageData.isVerified = true;
      showToast('Identity verified successfully', 'success');
      showSection('stepSign', 3);
      initSignaturePad();
    } catch (error) {
      if (error.type) {
        handleError(error);
      } else {
        // Check for specific error messages
        const msg = error.message || 'Invalid code';
        if (msg.toLowerCase().includes('expired')) {
          showInlineError(elements.inlineErrorVerify, 'Code expired. Please request a new one.');
        } else if (msg.toLowerCase().includes('attempts')) {
          showInlineError(elements.inlineErrorVerify, msg + ' Click "Resend" to get a new code.');
        } else {
          showInlineError(elements.inlineErrorVerify, msg);
        }
        elements.verificationCode.value = '';
        elements.verificationCode.focus();
      }
    } finally {
      setButtonLoading(elements.btnConfirmCode, false);
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

    hideInlineError(elements.inlineErrorSign);
    validateForm();
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
    hideInlineError(elements.inlineErrorSign);

    if (!elements.consentCheckbox.checked) {
      showInlineError(elements.inlineErrorSign, 'Please agree to the consent statement');
      return;
    }

    const payload = {
      signatureType,
      consentText: elements.consentText.textContent,
    };

    if (signatureType === 'typed') {
      payload.typedName = elements.typedSignature.value.trim();
      if (!payload.typedName) {
        showInlineError(elements.inlineErrorSign, 'Please type your signature');
        elements.typedSignature.focus();
        return;
      }
    } else {
      if (signaturePad.isEmpty()) {
        showInlineError(elements.inlineErrorSign, 'Please draw your signature');
        return;
      }
      payload.signatureImage = signaturePad.toDataURL();
    }

    try {
      setButtonLoading(elements.btnSubmit, true);

      const result = await api('/submit', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      elements.signedAt.textContent = new Date(result.signedAt).toLocaleString();
      showSection('stepSuccess');
      hideProgress();
      showToast('Document signed successfully!', 'success', 5000);
    } catch (error) {
      if (error.type) {
        handleError(error);
      } else {
        showInlineError(elements.inlineErrorSign, error.message || 'Failed to submit signature');
      }
    } finally {
      setButtonLoading(elements.btnSubmit, false);
    }
  }

  // Event listeners
  function bindEvents() {
    elements.btnContinueToVerify.addEventListener('click', () => {
      showSection('stepVerify', 2);
    });

    elements.btnVerifyEmail.addEventListener('click', () => sendVerificationCode('email'));
    elements.btnVerifySms.addEventListener('click', () => sendVerificationCode('sms'));

    elements.btnConfirmCode.addEventListener('click', confirmVerificationCode);

    elements.verificationCode.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        confirmVerificationCode();
      }
    });

    // Clear inline error when user starts typing
    elements.verificationCode.addEventListener('input', () => {
      hideInlineError(elements.inlineErrorVerify);
    });

    elements.btnResendCode.addEventListener('click', () => {
      if (currentVerificationMethod) {
        sendVerificationCode(currentVerificationMethod, true);
      }
    });

    if (elements.btnTryDifferent) {
      elements.btnTryDifferent.addEventListener('click', resetVerificationMethod);
    }

    if (elements.btnRetry) {
      elements.btnRetry.addEventListener('click', () => {
        showSection('loading');
        loadPageData();
      });
    }

    elements.tabType.addEventListener('click', () => switchSignatureType('typed'));
    elements.tabDraw.addEventListener('click', () => switchSignatureType('drawn'));

    elements.typedSignature.addEventListener('input', () => {
      updateTypedPreview();
      validateForm();
      hideInlineError(elements.inlineErrorSign);
    });

    elements.btnClearCanvas.addEventListener('click', () => {
      signaturePad.clear();
      validateForm();
    });

    elements.signatureCanvas.addEventListener('mouseup', validateForm);
    elements.signatureCanvas.addEventListener('touchend', validateForm);

    elements.consentCheckbox.addEventListener('change', () => {
      validateForm();
      hideInlineError(elements.inlineErrorSign);
    });

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
