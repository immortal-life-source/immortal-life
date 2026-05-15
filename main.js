/* ============================================================
   immortal.life — main.js
   Scroll reveal · Form validation · Modal · Backend hook
   ============================================================ */

'use strict';

/* ── Scroll reveal ─────────────────────────────────────────── */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1 }
);

document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

/* ── Form ──────────────────────────────────────────────────── */
const emailInput   = document.getElementById('emailInput');
const consentCheck = document.getElementById('consentCheck');
const formError    = document.getElementById('formError');
const formState    = document.getElementById('formState');
const successState = document.getElementById('successState');

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function setEmailError(msg) {
  emailInput.classList.add('error');
  formError.textContent = msg;
}

function clearEmailError() {
  emailInput.classList.remove('error');
  formError.textContent = '';
}

emailInput.addEventListener('input', clearEmailError);

emailInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSubmit();
});

async function handleSubmit() {
  let valid = true;
  clearEmailError();
  consentCheck.classList.remove('error');

  const email = emailInput.value.trim();

  if (!validateEmail(email)) {
    setEmailError('Please enter a valid email address.');
    emailInput.focus();
    valid = false;
  }

  if (!consentCheck.checked) {
    consentCheck.classList.add('error');
    valid = false;
  }

  if (!valid) return;

  /* ── Send to backend ─────────────────────────────────────
     Replace WEBHOOK_URL with your n8n webhook endpoint.
     The payload includes consent timestamp for GDPR audit trail.
     ─────────────────────────────────────────────────────── */
  const WEBHOOK_URL = 'YOUR_N8N_WEBHOOK_URL'; // TODO: replace before go-live

  const payload = {
    email:      email,
    consent:    true,
    consent_ts: new Date().toISOString(),
    source:     'immortal.life',
  };

  /* Optimistic UI — show success immediately, send in background */
  showSuccess();

  try {
    const res = await fetch(WEBHOOK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error('Webhook error:', res.status, res.statusText);
    }
  } catch (err) {
    /* Network failure — log silently, user already sees success.
       In production consider a retry queue or fallback. */
    console.error('Submission error:', err);
  }
}

function showSuccess() {
  formState.style.display    = 'none';
  successState.style.display = 'flex';
  successState.focus();
}

/* ── Privacy modal ─────────────────────────────────────────── */
const modal     = document.getElementById('privacyModal');
const firstFocus = modal.querySelector('.modal-close');

function openPrivacy() {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  firstFocus.focus();
}

function closePrivacy() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/* Close on backdrop click */
modal.addEventListener('click', (e) => {
  if (e.target === modal) closePrivacy();
});

/* Close on Escape */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('open')) closePrivacy();
});

/* Expose to inline onclick handlers */
window.openPrivacy  = openPrivacy;
window.closePrivacy = closePrivacy;
window.handleSubmit = handleSubmit;
