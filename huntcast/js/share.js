/* HuntCast — location ping + sharing. Native share sheet with clipboard / SMS / email fallbacks,
   a fresh high-accuracy GPS fix, and parsing of incoming ?spot=LAT,LON&name=… deep links. Vanilla JS. */
(function (HC) {
  'use strict';
  const APP_URL = 'https://matthewr-prog.github.io/huntcast/';
  const MAPS = 'https://www.google.com/maps/search/?api=1&query=';
  const $$ = (s, r) => (r || document).querySelector(s);

  /* ------------------------------------------------------------ pure helpers */
  const f5 = (n) => (+n).toFixed(5);
  function cleanName(n, fallback) {
    n = String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    return n || fallback || '';
  }
  const mapsLink = (lat, lon) => MAPS + f5(lat) + ',' + f5(lon);
  const deepLink = (lat, lon, name) => APP_URL + '?spot=' + f5(lat) + ',' + f5(lon) + (name ? '&name=' + encodeURIComponent(name) : '');
  function clock(t) { return new Date(t || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  /* p: { kind:'ping'|'spot', name, lat, lon, acc, time } -> { title, text, url, body } */
  function message(p) {
    const c = f5(p.lat) + ', ' + f5(p.lon), dl = deepLink(p.lat, p.lon, p.kind === 'spot' ? p.name : 'My location'), url = mapsLink(p.lat, p.lon);
    let title, line;
    if (p.kind === 'ping') {
      title = 'My location (HuntCast)';
      line = 'My location (HuntCast) — ' + c + (p.acc != null ? ' ± ' + Math.round(p.acc) + ' m' : '') + ', ' + clock(p.time);
    } else {
      title = 'HuntCast spot: ' + p.name;
      line = 'HuntCast spot “' + p.name + '” — ' + c;
    }
    const text = line + '\nOpen in HuntCast: ' + dl;
    return { title: title, text: text, url: url, body: text + '\n' + url };
  }
  /* "?spot=41.6,-79.8&name=Foo" -> { lat, lon, name } or null when missing/invalid */
  function parseSpotParam(search) {
    let q; try { q = new URLSearchParams(search || ''); } catch (e) { return null; }
    const raw = q.get('spot'); if (!raw) return null;
    const m = /^\s*([+-]?\d{1,3}(?:\.\d+)?)\s*,\s*([+-]?\d{1,3}(?:\.\d+)?)\s*$/.exec(raw); if (!m) return null;
    const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
    if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat: lat, lon: lon, name: cleanName(q.get('name'), 'Shared spot') };
  }

  /* ------------------------------------------------------------ GPS */
  /* Fresh high-accuracy fix: watches up to ~9 s, keeps the best reading, stops early at <= 15 m. */
  function freshFix(ok, fail) {
    if (!navigator.geolocation) { fail({ code: 2 }); return function () {}; }
    let best = null, done = false, wid = null, t1 = null, t2 = null;
    const finish = () => { if (done) return; done = true; clearTimeout(t1); clearTimeout(t2); if (wid != null) navigator.geolocation.clearWatch(wid); best ? ok(best) : fail({ code: 3 }); };
    wid = navigator.geolocation.watchPosition((p) => {
      if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
      if (p.coords.accuracy <= 15) finish();
    }, (e) => { if (done) return; if (!best) { done = true; clearTimeout(t1); clearTimeout(t2); navigator.geolocation.clearWatch(wid); fail(e); } },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    t1 = setTimeout(() => { if (best) finish(); }, 9000);   // good enough
    t2 = setTimeout(finish, 20000);                          // give up
    return function cancel() { done = true; clearTimeout(t1); clearTimeout(t2); if (wid != null) navigator.geolocation.clearWatch(wid); };
  }

  /* ------------------------------------------------------------ clipboard / panel */
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    try { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return !!ok; } catch (e) { return false; }
  }
  let panel = null, cancelFix = null;
  function toast(m, ms) { if (HC.app && HC.app.toast) HC.app.toast(m, ms); }
  function closePanel() { if (cancelFix) { cancelFix(); cancelFix = null; } if (panel) { panel.remove(); panel = null; } }

  /* opts: { onSave(name, lat, lon) } ; p may be null while waiting for a fix */
  function openPanel(p, opts, state) {
    closePanel(); opts = opts || {};
    panel = document.createElement('div'); panel.className = 'sh-back'; panel.id = 'sharePanel';
    const box = document.createElement('div'); box.className = 'sh-box'; box.setAttribute('role', 'dialog'); panel.appendChild(box);
    const h = document.createElement('h3'); box.appendChild(h);
    const info = document.createElement('div'); info.className = 'sh-info'; box.appendChild(info);
    const mk = (cls, label, fn) => { const b = document.createElement('button'); b.className = cls; b.textContent = label; b.onclick = fn; return b; };
    if (!p) { // waiting for GPS
      h.textContent = '📍 Getting a fresh GPS fix…'; info.textContent = state && state.err ? state.err : 'Hold still with a clear view of the sky for a few seconds.';
      box.appendChild(mk('btn small', 'Cancel', closePanel));
      if (state && state.err) box.appendChild(mk('btn', 'Try again', () => ping(opts)));
    } else {
      const m = message(p);
      h.textContent = p.kind === 'ping' ? '📍 My location' : '📤 Share spot';
      const nm = document.createElement('b'); nm.textContent = p.kind === 'spot' ? p.name : f5(p.lat) + ', ' + f5(p.lon); info.appendChild(nm);
      const sub = document.createElement('div'); sub.className = 'muted tiny';
      sub.textContent = p.kind === 'spot' ? f5(p.lat) + ', ' + f5(p.lon) : (p.acc != null ? '± ' + Math.round(p.acc) + ' m · ' : '') + clock(p.time); info.appendChild(sub);
      box.appendChild(mk('btn sh-main', '📤 Share…', () => nativeShare(p)));
      const row = document.createElement('div'); row.className = 'sh-row'; box.appendChild(row);
      row.appendChild(mk('btn small', '📋 Copy', () => copy(m.body).then((ok) => toast(ok ? 'Copied to clipboard' : 'Could not copy — long-press the text instead'))));
      const sms = document.createElement('a'); sms.className = 'btn small'; sms.textContent = '💬 SMS'; sms.href = 'sms:?body=' + encodeURIComponent(m.body); row.appendChild(sms);
      const em = document.createElement('a'); em.className = 'btn small'; em.textContent = '✉️ Email'; em.href = 'mailto:?subject=' + encodeURIComponent(m.title) + '&body=' + encodeURIComponent(m.body); row.appendChild(em);
      if (p.kind === 'ping' && opts.onSave) {
        const sv = document.createElement('div'); sv.className = 'sh-save';
        const inp = document.createElement('input'); inp.type = 'text'; inp.maxLength = 60; inp.placeholder = 'Spot name'; inp.value = 'Ping ' + clock(p.time); inp.setAttribute('aria-label', 'Spot name');
        sv.appendChild(inp);
        sv.appendChild(mk('btn small', '★ Save as spot', () => { opts.onSave(cleanName(inp.value, 'Ping ' + clock(p.time)), p.lat, p.lon); closePanel(); }));
        box.appendChild(sv);
      }
      const pre = document.createElement('pre'); pre.className = 'sh-pre'; pre.textContent = m.body; box.appendChild(pre);
      box.appendChild(mk('btn small sh-close', 'Close', closePanel));
      if (state && state.note) { const n = document.createElement('div'); n.className = 'muted tiny'; n.textContent = state.note; box.insertBefore(n, pre); }
    }
    panel.addEventListener('click', (e) => { if (e.target === panel) closePanel(); });
    document.body.appendChild(panel);
  }

  /* ------------------------------------------------------------ share */
  /* Native share sheet; falls back to clipboard (+ SMS/email options). Resolves to 'shared' | 'cancelled' | 'fallback'. */
  function nativeShare(p, opts) {
    const m = message(p);
    if (navigator.share) {
      return navigator.share({ title: m.title, text: m.text, url: m.url }).then(() => 'shared', (e) => {
        if (e && e.name === 'AbortError') return 'cancelled';
        return fallback(p, opts, 'Sharing was blocked — use Copy, SMS or Email.');
      });
    }
    return Promise.resolve(fallback(p, opts, 'Your browser has no share sheet — use Copy, SMS or Email.'));
  }
  function fallback(p, opts, why) {
    const m = message(p);
    copy(m.body).then((ok) => toast(ok ? 'Location copied — paste it into a message' : why, 3500));
    openPanel(p, opts, { note: why });
    return 'fallback';
  }
  /* Share a saved spot / pin: native sheet straight away (it's a tap), panel only if that fails. */
  function shareSpot(name, lat, lon, opts) {
    return nativeShare({ kind: 'spot', name: cleanName(name, 'Hunting spot'), lat: +lat, lon: +lon }, opts);
  }
  /* Ping: fresh fix, then show the share panel and (if the tap is still "fresh") pop the native sheet automatically. */
  function ping(opts) {
    opts = opts || {};
    if (!navigator.geolocation) { toast('GPS is not available in this browser.'); return; }
    openPanel(null, opts);
    cancelFix = freshFix((pos) => {
      cancelFix = null;
      const p = { kind: 'ping', name: 'My location', lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, time: Date.now() };
      openPanel(p, opts);
      if (navigator.share && (!navigator.userActivation || navigator.userActivation.isActive)) nativeShare(p, opts);
    }, (e) => {
      cancelFix = null;
      openPanel(null, opts, { err: e && e.code === 1 ? 'Location permission denied — allow it in browser/site settings.' : e && e.code === 3 ? 'GPS timed out — try again outdoors.' : 'Could not get your location.' });
    });
  }

  HC.Share = { message: message, mapsLink: mapsLink, deepLink: deepLink, parseSpotParam: parseSpotParam, cleanName: cleanName, freshFix: freshFix, ping: ping, shareSpot: shareSpot, openPanel: openPanel, closePanel: closePanel, copy: copy };
})(window.HC = window.HC || {});
