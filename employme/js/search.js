/* EmployMe — search, filtering and ranking.
   RANKING RULE: results are ordered ONLY by how well a listing matches the seeker's own search
   (keywords, filters, profile skills, distance, date). There is no sponsored or paid boost. */
(function (EM) {
  'use strict';
  const { hourly, miles, daysAgo, store } = EM;

  const DEFAULT_FILTERS = () => ({ q: '', types: [], shifts: [], minPay: '', posted: 'any', remote: false, radius: 25, sort: 'best' });
  const norm = (s) => String(s || '').toLowerCase();
  const tokens = (q) => norm(q).split(/[^a-z0-9+#.]+/).filter((t) => t.length > 1);
  const STOP = new Set(['and', 'the', 'for', 'job', 'jobs', 'work', 'in', 'of', 'to', 'a', 'an']);

  function isLive(j) {
    if (!j.expires) return true;
    const t = Date.parse(j.expires + 'T23:59:59');
    return isNaN(t) || t >= Date.now();
  }
  function hourlyMax(j) {
    const v = hourly(j.pay_max != null ? j.pay_max : j.pay_min, j.pay_unit);
    return v == null ? null : v;
  }
  function haystack(j) {
    return { title: norm(j.title + ' ' + (j.industry || '')), body: norm([j.description, (j.requirements || []).join(' '), j.employer, j.location].join(' ')) };
  }

  /* where: {lat, lon} of seeker. Returns [{job, score, dist, why[]}] */
  function run(jobs, f, where, skills) {
    const toks = tokens(f.q).filter((t) => !STOP.has(t));
    const sk = (skills || []).map(norm).filter(Boolean);
    const out = [];
    for (const j of jobs) {
      if (!isLive(j)) continue;
      // job type: matches arrangement OR hours (so "Full-time" finds full-time temp-to-hire roles)
      if (f.types.length && !f.types.some((t) => j.type === t || j.hours === t)) continue;
      if (f.shifts.length && !f.shifts.includes(j.shift)) continue;
      if (f.remote && !j.remote) continue;
      if (f.minPay) { const h = hourlyMax(j); if (h == null || h < +f.minPay) continue; }
      if (f.posted !== 'any') { const d = daysAgo(j.posted); if (d == null || d > +f.posted) continue; }
      let dist = null;
      if (where && j.lat != null && j.lon != null) dist = miles(where.lat, where.lon, j.lat, j.lon);
      if (f.radius && f.radius !== 'any' && !j.remote) { if (dist == null || dist > +f.radius) continue; }
      let score = 0; const why = [];
      if (toks.length) {
        const h = haystack(j); let hit = 0;
        for (const t of toks) {
          const inT = h.title.includes(t), inB = h.body.includes(t);
          if (!inT && !inB) { hit = -1; break; }
          score += inT ? 30 : 8; hit++;
        }
        if (hit < 0) continue; // every keyword must appear somewhere
        if (norm(j.title).includes(norm(f.q).trim())) score += 25;
      }
      if (sk.length) {
        const h = haystack(j), m = sk.filter((s) => h.title.includes(s) || h.body.includes(s));
        if (m.length) { score += Math.min(m.length, 6) * 4; why.push(m.length + ' of your skills'); }
      }
      if (dist != null) score += Math.max(0, 20 - dist / 2.5);
      const d = daysAgo(j.posted); if (d != null) score += Math.max(0, 10 - d / 6);
      out.push({ job: j, score, dist, why });
    }
    const by = {
      best: (a, b) => b.score - a.score || (a.dist == null ? 1 : b.dist == null ? -1 : a.dist - b.dist),
      newest: (a, b) => (b.job.posted || '').localeCompare(a.job.posted || '') || String(b.job.id).localeCompare(String(a.job.id), undefined, { numeric: true }),
      pay: (a, b) => (hourlyMax(b.job) || -1) - (hourlyMax(a.job) || -1) || b.score - a.score,
      distance: (a, b) => (a.dist == null ? 1e9 : a.dist) - (b.dist == null ? 1e9 : b.dist)
    };
    out.sort(by[f.sort] || by.best);
    return out;
  }

  function describeFilters(f, where) {
    const p = [];
    if (f.q) p.push('“' + f.q + '”');
    if (where && where.name) p.push(where.name + (f.radius === 'any' ? '' : ' +' + f.radius + ' mi'));
    if (f.types.length) p.push(f.types.join('/'));
    if (f.shifts.length) p.push(f.shifts.join('/') + ' shift');
    if (f.minPay) p.push('$' + f.minPay + '+/hr');
    if (f.posted !== 'any') p.push('last ' + f.posted + ' days');
    if (f.remote) p.push('remote');
    return p.join(' · ') || 'All jobs';
  }
  const activeCount = (f) => (f.types.length ? 1 : 0) + (f.shifts.length ? 1 : 0) + (f.minPay ? 1 : 0) + (f.posted !== 'any' ? 1 : 0) + (f.remote ? 1 : 0) + (f.radius !== 25 ? 1 : 0);

  EM.search = { DEFAULT_FILTERS, run, describeFilters, activeCount, isLive, hourlyMax };
})(window.EM);
