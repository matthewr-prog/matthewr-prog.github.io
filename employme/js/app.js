/* EmployMe — router, data loading, service worker registration. */
(function (EM) {
  'use strict';
  const { $, $$, store } = EM, S = EM.state;
  const view = () => $('#view');

  EM.loadJobs = async function () {
    S.error = null;
    try {
      const r = await fetch('data/jobs.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!Array.isArray(j)) throw new Error('jobs.json must be a list');
      S.jobs = j; S.loaded = true;
      store.set('jobsCache', { at: Date.now(), n: j.length });
    } catch (e) {
      S.loaded = false; S.error = 'You may be offline, and no saved copy is available yet. (' + e.message + ')';
    }
    EM.refreshBadge();
    const cur = ((location.hash || '#/jobs').replace(/^#\/?/, '').split('/')[0]) || 'jobs';
    if (['jobs', 'job', 'saved'].includes(cur) && !document.querySelector('#sheetRoot.open')) route(); // never wipe a form the user is typing in
  };

  function route() {
    EM.closeSheet(); EM.clearLd();
    const h = (location.hash || '#/jobs').replace(/^#\/?/, '').split('/');
    let name = h[0] || 'jobs', arg = h[1] ? decodeURIComponent(h[1]) : null;
    const v = view();
    if (!EM.views[name]) name = 'jobs';
    $$('.tabs a').forEach((a) => { const on = a.dataset.tab === ({ job: 'jobs', resume: 'profile', safety: 'info' }[name] || name); a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    v.className = 'view active' + (name === 'resume' ? ' resume-view' : '');
    document.title = 'EmployMe' + ({ jobs: ' — jobs near you', job: ' — job', saved: ' — saved', profile: ' — my profile', post: ' — post a job', info: ' — about', safety: ' — scam safety', resume: ' — resume' }[name] || '');
    EM.views[name](v, arg);
    if (name !== 'jobs') v.scrollTop = 0;
    $('#main').dataset.view = name;
  }
  EM.route = route;
  window.addEventListener('hashchange', route);

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); EM.setDeferred(e); const b = $('#installTop'); b.hidden = false; b.onclick = async () => { e.prompt(); await e.userChoice.catch(() => {}); b.hidden = true; }; });
  window.addEventListener('appinstalled', () => { $('#installTop').hidden = true; store.set('installDismissed', 1); });
  window.addEventListener('offline', () => { const b = $('#banner'); b.textContent = 'You’re offline. Showing the last jobs saved on this phone.'; b.hidden = false; });
  window.addEventListener('online', () => { $('#banner').hidden = true; EM.loadJobs(); });

  function init() {
    route(); EM.loadJobs();
    if (!navigator.onLine) window.dispatchEvent(new Event('offline'));
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { reg.update().catch(() => {}); EM.loadJobs(); } });
      }).catch((e) => console.warn('SW registration failed', e));
      // when a new version takes over, reload once so the update shows right away
      let reloaded = false, had = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; location.reload(); } had = true; });
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})(window.EM);
