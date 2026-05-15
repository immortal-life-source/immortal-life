# immortal.life — Cursor Implementation Brief
**Version:** 1.0  
**Date:** May 2026  
**Status:** Ready for implementation  

---

## 1. What this is

A production-ready static landing page for **immortal.life** — a longevity intelligence platform. The page is a holding/pre-launch experience with a GDPR-compliant email capture form. No framework. No build step. Pure HTML, CSS, and vanilla JavaScript.

**Live URL (target):** https://immortal.life  
**Hosting:** Vercel (static)  
**Repo:** GitHub (connect to Vercel for auto-deploy on push to `main`)

---

## 2. File structure

```
immortal-life/
├── index.html          ← Single page. All markup lives here.
├── style.css           ← All styles. Desktop-first. Mobile deferred.
├── main.js             ← Scroll reveal, form logic, modal, backend hook.
├── favicon.svg         ← SVG favicon. Works in all modern browsers.
├── vercel.json         ← Security headers + caching rules. Do not delete.
├── robots.txt          ← Allows all crawlers. Points to sitemap.
├── sitemap.xml         ← Single URL entry for immortal.life/
└── OG-IMAGE-NEEDED.txt ← Brief for the OG social image (1200×630 jpg)
```

**Do not add any build tools, package.json, node_modules, or frameworks.**  
This is intentionally zero-dependency. Keep it that way.

---

## 3. Fonts

Loaded from Google Fonts via `<link>` in `<head>`. No local font files needed.

| Family | Weights used | Role |
|--------|-------------|------|
| Cormorant | 200, 300 (normal + italic) | All display/headline text |
| Instrument Sans | 300, 400 (normal + italic) | All body/UI text |

---

## 4. Design tokens (CSS custom properties)

Defined in `:root` in `style.css`. **Do not hardcode colour values anywhere** — always reference these variables.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#070706` | Page background |
| `--bg2` | `#0d0d0b` | Hover states, modal background |
| `--gold` | `#b8955a` | Primary accent — logo, italic text, CTA |
| `--gold-faint` | `rgba(184,149,90,0.12)` | Subtle gold fills |
| `--gold-mid` | `rgba(184,149,90,0.35)` | Mid-opacity gold |
| `--white` | `#ede9e0` | Primary text |
| `--off` | `#8a8878` | Secondary text, labels |
| `--border` | `rgba(237,233,224,0.08)` | Subtle dividers |
| `--border-mid` | `rgba(237,233,224,0.14)` | Form borders |
| `--error` | `rgba(180,70,70,0.75)` | Validation error state |
| `--font-serif` | `'Cormorant', Georgia, serif` | Display font stack |
| `--font-sans` | `'Instrument Sans', system-ui, sans-serif` | UI font stack |
| `--pad-x` | `64px` | Horizontal page padding |
| `--pad-section` | `140px` | Vertical section padding |

---

## 5. Page sections (in order)

### S1 — Hero (full viewport height)
- Architectural grid lines (thin 1px borders, decorative only)
- Horizon glow (radial gradient at bottom, CSS only)
- Logo top-left, "Est. 2026" top-right
- Giant 3-line headline with staggered slide-up entrance animation
- Italic middle line uses `rgba(237,233,224,0.32)` — intentionally dim
- Subline with vertical gold rule and descriptive text
- Scroll indicator bottom-right (animated gold line)

### S2 — Manifesto
- 2-column grid: sticky label left (200px), content right
- 3 manifesto statements in large Cormorant serif
- Each has an `.aside` paragraph in smaller sans-serif
- Separated by bottom border; last item has no border

### S3 — Pillars
- 3-column grid, full width, no outer padding
- Each pillar: index number, title (Cormorant with gold italic), body text
- Right border between pillars (not on last)
- Hover: background shifts to `--bg2`

### S4 — Email capture
- 2-column: left = copy, right = form (440px fixed)
- Right-side radial glow (decorative, `pointer-events: none`)
- Form fields: email input + GDPR consent checkbox + CTA button
- On success: form hides, success state reveals (flex)
- Backend hook is in `main.js` — see Section 7

### Footer
- Simple flex row: logo left, links + copyright right
- Privacy Policy button opens modal
- Contact links to `mailto:hello@immortal.life`

### Privacy Modal
- Fixed overlay, `z-index: 10000`
- Opens/closes via `openPrivacy()` / `closePrivacy()` in `main.js`
- Also closes on backdrop click and Escape key
- `aria-hidden` toggled for accessibility
- Contains full GDPR-compliant privacy policy text — **do not edit the legal text without owner approval**

---

## 6. Animations

All animations are CSS-only except the scroll reveal (IntersectionObserver in JS).

| Animation | Trigger | Duration | Element |
|-----------|---------|----------|---------|
| `slideUp` | Page load | 1.3s per line | H1 lines (staggered) |
| `fadeUp` | Page load | 0.8–1s | Header, subline, hero footer |
| `scrollFill` | Infinite loop | 2.2s | Scroll bar indicator |
| Scroll reveal | IntersectionObserver | 1s + delay | `.reveal` elements |

**Reduced motion:** `@media (prefers-reduced-motion: reduce)` disables all animations and makes elements immediately visible. Already implemented in `style.css`. Do not remove.

---

## 7. Backend connection (deferred — do after go-live)

The form is ready for the backend. One line to change in `main.js`:

```javascript
const WEBHOOK_URL = 'YOUR_N8N_WEBHOOK_URL'; // ← replace this
```

**Payload sent (POST, JSON):**
```json
{
  "email": "user@example.com",
  "consent": true,
  "consent_ts": "2026-05-15T10:30:00.000Z",
  "source": "immortal.life"
}
```

The UI uses **optimistic rendering** — success state shows immediately, the network request fires in the background. This is intentional for perceived performance.

**Also update `vercel.json`** — replace `YOUR_N8N_DOMAIN` in the CSP header with the actual n8n webhook domain once known.

---

## 8. GitHub setup

1. Create a new **private** repository named `immortal-life`
2. Push all files (no `.gitignore` exclusions needed — no secrets in these files)
3. The `WEBHOOK_URL` in `main.js` is a placeholder — add the real URL only after the backend is live, or use a Vercel environment variable (see below)

**Recommended: use a Vercel environment variable for the webhook URL**

In `main.js`, change:
```javascript
const WEBHOOK_URL = 'YOUR_N8N_WEBHOOK_URL';
```
To:
```javascript
const WEBHOOK_URL = '__WEBHOOK_URL__'; // replaced at build time
```
Then configure Vercel to inject it. This keeps the real URL out of the public repo.

---

## 9. Vercel setup

1. Import the GitHub repo in Vercel dashboard
2. Framework preset: **Other** (no framework)
3. Build command: *(leave empty)*
4. Output directory: *(leave empty or set to `.`)*
5. Root directory: *(leave as repo root)*
6. Assign custom domain: `immortal.life`
7. Vercel will handle SSL automatically

`vercel.json` is already configured with:
- Security headers (X-Frame-Options, CSP, etc.)
- Cache-Control for static assets
- Clean URLs (no `.html` extension in URLs)

**DNS:** Point immortal.life nameservers to Vercel, or add the A/CNAME records Vercel provides in the domain settings.

---

## 10. Pre-launch checklist

- [ ] Replace `YOUR_N8N_WEBHOOK_URL` in `main.js` (or use env var)
- [ ] Replace `YOUR_N8N_DOMAIN` in `vercel.json` CSP header
- [ ] Create `og-image.jpg` (1200×630px) — see `OG-IMAGE-NEEDED.txt`
- [ ] Update `privacy@immortal.life` and `hello@immortal.life` — ensure these inboxes exist
- [ ] Confirm DNS propagation after connecting domain in Vercel
- [ ] Test form submission end-to-end (email received, Supabase row created)
- [ ] Test privacy modal on desktop
- [ ] Test keyboard navigation (Tab through form, Escape closes modal)
- [ ] Run Lighthouse — target 95+ Performance, 100 Accessibility
- [ ] Verify no console errors in production build

---

## 11. What NOT to do

- Do not add jQuery, React, Vue, or any framework
- Do not add Google Analytics or any tracking script without updating the Privacy Policy and adding cookie consent
- Do not hardcode colour hex values — always use CSS variables
- Do not edit the privacy policy legal text without owner approval
- Do not add `console.log` statements to production code
- Do not commit real webhook URLs or secrets to the repository

---

## 12. Browser support target

| Browser | Minimum version |
|---------|----------------|
| Chrome | 90+ |
| Firefox | 88+ |
| Safari | 14+ |
| Edge | 90+ |

No IE support. No polyfills needed for the target audience.

---

## 13. Contact

**Project owner:** immortal.life  
**Design:** Finalised — do not change layout, typography, colours, or copy without approval  
**Legal text:** Do not modify privacy policy content  
**Questions:** hello@immortal.life
