/* EmployMe — screens. All user data lives in localStorage on the device. */
(function (EM) {
  'use strict';
  const { esc, $, $$, store, payLabel, postedLabel, fmtDate, TYPE, SHIFT, toast, openSheet, closeSheet, mailto, MAIL, ERIE } = EM;
  const S = EM.state = { jobs: [], loaded: false, error: null, filters: null, where: null, scrollJobs: 0 };

  S.filters = Object.assign(EM.search.DEFAULT_FILTERS(), store.get('filters', {}));
  S.where = store.get('where', null) || { name: ERIE.name, lat: ERIE.lat, lon: ERIE.lon };

  const jobById = (id) => S.jobs.find((j) => j.id === id);
  const profile = () => Object.assign({ name: '', email: '', phone: '', city: '', summary: '', experience: [], education: '', skills: '', availability: { start: '', shifts: [], notes: '' } }, store.get('profile', {}));
  const skillList = (p) => String(p.skills || '').split(/[,\n;]/).map((s) => s.trim()).filter(Boolean);
  const saved = () => store.get('saved', {});
  const applied = () => store.get('applied', {});
  const searches = () => store.get('searches', []);
  const phoneOf = (j) => { const m = String(j.contact || '').match(/\(?\d{3}\)?[-.\s]\d{3}[-.]\d{4}/); return m ? m[0] : null; };
  const chip = (label, on, attr) => '<button type="button" class="chip' + (on ? ' on' : '') + '" aria-pressed="' + !!on + '" ' + attr + '>' + esc(label) + '</button>';
  const NOBOOST = 'No paid boosts — results are ranked only by your search.';

  // ---------- helpers ----------
  function runSearch(f, where) { return EM.search.run(S.jobs, f || S.filters, where === undefined ? S.where : where, skillList(profile())); }
  function newCount(s) { const ids = runSearch(s.filters, s.where).map((r) => r.job.id); return ids.filter((id) => !(s.seen || []).includes(id)).length; }
  function refreshBadge() {
    const n = searches().reduce((a, s) => a + newCount(s), 0), b = $('#savedBadge');
    b.hidden = !n; b.textContent = n > 9 ? '9+' : n;
  }
  function profileText(p, job) {
    const L = [];
    if (job) L.push('Hello,', '', 'I am interested in the ' + job.title + ' position' + (job.employer ? ' with ' + job.employer : '') + (job.location ? ' (' + job.location + ')' : '') + '. My profile is below.', '');
    L.push((p.name || '(your name)'));
    const c = [p.email, p.phone, p.city].filter(Boolean).join(' | '); if (c) L.push(c);
    if (p.summary) L.push('', 'SUMMARY', p.summary);
    if (p.experience.length) { L.push('', 'EXPERIENCE'); p.experience.forEach((x) => { L.push([x.title, x.company].filter(Boolean).join(' - ') + (x.dates ? ' (' + x.dates + ')' : '')); if (x.details) L.push(x.details); }); }
    if (p.education) L.push('', 'EDUCATION / CERTIFICATIONS', p.education);
    if (p.skills) L.push('', 'SKILLS', skillList(p).join(', '));
    const a = p.availability || {};
    const av = [a.start && 'Available to start: ' + a.start, (a.shifts || []).length && 'Shifts: ' + a.shifts.join(', '), a.notes].filter(Boolean);
    if (av.length) L.push('', 'AVAILABILITY', ...av);
    if (job) L.push('', 'Sent from EmployMe (free job board). Thank you for your time.');
    return L.join('\n');
  }
  function jobCard(r, opts) {
    const j = r.job, sv = !!saved()[j.id], ap = !!applied()[j.id];
    const tags = [TYPE[j.type], j.hours && j.hours !== j.type ? TYPE[j.hours] : null, SHIFT[j.shift], j.remote ? 'Remote' : null].filter(Boolean);
    return '<article class="job" data-open="' + esc(j.id) + '" tabindex="0" role="link" aria-label="' + esc(j.title) + '">' +
      '<div class="job-top"><h3>' + esc(j.title) + '</h3><button class="star' + (sv ? ' on' : '') + '" data-save="' + esc(j.id) + '" aria-label="' + (sv ? 'Unsave' : 'Save') + ' job" aria-pressed="' + sv + '">' + (sv ? '★' : '☆') + '</button></div>' +
      '<div class="emp">' + esc(j.employer) + (j.verified ? ' <span class="vbadge" title="Verified by EmployMe">✔ Verified</span>' : '') + '</div>' +
      '<div class="meta">📍 ' + esc(j.location) + (r.dist != null ? ' · ' + miLbl(r.dist) : '') + '</div>' +
      '<div class="pay">' + esc(payLabel(j)) + '</div>' +
      '<div class="tags">' + tags.map((t) => '<span class="tag">' + esc(t) + '</span>').join('') + (r.why && r.why.length ? '<span class="tag match">★ ' + esc(r.why[0]) + '</span>' : '') + (ap ? '<span class="tag done">Applied</span>' : '') + '</div>' +
      '<div class="foot">' + esc(postedLabel(j.posted)) + '</div></article>';
  }

  // ======================= JOBS =======================
  function viewJobs(root) {
    const f = S.filters;
    root.innerHTML =
      '<div class="searchbar"><form id="sForm" role="search"><div class="inwrap"><span aria-hidden="true">🔍</span><input id="q" type="search" enterkeyhint="search" placeholder="Job title or keyword" autocomplete="off" value="' + esc(f.q) + '" aria-label="Job title or keyword"></div></form>' +
      '<div class="row"><button class="pill" id="locBtn">📍 <span id="locTxt"></span></button><button class="pill" id="filtBtn">⚙ Filters<span id="filtN"></span></button><select id="sortSel" aria-label="Sort by"><option value="best">Best match</option><option value="newest">Newest</option><option value="pay">Highest pay</option><option value="distance">Nearest</option></select></div></div>' +
      '<div id="hint"></div><div id="jobList" aria-live="polite"></div>';
    $('#sortSel').value = f.sort;
    const upd = () => {
      $('#locTxt').textContent = S.where.name + (f.radius === 'any' ? ' · any distance' : ' · ' + f.radius + ' mi');
      const n = EM.search.activeCount(f); $('#filtN').textContent = n ? ' (' + n + ')' : '';
      drawResults();
    };
    function drawResults() {
      store.set('filters', f);
      const el = $('#jobList');
      if (!S.loaded) { el.innerHTML = S.error ? '<div class="empty"><div class="big">📡</div><h3>Couldn’t load jobs</h3><p>' + esc(S.error) + '</p><button class="btn" id="retry">Try again</button></div>' : '<div class="empty muted">Loading jobs…</div>'; const r = $('#retry'); if (r) r.onclick = () => EM.loadJobs(); return; }
      const live = S.jobs.filter(EM.search.isLive);
      if (!live.length) {
        el.innerHTML = '<div class="empty"><div class="big">🧭</div><h3>New Erie jobs coming soon</h3><p>Employers: post free during beta. Job seekers: build your free profile now so you’re ready to apply the moment jobs go live.</p><div class="btnrow"><a class="btn" href="#/post">Post a job (free)</a><a class="btn ghost" href="#/profile">Build my profile</a></div><p class="tiny muted">' + NOBOOST + '</p></div>';
        $('#hint').innerHTML = ''; return;
      }
      const res = runSearch();
      $('#hint').innerHTML = '<div class="resline"><b>' + res.length + '</b> job' + (res.length === 1 ? '' : 's') + ' · ' + esc(EM.search.describeFilters(f, S.where)) + '</div><div class="noboost">✔ ' + NOBOOST + '</div>' +
        '<div class="row-actions"><button class="link" id="saveSearch">🔔 Save this search</button>' + (EM.search.activeCount(f) || f.q ? '<button class="link" id="clearF">Clear filters</button>' : '') + '</div>';
      $('#saveSearch').onclick = saveSearchNow; const cf = $('#clearF'); if (cf) cf.onclick = () => { Object.assign(f, EM.search.DEFAULT_FILTERS(), { sort: f.sort }); $('#q').value = ''; upd(); };
      el.innerHTML = res.length ? res.map((r) => jobCard(r)).join('') + '<p class="tiny muted center pad">Listings are posted by employers. Never pay to apply. <a href="#/safety">Scam tips</a></p>' :
        '<div class="empty"><div class="big">🔎</div><h3>No jobs match</h3><p>Try a bigger radius, fewer filters, or different keywords.</p><button class="btn" id="widen">Widen search</button></div>';
      const w = $('#widen'); if (w) w.onclick = () => { f.radius = 'any'; f.minPay = ''; f.posted = 'any'; f.types = []; f.shifts = []; f.remote = false; upd(); };
    }
    function saveSearchNow() {
      const list = searches();
      const entry = { id: EM.uid(), name: EM.search.describeFilters(f, S.where), filters: JSON.parse(JSON.stringify(f)), where: Object.assign({}, S.where), seen: runSearch().map((r) => r.job.id), at: Date.now() };
      if (list.some((s) => s.name === entry.name)) { toast('You already saved this search.'); return; }
      list.push(entry); store.set('searches', list); toast('Search saved. You’ll see a badge on Saved when new matches appear.'); refreshBadge();
    }
    $('#sForm').onsubmit = (e) => { e.preventDefault(); f.q = $('#q').value.trim(); $('#q').blur(); upd(); };
    $('#q').oninput = () => { f.q = $('#q').value.trim(); drawResults(); };
    $('#sortSel').onchange = (e) => { f.sort = e.target.value; drawResults(); };
    $('#locBtn').onclick = () => locationSheet(upd);
    $('#filtBtn').onclick = () => filterSheet(upd);
    $('#jobList').addEventListener('click', listClicks);
    $('#jobList').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.open) location.hash = '#/job/' + encodeURIComponent(e.target.dataset.open); });
    upd();
    root.scrollTop = S.scrollJobs || 0;
    installHint(root);
  }
  function listClicks(e) {
    const sv = e.target.closest('[data-save]');
    if (sv) { e.stopPropagation(); toggleSave(sv.dataset.save); const on = !!saved()[sv.dataset.save]; sv.classList.toggle('on', on); sv.textContent = on ? '★' : '☆'; sv.setAttribute('aria-pressed', on); return; }
    const c = e.target.closest('[data-open]');
    if (c) { S.scrollJobs = $('#view').scrollTop; location.hash = '#/job/' + encodeURIComponent(c.dataset.open); }
  }
  function toggleSave(id) {
    const s = saved(), j = jobById(id);
    if (s[id]) { delete s[id]; toast('Removed from Saved'); } else { s[id] = { title: j ? j.title : id, employer: j ? j.employer : '', at: Date.now() }; toast('Saved ✔'); }
    store.set('saved', s);
  }
  function locationSheet(done) {
    const f = S.filters;
    openSheet('<h2>Location</h2><label class="lbl">City, ZIP or address</label><div class="inrow"><input id="locIn" type="text" placeholder="Erie, PA" value="' + esc(S.where.name) + '"><button class="btn" id="locGo">Set</button></div>' +
      '<button class="btn ghost" id="locGps">📡 Use my GPS</button><label class="lbl">Distance</label><div class="chips" id="radChips">' +
      [10, 25, 50, 100, 'any'].map((r) => chip(r === 'any' ? 'Any' : r + ' mi', f.radius === r, 'data-r="' + r + '"')).join('') + '</div>' +
      '<p class="tiny muted">Lookups use the free OpenStreetMap Nominatim service; your location is used only for this search and is saved on this phone.</p><div id="locMsg" class="tiny"></div>',
      (sh) => {
        const msg = (t, bad) => { $('#locMsg', sh).textContent = t; $('#locMsg', sh).className = 'tiny' + (bad ? ' bad' : ''); };
        $$('#radChips .chip', sh).forEach((b) => b.onclick = () => { f.radius = b.dataset.r === 'any' ? 'any' : +b.dataset.r; $$('#radChips .chip', sh).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); done(); });
        $('#locGo', sh).onclick = async () => {
          const q = $('#locIn', sh).value.trim(); if (!q) return;
          msg('Looking up…');
          try { const g = await EM.geocode(q); if (!g) return msg('Couldn’t find that place. Try “City, ST” or a ZIP.', true); S.where = { name: g.name, lat: g.lat, lon: g.lon }; store.set('where', S.where); done(); closeSheet(); }
          catch (e) { msg('Lookup failed (' + e.message + '). Check your connection.', true); }
        };
        $('#locIn', sh).onkeydown = (e) => { if (e.key === 'Enter') $('#locGo', sh).click(); };
        $('#locGps', sh).onclick = async () => {
          msg('Getting your location…');
          try { const p = await EM.gps(); const name = await EM.reverseName(p.lat, p.lon); S.where = { name, lat: p.lat, lon: p.lon }; store.set('where', S.where); done(); closeSheet(); }
          catch (e) { msg(e.message + '. You can type a city or ZIP instead.', true); }
        };
      });
  }
  function filterSheet(done) {
    const f = S.filters;
    const types = ['full-time', 'part-time', 'temp', 'temp-to-hire', 'contract'], shifts = ['1st', '2nd', '3rd', 'day', 'evening', 'night', 'weekend'];
    openSheet('<h2>Filters</h2><label class="lbl">Job type</label><div class="chips" id="fT">' + types.map((t) => chip(TYPE[t], f.types.includes(t), 'data-v="' + t + '"')).join('') + '</div>' +
      '<label class="lbl">Shift</label><div class="chips" id="fS">' + shifts.map((t) => chip(SHIFT[t], f.shifts.includes(t), 'data-v="' + t + '"')).join('') + '</div>' +
      '<div class="grid2"><div><label class="lbl" for="fPay">Minimum pay</label><select id="fPay"><option value="">Any</option>' + [12, 15, 18, 20, 25, 30, 40].map((n) => '<option value="' + n + '">$' + n + '+/hr</option>').join('') + '</select></div>' +
      '<div><label class="lbl" for="fPost">Posted</label><select id="fPost"><option value="any">Any time</option><option value="1">Last 24 hours</option><option value="3">Last 3 days</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></div></div>' +
      '<label class="check"><input type="checkbox" id="fRem"> Remote jobs only</label><p class="tiny muted">Pay filter uses hourly pay (salaries are converted). Jobs that don’t list pay are hidden while a pay filter is on.</p>' +
      '<div class="btnrow"><button class="btn" id="fOk">Show jobs</button><button class="btn ghost" id="fReset">Reset</button></div>',
      (sh) => {
        $('#fPay', sh).value = f.minPay; $('#fPost', sh).value = f.posted; $('#fRem', sh).checked = f.remote;
        const tog = (id, arr) => $$('#' + id + ' .chip', sh).forEach((b) => b.onclick = () => { const v = b.dataset.v, i = arr.indexOf(v); i < 0 ? arr.push(v) : arr.splice(i, 1); b.classList.toggle('on', i < 0); b.setAttribute('aria-pressed', i < 0); });
        tog('fT', f.types); tog('fS', f.shifts);
        $('#fOk', sh).onclick = () => { f.minPay = $('#fPay', sh).value; f.posted = $('#fPost', sh).value; f.remote = $('#fRem', sh).checked; done(); closeSheet(); };
        $('#fReset', sh).onclick = () => { Object.assign(f, EM.search.DEFAULT_FILTERS(), { q: f.q, sort: f.sort }); done(); closeSheet(); };
      });
  }
  function installHint(root) {
    if (store.get('installDismissed') || window.matchMedia('(display-mode: standalone)').matches) return;
    const b = document.createElement('div'); b.className = 'install-hint';
    b.innerHTML = '<span>📲 Add EmployMe to your home screen: Chrome ⋮ menu → <b>Install app</b> / <b>Add to Home screen</b>.</span><button class="x" aria-label="Dismiss">✕</button>';
    root.insertBefore(b, root.firstChild); $('.x', b).onclick = () => { store.set('installDismissed', 1); b.remove(); };
  }

  // ======================= JOB DETAIL =======================
  function jsonLd(j) {
    const m = String(j.location || '').match(/^(.*?),\s*([A-Za-z]{2})\b/);
    const emp = { 'full-time': 'FULL_TIME', 'part-time': 'PART_TIME', temp: 'TEMPORARY', 'temp-to-hire': 'TEMPORARY', contract: 'CONTRACTOR', 'direct-hire': 'FULL_TIME' }[j.type];
    const ld = { '@context': 'https://schema.org/', '@type': 'JobPosting', title: j.title,
      description: '<p>' + esc(j.description || '').replace(/\n+/g, '</p><p>') + '</p>' + (j.requirements && j.requirements.length ? '<ul>' + j.requirements.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ul>' : ''),
      datePosted: j.posted || undefined, validThrough: j.expires ? j.expires + 'T23:59:59' : undefined,
      employmentType: [emp, j.hours === 'full-time' ? 'FULL_TIME' : j.hours === 'part-time' ? 'PART_TIME' : null].filter((x, i, a) => x && a.indexOf(x) === i),
      hiringOrganization: { '@type': 'Organization', name: j.employer },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: m ? m[1] : j.location, addressRegion: m ? m[2].toUpperCase() : undefined, addressCountry: 'US' } },
      directApply: false, identifier: { '@type': 'PropertyValue', name: j.employer, value: j.id } };
    if (j.remote) { ld.jobLocationType = 'TELECOMMUTE'; ld.applicantLocationRequirements = { '@type': 'Country', name: 'US' }; }
    if (j.pay_min != null && j.pay_unit) ld.baseSalary = { '@type': 'MonetaryAmount', currency: 'USD', value: Object.assign({ '@type': 'QuantitativeValue', minValue: j.pay_min, unitText: j.pay_unit.toUpperCase() }, j.pay_max != null ? { maxValue: j.pay_max } : { value: j.pay_min }) };
    return JSON.stringify(ld);
  }
  function setLd(j) {
    clearLd(); if (!j) return;
    const s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ld-job'; s.textContent = jsonLd(j); document.head.appendChild(s);
  }
  function clearLd() { const o = $('#ld-job'); if (o) o.remove(); }
  function richText(t) {
    const out = []; let list = [];
    const flush = () => { if (list.length) { out.push('<ul>' + list.join('') + '</ul>'); list = []; } };
    String(t || '').split('\n').forEach((l) => {
      if (/^• /.test(l)) list.push('<li>' + esc(l.slice(2)) + '</li>');
      else { flush(); if (/^## /.test(l)) out.push('<h4>' + esc(l.slice(3)) + '</h4>'); else if (l.trim()) out.push('<p>' + esc(l) + '</p>'); }
    });
    flush(); return out.join('');
  }
  function miLbl(x) { return x < 1 ? '&lt;1 mi' : Math.round(x) + ' mi'; }
  function httpUrl(u) { return /^https?:\/\/[^\s]+$/i.test(String(u || '')); }
  function hostOf(u) { try { return new URL(u).host; } catch (e) { return String(u); } }
  function viewJob(root, id) {
    const j = jobById(id);
    if (!S.loaded) { root.innerHTML = '<div class="pad muted">Loading…</div>'; return; }
    if (!j) { root.innerHTML = '<div class="empty"><div class="big">🕳️</div><h3>That job isn’t listed anymore</h3><p>It may have been filled or removed.</p><a class="btn" href="#/jobs">Back to jobs</a></div>'; return; }
    setLd(j);
    const sv = !!saved()[j.id], ap = applied()[j.id], ph = phoneOf(j);
    const d = j.lat != null && S.where ? EM.miles(S.where.lat, S.where.lon, j.lat, j.lon) : null;
    const tags = [TYPE[j.type], j.hours && j.hours !== j.type ? TYPE[j.hours] : null, SHIFT[j.shift], j.remote ? 'Remote' : null, j.industry].filter(Boolean);
    const stale = EM.daysAgo(j.last_checked || j.posted);
    root.innerHTML = '<div class="detail"><a class="back" href="#/jobs">‹ Back to results</a>' +
      '<h1>' + esc(j.title) + '</h1><div class="emp">' + esc(j.employer) + (j.verified ? ' <span class="vbadge">✔ Verified</span>' : ' <span class="vbadge no">Not yet verified</span>') + '</div>' +
      '<div class="meta">📍 ' + esc(j.location) + (d != null ? ' · ' + miLbl(d) + ' from ' + esc(S.where.name) : '') + '</div>' +
      '<div class="pay big">' + esc(payLabel(j)) + '</div>' +
      '<div class="tags">' + tags.map((t) => '<span class="tag">' + esc(t) + '</span>').join('') + '</div>' +
      '<div class="foot">' + esc(postedLabel(j.posted)) + (j.last_checked ? ' · last confirmed ' + esc(fmtDate(j.last_checked)) : '') + (j.expires ? ' · expires ' + esc(fmtDate(j.expires)) : '') + '</div>' +
      (ap ? '<div class="note ok">You marked this as applied on ' + esc(fmtDate(new Date(ap.at).toISOString().slice(0, 10))) + '.</div>' : '') +
      '<div class="actions"><button class="btn" id="applyBtn">Apply</button><button class="btn ghost" id="saveBtn">' + (sv ? '★ Saved' : '☆ Save') + '</button></div>' +
      '<div class="actions sec">' + (ph ? '<a class="btn ghost" href="tel:' + esc(ph.replace(/\D/g, '')) + '">📞 Call ' + esc(ph) + '</a>' : '') + '<button class="btn ghost" id="shareBtn">Share</button></div>' +
      '<section><h2>About the job</h2>' + richText(j.description) + '</section>' +
      (j.requirements && j.requirements.length ? '<section><h2>Requirements</h2><ul>' + j.requirements.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ul></section>' : '') +
      '<section><h2>Schedule &amp; pay</h2><dl><dt>Pay</dt><dd>' + esc(payLabel(j)) + '</dd><dt>Job type</dt><dd>' + esc([TYPE[j.type], j.hours && j.hours !== j.type ? TYPE[j.hours] : null].filter(Boolean).join(', ') || '—') + '</dd><dt>Shift</dt><dd>' + esc(SHIFT[j.shift] || 'Not listed') + '</dd></dl></section>' +
      '<section><h2>Location</h2><p>' + esc(j.location) + (j.lat != null ? ' <span class="muted tiny">(approximate, city level)</span>' : '') + '</p>' +
      (j.lat != null ? '<div id="mapBox"><button class="btn ghost" id="mapBtn">🗺️ Show map</button><p class="tiny muted">The map loads from OpenStreetMap only when you tap.</p></div>' : '') + '</section>' +
      '<section><h2>Contact</h2><p>' + esc(j.contact || 'See apply options above.') + '</p>' + (j.source ? '<p class="tiny muted">Source: ' + (httpUrl(j.source) ? '<a href="' + esc(j.source) + '" target="_blank" rel="noopener noreferrer">' + esc(hostOf(j.source)) + '</a>' : esc(j.source)) + '</p>' : '') + '</section>' +
      '<div class="safety-box"><b>🛡️ Stay safe.</b> A real employer never asks you to pay to apply, buy equipment, or cash a check. <a href="#/safety">Scam tips</a> · <button class="link" id="reportBtn">Report this job</button></div>' +
      '<p class="tiny muted">' + NOBOOST + '</p></div>';
    $('#applyBtn').onclick = () => applySheet(j);
    $('#saveBtn').onclick = () => { toggleSave(j.id); $('#saveBtn').textContent = saved()[j.id] ? '★ Saved' : '☆ Save'; };
    $('#shareBtn').onclick = async () => {
      const txt = j.title + ' at ' + j.employer + ' (' + j.location + ') — ' + payLabel(j) + '\nFind it on EmployMe: ' + location.origin + location.pathname;
      if (navigator.share) { try { await navigator.share({ title: j.title, text: txt }); } catch (e) {} } else { await EM.copyText(txt); toast('Copied to clipboard'); }
    };
    const mb = $('#mapBtn');
    if (mb) mb.onclick = () => {
      const b = 0.06; $('#mapBox').innerHTML = '<iframe title="Map" loading="lazy" referrerpolicy="no-referrer" src="https://www.openstreetmap.org/export/embed.html?bbox=' + [j.lon - b, j.lat - b / 1.5, j.lon + b, j.lat + b / 1.5].join('%2C') + '&layer=mapnik&marker=' + j.lat + '%2C' + j.lon + '"></iframe>';
    };
    $('#reportBtn').onclick = () => {
      location.href = mailto(MAIL, 'Report job: ' + j.title + ' (' + j.id + ')', 'I want to report this EmployMe listing.\n\nJob: ' + j.title + '\nEmployer: ' + j.employer + '\nID: ' + j.id + '\n\nReason (scam / asked for money / discriminatory / filled / wrong info / other):\n\nDetails:\n');
    };
    root.scrollTop = 0;
  }
  function applySheet(j) {
    const p = profile(), a = j.apply || {}, hasProfile = !!(p.name || p.summary || p.experience.length);
    const body = profileText(p, j), subject = 'Application: ' + j.title + ' via EmployMe';
    const emailBtn = a.email ? '<a class="btn" id="aMail" href="' + esc(mailto(a.email, subject, body)) + '">✉️ Email my profile to ' + esc(a.email) + '</a>' : '';
    const urlBtn = httpUrl(a.url) ? '<a class="btn' + (a.email ? ' ghost' : '') + '" id="aUrl" href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">🔗 Apply on the employer’s site</a>' : '';
    openSheet('<h2>Apply: ' + esc(j.title) + '</h2>' +
      (hasProfile ? '<p>Your email app will open with a message already filled in from your EmployMe profile. Review it, attach a resume file if you have one, and send.</p>' : '<div class="note">You haven’t built a profile yet. <a href="#/profile" data-close>Build it in 2 minutes</a> so it fills in automatically — or just email and write your own message.</div>') +
      '<div class="stack">' + (a.method === 'url' ? urlBtn + emailBtn : emailBtn + urlBtn) + (!a.email && !httpUrl(a.url) ? '<p class="bad">This listing has no apply link. Use the contact info on the job.</p>' : '') +
      (hasProfile ? '<button class="btn ghost" id="aCopy">📋 Copy my profile text</button>' : '') + '</div>' +
      '<p class="tiny muted">EmployMe never sees your application: it’s sent from your own email. We can’t tell if you actually sent it, so we mark it “applied” when you tap above. <b>Never pay anyone to apply.</b></p>',
      (sh) => {
        const mark = () => { const m = applied(); m[j.id] = { at: Date.now(), title: j.title, employer: j.employer }; store.set('applied', m); };
        ['aMail', 'aUrl'].forEach((id) => { const el = $('#' + id, sh); if (el) el.addEventListener('click', () => { mark(); setTimeout(() => { closeSheet(); route(); }, 400); }); });
        const c = $('#aCopy', sh); if (c) c.onclick = async () => { toast((await EM.copyText(body)) ? 'Profile text copied' : 'Couldn’t copy'); };
      });
  }

  // ======================= SAVED =======================
  function viewSaved(root, tab) {
    tab = tab || store.get('savedTab', 'jobs');
    const sv = saved(), ap = applied(), ss = searches();
    const tabs = [['jobs', 'Jobs', Object.keys(sv).length], ['searches', 'Searches', ss.length], ['applied', 'Applied', Object.keys(ap).length]];
    let h = '<div class="pad"><h1>Saved</h1><div class="seg">' + tabs.map((t) => '<button data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + t[1] + ' (' + t[2] + ')</button>').join('') + '</div>';
    if (tab === 'jobs') {
      const ids = Object.keys(sv).sort((a, b) => sv[b].at - sv[a].at);
      h += ids.length ? ids.map((id) => { const j = jobById(id); return j ? jobCard({ job: j, dist: S.where && j.lat != null ? EM.miles(S.where.lat, S.where.lon, j.lat, j.lon) : null }) : '<article class="job gone"><h3>' + esc(sv[id].title) + '</h3><div class="emp">' + esc(sv[id].employer) + '</div><div class="foot">No longer listed</div><button class="link" data-unsave="' + esc(id) + '">Remove</button></article>'; }).join('') :
        '<div class="empty small"><div class="big">🔖</div><p>No saved jobs yet. Tap ☆ on any job to keep it here.</p></div>';
    } else if (tab === 'searches') {
      h += '<p class="tiny muted">Save a search from the Jobs tab. A badge shows when a new job matches. Checked each time you open the app.</p>';
      h += ss.length ? ss.map((s) => { const n = newCount(s); return '<div class="srch"><button class="srch-main" data-run="' + esc(s.id) + '"><b>' + esc(s.name) + '</b><span class="tiny muted">' + (n ? '' : 'No new matches') + '</span></button>' + (n ? '<span class="newbadge">' + n + ' new</span>' : '') + '<button class="link" data-delsearch="' + esc(s.id) + '" aria-label="Delete search">🗑</button></div>'; }).join('') :
        '<div class="empty small"><div class="big">🔔</div><p>No saved searches yet.</p></div>';
    } else {
      const ids = Object.keys(ap).sort((a, b) => ap[b].at - ap[a].at);
      h += '<p class="tiny muted">Jobs you tapped “Apply” on. Stored only on this phone.</p>';
      h += ids.length ? ids.map((id) => '<div class="srch"><a class="srch-main" href="#/job/' + encodeURIComponent(id) + '"><b>' + esc(ap[id].title) + '</b><span class="tiny muted">' + esc(ap[id].employer) + ' · ' + esc(fmtDate(new Date(ap[id].at).toISOString().slice(0, 10))) + '</span></a><button class="link" data-unapply="' + esc(id) + '">Remove</button></div>').join('') :
        '<div class="empty small"><div class="big">📨</div><p>Nothing yet. When you apply, it shows up here so you can keep track.</p></div>';
    }
    root.innerHTML = h + '</div>';
    $$('.seg button', root).forEach((b) => b.onclick = () => { store.set('savedTab', b.dataset.tab); viewSaved(root, b.dataset.tab); });
    root.onclick = (e) => {
      const t = e.target;
      if (t.closest('[data-save]') || t.closest('[data-open]')) { listClicks(e); if (t.closest('[data-save]')) viewSaved(root, tab); return; }
      let b;
      if ((b = t.closest('[data-unsave]'))) { const s = saved(); delete s[b.dataset.unsave]; store.set('saved', s); viewSaved(root, tab); }
      else if ((b = t.closest('[data-unapply]'))) { const s = applied(); delete s[b.dataset.unapply]; store.set('applied', s); viewSaved(root, tab); }
      else if ((b = t.closest('[data-delsearch]'))) { store.set('searches', searches().filter((s) => s.id !== b.dataset.delsearch)); refreshBadge(); viewSaved(root, tab); }
      else if ((b = t.closest('[data-run]'))) {
        const s = searches().find((x) => x.id === b.dataset.run); if (!s) return;
        S.filters = Object.assign(EM.search.DEFAULT_FILTERS(), s.filters); S.where = s.where; store.set('filters', S.filters); store.set('where', S.where);
        s.seen = runSearch(s.filters, s.where).map((r) => r.job.id); store.set('searches', searches().map((x) => (x.id === s.id ? s : x))); refreshBadge(); S.scrollJobs = 0; location.hash = '#/jobs';
      }
    };
  }

  // ======================= PROFILE =======================
  function viewProfile(root) {
    const p = profile();
    const save = () => { store.set('profile', p); };
    const shifts = ['1st', '2nd', '3rd', 'weekends', 'flexible'];
    root.innerHTML = '<div class="pad"><h1>My profile</h1><div class="note ok">🔒 <b>Your data stays on your phone.</b> It’s saved only in this browser on this device. EmployMe has no accounts or servers for it. It leaves your phone only when you tap Apply (it goes in an email <i>you</i> send).</div>' +
      '<label class="lbl" for="pName">Full name</label><input id="pName" data-f="name" autocomplete="name" value="' + esc(p.name) + '">' +
      '<div class="grid2"><div><label class="lbl" for="pEmail">Email</label><input id="pEmail" data-f="email" type="email" autocomplete="email" value="' + esc(p.email) + '"></div><div><label class="lbl" for="pPhone">Phone</label><input id="pPhone" data-f="phone" type="tel" autocomplete="tel" value="' + esc(p.phone) + '"></div></div>' +
      '<label class="lbl" for="pCity">City, state</label><input id="pCity" data-f="city" value="' + esc(p.city) + '" placeholder="Erie, PA">' +
      '<label class="lbl" for="pSum">Summary</label><textarea id="pSum" data-f="summary" rows="3" placeholder="2–3 sentences about you and the work you want">' + esc(p.summary) + '</textarea>' +
      '<h2>Experience</h2><div id="expList"></div><button class="btn ghost" id="addExp">+ Add a job</button>' +
      '<label class="lbl" for="pEdu">Education &amp; certifications</label><textarea id="pEdu" data-f="education" rows="3" placeholder="e.g. High school diploma; forklift certification">' + esc(p.education) + '</textarea>' +
      '<label class="lbl" for="pSkills">Skills <span class="muted">(comma separated; also used to match jobs)</span></label><textarea id="pSkills" data-f="skills" rows="2" placeholder="CNC, forklift, customer service, Excel">' + esc(p.skills) + '</textarea>' +
      '<h2>Availability</h2><label class="lbl" for="pStart">Available to start</label><input id="pStart" data-a="start" value="' + esc(p.availability.start) + '" placeholder="Immediately / 2 weeks notice">' +
      '<label class="lbl">Shifts I can work</label><div class="chips" id="pShifts">' + shifts.map((s) => chip(s, (p.availability.shifts || []).includes(s), 'data-v="' + s + '"')).join('') + '</div>' +
      '<label class="lbl" for="pNotes">Notes</label><input id="pNotes" data-a="notes" value="' + esc(p.availability.notes) + '" placeholder="e.g. Need weekends off, have own transportation">' +
      '<div class="note small">Tip: leave out your Social Security number, date of birth, bank info and photo. Employers don’t need them to apply.</div>' +
      '<div class="stack"><a class="btn" href="#/resume">🖨️ Print / save as PDF</a><button class="btn ghost" id="pCopy">📋 Copy as text</button><button class="btn ghost" id="pExport">⬇ Download backup file</button><label class="btn ghost filebtn">⬆ Restore from backup<input type="file" id="pImport" accept="application/json" hidden></label><button class="btn danger" id="pWipe">Delete all my data from this phone</button></div></div>';
    const drawExp = () => {
      $('#expList').innerHTML = p.experience.map((x) => '<div class="expcard" data-x="' + x.id + '"><input data-e="title" placeholder="Job title" value="' + esc(x.title) + '" aria-label="Job title"><input data-e="company" placeholder="Company" value="' + esc(x.company) + '" aria-label="Company"><input data-e="dates" placeholder="Dates (e.g. 2022 – 2025)" value="' + esc(x.dates) + '" aria-label="Dates"><textarea data-e="details" rows="3" placeholder="What you did" aria-label="Details">' + esc(x.details) + '</textarea><button class="link bad" data-rm="' + x.id + '">Remove</button></div>').join('') || '<p class="tiny muted">No jobs added yet.</p>';
    };
    drawExp();
    root.oninput = (e) => {
      const t = e.target;
      if (t.dataset.f) p[t.dataset.f] = t.value;
      else if (t.dataset.a) p.availability[t.dataset.a] = t.value;
      else if (t.dataset.e) { const x = p.experience.find((q) => q.id === t.closest('[data-x]').dataset.x); if (x) x[t.dataset.e] = t.value; }
      else return;
      save();
    };
    root.onclick = async (e) => {
      const t = e.target; let b;
      if ((b = t.closest('#addExp'))) { p.experience.push({ id: EM.uid(), title: '', company: '', dates: '', details: '' }); save(); drawExp(); const l = $$('.expcard input[data-e="title"]'); l[l.length - 1].focus(); }
      else if ((b = t.closest('[data-rm]'))) { p.experience = p.experience.filter((x) => x.id !== b.dataset.rm); save(); drawExp(); }
      else if ((b = t.closest('#pShifts .chip'))) { const a = p.availability.shifts = p.availability.shifts || [], v = b.dataset.v, i = a.indexOf(v); i < 0 ? a.push(v) : a.splice(i, 1); b.classList.toggle('on', i < 0); b.setAttribute('aria-pressed', i < 0); save(); }
      else if (t.closest('#pCopy')) toast((await EM.copyText(profileText(p))) ? 'Profile text copied' : 'Couldn’t copy');
      else if (t.closest('#pExport')) { EM.download('employme-profile-backup.json', JSON.stringify({ app: 'EmployMe', version: 1, profile: p, saved: saved(), applied: applied(), searches: searches() }, null, 2)); }
      else if (t.closest('#pWipe')) { if (confirm('Delete your profile, saved jobs, applied list and saved searches from this phone? This can’t be undone.')) { store.wipe(); S.filters = EM.search.DEFAULT_FILTERS(); S.where = { name: ERIE.name, lat: ERIE.lat, lon: ERIE.lon }; refreshBadge(); toast('All your EmployMe data was deleted from this phone.'); viewProfile(root); } }
    };
    $('#pImport').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { const d = JSON.parse(r.result); if (d.app !== 'EmployMe') throw 0; if (d.profile) store.set('profile', d.profile); if (d.saved) store.set('saved', d.saved); if (d.applied) store.set('applied', d.applied); if (d.searches) store.set('searches', d.searches); toast('Backup restored'); viewProfile(root); refreshBadge(); } catch (x) { toast('That file isn’t an EmployMe backup.'); } };
      r.readAsText(f);
    };
  }
  function viewResume(root) {
    const p = profile(), a = p.availability || {};
    root.innerHTML = '<div class="resume-wrap"><div class="noprint resume-bar"><a href="#/profile" class="btn ghost">‹ Back</a><button class="btn" id="printBtn">🖨️ Print / Save as PDF</button></div><p class="noprint tiny muted">In the print dialog, choose “Save as PDF” as the destination.</p>' +
      '<article class="resume"><h1>' + esc(p.name || 'Your Name') + '</h1><div class="rc">' + [p.email, p.phone, p.city].filter(Boolean).map(esc).join(' &nbsp;|&nbsp; ') + '</div>' +
      (p.summary ? '<h2>Summary</h2><p>' + esc(p.summary).replace(/\n/g, '<br>') + '</p>' : '') +
      (p.experience.length ? '<h2>Experience</h2>' + p.experience.map((x) => '<div class="xp"><b>' + esc(x.title) + '</b>' + (x.company ? ' — ' + esc(x.company) : '') + (x.dates ? '<span class="d">' + esc(x.dates) + '</span>' : '') + (x.details ? '<p>' + esc(x.details).replace(/\n/g, '<br>') + '</p>' : '') + '</div>').join('') : '') +
      (p.education ? '<h2>Education &amp; Certifications</h2><p>' + esc(p.education).replace(/\n/g, '<br>') + '</p>' : '') +
      (p.skills ? '<h2>Skills</h2><p>' + skillList(p).map(esc).join(' · ') + '</p>' : '') +
      ((a.start || (a.shifts || []).length || a.notes) ? '<h2>Availability</h2><p>' + [a.start && 'Available to start: ' + esc(a.start), (a.shifts || []).length && 'Shifts: ' + esc(a.shifts.join(', ')), a.notes && esc(a.notes)].filter(Boolean).join('<br>') + '</p>' : '') +
      (!p.name && !p.summary ? '<p class="muted">Your profile is empty. <a href="#/profile">Fill it in</a> first.</p>' : '') + '</article></div>';
    $('#printBtn').onclick = () => window.print();
  }

  // ======================= POST A JOB =======================
  const todayIso = () => new Date().toISOString().slice(0, 10);
  function viewPost(root) {
    root.innerHTML = '<div class="pad"><h1>Post a job</h1><div class="note ok"><b>Free during beta.</b> After beta: <b>$50 per user per month</b> — unlimited posts, full access, no extra fees. Results are never ranked by who pays: <b>no paid boosts</b>.</div>' +
      '<p class="tiny muted">Filling this in opens an email to EmployMe with your posting. We review it, confirm your contact details, and add it to the board (usually within a business day). Nothing is stored by this app.</p>' +
      '<form id="pf" novalidate>' +
      '<label class="lbl" for="fTitle">Job title *</label><input id="fTitle" name="title" required>' +
      '<label class="lbl" for="fEmp">Employer / company *</label><input id="fEmp" name="employer" required>' +
      '<label class="lbl" for="fLoc">Job location (City, ST) *</label><input id="fLoc" name="location" required placeholder="Erie, PA"><label class="check"><input type="checkbox" name="remote"> This job is remote</label>' +
      '<div class="grid2"><div><label class="lbl" for="fType">Job type *</label><select id="fType" name="type"><option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="temp">Temp</option><option value="temp-to-hire">Temp-to-hire</option><option value="contract">Contract</option><option value="direct-hire">Direct hire</option></select></div>' +
      '<div><label class="lbl" for="fShift">Shift</label><select id="fShift" name="shift"><option value="">Not specified</option><option value="1st">1st shift</option><option value="2nd">2nd shift</option><option value="3rd">3rd shift</option><option value="day">Day</option><option value="evening">Evening</option><option value="night">Night</option><option value="weekend">Weekend</option><option value="flexible">Flexible</option></select></div></div>' +
      '<label class="lbl">Pay</label><div class="grid3"><input name="pay_min" inputmode="decimal" placeholder="Min" aria-label="Minimum pay"><input name="pay_max" inputmode="decimal" placeholder="Max" aria-label="Maximum pay"><select name="pay_unit" aria-label="Pay unit"><option value="hour">per hour</option><option value="year">per year</option><option value="week">per week</option><option value="month">per month</option><option value="day">per day</option></select></div><input name="pay_text" placeholder="Pay details, if any (e.g. plus benefits)" aria-label="Pay details">' +
      '<label class="lbl" for="fDesc">Description *</label><textarea id="fDesc" name="description" rows="6" required placeholder="What the job involves, schedule, benefits"></textarea>' +
      '<label class="lbl" for="fReq">Requirements <span class="muted">(one per line)</span></label><textarea id="fReq" name="requirements" rows="4"></textarea>' +
      '<label class="lbl" for="fExp">Take down on (optional)</label><input id="fExp" name="expires" type="date" min="' + todayIso() + '">' +
      '<h2>How should people apply? *</h2><div class="grid2"><div><label class="lbl" for="fAE">Apply by email</label><input id="fAE" name="apply_email" type="email" placeholder="hr@company.com"></div><div><label class="lbl" for="fAU">Apply on a web page</label><input id="fAU" name="apply_url" type="url" placeholder="https://…"></div></div>' +
      '<h2>Your contact (so we can verify)</h2><label class="lbl" for="fCN">Your name, phone &amp; email *</label><input id="fCN" name="contact" required placeholder="Jane Smith, 814-555-0100, jane@company.com">' +
      '<label class="check"><input type="checkbox" name="auth" required> I’m authorized to post this job. It doesn’t discriminate (see <a href="#/info" target="_blank">EEO statement</a>), and applicants will never be asked to pay.</label>' +
      '<div id="pfErr" class="bad" role="alert"></div>' +
      '<div class="stack"><button class="btn" type="submit" id="pfGo">✉️ Email my posting</button><button class="btn ghost" type="button" id="pfCopy">📋 Copy posting instead</button></div></form>' +
      '<p class="tiny muted">Want to be a partner (staffing agency, chamber, workforce board)? <a href="' + esc(mailto(MAIL, 'EmployMe partner inquiry', 'Hi, I would like to learn about partnering with EmployMe.\n\nOrganization:\nName:\nPhone:\n')) + '">Become a partner</a>.</p></div>';
    const form = $('#pf');
    const build = async (geo) => {
      const v = (n) => (form.elements[n].value || '').trim(), num = (n) => (v(n) === '' || isNaN(+v(n)) ? null : +v(n));
      const err = [];
      ['title', 'employer', 'location', 'description', 'contact'].forEach((n) => { if (!v(n)) err.push(n); });
      if (!v('apply_email') && !v('apply_url')) err.push('apply');
      if (v('apply_url') && !/^https?:\/\//i.test(v('apply_url'))) err.push('apply_url');
      if (v('apply_email') && !/^\S+@\S+\.\S+$/.test(v('apply_email'))) err.push('apply_email');
      if (!form.elements.auth.checked) err.push('auth');
      if (err.length) return { err };
      let lat = null, lon = null;
      if (geo) { try { const g = await EM.geocode(v('location')); if (g) { lat = +g.lat.toFixed(4); lon = +g.lon.toFixed(4); } } catch (e) {} }
      const pmin = num('pay_min'), pmax = num('pay_max');
      const job = { id: 'post-' + todayIso().replace(/-/g, '') + '-' + EM.uid(), title: v('title'), employer: v('employer'), location: v('location'), lat, lon,
        pay_min: pmin, pay_max: pmax, pay_unit: pmin != null ? v('pay_unit') : null, pay_text: v('pay_text') || null, type: v('type'), hours: v('type') === 'full-time' || v('type') === 'part-time' ? v('type') : null, shift: v('shift') || null, industry: null,
        remote: form.elements.remote.checked, description: v('description'), requirements: v('requirements').split('\n').map((x) => x.trim()).filter(Boolean),
        posted: todayIso(), expires: v('expires') || null,
        apply: { method: v('apply_email') ? 'email' : 'url', email: v('apply_email') || null, url: v('apply_url') || null }, contact: v('contact'), verified: false, source: 'Submitted by employer via EmployMe form', last_checked: null };
      const text = 'EMPLOYME JOB POSTING (free beta)\n\nTitle: ' + job.title + '\nEmployer: ' + job.employer + '\nLocation: ' + job.location + (job.remote ? ' (remote)' : '') + '\nType: ' + (TYPE[job.type] || job.type) + '\nShift: ' + (SHIFT[job.shift] || 'n/a') + '\nPay: ' + (job.pay_min != null ? payLabel(job) : job.pay_text || 'not listed') + '\nExpires: ' + (job.expires || 'n/a') +
        '\nApply: ' + [job.apply.email && 'email ' + job.apply.email, job.apply.url && job.apply.url].filter(Boolean).join(' | ') + '\nContact: ' + job.contact + '\n\nDESCRIPTION\n' + job.description + '\n\nREQUIREMENTS\n' + (job.requirements.join('\n') || 'n/a') +
        '\n\n--- JSON for data/jobs.json (verify employer before adding; set "verified" only after confirming) ---\n' + JSON.stringify(job, null, 2) + '\n';
      return { job, text };
    };
    const showErr = (err) => { $('#pfErr').textContent = 'Please complete: ' + err.map((n) => ({ apply: 'an apply email or web page', auth: 'the authorization checkbox', apply_url: 'a valid web address (https://…)', apply_email: 'a valid apply email', contact: 'your contact', description: 'description' }[n] || n)).join(', ') + '.'; $('#pfErr').scrollIntoView({ block: 'center' }); };
    form.onsubmit = async (e) => {
      e.preventDefault(); $('#pfErr').textContent = '';
      const btn = $('#pfGo'); btn.disabled = true; btn.textContent = 'Preparing…';
      const r = await build(true); btn.disabled = false; btn.textContent = '✉️ Email my posting';
      if (r.err) return showErr(r.err);
      location.href = mailto(MAIL, 'EmployMe job posting', r.text);
      toast('Opening your email app…');
    };
    $('#pfCopy').onclick = async () => { const r = await build(false); if (r.err) return showErr(r.err); toast((await EM.copyText(r.text)) ? 'Posting copied. Paste it into an email to ' + MAIL : 'Couldn’t copy', 5000); };
  }

  // ======================= SAFETY / INFO =======================
  function viewSafety(root) {
    root.innerHTML = '<div class="pad"><a class="back" href="#/info">‹ Info</a><h1>Job scam safety</h1><div class="note bad-note"><b>EmployMe will never ask you for money.</b> Real employers and staffing agencies don’t charge applicants. If anyone does, it’s a scam.</div>' +
      '<h2>Red flags</h2><ul class="tips"><li>They ask you to <b>pay</b> for training, equipment, a background check, a uniform or “processing”.</li><li>They send a <b>check</b> and ask you to deposit it and send some back or buy gift cards.</li><li>The offer comes with <b>no interview</b>, or only a text/chat “interview”.</li><li>They ask for your <b>Social Security number, bank account or ID photos</b> before a real offer and paperwork (I-9/W-4 happen on or after your hire).</li><li>Pay sounds too good for the work, or the job is vague.</li><li>The email is from a free address (gmail, outlook) pretending to be a company, or the contact info doesn’t match the company’s real website.</li><li>They pressure you to act fast or keep it secret.</li></ul>' +
      '<h2>What to do</h2><ul class="tips"><li>Look the company up yourself and call the number on <i>its own</i> website.</li><li>Meet in person at the employer’s real address for interviews, and tell someone where you’re going.</li><li>Look for the <span class="vbadge">✔ Verified</span> badge: it means the listing was confirmed with the employer. No badge doesn’t mean fake, but be extra careful.</li><li>Use <b>Report this job</b> on any listing that feels wrong.</li></ul>' +
      '<h2>Report fraud</h2><p>Federal Trade Commission: <a href="https://reportfraud.ftc.gov" target="_blank" rel="noopener noreferrer">reportfraud.ftc.gov</a><br>PA Attorney General: <a href="https://www.attorneygeneral.gov/protect-yourself/" target="_blank" rel="noopener noreferrer">attorneygeneral.gov</a></p>' +
      '<p><a class="btn ghost" href="' + esc(mailto(MAIL, 'Report job', 'Please describe the job or message you are reporting:\n')) + '">Report to EmployMe</a></p></div>';
  }
  let deferred = null; EM.setDeferred = (e) => { deferred = e; };
  function viewInfo(root) {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    root.innerHTML = '<div class="pad"><h1>About EmployMe</h1>' +
      '<div class="note"><b>Beta.</b> EmployMe is a free local job board built in Erie, PA. It’s new, so expect rough edges and a small list of jobs. Tell us what to fix: <a href="' + esc(mailto(MAIL, 'EmployMe feedback', 'Feedback:\n')) + '">send feedback</a>.</div>' +
      '<h2>How it works</h2><ul class="tips"><li><b>Free for job seekers. Always.</b> No account, no fees.</li><li><b>No paid boosts.</b> Results are ranked only by how well they match <i>your</i> search: keywords, filters, your skills, distance and date. Nobody can pay to move up.</li><li>Employers can post free during the beta. After beta: <b>$50 per user per month</b> — unlimited posts, full access, no pay-to-rank.</li></ul>' +
      (standalone ? '' : '<div class="stack"><button class="btn" id="instBtn">📲 Install the app</button><p class="tiny muted">Or in Chrome tap ⋮ → <b>Install app</b> / <b>Add to Home screen</b>. Works offline once installed.</p></div>') +
      '<h2>Privacy summary</h2><ul class="tips"><li><b>No accounts. No tracking.</b> No ads, no analytics, no cookies from us.</li><li>Your profile, saved jobs, applied list and saved searches stay <b>on your phone</b> (browser local storage). Delete them any time from Profile.</li><li>When you apply, your email app sends the message — EmployMe never receives it.</li><li>Looking up a city/ZIP sends that text to OpenStreetMap’s Nominatim service; the “Show map” button loads an OpenStreetMap map. GPS is used only if you tap it.</li><li>The site is hosted on GitHub Pages, which keeps its own standard server logs.</li></ul>' +
      '<h2>Equal opportunity</h2><p>Employers using EmployMe must not post jobs that discriminate based on race, color, religion, sex (including pregnancy, sexual orientation, gender identity), national origin, age (40+), disability, genetic information, veteran status, or any other status protected by federal, Pennsylvania or local law. Postings must not state such preferences. We may remove any listing that does, or that appears fraudulent or asks applicants for payment. <a href="#/safety">Scam safety tips</a>.</p>' +
      '<h2>Where jobs come from</h2><p>The current listings come from All Seasons Placement, Inc.’s own public job portal (Erie, PA). Other employers’ postings are added after their contact details are confirmed. Listings can fill quickly, so confirm with the employer. Each listing shows when it was last confirmed.</p>' +
      '<h2>Contact</h2><p><a href="' + esc(mailto(MAIL, 'EmployMe', 'Hello,\n')) + '">' + MAIL + '</a><br><a href="' + esc(mailto(MAIL, 'EmployMe partner inquiry', 'Hi, I would like to learn about partnering with EmployMe.\n\nOrganization:\nName:\nPhone:\n')) + '">Become a partner</a></p>' +
      '<details class="terms"><summary>Terms of use <span class="draft">DRAFT</span></summary><div class="note bad-note"><b>DRAFT — pending attorney review. Not final and not legally binding yet.</b></div><p>[Placeholder] By using EmployMe you agree that listings are provided by third parties and EmployMe does not guarantee any job, hiring decision or the accuracy of any listing. You agree not to post unlawful, discriminatory, misleading or fraudulent content. Employers are responsible for compliance with all employment laws. Service is provided “as is” during beta. [Final terms, limitation of liability, governing law (Pennsylvania) and subscription terms to be added after legal review.]</p></details>' +
      '<p class="tiny muted center">EmployMe beta · v0.1.0 · ' + NOBOOST + '</p></div>';
    const ib = $('#instBtn');
    if (ib) ib.onclick = async () => { if (deferred) { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; } else toast('In Chrome tap ⋮ then “Install app” or “Add to Home screen”.', 5000); };
  }

  EM.views = { jobs: viewJobs, job: viewJob, saved: viewSaved, profile: viewProfile, resume: viewResume, post: viewPost, info: viewInfo, safety: viewSafety };
  EM.refreshBadge = refreshBadge; EM.clearLd = clearLd; EM.closeSheet = closeSheet;
  function route() { if (EM.route) EM.route(); }
})(window.EM);
