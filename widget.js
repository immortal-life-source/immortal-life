'use strict';

(function registerImmortalLifeFeed() {
  if (!window.customElements || window.customElements.get('immortal-life-feed')) return;

  function recordDate(record, kind) {
    return kind === 'research' ? record.published_on : kind === 'trials' ? record.last_update_date : kind === 'regulatory' ? record.published_at : record.announced_on || record.detected_at;
  }

  class ImmortalLifeFeed extends HTMLElement {
    async connectedCallback() {
      var root = this.attachShadow({ mode: 'open' });
      var style = document.createElement('style');
      style.textContent = ':host{display:block;background:#0b0b09;color:#ede9e0;border:1px solid #2a2822;padding:20px;font:14px/1.5 system-ui,sans-serif}h2{font:28px Georgia,serif;margin:0 0 6px}.scope{color:#b8955a;font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 14px}ol{list-style:none;padding:0;margin:0}li{border-top:1px solid #2a2822;padding:12px 0}a{color:inherit;text-decoration:none}a:hover{color:#b8955a}.meta,p{color:#929082;font-size:11px;margin:4px 0 0}.brand{display:block;color:#b8955a;margin-top:14px;font-size:10px;letter-spacing:.12em;text-transform:uppercase}';
      root.append(style);
      var heading = document.createElement('h2'); heading.textContent = this.getAttribute('heading') || 'Latest longevity intelligence'; root.append(heading);
      var topic = String(this.getAttribute('topic') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
      var kind = String(this.getAttribute('kind') || '').toLowerCase();
      if (!['research', 'trials', 'regulatory', 'integrity'].includes(kind)) kind = '';
      var country = String(this.getAttribute('country') || '').trim();
      if (topic || kind || country) {
        var scope = document.createElement('p'); scope.className = 'scope'; scope.textContent = [topic && topic.replace(/-/g, ' '), kind, country].filter(Boolean).join(' · '); root.append(scope);
      }
      var list = document.createElement('ol'); root.append(list);
      try {
        var endpoint = topic ? 'https://www.immortal.life/feeds/topics/' + encodeURIComponent(topic) + '.json' : kind ? 'https://www.immortal.life/datasets/' + encodeURIComponent(kind) + '.json' : 'https://www.immortal.life/feed.json';
        var response = await fetch(endpoint);
        if (!response.ok) throw new Error('feed unavailable');
        var payload = await response.json();
        var rows = [];
        if (Array.isArray(payload.items)) rows = payload.items.map(function (item) { return { title: item.title, url: item.url, date: item.date_published }; });
        else rows = (payload.records || []).filter(function (record) { return !country || (record.countries || []).some(function (value) { return String(value).toLowerCase() === country.toLowerCase(); }); }).map(function (record) { return { title: record.title, url: 'https://www.immortal.life/' + kind + '/' + record.id, date: recordDate(record, kind), meta: kind === 'trials' ? record.overall_status : kind === 'regulatory' ? record.jurisdiction : record.event_type }; });
        var limit = Math.min(Math.max(Number(this.getAttribute('limit')) || 5, 1), 10);
        rows.slice(0, limit).forEach(function (item) {
          var row = document.createElement('li');
          var anchor = document.createElement('a'); anchor.href = item.url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.textContent = item.title;
          var meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = [item.meta, item.date ? new Date(item.date).toLocaleDateString() : 'Current record'].filter(Boolean).join(' · ');
          row.append(anchor, meta); list.append(row);
        });
        if (!rows.length) { var empty = document.createElement('p'); empty.textContent = 'No eligible records match this view yet.'; root.append(empty); }
      } catch (_) {
        var note = document.createElement('p'); note.textContent = 'The live feed is temporarily unavailable.'; root.append(note);
      }
      var brand = document.createElement('a'); brand.className = 'brand'; brand.href = 'https://www.immortal.life'; brand.target = '_blank'; brand.rel = 'noopener noreferrer'; brand.textContent = 'Powered by immortal.life · automated, source-linked'; root.append(brand);
    }
  }
  window.customElements.define('immortal-life-feed', ImmortalLifeFeed);
})();
