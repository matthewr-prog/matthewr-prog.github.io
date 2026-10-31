/* HuntCast — astronomy helpers (sun, moon, solunar) built on SunCalc.
 *
 * Everything is computed client-side. All times are absolute epoch
 * milliseconds; time-zone aware formatting is done separately (HC.Util) so a
 * forecast for a spot in another time zone still shows that spot's local times.
 *
 * Solunar periods (a popular hunting/fishing heuristic, NOT proven science):
 *   major = moon overhead ("transit") or underfoot  -> about 2 h wide (±60 min)
 *   minor = moonrise or moonset                      -> about 1 h wide (±30 min)
 */
(function (HC) {
  'use strict';
  const SC = window.SunCalc;
  const RAD = Math.PI / 180;
  const MIN = 60000;

  function moonAltDeg(ms, lat, lon) {
    return SC.getMoonPosition(new Date(ms), lat, lon).altitude / RAD;
  }
  function sunAltDeg(ms, lat, lon) {
    return SC.getPosition(new Date(ms), lat, lon).altitude / RAD;
  }

  const PHASES = [
    [0.03, 'New Moon', '🌑'], [0.22, 'Waxing Crescent', '🌒'], [0.28, 'First Quarter', '🌓'],
    [0.47, 'Waxing Gibbous', '🌔'], [0.53, 'Full Moon', '🌕'], [0.72, 'Waning Gibbous', '🌖'],
    [0.78, 'Last Quarter', '🌗'], [0.97, 'Waning Crescent', '🌘'], [1.01, 'New Moon', '🌑']
  ];
  function phaseInfo(phase) {
    for (const p of PHASES) if (phase < p[0]) return { name: p[1], icon: p[2] };
    return { name: 'New Moon', icon: '🌑' };
  }

  /** Scan the moon's altitude to find rise / set / overhead / underfoot events. */
  function moonEvents(lat, lon, fromMs, toMs) {
    const step = 4 * MIN, pad = 8 * 3600000;
    const t0 = fromMs - pad, t1 = toMs + pad;
    const ts = [], alt = [];
    for (let t = t0; t <= t1; t += step) { ts.push(t); alt.push(moonAltDeg(t, lat, lon)); }
    const ev = { rise: [], set: [], over: [], under: [] };
    for (let i = 1; i < ts.length - 1; i++) {
      const a = alt[i - 1], b = alt[i], c = alt[i + 1];
      if (a < 0 && b >= 0) ev.rise.push(ts[i - 1] + (0 - a) / (b - a) * step);
      if (a >= 0 && b < 0) ev.set.push(ts[i - 1] + (a - 0) / (a - b) * step);
      // local extremum via parabola vertex
      if ((b > a && b >= c) || (b < a && b <= c)) {
        const den = (a - 2 * b + c);
        const off = den !== 0 ? 0.5 * (a - c) / den : 0;
        const tt = ts[i] + off * step;
        if (b > a) ev.over.push(tt); else ev.under.push(tt);
      }
    }
    return ev;
  }

  /** Full astronomy summary for one local day [dayStart, dayEnd). */
  function day(lat, lon, dayStart, dayEnd) {
    const mid = new Date((dayStart + dayEnd) / 2);
    const T = SC.getTimes(mid, lat, lon);
    const ms = (d) => (d && !isNaN(d.getTime())) ? d.getTime() : null;
    const ill = SC.getMoonIllumination(mid);
    const pi = phaseInfo(ill.phase);
    const ev = moonEvents(lat, lon, dayStart, dayEnd);
    const inDay = (t) => t >= dayStart && t < dayEnd;
    const out = {
      sunrise: ms(T.sunrise), sunset: ms(T.sunset), dawn: ms(T.dawn), dusk: ms(T.dusk),
      solarNoon: ms(T.solarNoon), goldenMorningEnd: ms(T.goldenHourEnd), goldenEvening: ms(T.goldenHour),
      illum: ill.fraction, phase: ill.phase, phaseName: pi.name, phaseIcon: pi.icon,
      moonrise: ev.rise.filter(inDay), moonset: ev.set.filter(inDay),
      overhead: ev.over.filter(inDay), underfoot: ev.under.filter(inDay),
      // Solunar windows include events just outside the day so edge hours score correctly.
      majors: [], minors: []
    };
    ev.over.concat(ev.under).forEach((t) => out.majors.push({ t, half: 60 * MIN, kind: ev.over.includes(t) ? 'overhead' : 'underfoot' }));
    ev.rise.concat(ev.set).forEach((t) => out.minors.push({ t, half: 30 * MIN, kind: ev.rise.includes(t) ? 'moonrise' : 'moonset' }));
    // polar day / night fallback
    out.polar = (out.sunrise == null || out.sunset == null) ? (sunAltDeg((dayStart + dayEnd) / 2, lat, lon) > 0 ? 'day' : 'night') : null;
    return out;
  }

  /** Solunar strength (0..~1.4) at epoch ms, plus which period it is. */
  function solunarAt(a, ms) {
    let best = 0, kind = null;
    for (const m of a.majors) {
      const d = Math.abs(ms - m.t);
      if (d < m.half) { const v = 0.5 + 0.5 * Math.cos(Math.PI * d / m.half); if (v > best) { best = v; kind = 'major (moon ' + m.kind + ')'; } }
    }
    for (const m of a.minors) {
      const d = Math.abs(ms - m.t);
      if (d < m.half) { const v = 0.6 * (0.5 + 0.5 * Math.cos(Math.PI * d / m.half)); if (v > best) { best = v; kind = 'minor (' + m.kind + ')'; } }
    }
    // New and full moons are said to strengthen solunar periods.
    const nf = Math.abs(2 * a.illum - 1);
    return { v: best * (1 + 0.4 * nf), kind };
  }

  HC.Astro = { day, solunarAt, sunAltDeg, moonAltDeg, phaseInfo };
})(window.HC = window.HC || {});
