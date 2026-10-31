/* HuntCast — weather loading (Open-Meteo, free, no API key, CORS enabled).
 *
 *  - Forecast:  https://api.open-meteo.com/v1/forecast   (2 past days + 14 forecast days, hourly)
 *  - Normals:   https://archive-api.open-meteo.com/v1/archive (last 3 years of daily mean temp,
 *               used to estimate "normal" temperature for the date)
 *
 * The last successful forecast is cached in localStorage so the app still shows
 * something when you are offline in the woods.
 */
(function (HC) {
  'use strict';
  const U = HC.Util;
  const LS_FC = 'huntcast.forecast.v1';
  const HOURLY = 'temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,pressure_msl,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m';

  async function getJSON(url, timeoutMs) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs || 15000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(to); }
  }

  function fillNulls(arr, fallback) {
    let last = null;
    for (let i = 0; i < arr.length; i++) { if (arr[i] == null || isNaN(arr[i])) arr[i] = last; else last = arr[i]; }
    let next = null;
    for (let i = arr.length - 1; i >= 0; i--) { if (arr[i] == null) arr[i] = next; else next = arr[i]; }
    for (let i = 0; i < arr.length; i++) if (arr[i] == null) arr[i] = fallback;
    return arr;
  }

  /** Raw Open-Meteo JSON -> array of hour records with derived trends. */
  function normalise(raw) {
    const h = raw.hourly, n = h.time.length;
    const g = (k, fb) => fillNulls(h[k].slice(), fb);
    const temp = g('temperature_2m', 50), rh = g('relative_humidity_2m', 70), pr = g('precipitation', 0),
      pp = g('precipitation_probability', 0), cl = g('cloud_cover', 50), ps = g('pressure_msl', 1015),
      vis = g('visibility', 24000), ws = g('wind_speed_10m', 0), wd = g('wind_direction_10m', 0), wg = g('wind_gusts_10m', 0);
    const tz = raw.timezone || 'UTC';
    const at = (arr, i) => arr[U.clamp(i, 0, n - 1)];
    const hours = [];
    for (let i = 0; i < n; i++) {
      const t = h.time[i] * 1000;
      let rain6 = 0; for (let k = 1; k <= 6; k++) rain6 += at(pr, i - k);
      hours.push({
        i, t, date: U.dateKey(t, tz), hr: U.hour(t, tz),
        temp: temp[i], rh: rh[i], precip: pr[i], prob: pp[i], cloud: cl[i], press: ps[i], vis: vis[i],
        wind: ws[i], dir: wd[i], gust: wg[i],
        // pressure trends (hPa): centred 3 h window, and look-back 12 h / 24 h
        d3: at(ps, i + 1) - at(ps, i - 2),
        d12: ps[i] - at(ps, i - 12),
        d24: ps[i] - at(ps, i - 24),
        t24: temp[i] - at(temp, i - 24),
        rain6
      });
    }
    return { tz, lat: raw.latitude, lon: raw.longitude, elevation: raw.elevation, hours };
  }

  /** Estimate normal daily-mean temperature (°F) from archive data, or from latitude if unavailable. */
  function makeNormals(lat, series) {
    if (series && series.length > 200) {
      return {
        source: 'last 3 years of observed data',
        at(doy) {
          let s = 0, c = 0;
          for (const p of series) { if (Math.abs(U.ddays(p.doy, doy)) <= 7) { s += p.t; c++; } }
          return c ? s / c : fallback(doy);
        }
      };
    }
    function fallback(doy) {
      const a = Math.abs(lat), mean = 85 - 0.9 * a, amp = 0.5 * a + 2;
      const peak = lat >= 0 ? 200 : 17;
      return mean + amp * Math.cos(2 * Math.PI * (doy - peak) / 365);
    }
    return { source: 'latitude-based estimate', at: fallback };
  }

  async function loadNormals(lat, lon) {
    const key = 'huntcast.normals.v1:' + (Math.round(lat * 2) / 2) + ',' + (Math.round(lon * 2) / 2);
    try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && c.series) return makeNormals(lat, c.series); } catch (e) { /* ignore */ }
    try {
      const end = new Date(Date.now() - 7 * 86400000), start = new Date(end.getTime() - 3 * 365 * 86400000);
      const f = (d) => d.toISOString().slice(0, 10);
      const url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + lat.toFixed(3) + '&longitude=' + lon.toFixed(3) +
        '&start_date=' + f(start) + '&end_date=' + f(end) + '&daily=temperature_2m_mean&temperature_unit=fahrenheit&timezone=auto';
      const j = await getJSON(url, 20000);
      const series = [];
      j.daily.time.forEach((d, i) => { const v = j.daily.temperature_2m_mean[i]; if (v != null) series.push({ doy: U.doy(d), t: Math.round(v * 10) / 10 }); });
      try { localStorage.setItem(key, JSON.stringify({ series })); } catch (e) { /* quota */ }
      return makeNormals(lat, series);
    } catch (e) {
      console.warn('normals unavailable, using latitude estimate', e.message);
      return makeNormals(lat, null);
    }
  }

  /** Load forecast (network first, cache fallback). Resolves {data, fetchedAt, offline}. */
  async function load(lat, lon) {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(4) + '&longitude=' + lon.toFixed(4) +
      '&hourly=' + HOURLY + '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=mm' +
      '&timezone=auto&timeformat=unixtime&past_days=2&forecast_days=14';
    let raw, fetchedAt, offline = false;
    try {
      raw = await getJSON(url, 15000);
      fetchedAt = Date.now();
      try { localStorage.setItem(LS_FC, JSON.stringify({ lat, lon, fetchedAt, raw })); } catch (e) { /* quota */ }
    } catch (err) {
      const c = readCache();
      if (!c) throw err;
      raw = c.raw; fetchedAt = c.fetchedAt; offline = true;
      console.warn('Forecast fetch failed, using cached copy:', err.message);
    }
    const data = normalise(raw);
    data.requestedLat = lat; data.requestedLon = lon;
    data.normals = offline ? makeNormals(lat, null) : await loadNormals(lat, lon);
    if (offline) { try { data.normals = await Promise.race([loadNormals(lat, lon), new Promise((r) => setTimeout(() => r(makeNormals(lat, null)), 1500))]); } catch (e) { /* ignore */ } }
    return { data, fetchedAt, offline };
  }
  function readCache() { try { return JSON.parse(localStorage.getItem(LS_FC) || 'null'); } catch (e) { return null; } }

  HC.Weather = { load, readCache, normalise };
})(window.HC = window.HC || {});
