'use strict';

(function registerImmortalLifeFeed() {
  if (!window.customElements || window.customElements.get('immortal-life-feed')) return;
  class ImmortalLifeFeed extends HTMLElement {
    async connectedCallback() {
      const root = this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = ':host{display:block;background:#0b0b09;color:#ede9e0;border:1px solid #2a2822;padding:20px;font:14px/1.5 system-ui,sans-serif}h2{font:28px Georgia,serif;margin:0 0 14px}ol{list-style:none;padding:0;margin:0}li{border-top:1px solid #2a2822;padding:12px 0}a{color:inherit;text-decoration:none}a:hover{color:#b8955a}.meta,p{color:#929082;font-size:11px;margin:4px 0 0}.brand{display:block;color:#b8955a;margin-top:14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase}';
      root.append(style);
      const heading = document.createElement('h2'); heading.textContent = this.getAttribute('heading') || 'Latest longevity intelligence'; root.append(heading);
      const list = document.createElement('ol'); root.append(list);
      try {
        const response = await fetch('https://immortal.life/feed.json');
        if (!response.ok) throw new Error('feed unavailable');
        const feed = await response.json();
        const limit = Math.min(Math.max(Number(this.getAttribute('limit')) || 5, 1), 10);
        (feed.items || []).slice(0, limit).forEach((item) => {
          const row = document.createElement('li');
          const anchor = document.createElement('a'); anchor.href = item.url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.textContent = item.title;
          const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = item.date_published ? new Date(item.date_published).toLocaleDateString() : 'Current record';
          row.append(anchor, meta); list.append(row);
        });
      } catch (_) {
        const note = document.createElement('p'); note.textContent = 'The live feed is temporarily unavailable.'; root.append(note);
      }
      const brand = document.createElement('a'); brand.className = 'brand'; brand.href = 'https://immortal.life'; brand.target = '_blank'; brand.rel = 'noopener noreferrer'; brand.textContent = 'Powered by immortal.life · automated, source-linked'; root.append(brand);
    }
  }
  window.customElements.define('immortal-life-feed', ImmortalLifeFeed);
})();
