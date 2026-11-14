// Dashboard rendering for the token launch radar. All data comes from
// data.js, written beside this page by main.ts; the page makes no network
// request of its own. Views are chosen by the address hash so the three
// screenshots can each show one state: no hash for the board,
// #detail=<slug> for one protocol, #watchlist for the watchlist filter.
(function () {
  var R = window.RADAR;
  var rows = R.rows;
  var model = R.model;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function money(v) {
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "k";
    return "$" + Math.round(v);
  }
  function tvl(v) { return money(v); }
  function pct(v) {
    if (v === null || v === undefined) return "—";
    return (v > 0 ? "+" : "") + v.toFixed(1) + "%";
  }
  function age(v) { return v.toFixed(2) + "y"; }
  function $(id) { return document.getElementById(id); }

  document.getElementById("as-of").textContent = R.as_of;
  var wl = rows.filter(function (r) { return r.on_watchlist; }).length;
  document.getElementById("hero-stats").innerHTML =
    '<div class="stat"><div class="num">' + rows.length + ' ranked</div><div class="lbl">' + wl + ' watchlist · ' + (rows.length - wl) + ' early</div></div>' +
    '<div class="stat"><div class="num">' + money(rows[0].implied_value_usd) + '</div><div class="lbl">Top implied · ' + esc(rows[0].name) + '</div></div>' +
    '<div class="stat"><div class="num">' + R.comparables + ' comps</div><div class="lbl">Traded tokens priced</div></div>' +
    '<div class="stat"><div class="num">R² ' + model.full_r2.toFixed(2) + '</div><div class="lbl">Power law R² ' + model.base_r2.toFixed(2) + '</div></div>';

  document.getElementById("model-strip").innerHTML =
    '<p class="formula">value = 10^' + model.intercept.toFixed(2) + ' &times; TVL^' + model.tvl_slope.toFixed(3) +
    ' &times; category &times; seasoning &times; momentum</p>' +
    '<p>Fitted at run time from the snapshot&rsquo;s own ' + R.comparables + ' comparable launches (of ' + R.traded_total +
    ' traded tokens). Half of the comparables land within &times;' + model.band_low_x.toFixed(2) + ' to &times;' + model.band_high_x.toFixed(2) +
    ' of the curve; the five-fold backtest puts ' + Math.round(model.cv_within_3x * 100) + '% within &times;3 and ' +
    Math.round(model.cv_within_5x * 100) + '% within &times;5. ' +
    'Seasoning is log10(age in years + 0.25), momentum is the 7-day TVL change clipped to &plusmn;20%. ' +
    'Category factors are shrunk residuals, trusted only where a category has at least three comparables.</p>';

  // Scatter: comparables on log-log axes, fitted line, middle-half band.
  (function scatter() {
    var pts = R.scatter;
    var W = 1160, H = 150, padL = 52, padB = 26, padT = 10, padR = 14;
    var xs = pts.map(function (p) { return p.log_tvl; });
    var ys = pts.map(function (p) { return p.log_mcap; });
    var x0 = Math.floor(Math.min.apply(null, xs) * 2) / 2, x1 = Math.ceil(Math.max.apply(null, xs) * 2) / 2;
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    function X(v) { return padL + (v - x0) / (x1 - x0) * (W - padL - padR); }
    function Y(v) { return H - padB - (v - y0) / (y1 - y0) * (H - padB - padT); }
    var bandLo = Math.log10(model.band_low_x), bandHi = Math.log10(model.band_high_x);
    function linePath(off) {
      var a = model.base_intercept + model.base_slope * x0 + off;
      var b = model.base_intercept + model.base_slope * x1 + off;
      return "M" + X(x0).toFixed(1) + " " + Y(a).toFixed(1) + " L" + X(x1).toFixed(1) + " " + Y(b).toFixed(1);
    }
    var dots = pts.map(function (p) {
      return '<circle cx="' + X(p.log_tvl).toFixed(1) + '" cy="' + Y(p.log_mcap).toFixed(1) + '" r="3.2" fill="#2563eb" opacity="0.75"><title>' + esc(p.name) + ' · TVL ' + money(Math.pow(10, p.log_tvl)) + ' · mcap ' + money(Math.pow(10, p.log_mcap)) + '</title></circle>';
    }).join("");
    var ticks = "";
    for (var gx = Math.ceil(x0); gx <= x1; gx++) {
      var label = gx >= 9 ? "$" + Math.pow(10, gx - 9) + "B" : "$" + Math.pow(10, gx - 6) + "M";
      ticks += '<text x="' + X(gx) + '" y="' + (H - 6) + '" font-size="10" fill="#5a6b82" text-anchor="middle">' + label + '</text>';
    }
    document.getElementById("scatter").innerHTML =
      '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Comparable launches, market cap against TVL">' +
      '<path d="' + linePath(bandHi) + ' L' + X(x1).toFixed(1) + ' ' + Y(model.base_intercept + model.base_slope * x1 + bandLo).toFixed(1) + ' L' + X(x0).toFixed(1) + ' ' + Y(model.base_intercept + model.base_slope * x0 + bandLo).toFixed(1) + ' Z" fill="#dbeafe" />' +
      '<path d="' + linePath(0) + '" stroke="#0f2a4a" stroke-width="2" fill="none" />' +
      '<path d="' + linePath(bandLo) + '" stroke="#93c5fd" stroke-width="1" stroke-dasharray="4 3" fill="none" />' +
      '<path d="' + linePath(bandHi) + '" stroke="#93c5fd" stroke-width="1" stroke-dasharray="4 3" fill="none" />' +
      dots + ticks +
      '<text x="14" y="18" font-size="11" fill="#5a6b82">log market cap</text>' +
      '</svg>';
  })();

  var cats = Array.from(new Set(rows.map(function (r) { return r.category || "Uncategorised"; }))).sort();
  var chains = Array.from(new Set(rows.flatMap(function (r) { return r.chains; }))).sort();
  cats.forEach(function (c) { $("category").insertAdjacentHTML("beforeend", '<option>' + esc(c) + '</option>'); });
  chains.forEach(function (c) { $("chain").insertAdjacentHTML("beforeend", '<option>' + esc(c) + '</option>'); });

  var sortKey = "rank", sortDir = 1;
  function visibleRows() {
    var q = $("search").value.trim().toLowerCase();
    var cat = $("category").value, chain = $("chain").value;
    var list = rows.filter(function (r) {
      if (q && (r.name + " " + r.slug + " " + (r.category || "")).toLowerCase().indexOf(q) < 0) return false;
      if (cat && (r.category || "Uncategorised") !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if ($("watchlist-only").checked && !r.on_watchlist) return false;
      if ($("early-only").checked && r.on_watchlist) return false;
      return true;
    });
    list = list.slice().sort(function (a, b) {
      var av = a[sortKey], bv = b[sortKey];
      if (typeof av === "string") return sortDir * av.localeCompare(bv);
      return sortDir * ((av === null ? -Infinity : av) - (bv === null ? -Infinity : bv));
    });
    return list;
  }
  function renderBoard() {
    var list = visibleRows();
    $("row-count").textContent = list.length + " of " + rows.length + " rows shown";
    $("board-body").innerHTML = list.map(function (r) {
      return '<tr><td>' + r.rank + '</td><td><a href="#detail=' + r.slug + '">' + esc(r.name) + '</a>' +
        (r.on_watchlist ? '<span class="badge">WATCHLIST</span>' : '<span class="badge early-badge">EARLY</span>') +
        '</td><td>' + esc(r.category || "—") + '</td><td class="num">' + tvl(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d > 0 ? "pos" : r.change_7d < 0 ? "neg" : "") + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_years) + '</td>' +
        '<td class="num implied">' + money(r.implied_value_usd) + '</td>' +
        '<td class="num">' + r.x_tvl.toFixed(3) + 'x</td>' +
        '<td class="num">$' + r.slice_per_1k_usd.toFixed(2) + '</td>' +
        '<td>' + esc(r.farm_summary) + '</td></tr>';
    }).join("");
  }
  document.querySelectorAll("th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var key = th.getAttribute("data-sort");
      if (sortKey === key) sortDir = -sortDir; else { sortKey = key; sortDir = 1; }
      renderBoard();
    });
  });
  ["search", "category", "chain", "watchlist-only", "early-only"].forEach(function (id) {
    $(id).addEventListener("input", renderBoard);
  });

  function renderDetail(slug) {
    var box = $("detail");
    var r = bySlug[slug];
    if (!r) { box.innerHTML = ""; return; }
    var comps = R.scatter.filter(function (p) { return p.category === r.category; })
      .sort(function (a, b) { return b.log_mcap - a.log_mcap; }).slice(0, 5);
    box.innerHTML =
      '<div class="detail-card"><h2>' + esc(r.name) + ' <span class="badge">' + (r.on_watchlist ? "WATCHLIST" : "EARLY") + '</span></h2>' +
      '<p class="sub">' + esc(r.category || "Uncategorised") + ' &middot; ' + esc(r.chains.join(", ")) + ' &middot; TVL ' + tvl(r.tvl_usd) +
      ' &middot; 7d ' + pct(r.change_7d) + ' &middot; listed ' + r.age_years.toFixed(2) + ' years ago &middot; records no token</p>' +
      '<div class="detail-grid"><div><h3>How the value is built</h3>' +
      '<table class="breakdown"><tr><td>Size curve, TVL ' + tvl(r.tvl_usd) + '</td><td>' + money(r.model_base_usd) + '</td></tr>' +
      '<tr><td>Category factor (' + esc(r.category || "none") + ')</td><td>&times;' + r.model_category_x.toFixed(2) + '</td></tr>' +
      '<tr><td>Seasoning (' + r.age_years.toFixed(2) + ' years)</td><td>&times;' + r.model_seasoning_x.toFixed(2) + '</td></tr>' +
      '<tr><td>Momentum (' + pct(r.change_7d) + ' in 7 days)</td><td>&times;' + r.model_momentum_x.toFixed(2) + '</td></tr>' +
      '<tr><td>Implied launch value</td><td>' + money(r.implied_value_usd) + '</td></tr>' +
      '<tr><td>Slice per $1,000 staked (10% pro-rata)</td><td>$' + r.slice_per_1k_usd.toFixed(2) + '</td></tr></table>' +
      '<h3 style="margin-top:12px">Traded comparables in this category</h3><p>' +
      (comps.length ? comps.map(function (p) { return esc(p.name) + ' (' + money(Math.pow(10, p.log_mcap)) + ')'; }).join(" &middot; ") : "No traded comparable in this category in the fit set — the category factor is 1.00.") + '</p></div>' +
      '<div><h3>Farm plan &middot; $1,000 working stake</h3><ol>' +
      r.farm_steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") +
      '</ol></div></div></div>';
  }

  document.getElementById("research-note").innerHTML =
    '<h2>Research note — how this radar is built, and what it does not claim</h2>' +
    '<h3>The fit</h3><p>The power law is fitted to ' + R.comparables + ' comparable launches from this snapshot alone: traded tokens outside the ' +
    'bridge, staking and exchange categories, with a market-cap-to-TVL ratio between 0.01 and 5. The ratio band drops ' + model.excluded_by_ratio.length + ' tokens: ' +
    esc(model.excluded_by_ratio.join(", ")) + '. The plain size curve explains R² ' + model.base_r2.toFixed(2) +
    ' of the comparables; adding shrunk category factors, seasoning and momentum lifts it to R² ' + model.full_r2.toFixed(2) +
    '. The five-fold backtest (folds dealt by slug order, each fold refitted) puts ' + Math.round(model.cv_within_2x * 100) +
    '% of held-out comparables within &times;2 of their true market cap, ' + Math.round(model.cv_within_3x * 100) + '% within &times;3.</p>' +
    '<h3>Thin categories</h3><p>Two of the board&rsquo;s biggest categories have almost no traded precedent in this snapshot. Risk Curators has one ' +
    'comparable (Api3); Onchain Capital Allocator has one in the fit set (Concrete). A single token cannot set a category factor, so both ' +
    'carry a factor of 1.00 and their values come from the size curve, seasoning and momentum alone. That is the board&rsquo;s widest ' +
    'uncertainty, and it is why Steakhouse Financial and Veda sit where the curve puts them rather than where one precedent would.</p>' +
    '<h3>The watchlist is a floor</h3><p>The watchlist names 40 protocols and the board holds 198 rows: the watchlist is a floor, never a ceiling, and a board may rank protocols the watchlist does not name. Above the floor, a protocol joins the board only when its record carries no token at all — no market cap, no CoinGecko id, no symbol. Sentora Curator is the largest such name the watchlist leaves out, a Risk Curators protocol with $2.76B of TVL. Morpho Blue is left out on the same line: $10.41B of TVL, but its record carries the symbol MORPHO, so its token already trades. Circle Gateway and USDCx are left out too, a cross-chain bridge and a wrapped stablecoin — neither is a launch.</p>' +
    '<h3>What the board does not claim</h3><ul><li>It does not predict whether or when any protocol issues a token — only what the token would be worth if the protocol&rsquo;s record stayed as it is.</li>' +
    '<li>It does not rank exchange chains, bridges or wrapped products as launches: they record no token only because their token already trades under another name.</li>' +
    '<li>Gas fees are snapshot-date estimates per chain; the farm column names the action, the chain, the fee and the setup time for a $1,000 stake.</li></ul>';

  function route() {
    var hash = location.hash || "";
    var detail = hash.match(/^#detail=(.+)$/);
    document.body.classList.toggle("detail-mode", !!detail);
    if (detail) { renderDetail(decodeURIComponent(detail[1])); }
    else { renderDetail(""); }
    if (hash === "#watchlist") { $("watchlist-only").checked = true; }
    if (hash.indexOf("#category=") === 0) { $("category").value = decodeURIComponent(hash.slice(10)); }
    renderBoard();
  }
  window.addEventListener("hashchange", route);
  route();
})();
