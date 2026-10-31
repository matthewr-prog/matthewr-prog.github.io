/* HuntCast — UI, map and state. Vanilla JS, no build step. */
(function (HC) {
  'use strict';
  const U = HC.Util, M = HC.Model, SP = HC.Species;
  const VERSION = '1.0.0';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const HOUR = 3600000;
  const DEFAULT_LOC = { lat: 42.1292, lon: -80.0851, name: 'Erie, PA' };

  /* ------------------------------------------------------------------ state */
  const LS_STATE = 'huntcast.state.v1', LS_SPOTS = 'huntcast.spots.v1';
  const S = Object.assign({ lat: DEFAULT_LOC.lat, lon: DEFAULT_LOC.lon, name: DEFAULT_LOC.name, species: 'whitetail', includeNight: false, legalMin: 30, layer: 'OpenStreetMap' }, readJSON(LS_STATE, {}));
  let spots = readJSON(LS_SPOTS, []);
  let data = null, fetchedAt = 0, offline = false;
  let selDate = null, selHour = null, cur = null; // cur = scoreDay result for selected species/date
  let reqId = 0, scoreCache = {};

  function readJSON(k, fb) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
  function save() { try { localStorage.setItem(LS_STATE, JSON.stringify({ lat: S.lat, lon: S.lon, name: S.name, species: S.species, includeNight: S.includeNight, legalMin: S.legalMin, layer: S.layer })); } catch (e) { /* ignore */ } }
  function saveSpots() { try { localStorage.setItem(LS_SPOTS, JSON.stringify(spots)); } catch (e) { /* ignore */ } }

  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }
  const colorFor = (s) => (s >= 70 ? '#4fc24b' : s >= 57 ? '#8dc63f' : s >= 44 ? '#c9c13a' : s >= 30 ? '#e0a030' : '#c4552f');
  const species = () => SP.byId[S.species];
  const opts = () => ({ includeNight: S.includeNight, legalMin: S.legalMin });
  const fmtT = (ms) => U.time(ms, data.tz);

  function dayScore(sp, date) {
    const k = sp.id + '|' + date + '|' + S.includeNight + '|' + S.legalMin;
    if (!scoreCache[k]) scoreCache[k] = M.scoreDay(sp, data, date, opts());
    return scoreCache[k];
  }

  /* --------------------------------------------------------------- location */
  let loadTimer = null;
  function setLocation(lat, lon, name, o) {
    o = o || {};
    S.lat = +lat; S.lon = +lon; S.name = name || ('Dropped pin'); save();
    updateLocUI();
    placeMarker(true, o.fly);
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => loadForecast(), o.immediate ? 0 : 350);
    if (!name || o.reverse) reverseName(S.lat, S.lon);
  }
  function updateLocUI() {
    $('#locName').textContent = S.name;
    $('#locCoord').textContent = S.lat.toFixed(3) + ', ' + S.lon.toFixed(3);
    $('#sheetName').textContent = S.name;
    $('#sheetCoord').textContent = S.lat.toFixed(4) + ', ' + S.lon.toFixed(4) + (data && data.elevation != null ? ' · ' + Math.round(data.elevation * 3.281) + ' ft' : '');
    $('#spotCurrent').textContent = 'Current: ' + S.name + ' (' + S.lat.toFixed(4) + ', ' + S.lon.toFixed(4) + ')';
    const fav = findSpot(S.lat, S.lon);
    $('#saveSpotBtn').textContent = fav ? '★ Saved' : '☆ Save spot';
  }
  async function reverseName(lat, lon) {
    const my = ++reverseName.id;
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&accept-language=en&lat=' + lat + '&lon=' + lon);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (my !== reverseName.id || !j.address) return;
      const a = j.address, place = a.city || a.town || a.village || a.hamlet || a.suburb || a.county || a.state_district;
      const st = (a['ISO3166-2-lvl4'] || '').split('-')[1] || a.state || a.country_code;
      if (place) { S.name = place + (st ? ', ' + st : ''); save(); updateLocUI(); }
    } catch (e) { /* offline: keep coordinates */ }
  }
  reverseName.id = 0;

  function gps(fromMap) {
    if (!('geolocation' in navigator)) { toast('GPS is not available in this browser.'); return; }
    toast('Finding you…', 8000);
    navigator.geolocation.getCurrentPosition((p) => {
      setLocation(p.coords.latitude, p.coords.longitude, 'My location', { fly: true, reverse: true, immediate: true });
      toast('Using your GPS location (±' + Math.round(p.coords.accuracy) + ' m)');
    }, (err) => {
      const why = err.code === 1 ? 'Location permission denied — allow it in browser/site settings.' : err.code === 3 ? 'GPS timed out — try again outdoors.' : 'Could not get your location.';
      toast(why, 4500);
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  }

  /* --------------------------------------------------------------- forecast */
  async function loadForecast() {
    const my = ++reqId;
    $('#loading').hidden = false; $('#errorBox').hidden = true; $('#refreshBtn').classList.add('spin');
    try {
      const r = await HC.Weather.load(S.lat, S.lon);
      if (my !== reqId) return;
      data = r.data; fetchedAt = r.fetchedAt; offline = r.offline; scoreCache = {};
      const today = U.dateKey(Date.now(), data.tz);
      const dates = availableDates();
      if (!selDate || dates.indexOf(selDate) < 0) selDate = dates.indexOf(today) >= 0 ? today : dates[0];
      $('#forecastBody').hidden = false;
      renderAll(true);
    } catch (e) {
      if (my !== reqId) return;
      console.error('forecast failed', e);
      const box = $('#errorBox');
      box.hidden = false;
      box.innerHTML = '<b>Couldn’t load the forecast.</b><br>' + U.esc(e.message || e) + '<br><span class="muted">Check your connection — HuntCast shows the last saved forecast when offline, but none is saved yet.</span><br><br><button class="btn" id="retryBtn">Try again</button>';
      $('#retryBtn').onclick = loadForecast;
      if (!data) $('#forecastBody').hidden = true;
    } finally {
      if (my === reqId) { $('#loading').hidden = true; $('#refreshBtn').classList.remove('spin'); }
    }
  }
  function availableDates() {
    const today = U.dateKey(Date.now(), data.tz), seen = [];
    data.hours.forEach((h) => { if (h.date >= today && seen.indexOf(h.date) < 0) seen.push(h.date); });
    return seen.slice(0, 14);
  }

  /* ---------------------------------------------------------------- render */
  function renderAll(newDay) {
    if (!data) return;
    cur = dayScore(species(), selDate);
    if (!cur) return;
    if (newDay || selHour == null || selHour >= cur.hours.length) {
      const el = cur.hours.filter((h) => h.eligible);
      const best = (el.length ? el : cur.hours).reduce((a, b) => (b.score > a.score ? b : a));
      selHour = cur.hours.indexOf(best);
    }
    renderBanner(); renderStrips(); renderRating(); renderChart(); renderHour(); renderAstro(); renderSparks(); renderRanking(); updateLocUI(); updateMapOverlay();
  }

  function renderBanner() {
    const b = $('#banner');
    if (offline) {
      b.hidden = false; b.className = 'banner';
      b.textContent = '📡 Offline — showing the forecast saved ' + new Date(fetchedAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + '. Numbers may be out of date.';
    } else if (Math.abs(data.requestedLat - data.lat) > 1 || Math.abs(data.requestedLon - data.lon) > 1) {
      b.hidden = false; b.className = 'banner bad'; b.textContent = 'Forecast location differs from the selected spot.';
    } else b.hidden = true;
  }

  function renderStrips() {
    const dates = availableDates(), today = U.dateKey(Date.now(), data.tz);
    $('#dateStrip').innerHTML = dates.map((d, i) => {
      const r = dayScore(species(), d), sc = r ? r.daily.score : 0;
      return '<button data-date="' + d + '" class="' + (d === selDate ? 'sel ' : '') + (i >= 7 ? 'far' : '') + '"><small>' + (d === today ? 'Today' : U.dayLabel(d)) + '</small><b>' + U.dayNum(d) + '</b><span class="dp" style="background:' + colorFor(sc) + '">' + sc + '</span></button>';
    }).join('');
    $('#speciesStrip').innerHTML = SP.list.map((s) => '<button data-sp="' + s.id + '" class="' + (s.id === S.species ? 'sel' : '') + '"><i>' + s.emoji + '</i>' + U.esc(s.name.replace(' / Waterfowl', '').replace(' / Boar', '')) + '</button>').join('');
    $('#dateTitle').textContent = (selDate === today ? 'Today · ' : '') + U.dayLabel(selDate, true) + (availableDates().indexOf(selDate) >= 7 ? ' · long-range (lower confidence)' : '');
    const sel = $('#dateStrip .sel'); if (sel) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
    const ss = $('#speciesStrip .sel'); if (ss && !renderStrips.done) { ss.scrollIntoView({ inline: 'center', block: 'nearest' }); renderStrips.done = true; }
  }

  function renderRating() {
    const d = cur.daily, sp = species();
    const ring = $('#ratingRing'); ring.style.setProperty('--c', colorFor(d.score)); ring.style.setProperty('--p', d.score);
    $('#ratingNum').textContent = d.score;
    $('#ratingLabel').textContent = d.label + ' day for ' + sp.name.split(' / ')[0];
    $('#ratingStars').textContent = '★'.repeat(d.stars) + '☆'.repeat(5 - d.stars);
    const a = cur.astro;
    const bits = [];
    bits.push('Avg ' + Math.round(cur.meanT) + '°F' + (cur.anom != null && Math.abs(cur.anom) >= 4 ? ' (' + Math.abs(Math.round(cur.anom)) + '° ' + (cur.anom < 0 ? 'below' : 'above') + ' normal)' : ''));
    bits.push(a.phaseIcon + ' ' + a.phaseName + ' ' + Math.round(a.illum * 100) + '%');
    if (cur.season.label) bits.push(cur.season.label);
    $('#ratingSub').textContent = bits.join(' · ');

    // windows
    const w = d.windows;
    $('#windowNote').textContent = S.includeNight ? '(incl. night)' : '(legal light only)';
    $('#windows').innerHTML = w.length ? w.map((x, i) => {
      const first = x.items[0], rel = '';
      const label = U.time(x.start, data.tz) + ' – ' + U.time(x.end, data.tz);
      return '<div class="win" style="border-left-color:' + colorFor(x.mean) + '"><div><b>' + (i === 0 ? '🏆 ' : '') + label + '</b><small>' + U.esc(x.items.reduce((a, b) => (b.score > a.score ? b : a)).why.slice(0, 3).join(' · ')) + '</small></div><span class="pill" style="background:' + colorFor(x.mean) + '">' + x.mean + '</span></div>';
    }).join('') : '<div class="muted">No standout window — activity looks low all day for this species.' + (sp.night && !S.includeNight ? ' (Night-active species: turn on “Include night”.)' : '') + '</div>';
    $('#drivers').innerHTML = d.drivers.map((x) => '<span class="drv ' + (x.pts >= 0 ? 'pos' : 'neg') + '"><b>' + (x.pts >= 0 ? '+' : '−') + Math.abs(x.pts).toFixed(0) + '</b> ' + U.esc(x.txt || x.name) + '</span>').join('');
    $('#nightToggle').checked = S.includeNight; $('#nightToggle2').checked = S.includeNight; $('#legalSel').value = String(S.legalMin);
  }

  /* ------------------------------------------------------------------ chart */
  function renderChart() {
    const cv = $('#chart'), W = cv.clientWidth || 360, H = 210, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const hrs = cur.hours, n = hrs.length, pL = 28, pR = 6, top = 22, bot = 38, pw = W - pL - pR, ph = H - top - bot, slot = pw / n;
    const t0 = hrs[0].t, span = n * HOUR, xT = (t) => pL + (t - t0) / span * pw, yS = (s) => top + ph * (1 - s / 100);
    // night / twilight shading
    hrs.forEach((r, i) => {
      const a = r.sunAlt; const al = a < -6 ? 0.5 : a < 0 ? 0.25 : 0;
      if (al) { g.fillStyle = 'rgba(8,14,38,' + al + ')'; g.fillRect(pL + i * slot, top, slot, ph); }
    });
    // grid
    g.font = '10px system-ui'; g.textBaseline = 'middle'; g.textAlign = 'right';
    [0, 25, 50, 75, 100].forEach((v) => { const y = yS(v); g.strokeStyle = v === 0 ? '#556647' : '#2c3a27'; g.lineWidth = 1; g.beginPath(); g.moveTo(pL, y); g.lineTo(W - pR, y); g.stroke(); g.fillStyle = '#7c8b6e'; g.fillText(v, pL - 4, y); });
    // bars
    hrs.forEach((r, i) => {
      const x = pL + i * slot + 1.5, bw = slot - 3, y = yS(r.score), h = yS(0) - y;
      g.globalAlpha = r.eligible ? 1 : 0.38; g.fillStyle = colorFor(r.score);
      roundRect(g, x, y, bw, Math.max(h, 1), 3); g.fill(); g.globalAlpha = 1;
      if (i === selHour) { g.strokeStyle = '#fff'; g.lineWidth = 2; roundRect(g, x - 1, y - 1, bw + 2, h + 2, 4); g.stroke(); }
    });
    // sunrise / sunset
    const a = cur.astro; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    [[a.sunrise, '☀↑'], [a.sunset, '☀↓']].forEach(([t, lab]) => {
      if (t == null) return; const x = xT(t); g.strokeStyle = '#ffd36b'; g.setLineDash([4, 3]); g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, top - 4); g.lineTo(x, top + ph); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#ffd36b'; g.font = '11px system-ui'; g.fillText(lab, Math.min(Math.max(x, pL + 12), W - 14), top - 8);
    });
    // solunar strip
    const sy = top + ph + 20;
    g.fillStyle = '#1a2417'; g.fillRect(pL, sy, pw, 9);
    a.minors.forEach((m) => band(g, xT(m.t - m.half), xT(m.t + m.half), sy, '#2d8c90', pL, W - pR));
    a.majors.forEach((m) => band(g, xT(m.t - m.half), xT(m.t + m.half), sy, '#46c4c9', pL, W - pR));
    g.font = '10px system-ui'; g.fillStyle = '#7c8b6e'; g.textAlign = 'left'; g.fillText('moon', 1, sy + 8);
    [[a.moonrise, '↑'], [a.moonset, '↓']].forEach(([arr, ar]) => arr.forEach((t) => { const x = xT(t); g.fillStyle = '#d7e8ff'; g.textAlign = 'center'; g.fillText('🌙' + ar, x, sy + 22); }));
    // x labels
    g.textAlign = 'center'; g.fillStyle = '#9aa88b'; g.font = '10px system-ui';
    hrs.forEach((r, i) => { if (i % 3 === 0) g.fillText(U.hourLabel(r.t, data.tz), pL + i * slot + slot / 2, top + ph + 13); });
    // now line
    const now = Date.now(); if (now >= t0 && now < t0 + span) { const x = xT(now); g.strokeStyle = '#ff7a1a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, top); g.lineTo(x, top + ph); g.stroke(); }
    // selected bubble
    const r = hrs[selHour]; if (r) {
      const x = pL + selHour * slot + slot / 2, y = yS(r.score) - 12; const txt = String(r.score);
      g.font = 'bold 12px system-ui'; const tw = g.measureText(txt).width + 10; g.fillStyle = '#fff'; roundRect(g, x - tw / 2, y - 9, tw, 18, 9); g.fill(); g.fillStyle = '#111'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(txt, x, y);
    }
    chartGeom = { pL, slot, n };
  }
  let chartGeom = null;
  function roundRect(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function band(g, x0, x1, y, col, minX, maxX) { x0 = Math.max(x0, minX); x1 = Math.min(x1, maxX); if (x1 <= x0) return; g.fillStyle = col; g.fillRect(x0, y, x1 - x0, 9); }
  function pickFromChart(e) {
    if (!chartGeom) return; const rect = $('#chart').getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - chartGeom.pL) / chartGeom.slot);
    if (i >= 0 && i < chartGeom.n && i !== selHour) setHour(i);
  }

  /* -------------------------------------------------------------- hour card */
  function setHour(i) {
    selHour = U.clamp(i, 0, cur.hours.length - 1);
    renderChart(); renderHour(); renderSparks(); updateMapOverlay();
  }
  const arrow = (d) => d <= -0.5 ? '↘ falling' : d >= 0.5 ? '↗ rising' : '→ steady';
  function renderHour() {
    const r = cur.hours[selHour], h = r.h, tz = data.tz;
    $('#hourTitle').textContent = U.time(r.t, tz) + ' – ' + U.time(r.t + HOUR, tz);
    $('#hourSub').textContent = M.ratingLabel(r.score) + ' · ' + (r.legal ? 'legal light' : 'outside legal light') + ' · sun ' + Math.round(r.sunAlt) + '°';
    const hs = $('#hourScore'); hs.textContent = r.score; hs.style.background = colorFor(r.score);
    $('#hourWhy').innerHTML = r.why.map((t) => '<span>' + U.esc(t) + '</span>').join('');
    const wx = [
      ['Temp', Math.round(h.temp) + '°F'], ['Wind', Math.round(h.wind) + ' mph ' + U.compass16(h.dir)], ['Gusts', Math.round(h.gust) + ' mph'],
      ['Pressure', U.hpaToInHg(h.press).toFixed(2) + ' inHg'], ['3 h trend', arrow(h.d3)], ['Humidity', Math.round(h.rh) + '%'],
      ['Cloud', Math.round(h.cloud) + '%'], ['Precip', U.mmToIn(h.precip).toFixed(2) + ' in · ' + Math.round(h.prob) + '%'], ['Visibility', Math.min(U.mToMi(h.vis), 15).toFixed(h.vis > 15000 ? 0 : 1) + (h.vis > 24000 ? '+' : '') + ' mi']
    ];
    $('#wxGrid').innerHTML = wx.map((x) => '<div class="wx"><small>' + x[0] + '</small><b>' + x[1] + '</b></div>').join('');
    drawCompass(h);
    const to = (h.dir + 180) % 360;
    $('#scentText').innerHTML = '🌬️ Wind from <b>' + U.compass16(h.dir) + '</b> at ' + Math.round(h.wind) + ' mph.<br>Your scent drifts toward <b>' + U.compass16(to) + '</b>.<br><span class="muted">Set up with the wind in your face — game approaching from the ' + U.compass16(h.dir) + ' side can’t smell you.' + scentExtra(h) + '</span>';
    const rows = [{ name: 'Time of day', pts: r.base, txt: r.todText, base: true }].concat(r.factors.filter((f) => Math.abs(f.pts) >= 0.3).sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts)));
    $('#factorList').innerHTML = rows.map((f) => {
      const wdt = Math.min(50, Math.abs(f.pts) * (f.base ? 0.5 : 2.2));
      return '<div class="fct"><span class="nm">' + f.name + '</span><div class="bar"><i class="' + (f.base ? 'p' : f.pts >= 0 ? 'p' : 'n') + '" style="width:' + wdt + '%;' + (f.base ? 'background:#6a8f3a' : '') + '"></i></div><span class="v" style="color:' + (f.base ? '#cfd8b9' : f.pts >= 0 ? '#8fe27d' : '#f0906f') + '">' + (f.base ? 'base ' + f.pts : (f.pts >= 0 ? '+' : '−') + Math.abs(f.pts).toFixed(1)) + '</span>' + (f.txt ? '<span class="t">' + U.esc(f.txt) + '</span>' : '') + '</div>';
    }).join('') + '<p class="muted tiny">Score = time-of-day base × weather/moon/season multiplier. Points show how much each factor adds or removes. Estimates only.</p>';
    $('#sheetHour').textContent = U.time(r.t, tz); $('#sheetScore').textContent = r.score; $('#sheetScore').style.background = colorFor(r.score);
    $('#sheetSpecies').textContent = species().emoji + ' ' + species().name;
    const sl = $('#hourSlider'); sl.max = cur.hours.length - 1; sl.value = selHour;
  }
  function scentExtra(h) {
    const bits = [];
    if (h.wind < 3) bits.push(' Light/swirling air: scent pools and shifts — play thermals (downhill in the evening, uphill in the morning).');
    if (h.rh >= 85 && h.wind < 8) bits.push(' High humidity holds scent close to the ground.');
    return bits.join('');
  }
  function drawCompass(h) {
    const to = (h.dir + 180) % 360;
    let s = '<circle r="54" fill="#121a10" stroke="#3b4d2a" stroke-width="2"/>';
    for (let a = 0; a < 360; a += 45) s += '<line x1="0" y1="-54" x2="0" y2="' + (a % 90 ? -49 : -46) + '" stroke="#657559" stroke-width="2" transform="rotate(' + a + ')"/>';
    s += '<text y="-36" text-anchor="middle" fill="#ff7a1a" font-size="12" font-weight="800">N</text><text x="40" y="4" text-anchor="middle" fill="#9aa88b" font-size="10">E</text><text y="48" text-anchor="middle" fill="#9aa88b" font-size="10">S</text><text x="-40" y="4" text-anchor="middle" fill="#9aa88b" font-size="10">W</text>';
    s += '<g transform="rotate(' + to + ')"><path d="M0,-32 L11,-8 L4,-8 L4,26 L-4,26 L-4,-8 L-11,-8 Z" fill="#ff7a1a" stroke="#1a1208" stroke-width="1.5"/></g>';
    s += '<circle r="3" fill="#121a10"/>';
    $('#compass').innerHTML = s;
  }

  /* ----------------------------------------------------------- sun and moon */
  function renderAstro() {
    const a = cur.astro, tz = data.tz;
    const list = (arr) => arr.length ? arr.map((t) => U.time(t, tz)).join(', ') : '—';
    const legal = cur.legalStart > -1e15 ? U.time(cur.legalStart, tz) + ' – ' + U.time(cur.legalEnd, tz) : 'all day';
    const cells = [
      ['Sunrise', fmtT(a.sunrise)], ['Sunset', fmtT(a.sunset)],
      ['First light (civil)', fmtT(a.dawn)], ['Last light (civil)', fmtT(a.dusk)],
      ['Legal light (est.)', legal], ['Daylight', a.sunrise && a.sunset ? Math.floor((a.sunset - a.sunrise) / HOUR) + ' h ' + Math.round(((a.sunset - a.sunrise) % HOUR) / 60000) + ' m' : '—'],
      ['Moon phase', a.phaseIcon + ' ' + a.phaseName], ['Illumination', Math.round(a.illum * 100) + '%'],
      ['Moonrise', list(a.moonrise)], ['Moonset', list(a.moonset)],
      ['Moon overhead', list(a.overhead)], ['Moon underfoot', list(a.underfoot)]
    ];
    $('#astroGrid').innerHTML = cells.map((c) => '<div class="wx"><small>' + c[0] + '</small><b>' + c[1] + '</b></div>').join('');
    const per = [];
    a.majors.concat(a.minors).filter((m) => m.t + m.half > cur.hours[0].t && m.t - m.half < cur.hours[cur.hours.length - 1].t + HOUR).sort((x, y) => x.t - y.t).forEach((m) => {
      per.push('<div><span>' + (m.half > 40 * 60000 ? '<b>Major</b> (moon ' + m.kind + ')' : 'Minor (' + m.kind + ')') + '</span><span>' + U.time(m.t - m.half, tz) + ' – ' + U.time(m.t + m.half, tz) + '</span></div>');
    });
    $('#solunar').innerHTML = '<h4>Solunar periods</h4>' + (per.join('') || '<div class="muted">None today.</div>') + '<p class="muted tiny">Solunar theory is popular but scientifically unproven — it carries a small weight in the score.</p>';
  }

  /* ----------------------------------------------------------- sparklines */
  function renderSparks() {
    const hrs = cur.hours.map((r) => r.h);
    spark('#spTemp', hrs.map((h) => h.temp), { fmt: (v) => Math.round(v) + '°', color: '#ff9a4a', unit: '°F' });
    spark('#spPress', hrs.map((h) => U.hpaToInHg(h.press)), { fmt: (v) => v.toFixed(2), color: '#6ec0ff', dec: 2 });
    spark('#spWind', hrs.map((h) => h.wind), { fmt: (v) => Math.round(v), color: '#b9e07a', second: hrs.map((h) => h.gust), min0: true });
    spark('#spRain', hrs.map((h) => U.mmToIn(h.precip)), { bars: true, color: '#6ea8ff', fmt: (v) => v.toFixed(2), min0: true, probs: hrs.map((h) => h.prob) });
    const h0 = cur.hours[selHour].h;
    $('#spTempVal').textContent = Math.round(h0.temp) + '°F';
    $('#spPressVal').textContent = U.hpaToInHg(h0.press).toFixed(2) + ' inHg ' + arrow(h0.d3).split(' ')[0];
    $('#spWindVal').textContent = Math.round(h0.wind) + ' mph, gusts ' + Math.round(h0.gust);
    const tot = hrs.reduce((s, h) => s + h.precip, 0), pmax = Math.max.apply(null, hrs.map((h) => h.prob));
    $('#spRainVal').textContent = U.mmToIn(tot).toFixed(2) + ' in total · up to ' + Math.round(pmax) + '% chance';
  }
  function spark(sel, vals, o) {
    const cv = $(sel), W = cv.clientWidth || 340, H = +cv.getAttribute('height'), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const all = o.second ? vals.concat(o.second) : vals;
    let lo = Math.min.apply(null, all), hi = Math.max.apply(null, all); if (o.min0) lo = 0;
    if (hi - lo < (o.dec ? 0.06 : 4)) { const m = (hi + lo) / 2; lo = m - (o.dec ? 0.03 : 2); hi = m + (o.dec ? 0.03 : 2); }
    const pL = 34, pR = 6, pT = 8, pB = 16, pw = W - pL - pR, ph = H - pT - pB, n = vals.length;
    const x = (i) => pL + (i + 0.5) / n * pw, y = (v) => pT + ph * (1 - (v - lo) / (hi - lo));
    g.strokeStyle = '#2c3a27'; g.fillStyle = '#7c8b6e'; g.font = '10px system-ui'; g.textAlign = 'right'; g.textBaseline = 'middle';
    [lo, (lo + hi) / 2, hi].forEach((v) => { g.beginPath(); g.moveTo(pL, y(v)); g.lineTo(W - pR, y(v)); g.stroke(); g.fillText(o.fmt(v), pL - 4, y(v)); });
    cur.hours.forEach((r, i) => { if (r.sunAlt < -6) { g.fillStyle = 'rgba(8,14,38,.4)'; g.fillRect(pL + i / n * pw, pT, pw / n, ph); } });
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#7c8b6e';
    cur.hours.forEach((r, i) => { if (i % 6 === 0) g.fillText(U.hourLabel(r.t, data.tz), x(i), H - 3); });
    if (o.bars) {
      vals.forEach((v, i) => { if (v > 0) { g.fillStyle = o.color; const hh = Math.max(2, y(0) - y(v)); g.fillRect(x(i) - pw / n / 2 + 1, y(0) - hh, pw / n - 2, hh); } });
      g.strokeStyle = '#ffffff55'; g.setLineDash([3, 3]); g.beginPath(); o.probs.forEach((p, i) => { const yy = pT + ph * (1 - p / 100); i ? g.lineTo(x(i), yy) : g.moveTo(x(i), yy); }); g.stroke(); g.setLineDash([]);
    } else {
      if (o.second) { g.strokeStyle = '#6a8f3a'; g.lineWidth = 1.5; g.beginPath(); o.second.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v)))); g.stroke(); }
      g.strokeStyle = o.color; g.lineWidth = 2.5; g.lineJoin = 'round'; g.beginPath(); vals.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v)))); g.stroke();
    }
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x(selHour), pT); g.lineTo(x(selHour), pT + ph); g.stroke();
    if (!o.bars) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x(selHour), y(vals[selHour]), 4, 0, 7); g.fill(); }
  }

  function renderRanking() {
    const rows = SP.list.map((s) => ({ s, r: dayScore(s, selDate) })).filter((x) => x.r).sort((a, b) => b.r.daily.score - a.r.daily.score);
    $('#ranking').innerHTML = rows.map((x) => '<button class="rk ' + (x.s.id === S.species ? 'sel' : '') + '" data-sp="' + x.s.id + '"><span style="font-size:1.4rem">' + x.s.emoji + '</span><span>' + U.esc(x.s.name) + '</span><span class="bar"><i style="width:' + x.r.daily.score + '%;background:' + colorFor(x.r.daily.score) + '"></i></span><b>' + x.r.daily.score + '</b></button>').join('');
  }

  /* -------------------------------------------------------------------- map */
  let map = null, marker = null, coneLayer = null, layersCtl = null;
  function initMap() {
    if (map) return;
    const PIN = L.icon({ iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAApCAYAAADAk4LOAAAFgUlEQVR4Aa1XA5BjWRTN2oW17d3YaZtr2962HUzbDNpjszW24mRt28p47v7zq/bXZtrp/lWnXr337j3nPCe85NcypgSFdugCpW5YoDAMRaIMqRi6aKq5E3YqDQO3qAwjVWrD8Ncq/RBpykd8oZUb/kaJutow8r1aP9II0WmLKLIsJyv1w/kqw9Ch2MYdB++12Onxee/QMwvf4/Dk/Lfp/i4nxTXtOoQ4pW5Aj7wpici1A9erdAN2OH64x8OSP9j3Ft3b7aWkTg/Fm91siTra0f9on5sQr9INejH6CUUUpavjFNq1B+Oadhxmnfa8RfEmN8VNAsQhPqF55xHkMzz3jSmChWU6f7/XZKNH+9+hBLOHYozuKQPxyMPUKkrX/K0uWnfFaJGS1QPRtZsOPtr3NsW0uyh6NNCOkU3Yz+bXbT3I8G3xE5EXLXtCXbbqwCO9zPQYPRTZ5vIDXD7U+w7rFDEoUUf7ibHIR4y6bLVPXrz8JVZEql13trxwue/uDivd3fkWRbS6/IA2bID4uk0UpF1N8qLlbBlXs4Ee7HLTfV1j54APvODnSfOWBqtKVvjgLKzF5YdEk5ewRkGlK0i33Eofffc7HT56jD7/6U+qH3Cx7SBLNntH5YIPvODnyfIXZYRVDPqgHtLs5ABHD3YzLuespb7t79FY34DjMwrVrcTuwlT55YMPvOBnRrJ4VXTdNnYug5ucHLBjEpt30701A3Ts+HEa73u6dT3FNWwflY86eMHPk+Yu+i6pzUpRrW7SNDg5JHR4KapmM5Wv2E8Tfcb1HoqqHMHU+uWDD7zg54mz5/2BSnizi9T1Dg4QQXLToGNCkb6tb1NU+QAlGr1++eADrzhn/u8Q2YZhQVlZ5+CAOtqfbhmaUCS1ezNFVm2imDbPmPng5wmz+gwh+oHDce0eUtQ6OGDIyR0uUhUsoO3vfDmmgOezH0mZN59x7MBi++WDL1g/eEiU3avlidO671bkLfwbw5XV2P8Pzo0ydy4t2/0eu33xYSOMOD8hTf4CrBtGMSoXfPLchX+J0ruSePw3LZeK0juPJbYzrhkH0io7B3k164hiGvawhOKMLkrQLyVpZg8rHFW7E2uHOL888IBPlNZ1FPzstSJM694fWr6RwpvcJK60+0HCILTBzZLFNdtAzJaohze60T8qBzyh5ZuOg5e7uwQppofEmf2++DYvmySqGBuKaicF1blQjhuHdvCIMvp8whTTfZzI7RldpwtSzL+F1+wkdZ2TBOW2gIF88PBTzD/gpeREAMEbxnJcaJHNHrpzji0gQCS6hdkEeYt9DF/2qPcEC8RM28Hwmr3sdNyht00byAut2k3gufWNtgtOEOFGUwcXWNDbdNbpgBGxEvKkOQsxivJx33iow0Vw5S6SVTrpVq11ysA2Rp7gTfPfktc6zhtXBBC+adRLshf6sG2RfHPZ5EAc4sVZ83yCN00Fk/4kggu40ZTvIEm5g24qtU4KjBrx/BTTH8ifVASAG7gKrnWxJDcU7x8X6Ecczhm3o6YicvsLXWfh3Ch1W0k8x0nXF+0fFxgt4phz8QvypiwCCFKMqXCnqXExjq10beH+UUA7+nG6mdG/Pu0f3LgFcGrl2s0kNNjpmoJ9o4B29CMO8dMT4Q5ox8uitF6fqsrJOr8qnwNbRzv6hSnG5wP+64C7h9lp30hKNtKdWjtdkbuPA19nJ7Tz3zR/ibgARbhb4AlhavcBebmTHcFl2fvYEnW0ox9xMxKBS8btJ+KiEbq9zA4RthQXDhPa0T9TEe69gWupwc6uBUphquXgf+/FrIjweHQS4/pduMe5ERUMHUd9xv8ZR98CxkS4F2n3EUrUZ10EYNw7BWm9x1GiPssi3GgiGRDKWRYZfXlON+dfNbM+GgIwYdwAAAAASUVORK5CYII=', iconRetinaUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAABSCAMAAAAhFXfZAAAC91BMVEVMaXEzeak2f7I4g7g3g7cua5gzeKg8hJo3grY4g7c3grU0gLI2frE0daAubJc2gbQwd6QzeKk2gLMtd5sxdKIua5g1frA2f7IydaM0e6w2fq41fK01eqo3grgubJgta5cxdKI1f7AydaQydaMxc6EubJgvbJkwcZ4ubZkwcJwubZgubJcydqUydKIxapgubJctbJcubZcubJcvbJYubJcvbZkubJctbJctbZcubJg2f7AubJcrbZcubJcubJcua5g3grY0fq8ubJcubJdEkdEwhsw6i88vhswuhcsuhMtBjMgthMsrg8srgss6is8qgcs8i9A9iMYtg8spgcoogMo7hcMngMonf8olfso4gr8kfck5iM8jfMk4iM8he8k1fro7itAgesk2hs8eecgzfLcofssdeMg0hc4cd8g2hcsxeLQbdsgZdcgxeLImfcszhM0vda4xgckzhM4xg84wf8Yxgs4udKsvfcQucqhUndROmdM1fK0wcZ8vb5w0eqpQm9MzeKhXoNVcpdYydKNWn9VZotVKltJFjsIwcJ1Rms9OlslLmtH///8+kc9epdYzd6dbo9VHkMM2f7FHmNBClM8ydqVcpNY9hro3gLM9hLczealQmcw3fa46f7A8gLMxc6I3eagyc6FIldJMl9JSnNRSntNNl9JPnNJFi75UnM9ZodVKksg8kM45jc09e6ZHltFBk883gbRBh7pDk9EwcaBzn784g7dKkcY2i81Om9M7j85Llc81is09g7Q4grY/j9A0eqxKmdFFltBEjcXf6fFImdBCiLxJl9FGlNFBi78yiMxVndEvbpo6js74+vx+psPP3+o/ks5HkcpGmNCjwdZCkNDM3ehYoNJEls+lxNkxh8xHks0+jdC1zd5Lg6r+/v/H2ufz9/o3jM3t8/edvdM/k89Th61OiLBSjbZklbaTt9BfptdjmL1AicBHj8hGk9FAgK1dkLNTjLRekrdClc/k7fM0icy0y9tgp9c4jc2NtM9Dlc8zicxeXZn3AAAAQ3RSTlMAHDdTb4yPA+LtnEQmC4L2EmHqB7XA0d0sr478x4/Yd5i1zOfyPkf1sLVq4Nh3FvjxopQ2/STNuFzUwFIwxKaejILpIBEV9wAABhVJREFUeF6s1NdyFEcY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', shadowUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACkAAAApCAQAAAACach9AAACMUlEQVR4Ae3ShY7jQBAE0Aoz/f9/HTMzhg1zrdKUrJbdx+Kd2nD8VNudfsL/Th///dyQN2TH6f3y/BGpC379rV+S+qqetBOxImNQXL8JCAr2V4iMQXHGNJxeCfZXhSRBcQMfvkOWUdtfzlLgAENmZDcmo2TVmt8OSM2eXxBp3DjHSMFutqS7SbmemzBiR+xpKCNUIRkdkkYxhAkyGoBvyQFEJEefwSmmvBfJuJ6aKqKWnAkvGZOaZXTUgFqYULWNSHUckZuR1HIIimUExutRxwzOLROIG4vKmCKQt364mIlhSyzAf1m9lHZHJZrlAOMMztRRiKimp/rpdJDc9Awry5xTZCte7FHtuS8wJgeYGrex28xNTd086Dik7vUMscQOa8y4DoGtCCSkAKlNwpgNtphjrC6MIHUkR6YWxxs6Sc5xqn222mmCRFzIt8lEdKx+ikCtg91qS2WpwVfBelJCiQJwvzixfI9cxZQWgiSJelKnwBElKYtDOb2MFbhmUigbReQBV0Cg4+qMXSxXSyGUn4UbF8l+7qdSGnTC0XLCmahIgUHLhLOhpVCtw4CzYXvLQWQbJNmxoCsOKAxSgBJno75avolkRw8iIAFcsdc02e9iyCd8tHwmeSSoKTowIgvscSGZUOA7PuCN5b2BX9mQM7S0wYhMNU74zgsPBj3HU7wguAfnxxjFQGBE6pwN+GjME9zHY7zGp8wVxMShYX9NXvEWD3HbwJf4giO4CFIQxXScH1/TM+04kkBiAAAAAElFTkSuQmCC', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], tooltipAnchor: [16, -28], shadowSize: [41, 41] });
    map = L.map('map', { zoomControl: false, tap: true }).setView([S.lat, S.lon], 12);
    const base = {
      'OpenStreetMap': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }),
      'Satellite (Esri)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }),
      'Topo (OpenTopoMap)': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, subdomains: 'abc', attribution: '© OpenTopoMap (CC-BY-SA), © OpenStreetMap' })
    };
    (base[S.layer] || base.OpenStreetMap).addTo(map);
    layersCtl = L.control.layers(base, null, { position: 'topright', collapsed: true }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    map.on('baselayerchange', (e) => { S.layer = e.name; save(); });
    coneLayer = L.layerGroup().addTo(map);
    marker = L.marker([S.lat, S.lon], { icon: PIN, draggable: true, title: 'Hunting spot' }).addTo(map);
    marker.on('dragend', () => { const p = marker.getLatLng(); setLocation(p.lat, p.lng, null, {}); });
    map.on('click', (e) => setLocation(e.latlng.lat, e.latlng.lng, null, {}));
    updateMapOverlay();
  }
  function placeMarker(fit, fly) {
    if (!map) return;
    marker.setLatLng([S.lat, S.lon]);
    updateMapOverlay();
    if (fly) fitCone(true);
  }
  let coneBounds = null, mapFitted = false;
  function fitCone(animate) {
    if (!map || !coneBounds) return;
    map.invalidateSize();
    map.fitBounds(coneBounds.pad(0.25), { maxZoom: 15, animate: !!animate, paddingTopLeft: [24, 70], paddingBottomRight: [24, 250] });
  }
  function updateMapOverlay() {
    if (!map || !cur) return;
    coneLayer.clearLayers();
    const h = cur.hours[selHour].h, to = (h.dir + 180) % 360, v = h.wind;
    const len = v < 2 ? 120 : U.clamp(100 + 55 * v, 150, 1100);
    const half = (v < 3 ? 60 : v < 6 ? 35 : 22) + (h.gust - v > 10 ? 8 : 0);
    const poly = (r, ang, op, wt) => {
      const pts = [[S.lat, S.lon]];
      
      for (let a = -ang; a <= ang; a += 4) pts.push(U.dest(S.lat, S.lon, to + a, r));
      return L.polygon(pts, { color: '#ff7a1a', weight: wt, fillColor: '#ff7a1a', fillOpacity: op, interactive: false });
    };
    if (v < 2) L.circle([S.lat, S.lon], { radius: len, color: '#ff7a1a', weight: 2, fillOpacity: 0.22, interactive: false }).addTo(coneLayer);
    else { poly(len, half + 12, 0.14, 1).addTo(coneLayer); poly(len * 0.55, half, 0.3, 2).addTo(coneLayer); }
    const tip = U.dest(S.lat, S.lon, to, len * 1.04);
    coneBounds = L.latLngBounds([[S.lat, S.lon], tip, U.dest(S.lat, S.lon, to - half - 12, len), U.dest(S.lat, S.lon, to + half + 12, len)]);
    L.polyline([[S.lat, S.lon], tip], { color: '#ffffff', weight: 3, dashArray: '2 6', interactive: false }).addTo(coneLayer);
    L.marker(tip, { interactive: false, icon: L.divIcon({ className: '', html: '<div class="scent-label">scent → ' + U.compass16(to) + ' · ' + Math.round(v) + ' mph</div>', iconSize: [0, 0] }) }).addTo(coneLayer);
    $('#sheetScent').textContent = 'Wind from ' + U.compass16(h.dir) + ' (' + Math.round(h.wind) + ' mph, gusts ' + Math.round(h.gust) + '). Scent travels ' + U.compass16(to) + ' — keep bedding/food sides ' + U.compass16(h.dir) + ' of your stand.';
  }

  /* ------------------------------------------------------------ search/geocode */
  async function search(q) {
    q = q.trim(); if (!q) return;
    const m = q.match(/^(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) { setLocation(+m[1], +m[2], null, { fly: true, immediate: true, reverse: true }); return; }
    const ul = $('#searchResults'); ul.hidden = false; ul.innerHTML = '<li>Searching…</li>';
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=en&q=' + encodeURIComponent(q));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const list = await r.json();
      if (!list.length) { ul.innerHTML = '<li>No places found. Try a nearby town or paste “lat, lon”.</li>'; return; }
      ul.innerHTML = list.map((p, i) => '<li data-i="' + i + '">' + U.esc(p.display_name) + '</li>').join('');
      ul.onclick = (e) => {
        const li = e.target.closest('li[data-i]'); if (!li) return; const p = list[+li.dataset.i];
        const parts = p.display_name.split(', '); const nm = parts[0] + (parts.length > 2 ? ', ' + parts[parts.length - 3 >= 1 ? parts.length - 3 : 1] : '');
        ul.hidden = true; $('#searchInput').blur();
        setLocation(+p.lat, +p.lon, p.name || parts[0], { fly: true, immediate: true });
        if (p.boundingbox && map) map.fitBounds([[+p.boundingbox[0], +p.boundingbox[2]], [+p.boundingbox[1], +p.boundingbox[3]]], { maxZoom: 13 });
      };
    } catch (e) { ul.innerHTML = '<li>Search unavailable' + (navigator.onLine ? '' : ' (offline)') + '. You can still tap the map or paste “lat, lon”.</li>'; }
  }

  /* ------------------------------------------------------------------ spots */
  function findSpot(lat, lon) { return spots.find((s) => Math.abs(s.lat - lat) < 0.0015 && Math.abs(s.lon - lon) < 0.0015); }
  function renderSpots() {
    $('#spotEmpty').hidden = spots.length > 0;
    $('#spotList').innerHTML = spots.map((s) => '<div class="spot' + (findSpot(S.lat, S.lon) === s ? ' cur' : '') + '" data-id="' + s.id + '"><div class="nm"><b>' + U.esc(s.name) + '</b><span class="muted tiny">' + s.lat.toFixed(4) + ', ' + s.lon.toFixed(4) + '</span></div><button class="ren" aria-label="Rename">✏️</button><button class="del" aria-label="Delete">🗑️</button><button class="use">Hunt here</button></div>').join('');
  }
  function saveSpot(name) {
    const ex = findSpot(S.lat, S.lon);
    if (ex) { toast('Already saved as “' + ex.name + '”'); return; }
    spots.unshift({ id: 's' + Date.now().toString(36), name: (name || S.name).slice(0, 60), lat: +S.lat.toFixed(5), lon: +S.lon.toFixed(5), created: Date.now() });
    saveSpots(); renderSpots(); updateLocUI(); toast('★ Spot saved');
  }

  /* ------------------------------------------------------------------- info */
  function renderInfo() {
    $('#howScores').innerHTML = `
<p><b>These are estimates, not guarantees.</b> HuntCast turns the forecast, sun, moon and season into a 0–100 score for each hour. It uses simple, widely known hunting rules of thumb — it is <i>not</i> trained on animal GPS data and cannot see food sources, hunting pressure or terrain. Use it to pick promising days and hours, then trust your scouting.</p>
<p><code>score = 100 × time-of-day × multiplier × 0.55</code></p>
<details open><summary>1 · Time of day (the biggest factor)</summary>
<p>Each species has an activity level for <b>dawn</b>, <b>day</b>, <b>dusk</b> and <b>night</b> (deer, bear, coyotes and waterfowl peak near first and last light; turkeys are roosted at night; hogs and foxes are mostly nocturnal). The sun’s position blends these smoothly through the day. Heat shifts activity toward night and shade, very cold weather pushes feeding into midday, and the rut shifts bucks and bulls into daytime movement.</p></details>
<details><summary>2 · Pressure trend</summary>
<p>A <b>falling barometer</b> ahead of a front is the classic movement trigger (strongest effect). A steady high or a rising barometer after the front clears is mildly good. Very low pressure (storm) is penalised.</p></details>
<details><summary>3 · Temperature</summary>
<p>Each species has a comfort band; outside it the score falls. Colder than normal for the date helps cold-loving game (deer, elk, moose, waterfowl); hot spells hurt. “Normal” comes from the last 3 years of observed weather at your spot.</p></details>
<details><summary>4 · Wind</summary>
<p>Each species has an ideal speed band: light breezes for deer, near-calm for turkey and small game, and 8–20 mph for ducks and geese. Strong wind and big gusts cut movement. Wind direction drives the <b>scent cone</b> on the map.</p></details>
<details><summary>5 · Rain, snow, clouds, fog</summary>
<p>Light rain is neutral to slightly good; steady or heavy precipitation is bad (waterfowl tolerate it). The first dry hours after a soaking rain get a bonus. Overcast sky lengthens daytime movement for most species. Fog/low visibility lowers success.</p></details>
<details><summary>6 · Fronts &amp; cold snaps</summary>
<p>Detected from the 24-hour pressure drop and temperature change. It matters most for <b>ducks and geese</b>, where cold fronts with north-west wind push migrating birds.</p></details>
<details><summary>7 · Moon &amp; solunar</summary>
<p><b>Major</b> periods (moon overhead/underfoot, ±1 h) and <b>minor</b> periods (moonrise/moonset, ±30 min) add a small bonus, larger near new and full moon. Bright moonlit nights can shift deer, hogs and predators to night activity and dampen daytime movement. The solunar idea is popular but not scientifically proven, so it has a small weight.</p></details>
<details><summary>8 · Season</summary>
<p>Rut timing (whitetail ~Nov 12, shifted later in the South; mule deer ~Nov 20; elk ~Sep 22; moose ~Oct 1; pronghorn ~Sep 20), spring gobbling for turkey, fall feeding and denning for bear, migration for waterfowl, and breeding season for coyote/fox.</p></details>
<details><summary>Daily rating &amp; best windows</summary>
<p>The daily rating is the average of the 4 best hours during legal shooting light (default: 30 minutes before sunrise to 30 minutes after sunset — <b>check your state’s rules</b>). Best windows are runs of hours scoring within 80% of the day’s peak. Ratings: 70+ Excellent, 57+ Very good, 44+ Good, 30+ Fair.</p></details>
<details><summary>Forecast limits</summary>
<p>Days 8–14 use long-range forecasts with much lower accuracy. Wind is measured 10 m above ground; wind in timber is lighter and swirls with terrain.</p></details>`;
    const rows = SP.list.map((s) => {
      const t = s.tod, peak = (() => { const e = [['dawn', t.dawn], ['dusk', t.dusk], ['midday', t.day], ['night', t.night]].sort((a, b) => b[1] - a[1]); return e[0][0] + (e[1][1] >= e[0][1] - 0.1 ? ' & ' + e[1][0] : ''); })();
      return '<tr><td>' + s.emoji + ' <b>' + U.esc(s.name) + '</b></td><td>' + peak + '</td><td>' + s.temp.lo + '–' + s.temp.hi + '°F</td><td>' + s.wind.lo + '–' + s.wind.hi + ' mph</td></tr><tr><td colspan="4" class="muted">' + U.esc(s.tip) + '</td></tr>';
    }).join('');
    $('#speciesTable').innerHTML = '<table><tr><th>Species</th><th>Peaks</th><th>Temp</th><th>Wind</th></tr>' + rows + '</table>';
    $('#versionLine').textContent = 'HuntCast v' + VERSION;
  }

  /* ------------------------------------------------------------------ views */
  function showView(v) {
    $$('.view').forEach((x) => x.classList.toggle('active', x.id === 'view-' + v));
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    if (v === 'map') { initMap(); setTimeout(() => { sheetH(); map.invalidateSize(); if (!mapFitted) { mapFitted = true; updateMapOverlay(); if (coneBounds) fitCone(false); else map.setView([S.lat, S.lon], 14); } }, 60); }
    if (v === 'spots') renderSpots();
    if (v === 'forecast' && cur) setTimeout(() => { renderChart(); renderSparks(); }, 30);
    history.replaceState(null, '', '#' + v);
  }
  function sheetH() { const s = $('#mapSheet'); document.documentElement.style.setProperty('--sheet-h', s.offsetHeight + 'px'); }

  /* ----------------------------------------------------------------- events */
  function bind() {
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
    $('#locChip').onclick = () => { showView('map'); setTimeout(() => $('#searchInput').focus(), 150); };
    $('#refreshBtn').onclick = () => { scoreCache = {}; loadForecast(); };
    $('#gpsBtn').onclick = () => gps(); $('#mapLocate').onclick = () => gps(true);
    $('#dateStrip').addEventListener('click', (e) => { const b = e.target.closest('button[data-date]'); if (!b) return; selDate = b.dataset.date; renderAll(true); });
    const pickSp = (e) => { const b = e.target.closest('[data-sp]'); if (!b) return; S.species = b.dataset.sp; save(); renderAll(false); if (e.currentTarget.id === 'ranking') window.scrollTo(0, 0), $('#view-forecast').scrollTo({ top: 0, behavior: 'smooth' }); };
    $('#speciesStrip').addEventListener('click', pickSp); $('#ranking').addEventListener('click', pickSp);
    const night = (v) => { S.includeNight = v; save(); scoreCache = {}; renderAll(false); };
    $('#nightToggle').onchange = (e) => night(e.target.checked); $('#nightToggle2').onchange = (e) => night(e.target.checked);
    $('#legalSel').onchange = (e) => { S.legalMin = +e.target.value; save(); scoreCache = {}; renderAll(false); };
    const cv = $('#chart');
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pickFromChart(e); });
    cv.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') pickFromChart(e); });
    $('#hourSlider').addEventListener('input', (e) => setHour(+e.target.value));
    $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); search($('#searchInput').value); });
    $('#saveSpotBtn').onclick = () => { if (findSpot(S.lat, S.lon)) toast('Already in your saved spots'); else saveSpot(); };
    $('#spotSave').onclick = () => { saveSpot($('#spotName').value.trim()); $('#spotName').value = ''; };
    $('#spotList').addEventListener('click', (e) => {
      const el = e.target.closest('.spot'); if (!el) return; const s = spots.find((x) => x.id === el.dataset.id); if (!s) return;
      if (e.target.closest('.use')) { setLocation(s.lat, s.lon, s.name, { fly: true, immediate: true }); showView('forecast'); }
      else if (e.target.closest('.del')) { if (confirm('Delete “' + s.name + '”?')) { spots = spots.filter((x) => x !== s); saveSpots(); renderSpots(); updateLocUI(); } }
      else if (e.target.closest('.ren')) { const n = prompt('Rename spot', s.name); if (n && n.trim()) { s.name = n.trim().slice(0, 60); saveSpots(); renderSpots(); } }
    });
    $('#clearBtn').onclick = async () => {
      if (!confirm('Clear saved spots, settings, cached forecast and offline map tiles?')) return;
      localStorage.clear(); if (window.caches) (await caches.keys()).forEach((k) => caches.delete(k));
      toast('Cleared. Reloading…'); setTimeout(() => location.reload(), 600);
    };
    document.addEventListener('click', (e) => { if (!e.target.closest('.map-search')) $('#searchResults').hidden = true; });
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (cur && $('#view-forecast').classList.contains('active')) { renderChart(); renderSparks(); } if (map) { map.invalidateSize(); sheetH(); } }, 120); });
    window.addEventListener('online', () => { if (offline) loadForecast(); });
    let deferred; window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
    $('#installBtn').onclick = async () => { if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; } };
    window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('HuntCast installed'); });
  }

  /* ------------------------------------------------------------------- init */
  function init() {
    bind(); renderInfo(); renderSpots(); updateLocUI();
    const v = (location.hash || '').slice(1);
    if (['forecast', 'map', 'spots', 'info'].indexOf(v) > 0) showView(v);
    // Query params: ?lat=..&lon=..&sp=..  (handy for testing / sharing)
    const q = new URLSearchParams(location.search);
    if (q.get('sp') && SP.byId[q.get('sp')]) S.species = q.get('sp');
    if (q.get('lat') && q.get('lon')) { S.lat = +q.get('lat'); S.lon = +q.get('lon'); S.name = q.get('name') || 'Custom location'; }
    // If location permission was already granted earlier and no saved place, offer to use it silently
    loadForecast();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
    }
  }
  document.addEventListener('DOMContentLoaded', init);
  HC.app = { S, get data() { return data; }, get cur() { return cur; }, setLocation, showView, setHour, gps };
})(window.HC = window.HC || {});
