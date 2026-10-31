/* HuntCast — small shared helpers (time-zone aware formatting, geometry). */
(function (HC) {
  'use strict';
  const fmtCache = {};
  function fmt(tz, key, opts) {
    const k = tz + '|' + key;
    if (!fmtCache[k]) fmtCache[k] = new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: tz }, opts));
    return fmtCache[k];
  }
  const U = {
    clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
    lerp: (a, b, t) => a + (b - a) * t,
    smooth(e0, e1, x) { const t = U.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); },
    gauss: (x, s) => Math.exp(-(x * x) / (2 * s * s)),
    /** 'YYYY-MM-DD' of an epoch (ms) in the given IANA zone */
    dateKey(ms, tz) {
      const p = fmt(tz, 'd', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
      const g = (t) => p.find((x) => x.type === t).value;
      return g('year') + '-' + g('month') + '-' + g('day');
    },
    hour(ms, tz) {
      const p = fmt(tz, 'h', { hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(ms));
      return parseInt(p.find((x) => x.type === 'hour').value, 10) % 24;
    },
    time(ms, tz) {
      if (ms == null) return '—';
      return fmt(tz, 't', { hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
    },
    hourLabel(ms, tz) {
      return fmt(tz, 'hl', { hour: 'numeric' }).format(new Date(ms)).replace(' ', '').toLowerCase();
    },
    dayLabel(key, long) {
      const [y, m, d] = key.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d, 12));
      return new Intl.DateTimeFormat('en-US', long ? { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' } : { timeZone: 'UTC', weekday: 'short' }).format(dt);
    },
    dayNum(key) { return +key.split('-')[2]; },
    doy(key) {
      const [y, m, d] = key.split('-').map(Number);
      return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
    },
    doyOf: (m, d) => Math.round((Date.UTC(2001, m - 1, d) - Date.UTC(2001, 0, 0)) / 86400000),
    /** circular distance (days) a - b in a 365-day year, signed in [-182, 182] */
    ddays(a, b) { let d = a - b; while (d > 182.5) d -= 365; while (d < -182.5) d += 365; return d; },
    compass16(deg) {
      const n = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
      return n[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
    },
    hpaToInHg: (h) => h * 0.0295300,
    mmToIn: (m) => m / 25.4,
    mToMi: (m) => m / 1609.34,
    /** destination point given start, bearing (deg) and distance (m) */
    dest(lat, lon, bearing, dist) {
      const R = 6371000, b = bearing * Math.PI / 180, d = dist / R, la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
      const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
      const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
      return [la2 * 180 / Math.PI, lo2 * 180 / Math.PI];
    },
    esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  };
  HC.Util = U;
})(window.HC = window.HC || {});
