// Token Launch Radar's plain dashboard. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail view with the model's own inputs, its traded comparables
// and its farm plan, plus the live-token view and the research note. No network:
// every byte it shows is in data.js. The page recomputes each row's implied
// value from the snapshot figures and the fitted curve, so a reader can see the
// board's number is the code's number, not a typed-in claim.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  app.setAttribute('aria-busy', 'false');

  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, watchOnly: false, sort: 'implied', dir: -1, tab: 'board', selected: null };
  readHash();

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) { return String(s === null || s === undefined ? '' : s); }

  // The model in one function: the fitted power law, the category multiplier,
  // the growth and maturity adjustments. It must reproduce board.json's number.
  function impliedOf(row) {
    var fit = DATA.fit;
    var base = Math.pow(10, fit.intercept + fit.slope * Math.log10(row.tvl_usd)) * row.category_multiplier;
    var growth = Math.min(120, Math.max(-60, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * 0.25;
    var age = row.age_days === null || row.age_days === undefined ? 365 : row.age_days;
    var maturity = 0.7 + (Math.min(Math.max(age, 0), 1095) / 1095) * 0.3;
    return { implied: Math.max(1, Math.round(base * growthMult * maturity)), base: Math.round(base) };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var h = window.location.hash || '';
    state.tab = 'board';
    state.selected = null;
    if (h.indexOf('#detail=') === 0) { state.selected = decodeURIComponent(h.slice(8)); return; }
    if (h === '#live') { state.tab = 'live'; return; }
    if (h === '#research') { state.tab = 'research'; return; }
    if (h.indexOf('#cat=') === 0) { state.category = decodeURIComponent(h.slice(5)); return; }
    if (h === '#watchlist') { state.watchOnly = true; return; }
  }

  function setHash(h) {
    if (window.history && window.history.replaceState) window.history.replaceState(null, '', h);
    else window.location.hash = h;
  }

  function categories() {
    var seen = {};
    DATA.rows.forEach(function (r) { if (r.category) seen[r.category] = true; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { seen[c] = true; }); });
    return Object.keys(seen).sort();
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watchOnly && !r.on_watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var av = key === 'tvl' ? a.tvl_usd : key === 'growth' ? (a.change_7d === null ? -999 : a.change_7d) : key === 'age' ? (a.age_days === null ? -1 : a.age_days) : key === 'name' ? a.name.toLowerCase() : key === 'multiple' ? a.implied_value_usd / a.tvl_usd : a.implied_value_usd;
      var bv = key === 'tvl' ? b.tvl_usd : key === 'growth' ? (b.change_7d === null ? -999 : b.change_7d) : key === 'age' ? (b.age_days === null ? -1 : b.age_days) : key === 'name' ? b.name.toLowerCase() : key === 'multiple' ? b.implied_value_usd / b.tvl_usd : b.implied_value_usd;
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
    return rows;
  }

  function header() {
    var fit = DATA.fit;
    return el('header', null,
      el('h1', { text: 'Token Launch Radar' }),
      el('p', { class: 'lede', text: DATA.rows.length + ' pre-token protocols ranked by implied launch value, priced off the snapshot\u2019s own traded tokens. Every protocol on the watchlist is covered; the rest are the largest pre-token protocols below the floor.' }),
      el('p', { class: 'meta', text: 'Snapshot: ' + DATA.source + ' \u00b7 as of ' + DATA.as_of + ' \u00b7 ' + DATA.watchlist_size + ' on the watchlist, ' + DATA.early_size + ' early rows below the $50M floor \u00b7 model ' + DATA.model_version }),
      el('div', { class: 'card' },
        el('div', { class: 'model-strip' },
          el('div', null, el('div', { class: 'lbl', text: 'Fit set' }), el('b', { text: fit.n + ' traded tokens' })),
          el('div', null, el('div', { class: 'lbl', text: 'Power law' }), el('b', { text: 'slope ' + fit.slope })),
          el('div', null, el('div', { class: 'lbl', text: 'R-squared' }), el('b', { text: String(fit.r_squared) })),
          el('div', null, el('div', { class: 'lbl', text: 'Leave-one-out error' }), el('b', { text: Math.round(fit.loo_median_abs_pct_error * 100) + '% median' })),
          el('div', null, el('div', { class: 'lbl', text: 'Top implied value' }), el('b', { text: fmtUsd(DATA.rows[0].implied_value_usd) }))
        ),
        el('p', { class: 'formula', text: 'implied = 10^(' + fit.intercept + ' + ' + fit.slope + ' x log10(TVL)) x category multiplier x (1 + 0.25 x growth) x maturity' }),
        el('p', { class: 'warn', text: 'Read every implied value as an order of magnitude, not a price target. The fit explains little of the spread between traded tokens (R-squared ' + fit.r_squared + '); the board ranks protocols, it does not predict that a token will launch or what it will open at.' })
      )
    );
  }

  function tabs() {
    function tab(href, label, on) {
      return el('a', { href: href, class: on ? 'on' : '', onclick: function (e) { e.preventDefault(); setHash(href); readHash(); render(); } }, el('span', { text: label }));
    }
    return el('nav', { class: 'tabs' },
      tab('#', 'Board (' + DATA.rows.length + ')', state.tab === 'board' && !state.selected),
      tab('#live', 'Live tokens (' + DATA.live.length + ')', state.tab === 'live'),
      tab('#research', 'Research note', state.tab === 'research'));
  }

  function controls() {
    var wrap = el('div', { class: 'controls' });
    var q = el('input', { type: 'search', placeholder: 'Search name or slug', value: state.q, 'aria-label': 'Search protocols' });
    q.addEventListener('input', function () { state.q = q.value; renderBoard(); });
    wrap.appendChild(el('div', null, el('label', { text: 'Search' }), q));
    var cat = el('select', { 'aria-label': 'Category' });
    cat.appendChild(el('option', { value: 'all', text: 'All categories' }));
    categories().forEach(function (c) { cat.appendChild(el('option', { value: c, text: c })); });
    cat.value = state.category;
    cat.addEventListener('change', function () { state.category = cat.value; renderBoard(); });
    wrap.appendChild(el('div', null, el('label', { text: 'Category' }), cat));
    var ch = el('select', { 'aria-label': 'Chain' });
    ch.appendChild(el('option', { value: 'all', text: 'All chains' }));
    chains().forEach(function (c) { ch.appendChild(el('option', { value: c, text: c })); });
    ch.value = state.chain;
    ch.addEventListener('change', function () { state.chain = ch.value; renderBoard(); });
    wrap.appendChild(el('div', null, el('label', { text: 'Chain' }), ch));
    var tv = el('select', { 'aria-label': 'Minimum TVL' });
    [[0, 'Any TVL'], [50000000, 'TVL $50M+'], [100000000, 'TVL $100M+'], [500000000, 'TVL $500M+'], [1000000000, 'TVL $1B+']].forEach(function (o) {
      tv.appendChild(el('option', { value: String(o[0]), text: o[1] }));
    });
    tv.value = String(state.minTvl);
    tv.addEventListener('change', function () { state.minTvl = Number(tv.value); renderBoard(); });
    wrap.appendChild(el('div', null, el('label', { text: 'Minimum TVL' }), tv));
    var so = el('select', { 'aria-label': 'Sort by' });
    [['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7-day growth'], ['age', 'Age'], ['name', 'Name']].forEach(function (o) {
      so.appendChild(el('option', { value: o[0], text: 'Sort: ' + o[1] }));
    });
    so.value = state.sort;
    so.addEventListener('change', function () { state.sort = so.value; renderBoard(); });
    wrap.appendChild(el('div', null, el('label', { text: 'Sort' }), so));
    var wl = el('input', { type: 'checkbox', checked: state.watchOnly ? true : null, 'aria-label': 'Watchlist only' });
    wl.addEventListener('change', function () { state.watchOnly = wl.checked; renderBoard(); });
    wrap.appendChild(el('label', { class: 'check' }, wl, el('span', { text: 'Watchlist only' })));
    return wrap;
  }

  function boardTable(rows) {
    var table = el('table', null);
    var head = el('tr', null);
    [['#', 'rank'], ['Protocol', 'name'], ['Category', 'category'], ['Chains', 'chains'], ['TVL', 'tvl'], ['7d', 'growth'], ['Age', 'age'], ['Implied value', 'implied'], ['Implied / TVL', 'multiple']].forEach(function (c, i) {
      var th = el('th', { class: (i >= 4 ? 'num ' : '') + (i === 2 ? 'catcol' : '') + (i === 3 ? ' chaincol' : '') });
      var btn = el('button', { text: c[0] + (state.sort === c[1] ? (state.dir === -1 ? ' \u25bc' : ' \u25b2') : '') });
      btn.addEventListener('click', function () {
        if (state.sort === c[1]) state.dir = -state.dir;
        else { state.sort = c[1]; state.dir = c[1] === 'name' ? 1 : -1; }
        renderBoard();
      });
      th.appendChild(btn);
      head.appendChild(th);
    });
    table.appendChild(el('thead', null, head));
    var body = el('tbody', null);
    rows.forEach(function (r) {
      var tr = el('tr', { class: 'rowlink' + (state.selected === r.slug ? ' sel' : '') });
      tr.addEventListener('click', function () { state.selected = r.slug; setHash('#detail=' + r.slug); render(); });
      var nameCell = el('td', null, el('b', { text: r.name }));
      if (r.on_watchlist) nameCell.appendChild(el('span', { class: 'badge watch', text: 'WATCHLIST' }));
      var g = el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) });
      tr.appendChild(el('td', { class: 'num', text: String(r.rank) }));
      tr.appendChild(nameCell);
      tr.appendChild(el('td', { class: 'catcol', text: esc(r.category) }));
      tr.appendChild(el('td', { class: 'chaincol', text: (r.chains || []).join(', ') }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      tr.appendChild(g);
      tr.appendChild(el('td', { class: 'num', text: fmtAge(r.age_days) }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }));
      tr.appendChild(el('td', { class: 'num', text: fmtMult(r.implied_value_usd / r.tvl_usd) }));
      body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
  }

  function detailView(row) {
    var check = impliedOf(row);
    var match = check.implied === row.implied_value_usd;
    var sec = el('section', { class: 'card detail' },
      el('p', { class: 'back' }, el('a', { href: '#', text: '\u2190 Back to the board', onclick: function (e) { e.preventDefault(); state.selected = null; setHash('#'); render(); } })),
      el('h2', null, el('span', { text: '#' + row.rank + ' ' + row.name }), row.on_watchlist ? el('span', { class: 'badge watch', text: 'WATCHLIST' }) : null),
      el('p', { class: 'meta', text: (row.category || 'Uncategorised') + ' \u00b7 ' + (row.chains || []).join(', ') + ' \u00b7 tracked since ' + (row.listed_at || 'unknown') + ' \u00b7 records no token' }),
      el('div', { class: 'kv' },
        el('div', null, el('div', { class: 'lbl', text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('div', { class: 'lbl', text: '7-day growth' }), el('b', { text: fmtPct(row.change_7d) })),
        el('div', null, el('div', { class: 'lbl', text: 'Age, no token' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', null, el('div', { class: 'lbl', text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('div', { class: 'lbl', text: 'Implied / TVL' }), el('b', { text: fmtMult(row.implied_value_usd / row.tvl_usd) }))
      ),
      el('h3', { text: 'How the value is built' }),
      el('table', null, el('tbody', null,
        el('tr', null, el('td', { text: 'Fitted power law at this TVL' }), el('td', { class: 'num', text: fmtUsd(row.base_power_law_usd) })),
        el('tr', null, el('td', { text: 'Category multiplier (' + (row.category || 'Uncategorised') + ')' }), el('td', { class: 'num', text: 'x' + row.category_multiplier.toFixed(2) })),
        el('tr', null, el('td', { text: 'Growth multiplier (' + fmtPct(row.change_7d) + ' over 7 days)' }), el('td', { class: 'num', text: 'x' + row.growth_multiplier.toFixed(2) })),
        el('tr', null, el('td', { text: 'Maturity multiplier (' + fmtAge(row.age_days) + ' with no token)' }), el('td', { class: 'num', text: 'x' + row.maturity_multiplier.toFixed(2) })),
        el('tr', null, el('td', { text: 'Page recomputes from the same figures' }), el('td', { class: 'num', text: fmtUsd(check.implied) + (match ? ' \u2014 matches the board' : ' \u2014 differs from the board') }))
      )),
      el('h3', { text: 'Traded comparables (nearest by size in its category, or overall when the category is thin)' }),
      el('table', null, el('thead', null, el('tr', null,
        el('th', { text: 'Protocol' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'Mcap / TVL' }))),
        el('tbody', null, row.comparables.map(function (c) {
          return el('tr', null, el('td', { text: c.name }), el('td', { class: 'num', text: fmtUsd(c.tvl_usd) }), el('td', { class: 'num', text: fmtUsd(c.mcap_usd) }), el('td', { class: 'num', text: fmtMult(c.mcap_tvl) }));
        })))
    );
    sec.appendChild(el('h3', { text: 'Farm plan \u2014 six steps' }));
    var ol = el('ol', { class: 'steps' });
    row.farm_steps.forEach(function (s) { ol.appendChild(el('li', { text: s })); });
    sec.appendChild(ol);
    sec.appendChild(el('p', { class: 'small', text: 'Never pay to claim, and never follow a claim link from anywhere but the protocol\u2019s own page.' }));
    return sec;
  }

  function liveView() {
    var table = el('table', null,
      el('thead', null, el('tr', null,
        el('th', { text: 'Protocol' }), el('th', { class: 'catcol', text: 'Category' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'Mcap / TVL' }), el('th', { class: 'num', text: '7d' }))),
      el('tbody', null, DATA.live.map(function (r) {
        return el('tr', null,
          el('td', null, el('b', { text: r.name })),
          el('td', { class: 'catcol', text: esc(r.category) }),
          el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
          el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
          el('td', { class: 'num', text: fmtMult(r.mcap_tvl) }),
          el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }));
      })));
    return el('div', null,
      el('h2', { text: 'Live tokens \u2014 what the market already pays' }),
      el('p', { class: 'lede', text: 'The ' + DATA.live.length + ' largest traded tokens in the snapshot, at the market\u2019s own values. They are the fit set\u2019s neighbours, kept apart from the ranked board so a protocol that already trades never stands as a launch.' }),
      table);
  }

  function researchView() {
    var wrap = el('div', { class: 'note' },
      el('h2', { text: 'Research note' }));
    DATA.research.forEach(function (p) { wrap.appendChild(el('p', { text: p })); });
    wrap.appendChild(el('h3', { text: 'Calibration by category (traded tokens, median multiple, fitted multiplier)' }));
    var ct = el('table', null,
      el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Traded n' }), el('th', { class: 'num', text: 'Median mcap / TVL' }), el('th', { class: 'num', text: 'Multiplier' }))),
      el('tbody', null, DATA.categories.map(function (c) {
        return el('tr', null, el('td', { text: c.category }), el('td', { class: 'num', text: String(c.traded_n) }), el('td', { class: 'num', text: fmtMult(c.median_mcap_tvl) }), el('td', { class: 'num', text: 'x' + c.multiplier.toFixed(2) }));
      })));
    wrap.appendChild(ct);
    wrap.appendChild(el('h3', { text: 'The size effect (traded tokens by TVL band)' }));
    var bt = el('table', null,
      el('thead', null, el('tr', null, el('th', { text: 'TVL band' }), el('th', { class: 'num', text: 'Traded n' }), el('th', { class: 'num', text: 'Median mcap / TVL' }))),
      el('tbody', null, DATA.bands.map(function (b) {
        return el('tr', null, el('td', { text: b.label }), el('td', { class: 'num', text: String(b.n) }), el('td', { class: 'num', text: fmtMult(b.median_mcap_tvl) }));
      })));
    wrap.appendChild(bt);
    wrap.appendChild(el('p', { class: 'small', text: 'Source: ' + DATA.source + '. Implied values are this entry\u2019s own claim, never make.fun\u2019s. A protocol that records no token may still have one its DefiLlama record does not carry.' }));
    return wrap;
  }

  var boardHost;
  function renderBoard() {
    if (!boardHost) return;
    boardHost.innerHTML = '';
    var rows = filteredRows();
    boardHost.appendChild(el('p', { class: 'count', text: rows.length + ' of ' + DATA.rows.length + ' rows shown' }));
    boardHost.appendChild(boardTable(rows));
  }

  function render() {
    app.innerHTML = '';
    app.appendChild(header());
    app.appendChild(tabs());
    if (state.tab === 'live') { app.appendChild(liveView()); return; }
    if (state.tab === 'research') { app.appendChild(researchView()); return; }
    if (state.selected) {
      var row = null;
      DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
      if (row) { app.appendChild(detailView(row)); return; }
      state.selected = null;
    }
    app.appendChild(controls());
    boardHost = el('div', null);
    app.appendChild(boardHost);
    renderBoard();
  }

  window.addEventListener('hashchange', function () { readHash(); render(); });
  render();
})();
