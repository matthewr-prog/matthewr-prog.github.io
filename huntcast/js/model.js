/* HuntCast — activity scoring model.
 * ===========================================================================
 * Purpose: turn weather + sun + moon + season into a 0–100 "likelihood of
 * seeing/encountering this animal" score for every hour of a day.
 *
 * IMPORTANT: this is a transparent HEURISTIC model, not a trained model. It is
 * built from well-known hunting rules of thumb. Real animals vary by region,
 * hunting pressure, food, habitat and plain luck. Treat results as estimates.
 *
 * Formula for each hour h (evaluated at the middle of the hour):
 *
 *   tod    = time-of-day activity 0..1   (blend of dawn / day / dusk / night
 *                                          weights from the species profile,
 *                                          adjusted for heat, cold and rut)
 *   M      = 1 + Σ  weight_f × signal_f   (clamped to 0.25 … 1.70)
 *   score  = 100 × clamp( tod × M × K )   with K = 0.55
 *
 * so the biggest lever is "is it a time of day this animal moves?" and the
 * weather/moon/season factors then scale that up or down. Each signal is in
 * −1 … +1 and every species has its own weights (species.js).
 *
 * Signals
 *  pressure  barometric trend over ~3 h (hPa). Falling pressure before a front
 *            is the classic movement trigger (+); a steady high, or a rising
 *            barometer after a front clears, is mildly good; very low pressure
 *            (<1000 hPa, i.e. storm) is penalised.
 *  temp      70% absolute comfort band for the species + 30% anomaly vs the
 *            seasonal normal for the date (colder than normal helps cold-
 *            loving game such as deer/elk/moose/ducks; hot days hurt).
 *  wind      each species has an ideal speed band; too calm or too windy
 *            lowers activity/hunter success (ducks like wind, turkeys do not).
 *  precip    light rain neutral/slightly good, moderate/heavy bad (waterfowl
 *            shrug it off); the first dry hours after a soaking rain are a
 *            bonus (animals resume feeding); snow treated like precipitation.
 *  cloud     overcast extends daytime movement for most species (daylight only).
 *  front     cold-front / cold-snap detector from 24 h pressure drop and 24 h
 *            temperature change (+), warm spike after a front (−). NW wind
 *            adds for waterfowl. Weight is large for ducks and geese.
 *  solunar   "major" periods (moon overhead/underfoot, ±60 min) and "minor"
 *            periods (moonrise/moonset, ±30 min), stronger near new/full moon.
 *            Small weight because evidence is weak and debated.
 *  moonL     night-time moonlight (illumination × moon altitude × clear sky).
 *  moonD     bright (full) moon is said to dampen daytime movement of species
 *            that feed at night under it; new moon the opposite.
 *  vis       fog / low visibility lowers success.
 *  season    rut (deer, elk, moose, pronghorn), spring gobbling (turkey), fall
 *            hyperphagia / denning (bear), migration (ducks, geese), breeding
 *            (coyote, fox) and so on; rut also shifts movement into midday.
 *
 * Forecast quality: weather beyond ~7 days is much less reliable, and the model
 * only knows the forecast – it cannot know about local food sources, pressure
 * from other hunters, or where animals actually are.
 * ========================================================================= */
(function (HC) {
  'use strict';
  const U = HC.Util, A = HC.Astro;
  const K = 0.55;
  const MIN = 60000, HOUR = 3600000;
  const DAY_LABELS = [[70, "Excellent"], [57, "Very good"], [44, "Good"], [30, "Fair"], [-1, "Poor"]];
  const ratingLabel = (s) => DAY_LABELS.find((x) => s >= x[0])[1];
  const stars = (s) => (s >= 70 ? 5 : s >= 57 ? 4 : s >= 44 ? 3 : s >= 30 ? 2 : 1);

  /* ---- time-of-day phases from the sun ---- */
  function phases(sp, a, mid, sunAlt) {
    let dawn = 0, dusk = 0;
    if (!a.polar && a.sunrise != null && a.sunset != null) {
      const dShift = sp.dawnShift == null ? -10 : sp.dawnShift, uShift = sp.duskShift == null ? -15 : sp.duskShift;
      dawn = U.gauss((mid - a.sunrise) / MIN - dShift, 70);
      dusk = U.gauss((mid - a.sunset) / MIN - uShift, 75);
    }
    const night = 1 - U.smooth(-14, -4, sunAlt);
    let day = sunAlt > 0 ? Math.max(0, 1 - Math.max(dawn, dusk)) : 0;
    let sum = dawn + dusk + night + day;
    if (sum < 0.05) { night === 0 ? (day = 1) : 0; sum = dawn + dusk + night + day || 1; }
    return { dawn: dawn / sum, dusk: dusk / sum, night: night / sum, day: day / sum, nightness: night };
  }

  /* ---- factor signals ---- */
  function sigPressure(h) {
    const d3 = h.d3, P = h.press;
    let s, txt;
    const inHg = (x) => (Math.abs(U.hpaToInHg(x))).toFixed(2);
    if (d3 <= -0.5) { s = Math.min(1, -d3 / 2.5); if (d3 < -5) s = 0.5; txt = (d3 < -2.5 ? 'rapidly ' : '') + 'falling pressure (−' + inHg(d3) + ' inHg/3h)'; }
    else if (d3 >= 0.5) { s = d3 <= 3 ? 0.35 : 0.1; txt = 'rising pressure (+' + inHg(d3) + ' inHg/3h)'; }
    else { s = (P >= 1013 && P <= 1030) ? 0.2 : (P < 1005 ? -0.2 : 0); txt = 'steady ' + (P >= 1013 ? 'high ' : P < 1005 ? 'low ' : '') + 'pressure'; }
    if (P < 1000) { s -= 0.3; txt += ', stormy-low barometer'; }
    return { s: U.clamp(s, -1, 1), txt };
  }
  function sigTemp(sp, h, anom) {
    const T = h.temp, o = sp.temp, mid = (o.lo + o.hi) / 2, half = (o.hi - o.lo) / 2;
    let abs;
    if (T >= o.lo && T <= o.hi) abs = 0.5 + 0.5 * (1 - Math.abs(T - mid) / half);
    else { const dist = T < o.lo ? o.lo - T : T - o.hi; abs = 0.5 - dist / 20; }
    abs = U.clamp(abs, -1, 1);
    const an = anom == null ? 0 : U.clamp(-anom / 12, -1, 1) * o.coldBias;
    const s = U.clamp(0.7 * abs + 0.3 * an, -1, 1);
    let word = T < 10 ? 'frigid' : T < 28 ? 'very cold' : T < 40 ? 'cold' : T < 55 ? 'cool' : T < 68 ? 'mild' : T < 80 ? 'warm' : T < 90 ? 'hot' : 'very hot';
    let txt = word + ' ' + Math.round(T) + '°F';
    if (anom != null && Math.abs(anom) >= 6) txt += ' (' + Math.round(Math.abs(anom)) + '° ' + (anom < 0 ? 'below' : 'above') + ' normal)';
    return { s, txt };
  }
  function sigWind(sp, h) {
    const o = sp.wind, v = h.wind;
    let s;
    if (v < o.lo) s = 1 - (o.lo - v) / o.lo * 1.6;
    else if (v <= o.hi) s = 1;
    else s = 1 - 2 * (v - o.hi) / (o.max - o.hi);
    if (h.gust > o.max * 1.3) s -= 0.2;
    s = U.clamp(s, -1, 1);
    const word = v < 2 ? 'calm' : v < 6 ? 'light breeze' : v < 13 ? 'moderate wind' : v < 20 ? 'strong wind' : 'very windy';
    return { s, txt: word + ' ' + Math.round(v) + ' mph ' + U.compass16(h.dir) + (h.gust - v > 10 ? ' (gusts ' + Math.round(h.gust) + ')' : '') };
  }
  function sigPrecip(sp, h) {
    const p = h.precip, snow = h.temp <= 33;
    let s = 0, txt = '';
    const kind = snow ? 'snow' : 'rain';
    if (p >= 2.5) { s = -1; txt = 'heavy ' + kind; }
    else if (p >= 0.5) { s = -0.4; txt = 'steady ' + kind; }
    else if (p >= 0.05) { s = sp.rainLight; txt = 'light ' + (snow ? 'snow' : 'drizzle/rain'); }
    else if (h.rain6 >= 1) { s = 0.4; txt = 'just after rain: animals resume feeding'; }
    if (s < 0) s *= (1 - sp.wetLove * 0.8);
    return { s, txt };
  }
  function sigCloud(sp, h, nightness) {
    if (!sp.cloudDir) return { s: 0, txt: '' };
    const s = ((h.cloud - 50) / 50) * sp.cloudDir * (1 - nightness);
    return { s, txt: h.cloud >= 70 ? 'overcast skies' : h.cloud <= 25 ? 'clear skies' : '' };
  }
  function sigFront(sp, h) {
    const approach = U.clamp(-h.d24 / 8, 0, 1) * 0.6;
    const snap = U.clamp(-h.t24 / 12, 0, 1);
    let s = Math.max(approach, snap), txt = '';
    if (snap >= approach && snap > 0.3) txt = 'cold snap (' + Math.round(-h.t24) + '°F colder than 24 h ago)';
    else if (approach > 0.3) txt = 'front approaching (pressure down ' + Math.abs(U.hpaToInHg(h.d24)).toFixed(2) + ' inHg in 24 h)';
    const nw = (h.dir >= 270 || h.dir <= 30) && h.wind >= 10;
    if (sp.w.front >= 0.2 && nw && s > 0) { s = Math.min(1, s + 0.2); txt += (txt ? ' + ' : '') + 'north-west wind'; }
    if (h.t24 > 12 && s < 0.2) { s = -0.4; txt = 'warm spike (+' + Math.round(h.t24) + '°F vs yesterday)'; }
    return { s: U.clamp(s, -1, 1), txt };
  }
  function sigVis(h) {
    const mi = U.mToMi(h.vis);
    if (mi < 0.5) return { s: -1, txt: 'fog / very low visibility' };
    if (mi < 1) return { s: -0.5, txt: 'reduced visibility' };
    return { s: 0, txt: '' };
  }

  /** Score a single hour. `c` carries per-day context. */
  function scoreHour(sp, h, c) {
    const mid = h.t + 30 * MIN;
    const sunAlt = A.sunAltDeg(mid, c.lat, c.lon), moonAlt = A.moonAltDeg(mid, c.lat, c.lon);
    const ph = phases(sp, c.astro, mid, sunAlt);

    // --- time-of-day weights, adjusted for heat / cold / rut ---
    const w = Object.assign({}, sp.tod);
    const heatS = U.clamp((h.temp - sp.heat) / 15, 0, 1);
    if (heatS > 0) { w.day *= 1 - 0.7 * heatS; w.dawn *= 1 - 0.1 * heatS; if (w.night >= 0.2) w.night = Math.min(1, w.night + 0.25 * heatS); }
    const coldS = U.clamp((25 - h.temp) / 20, 0, 1) * sp.coldDay;
    if (coldS > 0) { w.day = Math.min(1, w.day + 0.35 * coldS); w.night *= 1 - 0.5 * coldS; }
    if (c.season.dayBoost) w.day = Math.min(1, w.day + (sp.dayBoostMax || 0) * c.season.dayBoost);
    const tod = w.dawn * ph.dawn + w.day * ph.day + w.dusk * ph.dusk + w.night * ph.night;
    const dom = ['dawn', 'dusk', 'night', 'day'].reduce((a, b) => (ph[b] > ph[a] ? b : a));
    const todText = ({
      dawn: sp.id === 'turkey' ? 'Fly-down & morning gobbling window' : 'Dawn movement window',
      dusk: sp.id === 'turkey' ? 'Late-day roost-approach window' : 'Evening movement window',
      night: w.night < 0.1 ? 'Night: animals are bedded/roosted' : 'Night activity',
      day: tod >= 0.55 ? 'Active daytime hours' : 'Midday lull'
    })[dom];

    // --- moon / solunar ---
    const subs = [0.125, 0.375, 0.625, 0.875];
    let sol = 0, solKind = null;
    subs.forEach((f) => { const r = A.solunarAt(c.astro, h.t + f * HOUR); sol += r.v / 4; if (r.v > 0.3 && (!solKind || r.v > 0.6)) solKind = r.kind; });
    const moonLight = c.astro.illum * U.smooth(0, 15, moonAlt) * (1 - 0.7 * h.cloud / 100) * ph.nightness;
    const moonDay = (0.5 - c.astro.illum) * 2 * (1 - ph.nightness);

    const f = {
      pressure: sigPressure(h), temp: sigTemp(sp, h, c.anom), wind: sigWind(sp, h), precip: sigPrecip(sp, h),
      cloud: sigCloud(sp, h, ph.nightness), front: sigFront(sp, h), vis: sigVis(h)
    };
    const wt = sp.w;
    const factors = [
      { key: 'pressure', name: 'Pressure', w: wt.press, ...f.pressure },
      { key: 'temp', name: 'Temperature', w: wt.temp, ...f.temp },
      { key: 'wind', name: 'Wind', w: wt.wind, ...f.wind },
      { key: 'precip', name: 'Precipitation', w: wt.precip, ...f.precip },
      { key: 'cloud', name: 'Sky', w: wt.cloud, ...f.cloud },
      { key: 'front', name: 'Front / cold snap', w: wt.front, ...f.front },
      { key: 'solunar', name: 'Solunar', w: wt.sol, s: U.clamp(sol, 0, 1.4), txt: sol > 0.25 ? (solKind ? solKind + ' solunar period' : 'solunar period') : '' },
      { key: 'moonlight', name: 'Moonlight', w: wt.moonL, s: moonLight, txt: moonLight > 0.35 ? 'bright moonlit night' : '' },
      { key: 'moonday', name: 'Moon phase', w: wt.moonD, s: moonDay, txt: Math.abs(moonDay) > 0.5 ? (moonDay < 0 ? 'near-full moon (daytime activity can dip)' : 'dark moon phase (daytime activity can rise)') : '' },
      { key: 'vis', name: 'Visibility', w: wt.vis, ...f.vis },
      { key: 'season', name: 'Season', w: wt.season, s: c.season.s, txt: c.season.label }
    ];
    let M = 1;
    factors.forEach((x) => { x.mult = x.w * x.s; M += x.mult; });
    M = U.clamp(M, 0.25, 1.7);
    const raw = tod * M * K;
    const score = Math.round(U.clamp(raw, 0, 1) * 100);
    // points each factor adds (+) or removes (−) from the score
    factors.forEach((x) => { x.pts = Math.round(100 * tod * K * x.mult * 10) / 10; });
    const base = Math.round(tod * K * 100);

    const notable = factors.filter((x) => x.txt && Math.abs(x.pts) >= 1.5 && tod > 0.08).sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
    const why = [todText].concat(notable.slice(0, 4).map((x) => x.txt));
    return {
      i: h.i, t: h.t, hr: h.hr, score, tod, base, M, dom, todText, factors, notable, why,
      sunAlt, moonAlt, h, legal: false
    };
  }

  /**
   * Score a whole local day for a species.
   * @param {object} sp   species profile
   * @param {object} data weather data from HC.Weather (hours, tz, normals, lat, lon)
   * @param {string} date 'YYYY-MM-DD' local date at the location
   * @param {object} opts {includeNight:boolean, legalMin:number}
   */
  function scoreDay(sp, data, date, opts) {
    opts = opts || {};
    const hrs = data.hours.filter((h) => h.date === date);
    if (!hrs.length) return null;
    const astro = astroFor(data, date, hrs);
    const doy = U.doy(date), lat = data.lat >= 0 ? data.lat : data.lat;
    const season = sp.season({ doy: data.lat < 0 ? (doy + 182) % 365 : doy, lat: Math.abs(data.lat) });
    const meanT = hrs.reduce((s, h) => s + h.temp, 0) / hrs.length;
    const normal = data.normals ? data.normals.at(doy) : null;
    const anom = normal == null ? null : meanT - normal;
    const c = { lat: data.lat, lon: data.lon, astro, season, anom, doy };
    const legalMin = opts.legalMin == null ? 30 : opts.legalMin;
    const ls = astro.polar ? -Infinity : (astro.sunrise - legalMin * MIN), le = astro.polar ? Infinity : (astro.sunset + legalMin * MIN);
    const out = hrs.map((h) => {
      const r = scoreHour(sp, h, c);
      r.legal = (h.t + HOUR > ls && h.t < le) || astro.polar === 'day';
      r.eligible = opts.includeNight ? true : r.legal;
      return r;
    });
    const elig = out.filter((r) => r.eligible);
    const top = elig.map((r) => r.score).sort((a, b) => b - a).slice(0, 4);
    const daily = top.length ? Math.round(top.reduce((s, x) => s + x, 0) / top.length) : 0;
    const peak = elig.length ? Math.max.apply(null, elig.map((r) => r.score)) : 0;
    // best windows: contiguous eligible hours >= max(80% of peak, 35)
    const thr = Math.max(0.8 * peak, 35), windows = [];
    let cur = null;
    out.forEach((r) => {
      if (r.eligible && r.score >= thr) { if (cur) { cur.end = r.t + HOUR; cur.items.push(r); } else cur = { start: r.t, end: r.t + HOUR, items: [r] }; }
      else if (cur) { windows.push(cur); cur = null; }
    });
    if (cur) windows.push(cur);
    windows.forEach((wd) => { wd.mean = Math.round(wd.items.reduce((s, x) => s + x.score, 0) / wd.items.length); wd.peak = Math.max.apply(null, wd.items.map((x) => x.score)); });
    windows.sort((a, b) => b.mean - a.mean);
    const dayWhy = dayDrivers(out, elig, season, c);
    return {
      date, hours: out, astro, season, anom, normal, meanT, legalStart: ls, legalEnd: le,
      daily: { score: daily, label: ratingLabel(daily), stars: stars(daily), peak, windows: windows.slice(0, 3), drivers: dayWhy }
    };
  }

  /** Summarise which factors drive the day (averaged over the best hours). */
  function dayDrivers(out, elig, season, c) {
    const best = elig.slice().sort((a, b) => b.score - a.score).slice(0, 4);
    if (!best.length) return [];
    const sum = {};
    best.forEach((r) => r.factors.forEach((f) => { if (!sum[f.key]) sum[f.key] = { name: f.name, pts: 0, txts: [] }; sum[f.key].pts += f.pts / best.length; if (f.txt) sum[f.key].txts.push(f.txt); }));
    return Object.keys(sum).map((k) => ({ key: k, name: sum[k].name, pts: Math.round(sum[k].pts * 10) / 10, txt: sum[k].txts[0] || '' }))
      .filter((x) => Math.abs(x.pts) >= 1.2).sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts)).slice(0, 5);
  }

  const astroCache = new WeakMap();
  function astroFor(data, date, hrs) {
    let m = astroCache.get(data);
    if (!m) { m = {}; astroCache.set(data, m); }
    if (!m[date]) {
      hrs = hrs || data.hours.filter((h) => h.date === date);
      m[date] = A.day(data.lat, data.lon, hrs[0].t, hrs[hrs.length - 1].t + HOUR);
    }
    return m[date];
  }

  HC.Model = { scoreDay, astroFor, ratingLabel, stars, K };
})(window.HC = window.HC || {});
