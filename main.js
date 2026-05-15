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
  const WEBHOOK_URL = 'https://nifbuyoghesveotugday.supabase.co/functions/v1/subscribe';

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
const modal = document.getElementById('privacyModal');
const firstFocus = modal?.querySelector('.modal-close');

function openPrivacy(e) {
  document.getElementById('privacyModal').style.display = 'block';
  if (e && e.preventDefault) e.preventDefault();
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  firstFocus?.focus();
}

function closePrivacy() {
  if (!modal) return;
  modal.style.display = '';
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePrivacy();
  });
}

firstFocus?.addEventListener('click', closePrivacy);

function bindPrivacyOpenTriggers(el) {
  if (!el) return;
  const handler = (e) => openPrivacy(e);
  el.addEventListener('click', handler, { passive: false });
  el.addEventListener('touchstart', handler, { passive: false });
}

bindPrivacyOpenTriggers(document.querySelector('.privacy-link'));
bindPrivacyOpenTriggers(
  document.querySelector('.site-footer .foot-right > button.foot-link')
);

document.getElementById('submitBtn')?.addEventListener('click', () => {
  handleSubmit();
});

/* Close on Escape */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal?.classList.contains('open')) closePrivacy();
});

/* ── Hero particle canvas ─────────────────────────────────── */
(function initHeroParticles() {
  const canvas = document.getElementById('heroParticles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const N = 220;
  const CONN_DIST = 90;
  const ROTATION_PERIOD_S = 120;
  const dprCap = 2;

  const goldCount = Math.round(N * 0.3);
  const isGoldArr = [];
  let i;
  for (i = 0; i < goldCount; i++) isGoldArr.push(true);
  for (i = goldCount; i < N; i++) isGoldArr.push(false);
  for (i = isGoldArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = isGoldArr[i];
    isGoldArr[i] = isGoldArr[j];
    isGoldArr[j] = tmp;
  }

  const particles = [];
  let cssW = 0;
  let cssH = 0;

  function insetXMin(w) {
    return Math.max(20, Math.round(w * 0.1));
  }

  function wrap1D(v, lo, hi) {
    const span = hi - lo;
    if (span < 1) return lo;
    let t = v - lo;
    t = ((t % span) + span) % span;
    return lo + t;
  }

  function layoutCanvas() {
    const nextW = canvas.clientWidth;
    const nextH = canvas.clientHeight;
    if (nextW < 2 || nextH < 2) return;

    const xMin = insetXMin(nextW);

    if (particles.length === 0) {
      const spanX = Math.max(1, nextW - xMin);
      for (i = 0; i < N; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.08 + Math.random() * (0.18 - 0.08);
        particles.push({
          x: xMin + Math.random() * spanX,
          y: Math.random() * nextH,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          baseR: 0.8 + Math.random() * (2 - 0.8),
          phase: Math.random() * Math.PI * 2,
          period: 3 + Math.random() * 3,
          isGold: isGoldArr[i],
        });
      }
    } else if (cssW > 0 && cssH > 0 && (nextW !== cssW || nextH !== cssH)) {
      const sx = nextW / cssW;
      const sy = nextH / cssH;
      const xMinN = insetXMin(nextW);
      particles.forEach((pp) => {
        pp.x *= sx;
        pp.y *= sy;
        pp.x = wrap1D(pp.x, xMinN, nextW);
        pp.y = wrap1D(pp.y, 0, nextH);
      });
    }

    cssW = nextW;
    cssH = nextH;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function tick(now) {
    if (document.hidden) return;

    if (cssW < 2 || cssH < 2) {
      layoutCanvas();
      requestAnimationFrame(tick);
      return;
    }

    const tSec = now * 0.001;
    const rot = (tSec * (Math.PI * 2)) / ROTATION_PERIOD_S;
    const xMin = insetXMin(cssW);

    ctx.clearRect(0, 0, cssW, cssH);

    ctx.save();
    ctx.translate(cssW * 0.5, cssH * 0.5);
    ctx.rotate(rot);
    ctx.translate(-cssW * 0.5, -cssH * 0.5);

    let a;
    let b;
    let d;
    let dx;
    let dy;
    let j;
    let prox;
    let p;
    let breath;
    let r;

    for (i = 0; i < N; i++) {
      p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.x = wrap1D(p.x, xMin, cssW);
      p.y = wrap1D(p.y, 0, cssH);
    }

    for (i = 0; i < N; i++) {
      a = particles[i];
      for (j = i + 1; j < N; j++) {
        b = particles[j];
        dx = b.x - a.x;
        dy = b.y - a.y;
        d = Math.hypot(dx, dy);
        if (d >= CONN_DIST) continue;
        prox = 1 - d / CONN_DIST;
        ctx.strokeStyle = 'rgba(184,149,90,' + (0.12 * prox) + ')';
        ctx.lineWidth = 2 * prox;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    for (i = 0; i < N; i++) {
      p = particles[i];
      breath = 0.4 * Math.sin((tSec * (Math.PI * 2)) / p.period + p.phase);
      r = Math.max(0.2, p.baseR + breath);
      ctx.fillStyle = p.isGold ? 'rgba(184,149,90,0.6)' : 'rgba(237,233,224,0.4)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    requestAnimationFrame(tick);
  }

  layoutCanvas();
  window.addEventListener('resize', layoutCanvas);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestAnimationFrame(tick);
  });
  requestAnimationFrame(tick);
})();

window.openPrivacy  = openPrivacy;
window.closePrivacy = closePrivacy;
window.handleSubmit = handleSubmit;
