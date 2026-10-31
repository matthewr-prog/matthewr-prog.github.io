/* HuntCast — sponsor ad bar (top of every tab).
 * Reads data/ads.json: an array of
 *   { "image": "img/ads/shop.png", "link": "https://example.com", "alt": "Shop name — tagline",
 *     "start": "2026-11-01", "end": "2026-12-31" }          (start/end optional, inclusive, YYYY-MM-DD, device date)
 * Several active ads rotate. With none active, shows the "Your ad here" line with a mailto link. */
(function (HC) {
  'use strict';
  const EMAIL = 'matthewr@npigrp.com';
  const bar = () => document.getElementById('adbar');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => /^(https?:\/\/|\.?\/?[\w\-./%]+$)/i.test(String(u || '')) && !/^\s*javascript:/i.test(u) ? u : '';
  const safeLink = (u) => (/^https?:\/\//i.test(String(u || '')) ? u : '');
  function today() {
    const q = new URLSearchParams(location.search).get('today');
    if (/^\d{4}-\d{2}-\d{2}$/.test(q || '')) return q;
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function active(list) {
    const t = today();
    return (Array.isArray(list) ? list : []).filter((a) => a && safeUrl(a.image) && safeLink(a.link) && (!a.start || a.start <= t) && (!a.end || a.end >= t));
  }
  function placeholder() {
    bar().className = 'adbar adbar-empty';
    bar().innerHTML = '<span class="ad-text">Your ad here — <a href="mailto:' + EMAIL + '?subject=HuntCast%20advertising">Become a partner</a></span>';
  }
  let timer = null;
  function show(ads) {
    clearInterval(timer);
    if (!ads.length) return placeholder();
    let i = 0;
    const draw = () => {
      const a = ads[i % ads.length];
      bar().className = 'adbar adbar-live';
      bar().innerHTML = '<span class="ad-tag">Sponsored</span><a class="ad-link" href="' + esc(safeLink(a.link)) + '" target="_blank" rel="noopener sponsored"><img src="' + esc(safeUrl(a.image)) + '" alt="' + esc(a.alt || 'Sponsor') + '" loading="lazy"></a>';
      i++;
    };
    draw();
    if (ads.length > 1) timer = setInterval(draw, 7000);
  }
  function load() {
    placeholder(); // visible immediately, also if the data file is missing/offline
    fetch('data/ads.json').then((r) => (r.ok ? r.json() : [])).then((j) => show(active(j))).catch(() => placeholder());
  }
  HC.ads = { load, active };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})(window.HC = window.HC || {});
