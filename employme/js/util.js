/* EmployMe — utilities, local storage, geo helpers. Everything user-related stays on the device. */
(function (EM) {
  'use strict';
  const MAIL = 'matthewr@npigrp.com';
  const ERIE = { name: 'Erie, PA', lat: 42.1292, lon: -80.0851 };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // ---- storage (localStorage only, namespaced) ----
  const K = 'employme.';
  const store = {
    get(k, d) { try { const v = localStorage.getItem(K + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(K + k, JSON.stringify(v)); } catch (e) { toast('Could not save on this device (storage full or blocked).'); } },
    del(k) { try { localStorage.removeItem(K + k); } catch (e) {} },
    wipe() { try { Object.keys(localStorage).filter((x) => x.startsWith(K)).forEach((x) => localStorage.removeItem(x)); } catch (e) {} }
  };

  // ---- geo ----
  const toRad = (d) => d * Math.PI / 180;
  function miles(a, b, c, d) {
    const R = 3958.8, dLat = toRad(c - a), dLon = toRad(d - b);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }
  // free Nominatim geocoder (OpenStreetMap). One request per user action, per their usage policy.
  async function geocode(q) {
    const u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&addressdetails=1&q=' + encodeURIComponent(q);
    const r = await withTimeout(fetch(u, { headers: { 'Accept': 'application/json' } }), 8000);
    if (!r.ok) throw new Error('geocoder ' + r.status);
    const a = await r.json();
    if (!a.length) return null;
    const ad = a[0].address || {};
    const city = ad.city || ad.town || ad.village || ad.hamlet || ad.county || '';
    const st = ad.state || '';
    return { lat: +a[0].lat, lon: +a[0].lon, name: (city && st ? city + ', ' + stAbbr(st) : a[0].display_name.split(',').slice(0, 2).join(',').trim()) };
  }
  const ST = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC' };
  const stAbbr = (s) => ST[s] || s;
  function gps() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('GPS not available'));
      navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lon: p.coords.longitude }), (e) => rej(new Error(e.code === 1 ? 'Location permission was denied' : 'Could not get your location')), { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
    });
  }
  async function reverseName(lat, lon) {
    try {
      const r = await withTimeout(fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=' + lat + '&lon=' + lon), 8000);
      const j = await r.json(), ad = j.address || {};
      const city = ad.city || ad.town || ad.village || ad.county || '';
      return city ? city + ', ' + stAbbr(ad.state || '') : 'My location';
    } catch (e) { return 'My location'; }
  }

  // ---- pay / dates ----
  const HOURS = { hour: 1, day: 1 / 8, week: 1 / 40, month: 1 / 173.33, year: 1 / 2080 };
  const hourly = (n, unit) => (n == null || !unit ? null : n * (HOURS[unit] || 0));
  const money = (n) => '$' + (n % 1 ? n.toFixed(2) : n.toLocaleString('en-US'));
  function payLabel(j) {
    if (j.pay_min != null && j.pay_unit) {
      const u = { hour: '/hr', year: '/yr', week: '/wk', month: '/mo', day: '/day' }[j.pay_unit] || '';
      if (j.pay_max != null && j.pay_max !== j.pay_min) return money(j.pay_min) + '–' + money(j.pay_max) + u;
      return (j.pay_max == null ? 'From ' : '') + money(j.pay_min) + u;
    }
    return j.pay_text || 'Pay not listed';
  }
  const DAY = 86400000;
  function daysAgo(iso) { if (!iso) return null; const t = Date.parse(iso + 'T12:00:00'); return isNaN(t) ? null : Math.floor((Date.now() - t) / DAY); }
  function postedLabel(iso) {
    const d = daysAgo(iso);
    if (d == null) return 'Posting date not listed';
    if (d <= 0) return 'Posted today';
    if (d === 1) return 'Posted yesterday';
    if (d < 30) return 'Posted ' + d + ' days ago';
    return 'Posted ' + fmtDate(iso);
  }
  function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso + 'T12:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  const TYPE = { 'full-time': 'Full-time', 'part-time': 'Part-time', temp: 'Temp', 'temp-to-hire': 'Temp-to-hire', contract: 'Contract', 'direct-hire': 'Direct hire' };
  const SHIFT = { '1st': '1st shift', '2nd': '2nd shift', '3rd': '3rd shift', day: 'Day', evening: 'Evening', night: 'Night', weekend: 'Weekend', flexible: 'Flexible' };

  // ---- ui helpers ----
  let toastT;
  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms || 3200);
  }
  function openSheet(html, onMount) {
    const root = $('#sheetRoot');
    root.innerHTML = '<div class="scrim" data-close></div><section class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</section>';
    root.classList.add('open');
    root.onclick = (e) => { if (e.target.closest('[data-close]')) closeSheet(); };
    if (onMount) onMount($('.sheet', root));
    return $('.sheet', root);
  }
  function closeSheet() { const r = $('#sheetRoot'); r.classList.remove('open'); r.innerHTML = ''; }
  function mailto(to, subject, body) {
    return 'mailto:' + to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (x) {} ta.remove(); return ok;
    }
  }
  const uid = () => Math.random().toString(36).slice(2, 9);

  Object.assign(EM, { MAIL, ERIE, esc, $, $$, store, miles, geocode, gps, reverseName, withTimeout, hourly, payLabel, money, daysAgo, postedLabel, fmtDate, TYPE, SHIFT, toast, openSheet, closeSheet, mailto, download, copyText, uid, stAbbr });
})(window.EM = window.EM || {});
