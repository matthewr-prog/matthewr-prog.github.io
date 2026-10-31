/* HuntCast — Regs tab: state + county → what's in season and the key rules, from official agency data.
 * Data lives in data/regs/index.json (all states) and data/regs/<ST>.json (detailed seasons). No code change is
 * needed for the yearly refresh — just replace the JSON (see data/README.md). */
(function (HC) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const LS = 'huntcast.regs';
  const DISC = 'Always confirm with the official regulations before hunting.';
  let index = null, stateData = {}, sel = { state: null, county: null }, touched = false, geoDone = false, loadErr = null;

  function today() {
    const q = new URLSearchParams(location.search).get('today'); // ?today=YYYY-MM-DD lets you preview other dates
    if (/^\d{4}-\d{2}-\d{2}$/.test(q || '')) return q;
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const TODAY = today();
  const dayNum = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5);
  const daysBetween = (a, b) => dayNum(b) - dayNum(a);
  function fd(iso, withYear) { const m = +iso.slice(5, 7) - 1, d = +iso.slice(8, 10); return MON[m] + ' ' + d + (withYear ? ', ' + iso.slice(0, 4) : ''); }
  function fr(r) {
    const y = TODAY.slice(0, 4);
    if (r[0] === r[1]) return fd(r[0], r[0].slice(0, 4) !== y);
    return fd(r[0], r[0].slice(0, 4) !== y) + ' – ' + fd(r[1], r[1].slice(0, 4) !== y);
  }
  const fullDate = (iso) => fd(iso, true);

  function status(it) {
    const rs = it.ranges || [];
    for (const r of rs) if (TODAY >= r[0] && TODAY <= r[1]) return { k: 'in', end: r[1], range: r, allYear: daysBetween(r[0], r[1]) >= 330 };
    let next = null;
    for (const r of rs) if (r[0] > TODAY && (!next || r[0] < next[0])) next = r;
    if (next) return { k: 'soon', start: next[0], in: daysBetween(TODAY, next[0]), range: next };
    return { k: rs.length ? 'past' : 'none' };
  }

  /* ---------------------------------------------------------------- data */
  function getJSON(u) { return fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }); }
  function loadIndex() { return index ? Promise.resolve(index) : getJSON('data/regs/index.json').then((j) => (index = j)); }
  function loadState(code) {
    const e = index.states.find((s) => s.code === code);
    if (!e || !e.file) return Promise.resolve(null);
    if (stateData[code]) return Promise.resolve(stateData[code]);
    return getJSON('data/regs/' + e.file).then((j) => (stateData[code] = j));
  }

  /* ------------------------------------------------------------ defaults */
  function saved() { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } }
  function stateFromName(name) {
    const m = /,\s*([A-Za-z]{2})\b/.exec(name || '');
    return m ? m[1].toUpperCase() : null;
  }
  function pickDefault() {
    const S = (HC.app && HC.app.S) || {};
    const qp = new URLSearchParams(location.search); // ?rstate=OH&rcounty=Franklin%20County (testing / deep links)
    if (qp.get('rstate') && index.states.some((s) => s.code === qp.get('rstate').toUpperCase())) {
      const st0 = index.states.find((s) => s.code === qp.get('rstate').toUpperCase());
      touched = true;
      return { state: st0.code, county: st0.counties.includes(qp.get('rcounty')) ? qp.get('rcounty') : st0.counties[0] };
    }
    const sv = saved();
    if (sv && sv.state && index.states.some((s) => s.code === sv.state)) return { state: sv.state, county: sv.county };
    let code = stateFromName(S.name), county = null;
    if (!code || !index.states.some((s) => s.code === code)) code = index.default.state;
    const st = index.states.find((s) => s.code === code);
    const city = ((S.name || '').split(',')[0] || '').trim().toLowerCase();
    county = st.counties.find((c) => c.toLowerCase().replace(/ (county|parish|borough|census area|municipality)$/, '') === city) || null;
    if (!county && code === index.default.state) county = index.default.county;
    return { state: code, county: county || st.counties[0] };
  }
  // Best-effort: ask OpenStreetMap which county the saved location is in (one small request, cached).
  function geo() {
    if (geoDone) return; geoDone = true;
    const S = (HC.app && HC.app.S) || {};
    if (typeof S.lat !== 'number') return;
    const key = 'huntcast.regs.geo.' + S.lat.toFixed(2) + ',' + S.lon.toFixed(2);
    const apply = (g) => {
      if (touched || !g || !g.state || !index) return;
      const st = index.states.find((s) => s.code === g.state); if (!st) return;
      const cty = st.counties.find((c) => c === g.county) || st.counties.find((c) => c.toLowerCase().replace(/ (county|parish|borough|census area|municipality)$/, '') === String(g.county || '').toLowerCase().replace(/ (county|parish|borough|census area|municipality)$/, ''));
      if (cty && (sel.state !== st.code || sel.county !== cty)) { sel = { state: st.code, county: cty }; go(); }
    };
    try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c) return apply(c); } catch (e) { /* ignore */ }
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), 6000);
    fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=' + S.lat + '&lon=' + S.lon, { signal: ctl ? ctl.signal : undefined, headers: { Accept: 'application/json' } })
      .then((r) => r.json()).then((j) => {
        const a = (j && j.address) || {}; const iso = a['ISO3166-2-lvl4'] || '';
        const g = { state: /^US-([A-Z]{2})$/.test(iso) ? iso.slice(3) : null, county: a.county || null };
        try { localStorage.setItem(key, JSON.stringify(g)); } catch (e) { /* ignore */ }
        apply(g);
      }).catch(() => {}).then(() => clearTimeout(t));
  }

  /* ----------------------------------------------------------- selectors */
  function fillSelectors() {
    const stSel = $('#regState'), cSel = $('#regCounty');
    if (!stSel.options.length) {
      stSel.innerHTML = index.states.map((s) => '<option value="' + s.code + '">' + esc(s.name) + (s.detail === 'link' ? '' : ' ●') + '</option>').join('');
    }
    stSel.value = sel.state;
    const st = index.states.find((s) => s.code === sel.state);
    if (!st.counties.includes(sel.county)) sel.county = st.counties[0];
    cSel.innerHTML = st.counties.map((c) => '<option>' + esc(c) + '</option>').join('');
    cSel.value = sel.county;
  }

  /* -------------------------------------------------------------- render */
  function countyAreas(data) {
    if (!data || !data.county_areas) return null;
    return data.county_areas[sel.county] || null;
  }
  // which items apply to the selected county; returns {item, matched:[{id,label,share}], small}
  function applicable(data) {
    const ca = countyAreas(data), out = [];
    const ids = ca ? ca.areas.map((a) => a.id) : null;
    (data.seasons || []).forEach((c) => {
      c.items.forEach((it) => {
        let matched = null, small = false;
        if (it.areas && ids) {
          matched = ca.areas.filter((a) => it.areas.includes(a.id));
          if (!matched.length) return;
          small = matched.every((a) => a.share != null && a.share < 5);
        }
        out.push({ cat: c, it, matched, small, st: status(it) });
      });
    });
    return out;
  }
  function metaLine(x) {
    const it = x.it, bits = [];
    if (it.bag) bits.push('Limit: ' + esc(it.bag));
    if (it.who) bits.push('For: ' + esc(it.who));
    if (it.hours) bits.push('Hours: ' + esc(it.hours));
    if (x.matched && x.matched.length) bits.push('Applies to your county: ' + x.matched.map((a) => esc(a.label)).join(', ') + (x.small ? ' (small part of county)' : ''));
    else if (it.area_label) bits.push('Area: ' + esc(it.area_label));
    return bits.join(' · ');
  }
  function badge(x) {
    const s = x.st, it = x.it;
    if (s.k === 'in') {
      const part = it.partial ? ' in some areas' : (!x.matched && it.area_label ? ' — ' + esc(it.area_label) : '');
      return '<span class="rg-badge in">In season' + part + '</span>';
    }
    if (s.k === 'soon') return '<span class="rg-badge soon">Opens ' + fd(s.start, s.start.slice(0, 4) !== TODAY.slice(0, 4)) + ' · ' + (s.in === 1 ? 'tomorrow' : 'in ' + s.in + ' days') + '</span>';
    if (s.k === 'past') return '<span class="rg-badge out">Ended</span>';
    return '<span class="rg-badge none">See note</span>';
  }
  function datesLine(x) {
    const it = x.it, rs = it.ranges || [];
    if (!rs.length) return '';
    if (rs.length === 1 && daysBetween(rs[0][0], rs[0][1]) >= 330) return 'Open all year (no closed season)';
    return rs.map(fr).join('  ·  ');
  }
  function itemHTML(x, emoji) {
    const note = x.it.note ? '<div class="rg-note">' + esc(x.it.note) + '</div>' : '';
    const meta = metaLine(x);
    return '<div class="rg-item ' + x.st.k + '"><div class="rg-top"><b>' + (emoji ? emoji + ' ' : '') + esc(x.it.label) + '</b>' + badge(x) + '</div>' +
      (datesLine(x) ? '<div class="rg-dates">' + esc(datesLine(x)) + '</div>' : '') +
      (meta ? '<div class="rg-meta">' + meta + '</div>' : '') + note + '</div>';
  }
  function areaCard(data) {
    const ca = countyAreas(data);
    if (!ca) {
      const zoned = (data.seasons || []).some((c) => c.items.some((it) => it.area_label));
      return zoned ? '<div class="card"><h3>📍 ' + esc(sel.county) + ', ' + esc(data.name) + '</h3><div class="rg-warn">' + esc(data.name) + ' seasons depend on zone / management area, and HuntCast doesn\'t map counties to them for this state yet. Items below are labeled with their zone or area — find yours on the official map (see Official sources).</div></div>' : '';
    }
    let h = '<div class="card"><h3>📍 ' + esc(sel.county) + ', ' + esc(data.name) + '</h3>';
    const lab = data.county_label || (data.state === 'PA' ? 'Wildlife Management Unit (WMU)' : 'Area');
    if (data.state === 'PA') {
      h += '<div class="rg-wmus">' + ca.areas.map((a) => '<span class="rg-wmu">' + esc(a.label) + ' <small>' + a.share + '%' + (a.share < 5 ? ' · small part' : '') + '</small></span>').join('') + '</div>';
      h += '<div class="muted tiny">' + (ca.areas.length > 1 ? 'This county spans ' + ca.areas.length + ' WMUs.' : 'This county is entirely in WMU ' + esc(ca.areas[0].id) + '.') + ' Seasons below that vary by WMU show the ones that match.</div>';
      if (ca.note) h += '<div class="rg-warn">' + esc(ca.note) + '</div>';
      ca.areas.forEach((a) => {
        const w = data.wmu_info && data.wmu_info[a.id]; if (!w) return;
        h += '<div class="rg-wmuinfo"><b>WMU ' + esc(a.id) + '</b>: antler rule — ' + esc(w.antler) + '. 2026 antlerless licenses allocated: ' + w.antlerless_allocation_2026.toLocaleString('en-US') + '.</div>';
      });
    } else {
      h += '<div class="muted tiny">' + esc(lab) + ':</div>' + ca.areas.map((a) => '<div class="rg-wmuinfo"><b>' + esc(a.label) + '</b></div>').join('');
      if (ca.note) h += '<div class="rg-warn">' + esc(ca.note) + '</div>';
    }
    const cn = data.county_notes && data.county_notes[sel.county];
    if (cn) h += '<div class="rg-wmuinfo"><b>Also:</b> ' + esc(cn) + '</div>';
    return h + '</div>';
  }
  function stale(data) {
    const m = /^(\d{4})-(\d{2})$/.exec(data.season_year || ''); if (!m) return '';
    const endY = +m[1] + 1;
    if (TODAY > endY + '-08-31') return '<div class="card err"><b>These dates may be out of date.</b> They are for the ' + esc(data.season_year) + ' season. Check the official site for the current regulations.</div>';
    return '';
  }
  function linksHTML(data, entry) {
    const ls = (data && data.links) || [{ label: entry.agency.name + ' — hunting regulations', url: entry.agency.url }];
    return ls.map((l) => '<a class="rg-link" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + ' ↗</a>').join('');
  }
  function renderBody() {
    const entry = index.states.find((s) => s.code === sel.state), data = stateData[sel.state] || null;
    const body = $('#regBody');
    const lc = entry.last_checked ? fullDate(entry.last_checked) : '—';
    let src;
    if (data) src = 'Source: <a href="' + esc(data.source_url) + '" target="_blank" rel="noopener">' + esc(data.agency.name) + '</a> · Season year ' + esc(data.season_year) + (data.license_year ? ' (license year ' + esc(data.license_year) + ')' : '') + ' · Last checked ' + fullDate(data.last_checked);
    else src = 'Source: <a href="' + esc(entry.source_url) + '" target="_blank" rel="noopener">' + esc(entry.agency.name) + '</a> · Last checked ' + lc;
    $('#regSource').innerHTML = src;
    if (loadErr) { body.innerHTML = '<div class="card err">Couldn\'t load the regulation data (' + esc(loadErr) + '). It will work offline once it has loaded once.</div>'; return; }
    if (!data) {
      body.innerHTML = '<div class="card"><h3>' + esc(entry.name) + '</h3><p>HuntCast doesn\'t have season dates for ' + esc(entry.name) + ' yet — go straight to the official source:</p>' +
        '<a class="btn" href="' + esc(entry.agency.url) + '" target="_blank" rel="noopener">' + esc(entry.agency.name) + ' ↗</a>' +
        '<p class="muted tiny">Pennsylvania has full detail; OH, WV, MD, NY and NJ have season summaries. Other states link to the agency\'s regulations page.</p></div>';
      return;
    }
    const all = applicable(data);
    const inNow = all.filter((x) => x.st.k === 'in' && x.it.ranges.length);
    const soon = all.filter((x) => x.st.k === 'soon' && x.st.in <= 30).sort((a, b) => a.st.start.localeCompare(b.st.start));
    let h = stale(data) + areaCard(data);
    h += '<div class="card"><h3>✅ In season today <small class="muted">(' + fullDate(TODAY) + ')</small></h3>' +
      (inNow.length ? inNow.map((x) => itemHTML(x, x.cat.emoji)).join('') : '<p class="muted">Nothing on this list is open today for ' + esc(sel.county) + '. See what\'s coming up below.</p>') + '</div>';
    h += '<div class="card"><h3>⏳ Coming up <small class="muted">(next 30 days)</small></h3>' +
      (soon.length ? soon.map((x) => itemHTML(x, x.cat.emoji)).join('') : '<p class="muted">No new seasons open in the next 30 days.</p>') + '</div>';
    h += '<div class="card"><h3>All seasons — ' + esc(data.season_year) + '</h3>' + (data.seasons || []).map((c, i) => {
      const xs = all.filter((x) => x.cat === c); if (!xs.length) return '';
      const n = xs.filter((x) => x.st.k === 'in' && x.it.ranges.length).length;
      return '<details class="rg-cat"' + (i === 0 ? ' open' : '') + '><summary>' + c.emoji + ' ' + esc(c.title) + (n ? ' <span class="rg-count">' + n + ' open now</span>' : '') + '</summary>' + xs.map((x) => itemHTML(x)).join('') + '</details>';
    }).join('') + '</div>';
    if (data.rules && data.rules.length) h += '<div class="card"><h3>📜 Key rules</h3>' + data.rules.map((r, i) => '<details class="rg-cat"' + (i === 0 ? ' open' : '') + '><summary>' + esc(r.title) + '</summary><p>' + esc(r.text) + '</p></details>').join('') + '</div>';
    h += '<div class="card"><h3>🔗 Official sources</h3>' + linksHTML(data, entry) +
      (data.notes || []).map((n) => '<p class="muted tiny">' + esc(n) + '</p>').join('') +
      '<p class="muted tiny">Season year ' + esc(data.season_year) + ' · data updated ' + fullDate(data.updated) + ' · last checked ' + fullDate(data.last_checked) + '.</p></div>';
    body.innerHTML = h;
  }
  function go() {
    fillSelectors();
    $('#regBody').innerHTML = '<div class="card center muted">Loading…</div>';
    const code = sel.state;
    loadState(code).then(() => { loadErr = null; }, (e) => { loadErr = e.message; }).then(() => { if (code === sel.state) renderBody(); });
  }
  function show() {
    if (index) return; // already built; selectors keep state
    loadIndex().then(() => {
      sel = pickDefault();
      $('#regDisclaimer').textContent = index.disclaimer || DISC;
      go(); geo();
    }).catch((e) => { loadErr = e.message; $('#regBody').innerHTML = '<div class="card err">Couldn\'t load the regulation data (' + esc(e.message) + ').</div>'; });
  }
  document.addEventListener('change', (e) => {
    if (!index) return;
    if (e.target.id === 'regState') { touched = true; sel = { state: e.target.value, county: null }; const st = index.states.find((s) => s.code === sel.state); sel.county = (sel.state === index.default.state ? index.default.county : st.counties[0]); persist(); go(); }
    if (e.target.id === 'regCounty') { touched = true; sel.county = e.target.value; persist(); go(); }
  });
  function persist() { try { localStorage.setItem(LS, JSON.stringify(sel)); } catch (e) { /* ignore */ } }
  HC.regs = { show, status, today: () => TODAY };
})(window.HC = window.HC || {});
