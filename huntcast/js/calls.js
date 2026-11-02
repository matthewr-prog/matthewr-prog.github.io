/* HuntCast — Calls tab. Reads data/calls.json: species → call cards with real recordings (or "Recording coming soon"),
 * "Best time" / "Why" / how-to tip, and per-clip credits (also listed in Info). Audio is cached on first play (see sw.js)
 * and can be saved all at once with "Download all for offline". One clip plays at a time. Vanilla JS. */
(function (HC) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const okUrl = (u) => /^https?:\/\//i.test(String(u || ''));
  const AUDIO_CACHE = 'huntcast-audio-v1';
  const LS = 'huntcast.calls.sp';
  let data = null, failed = false, sp = null, playing = null, saved = {}, dl = null;
  const aud = typeof Audio !== 'undefined' ? new Audio() : null;
  if (aud) aud.preload = 'none';

  function mb(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB'; }
  function loopOn(id) { const el = document.querySelector('input.cl-loop[data-clip="' + id + '"]'); return !!(el && el.checked); }

  /* ----------------------------------------------------------- playback */
  function setBtns() {
    document.querySelectorAll('.cl-play').forEach((b) => {
      const on = b.dataset.clip === playing;
      b.classList.toggle('on', on);
      b.textContent = on ? '■ Stop' : '▶ Play';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function stop() {
    if (!aud) return;
    try { aud.pause(); } catch (e) { /* ignore */ }
    playing = null; setBtns();
  }
  function play(id) {
    const c = data && data.clips[id]; if (!c || !aud) return Promise.resolve(false);
    if (playing === id) { stop(); return Promise.resolve(false); }
    try { aud.pause(); } catch (e) { /* ignore */ }
    aud.src = c.file; aud.loop = loopOn(id); aud.currentTime = 0;
    playing = id; setBtns();
    const note = $('#clNote-' + id); if (note) note.textContent = '';
    const p = aud.play();
    return Promise.resolve(p).then(() => { setTimeout(() => confirmSaved(id), 800); return true; }).catch((err) => {
      if (playing === id) { playing = null; setBtns(); }
      if (note) note.textContent = navigator.onLine === false ? 'Offline and not saved yet. Play it once online, or use “Download all for offline”.' : 'Couldn’t play this clip' + (err && err.name === 'NotAllowedError' ? ' (tap Play again)' : '') + '.';
      return false;
    });
  }
  if (aud) {
    aud.addEventListener('ended', () => { if (!aud.loop) { playing = null; setBtns(); } });
    aud.addEventListener('error', () => { if (playing) { const id = playing, note = $('#clNote-' + id); playing = null; setBtns(); if (note) note.textContent = navigator.onLine === false ? 'Offline and not saved yet. Play it once online, or use “Download all for offline”.' : 'Couldn’t load this clip.'; } });
  }

  /* ----------------------------------------------------------- offline cache */
  function markSaved(id) {
    saved[id] = true;
    document.querySelectorAll('.cl-saved[data-clip="' + id + '"]').forEach((e) => { e.hidden = false; });
    updateDl();
  }
  function confirmSaved(id) {
    if (!window.caches || !data || !data.clips[id]) return;
    caches.open(AUDIO_CACHE).then((c) => c.match(data.clips[id].file)).then((r) => { if (r) markSaved(id); }).catch(() => {});
  }
  function refreshSaved() {
    if (!data || !window.caches) return Promise.resolve();
    return caches.open(AUDIO_CACHE).then((c) => Promise.all(Object.keys(data.clips).map((id) => c.match(data.clips[id].file).then((r) => { if (r) markSaved(id); })))).catch(() => {});
  }
  function updateDl() {
    const b = $('#clDl'), t = $('#clDlTxt'); if (!b || !data) return;
    const ids = Object.keys(data.clips), missing = ids.filter((i) => !saved[i]);
    const bytes = missing.reduce((n, i) => n + (data.clips[i].bytes || 0), 0);
    if (dl) return;
    if (!window.caches) { b.hidden = true; return; }
    if (!missing.length) { b.disabled = true; b.textContent = '✓ All ' + ids.length + ' clips saved for offline'; t.textContent = ''; return; }
    b.disabled = false; b.textContent = '⬇ Download all for offline (' + mb(bytes) + ')';
  }
  async function downloadAll() {
    if (!window.caches || !data || dl) return;
    const b = $('#clDl'), t = $('#clDlTxt'), ids = Object.keys(data.clips).filter((i) => !saved[i]);
    dl = true; b.disabled = true; let done = 0, fail = 0;
    try {
      const cache = await caches.open(AUDIO_CACHE);
      for (const id of ids) {
        b.textContent = 'Downloading… ' + done + ' / ' + ids.length;
        try {
          const r = await fetch(data.clips[id].file, { cache: 'reload' });
          if (!r.ok) throw new Error(r.status);
          if (!(await cache.match(data.clips[id].file))) await cache.put(data.clips[id].file, r.clone());
          markSaved(id); done++;
        } catch (e) { fail++; }
      }
    } catch (e) { fail = ids.length - done; }
    dl = null; updateDl();
    if (fail) { t.textContent = fail + ' clip' + (fail > 1 ? 's' : '') + ' didn’t download. Check your connection and tap again.'; if (HC.app && HC.app.toast) HC.app.toast('Some clips didn’t download'); }
    else { t.textContent = 'Done. These clips now play with no signal.'; if (HC.app && HC.app.toast) HC.app.toast('Calls saved for offline'); }
  }

  /* ----------------------------------------------------------- credits */
  function credit(c) {
    const lic = okUrl(c.license_url) ? '<a href="' + esc(c.license_url) + '" target="_blank" rel="noopener">' + esc(c.license) + '</a>' : esc(c.license);
    return '“' + esc(c.title) + '” by ' + esc(c.author) + ' · ' + lic + ' · <a href="' + esc(c.source_url) + '" target="_blank" rel="noopener">' + esc(c.source_name) + '</a>';
  }
  function creditsList(whichIds) {
    return '<ul class="cl-credits">' + whichIds.map((id) => {
      const c = data.clips[id];
      return '<li>' + credit(c) + '<br><span class="muted tiny">' + esc(c.modified || '') + (c.note ? ' ' + esc(c.note) : '') + '</span></li>';
    }).join('') + '</ul>';
  }
  function renderInfoCredits() {
    const el = $('#callsCredits'); if (!el) return;
    if (!data) { el.innerHTML = failed ? '<p class="muted tiny">Call recording credits load with the Calls tab.</p>' : ''; return; }
    el.innerHTML = '<p><b>Game-call recordings</b> (Calls tab). Only public-domain, CC0, CC BY and CC BY-SA recordings are used. Each is trimmed and volume-normalized by HuntCast.</p>' + creditsList(Object.keys(data.clips));
  }

  /* ----------------------------------------------------------- render */
  function srcLinks(ids) {
    return (ids || []).map((i) => data.sources[i]).filter(Boolean).map((s) => '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title) + '</a>').join(' · ');
  }
  function cardHtml(sp0, c) {
    const has = c.clips && c.clips.length;
    let h = '<article class="card cl-card' + (has ? '' : ' soon') + '"><div class="row-between"><h3>' + esc(c.name) + '</h3>' +
      (c.listenOnly ? '<span class="chip-s">Listen only</span>' : '') + (!has ? '<span class="chip-s cl-soon">Recording coming soon</span>' : '') + '</div>' +
      '<p class="cl-line"><b>Best time:</b> ' + esc(c.best) + '</p>' +
      '<p class="cl-line"><b>Why:</b> ' + esc(c.why) + '</p>' +
      '<p class="cl-line"><b>How:</b> ' + esc(c.tip) + '</p>';
    if (has) {
      h += c.clips.map((id) => {
        const k = data.clips[id];
        return '<div class="cl-clip"><div class="cl-row"><button type="button" class="btn small cl-play" data-clip="' + esc(id) + '" aria-pressed="false">▶ Play</button>' +
          '<span class="cl-lbl">' + esc(k.label) + ' <span class="cl-saved" data-clip="' + esc(id) + '"' + (saved[id] ? '' : ' hidden') + ' title="Saved for offline">✓</span></span>' +
          '<label class="cl-lp"><input type="checkbox" class="cl-loop" data-clip="' + esc(id) + '"> Loop</label></div>' +
          '<div class="muted tiny cl-attr">Audio: ' + credit(k) + '. ' + esc(k.modified || '') + (k.note ? ' ' + esc(k.note) : '') + '</div>' +
          '<div class="tiny cl-err" id="clNote-' + esc(id) + '" role="status"></div></div>';
      }).join('');
    }
    h += '<div class="muted tiny cl-src">Sources: ' + srcLinks(c.src) + '</div></article>';
    return h;
  }
  function render() {
    const body = $('#callsBody'), chips = $('#callsSp'); if (!body) return;
    if (failed && !data) { chips.hidden = true; body.innerHTML = '<div class="card muted">Couldn’t load the calls list (offline?). Connect once to load it; it’s saved for offline after that.</div>'; return; }
    if (!data) { body.innerHTML = '<div class="card center muted">Loading…</div>'; return; }
    if (!sp || !data.species.some((s) => s.id === sp)) sp = data.species[0].id;
    chips.hidden = false;
    chips.innerHTML = data.species.map((s) => '<button type="button" class="pill-btn' + (s.id === sp ? ' sel' : '') + '" data-sp="' + esc(s.id) + '">' + s.emoji + ' ' + esc(s.name) + '</button>').join('');
    const s = data.species.find((x) => x.id === sp), live = s.calls.filter((c) => c.clips && c.clips.length).length;
    stopQuiet();
    body.innerHTML = '<p class="muted tiny cl-count">' + live + ' of ' + s.calls.length + ' calls have a recording. The rest are marked “Recording coming soon”.</p>' + s.calls.map((c) => cardHtml(s, c)).join('');
  }
  function stopQuiet() { if (aud && playing) { try { aud.pause(); } catch (e) { /* ignore */ } playing = null; } }
  function renderLegal() {
    const el = $('#callsLegal'); if (!el || !data) return;
    const src = data.sources[data.legal.source];
    el.innerHTML = '<b>⚖️ ' + esc(data.legal.title) + '.</b> ' + esc(data.legal.text) + (src ? ' <a href="' + esc(src.url) + '" target="_blank" rel="noopener">' + esc(src.title) + '</a>' : '');
  }

  function load() {
    if (data || load.p) return load.p;
    load.p = fetch('data/calls.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((j) => {
      if (!j || !Array.isArray(j.species) || !j.clips) throw new Error('bad');
      data = j; failed = false;
    }).catch(() => { failed = true; load.p = null; }).then(() => { render(); renderLegal(); renderInfoCredits(); if (data) { refreshSaved().then(updateDl); updateDl(); } });
    return load.p;
  }
  function show() { render(); load(); }

  function bind() {
    const v = $('#view-calls'); if (!v) return;
    try { sp = localStorage.getItem(LS) || null; } catch (e) { /* ignore */ }
    v.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-sp]'); if (chip) { sp = chip.dataset.sp; try { localStorage.setItem(LS, sp); } catch (x) { /* ignore */ } render(); v.scrollTo && v.scrollTo(0, 0); setBtns(); return; }
      const pb = e.target.closest('.cl-play'); if (pb) { play(pb.dataset.clip); return; }
      if (e.target.closest('#clDl')) downloadAll();
    });
    v.addEventListener('change', (e) => { const l = e.target.closest('.cl-loop'); if (l && playing === l.dataset.clip && aud) aud.loop = l.checked; });
  }
  document.addEventListener('DOMContentLoaded', () => { bind(); renderInfoCredits(); load(); });
  HC.calls = { show, stop, load, play, get playing() { return playing; }, get audio() { return aud; } };
})(window.HC = window.HC || {});
