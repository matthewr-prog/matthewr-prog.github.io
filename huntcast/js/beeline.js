/* HuntCast — Beeline navigator: straight-line (great-circle) path from you to a saved spot.
   Ignores roads, trails and obstacles. Compass arrow + live distance/bearing. Vanilla JS. */
(function (HC) {
  'use strict';
  const R_EARTH = 6371008.8; // mean earth radius, metres
  const toRad = (d) => d * Math.PI / 180, toDeg = (r) => r * 180 / Math.PI;
  const norm360 = (d) => ((d % 360) + 360) % 360;
  const CARD = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const cardinal = (b) => CARD[Math.round(norm360(b) / 22.5) % 16];
  const ARRIVE_M = 20, LEAVE_M = 35;

  /* great-circle distance (m) and initial bearing (deg from true north) */
  function calc(lat1, lon1, lat2, lon2) {
    const p1 = toRad(lat1), p2 = toRad(lat2), dp = p2 - p1, dl = toRad(lon2 - lon1);
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    const dist = 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
    const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return { dist: dist, bearing: norm360(toDeg(Math.atan2(y, x))) };
  }
  /* { main, sub } display strings. >= 0.1 mi: miles (yards below); closer: yards (feet below). */
  function fmtDist(m) {
    const mi = m / 1609.344, yd = m / 0.9144, ft = m / 0.3048;
    if (mi >= 10) return { main: mi.toFixed(1) + ' mi', sub: '' };
    if (mi >= 0.1) return { main: mi.toFixed(2) + ' mi', sub: Math.round(yd).toLocaleString() + ' yd' };
    return { main: Math.round(yd) + ' yd', sub: Math.round(ft) + ' ft' };
  }
  const bearingText = (b) => cardinal(b) + ' ' + Math.round(norm360(b)) + '°';

  /* ---------------------------------------------------------------- state */
  let st = null; // active session
  let ov = null, bar = null;
  const $ = (s) => ov.querySelector(s);

  function build() {
    ov = document.createElement('div'); ov.id = 'beeline'; ov.className = 'bl'; ov.hidden = true;
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Beeline navigator');
    ov.innerHTML =
      '<div class="bl-top"><b>🧭 Beeline</b><span class="muted tiny">straight line · ignores roads &amp; trails</span><button class="bl-x" id="blClose" aria-label="Close beeline">✕</button></div>' +
      '<div class="bl-name" id="blName"></div><div class="muted tiny bl-coords" id="blCoords"></div>' +
      '<div class="bl-dial"><svg id="blArrow" viewBox="-100 -100 200 200" aria-hidden="true">' +
      '<circle r="94" fill="#10170e" stroke="#3b4d2a" stroke-width="3"/>' +
      '<g id="blRose" fill="#9fb48a" font-size="15" font-weight="700" text-anchor="middle"><text y="-76">N</text><text x="78" y="5">E</text><text y="86">S</text><text x="-78" y="5">W</text></g>' +
      '<g id="blPtr"><path d="M0 -70 L34 34 L0 18 L-34 34 Z" fill="#ff7a1a" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></g></svg>' +
      '<div class="bl-arrived" id="blArrived" hidden>🎯 ARRIVED</div></div>' +
      '<div class="bl-dist" id="blDist">—</div><div class="bl-sub" id="blSub">&nbsp;</div>' +
      '<div class="bl-brg" id="blBrg">Waiting for GPS…</div>' +
      '<div class="muted tiny bl-stat" id="blStat"></div>' +
      '<div class="bl-note" id="blNote" hidden></div>' +
      '<button class="btn bl-perm" id="blPerm" hidden>Enable compass</button>' +
      '<div class="bl-actions"><div class="bl-btns"><button class="btn small" id="blMap">🗺️ Show on map</button><button class="btn small alt" id="blShare">📤 Share spot</button><button class="btn small alt" id="blPing">📍 Ping me</button></div><a class="bl-road" id="blRoad" target="_blank" rel="noopener">Road route (Google Maps)</a></div>';
    document.body.appendChild(ov);
    bar = document.createElement('div'); bar.id = 'blBar'; bar.className = 'bl-bar'; bar.hidden = true;
    bar.innerHTML = '<button class="bl-bar-main" id="blBarMain">🧭 <span id="blBarTxt"></span></button><button class="bl-bar-x" id="blBarX" aria-label="Stop beeline">✕</button>';
    document.body.appendChild(bar);
    $('#blClose').onclick = stop;
    bar.querySelector('#blBarX').onclick = stop;
    $('#blMap').onclick = toMap;
    $('#blShare').onclick = () => { if (st && st.opts.onShare) st.opts.onShare(); };
    $('#blPing').onclick = () => { if (st && st.opts.onPing) st.opts.onPing(); };
    bar.querySelector('#blBarMain').onclick = () => { ov.hidden = false; bar.hidden = true; render(); };
    $('#blPerm').onclick = askCompass;
  }

  /* ---------------------------------------------------------------- compass */
  function onAbs(e) {
    if (e.alpha == null) return;
    st.compassSrc = 'abs'; st.lastOri = Date.now();
    setHeading(360 - e.alpha);
  }
  function onRel(e) {
    if (st.compassSrc === 'abs' && Date.now() - st.lastOri < 2000) return; // absolute event is better
    let h = null;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading; // iOS
    else if (e.absolute === true && e.alpha != null) h = 360 - e.alpha;
    if (h == null) return;
    st.compassSrc = 'rel'; st.lastOri = Date.now();
    setHeading(h);
  }
  function setHeading(h) {
    const sa = (window.screen && screen.orientation && screen.orientation.angle) || 0; // landscape correction
    h = norm360(h + sa);
    if (st.heading == null) st.heading = h;
    else { let d = ((h - st.heading + 540) % 360) - 180; st.heading = norm360(st.heading + d * 0.25); } // circular low-pass
    render();
  }
  function listen() {
    window.addEventListener('deviceorientationabsolute', onAbs, true);
    window.addEventListener('deviceorientation', onRel, true);
    st.listening = true;
  }
  function askCompass() {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      D.requestPermission().then((r) => { st.permAsked = true; if (r === 'granted') { $('#blPerm').hidden = true; listen(); } else note('Compass permission denied — arrow shows direction from North.'); render(); })
        .catch(() => { note('Compass permission failed — arrow shows direction from North.'); });
    }
  }
  function note(t) { const n = $('#blNote'); n.textContent = t; n.hidden = !t; }

  /* ---------------------------------------------------------------- GPS */
  function onPos(p) {
    const c = p.coords;
    st.pos = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, speed: c.speed, course: c.heading, t: p.timestamp };
    st.err = null;
    const r = calc(c.latitude, c.longitude, st.target.lat, st.target.lon);
    st.dist = r.dist; st.bearing = r.bearing;
    if (!st.arrived && r.dist <= ARRIVE_M) { st.arrived = true; try { navigator.vibrate && navigator.vibrate([300, 120, 300]); } catch (e) { /* ignore */ } }
    else if (st.arrived && r.dist > LEAVE_M) st.arrived = false;
    if (st.opts.onUpdate) st.opts.onUpdate({ lat: c.latitude, lon: c.longitude, acc: c.accuracy }, st.target, r);
    render();
  }
  function onErr(e) {
    st.err = e.code === 1 ? 'Location permission denied. Allow location for this site to use Beeline.' : e.code === 2 ? 'Position unavailable — go outside or check GPS.' : 'GPS timed out — still trying…';
    render();
  }

  /* ---------------------------------------------------------------- render */
  let rot = 0; // unwrapped CSS rotation so the arrow never spins the long way round
  function render() {
    if (!st) return;
    const haveCompass = st.compassSrc && Date.now() - st.lastOri < 3000;
    let head = null, src = '';
    if (haveCompass) { head = st.heading; src = 'compass'; }
    else if (st.pos && st.pos.course != null && !isNaN(st.pos.course) && st.pos.speed > 0.5) { head = st.pos.course; src = 'gps'; }
    const f = st.dist != null ? fmtDist(st.dist) : null;
    const txt = f ? f.main + ' · ' + bearingText(st.bearing) : 'Waiting for GPS…';
    document.getElementById('blBarTxt').textContent = (st.target.name || 'Spot') + ' — ' + txt;
    if (ov.hidden) return;
    $('#blName').textContent = st.target.name || 'Saved spot';
    $('#blCoords').textContent = st.target.lat.toFixed(5) + ', ' + st.target.lon.toFixed(5);
    $('#blDist').textContent = f ? f.main : '—';
    $('#blSub').innerHTML = f && f.sub ? f.sub : '&nbsp;';
    $('#blBrg').textContent = st.dist != null ? bearingText(st.bearing) : 'Waiting for GPS…';
    $('#blStat').textContent = st.err ? '' : (st.pos ? 'GPS accuracy ±' + Math.round(st.pos.acc) + ' m (±' + Math.round(st.pos.acc * 3.281) + ' ft)' + (src === 'gps' ? ' · heading from GPS movement' : src === 'compass' ? ' · compass live' : '') : '');
    $('#blArrived').hidden = !st.arrived;
    ov.classList.toggle('arrived', !!st.arrived);
    let msg = st.err || '';
    if (!msg && !head && st.dist != null) msg = 'Compass unavailable — arrow shows direction from North';
    note(msg);
    const needPerm = typeof (window.DeviceOrientationEvent || {}).requestPermission === 'function' && !haveCompass && !st.permAsked;
    $('#blPerm').hidden = !needPerm;
    // arrow angle: bearing relative to where the phone points (or to north if unknown)
    const ang = st.bearing == null ? 0 : norm360(st.bearing - (head == null ? 0 : head));
    let d = ((ang - norm360(rot) + 540) % 360) - 180; rot += d;
    $('#blPtr').setAttribute('transform', 'rotate(' + rot.toFixed(1) + ')');
    // dial letters N/E/S/W counter-rotate so N stays at true north when heading known
    $('#blRose').setAttribute('transform', 'rotate(' + (head == null ? 0 : -head).toFixed(1) + ')');
    st.shown = { ang: ang, head: head, src: src };
    ov.dataset.ang = ang.toFixed(1); ov.dataset.src = src || 'none';
  }

  /* ---------------------------------------------------------------- wake lock */
  async function wake() {
    try { if (navigator.wakeLock && st && !st.lock) { st.lock = await navigator.wakeLock.request('screen'); st.lock.addEventListener('release', () => { if (st) st.lock = null; }); } } catch (e) { /* ignore */ }
  }
  function onVis() { if (document.visibilityState === 'visible' && st) wake(); }

  /* ---------------------------------------------------------------- lifecycle */
  /* opts: { onUpdate(user, target, calc), onStop(), onMap(), roadUrl } */
  function open(target, opts) {
    if (!ov) build();
    if (st) stop(true);
    st = { target: target, opts: opts || {}, dist: null, bearing: null, heading: null, compassSrc: null, lastOri: 0, pos: null, arrived: false, err: null };
    ov.hidden = false; bar.hidden = true; document.body.classList.add('bl-open');
    $('#blRoad').href = (opts && opts.roadUrl) || '#';
    $('#blPerm').hidden = true; note('');
    rot = 0;
    listen(); wake(); document.addEventListener('visibilitychange', onVis);
    if (navigator.geolocation) st.watch = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
    else onErr({ code: 2 });
    st.timer = setInterval(render, 1500); // re-evaluates compass availability
    render();
  }
  function toMap() {
    ov.hidden = true; bar.hidden = false; document.body.classList.remove('bl-open'); render();
    if (st && st.opts.onMap) st.opts.onMap();
  }
  function stop(silent) {
    if (!st) return;
    window.removeEventListener('deviceorientationabsolute', onAbs, true);
    window.removeEventListener('deviceorientation', onRel, true);
    document.removeEventListener('visibilitychange', onVis);
    if (st.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(st.watch);
    clearInterval(st.timer);
    try { st.lock && st.lock.release(); } catch (e) { /* ignore */ }
    const cb = st.opts.onStop; st = null;
    ov.hidden = true; bar.hidden = true; document.body.classList.remove('bl-open');
    if (silent !== true && cb) cb();
  }

  HC.Beeline = { open: open, stop: stop, calc: calc, fmtDist: fmtDist, bearingText: bearingText, cardinal: cardinal, get active() { return !!st; }, _state: () => st };
})(window.HC = window.HC || {});
