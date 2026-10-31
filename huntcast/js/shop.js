/* HuntCast — Shop tab. Reads data/shop.json:
 *   { "stores": [ { "name", "url", "description", "image" (optional), "category" } ], "_example": [ ... never shown ] }
 * (a bare array of stores also works). Add a store by adding an object to "stores". */
(function (HC) {
  'use strict';
  const EMAIL = 'matthewr@npigrp.com';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const okUrl = (u) => /^https?:\/\//i.test(String(u || ''));
  const okImg = (u) => /^(https?:\/\/|\.?\/?[\w\-./%]+$)/i.test(String(u || ''));
  let stores = null, cat = 'All', failed = false;
  function empty() {
    return '<div class="card shop-empty"><div class="shop-emoji">🛒</div><h3>Partner stores coming soon</h3>' +
      '<p class="muted">HuntCast is lining up local gun shops, outdoor stores and outfitters. Check back soon for deals and links.</p>' +
      '<a class="btn" href="mailto:' + EMAIL + '?subject=HuntCast%20partner">Become a partner</a></div>';
  }
  function render() {
    const body = $('#shopBody'), cats = $('#shopCats');
    if (stores === null) { body.innerHTML = '<div class="card center muted">Loading…</div>'; return; }
    if (!stores.length) { cats.hidden = true; body.innerHTML = failed ? '<div class="card muted">Couldn\'t load the store list (offline?). ' + '</div>' + empty() : empty(); return; }
    const names = ['All'].concat(Array.from(new Set(stores.map((s) => s.category).filter(Boolean))));
    cats.hidden = names.length < 3;
    cats.innerHTML = names.map((n) => '<button type="button" class="pill-btn' + (n === cat ? ' sel' : '') + '" data-c="' + esc(n) + '">' + esc(n) + '</button>').join('');
    const list = stores.filter((s) => cat === 'All' || s.category === cat);
    body.innerHTML = list.map((s) =>
      '<article class="card shop-card">' +
      (s.image && okImg(s.image) ? '<img class="shop-img" src="' + esc(s.image) + '" alt="' + esc(s.name) + '" loading="lazy">' : '') +
      '<div class="shop-info"><div class="row-between"><b>' + esc(s.name) + '</b>' + (s.category ? '<span class="chip-s">' + esc(s.category) + '</span>' : '') + '</div>' +
      (s.description ? '<p class="muted">' + esc(s.description) + '</p>' : '') +
      '<a class="btn small" href="' + esc(s.url) + '" target="_blank" rel="noopener sponsored">Visit store ↗</a></div></article>'
    ).join('') +
      '<p class="muted tiny shop-note">Some links may be affiliate links — HuntCast may earn a commission at no cost to you. <a href="mailto:' + EMAIL + '?subject=HuntCast%20partner">Become a partner</a></p>';
  }
  function load() {
    if (stores !== null) return;
    fetch('data/shop.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((j) => {
      const arr = Array.isArray(j) ? j : (j && j.stores) || [];
      stores = arr.filter((s) => s && s.name && okUrl(s.url));
    }).catch(() => { stores = []; failed = true; }).then(render);
  }
  function show() { render(); load(); }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#shopCats button'); if (!b) return;
    cat = b.dataset.c; render();
  });
  HC.shop = { show };
})(window.HC = window.HC || {});
