/**
 * Catalyst Radar — filters, Potential, ship radar hooks, majors bars
 */
(function () {
  'use strict';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  let allRows = [];
  let activeFilter = 'all';

  function fmt(n, d = 2) {
    if (n == null || !Number.isFinite(+n)) return '—';
    const v = +n;
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toFixed(d);
  }
  function pct(n) {
    if (n == null || !Number.isFinite(+n)) return '—';
    const v = +n;
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  }
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function tick() {
    const c = $('#clock');
    if (c) c.textContent = new Date().toISOString().slice(11, 16) + ' UTC';
  }
  tick();
  setInterval(tick, 20000);

  async function fetchJson(url, timeout = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  function classify(r) {
    const tags = [];
    if (r.ageHours != null && r.ageHours < 48) tags.push('new');
    if (r.boosted) tags.push('boosted');
    if (r.risk === 'THIN' || r.risk === 'EXTREME' || r.risk === 'VOL/LIQ') tags.push('risk');
    if (
      r.liq != null && r.liq >= 15000 &&
      r.risk !== 'THIN' && r.risk !== 'EXTREME' &&
      ((r.ch24 != null && Math.abs(r.ch24) >= 8 && Math.abs(r.ch24) < 120) || (r.vol != null && r.vol >= 20000))
    ) tags.push('potential');
    const sym = (r.symbol || '').toUpperCase();
    if (sym.length <= 5 || /PEPE|DOGE|MEME|CAT|DOG|INU|WIF|BONK|MOON|PUMP|FROG|TRUMP/.test(sym))
      tags.push('meme');
    return tags;
  }

  function matchesFilter(r, filter) {
    if (filter === 'all') return true;
    return (r.tags || classify(r)).includes(filter);
  }

  function renderTable(rows) {
    const body = $('#discovery-body');
    const count = $('#discovery-count');
    if (!body) return;
    const filtered = rows.filter((r) => matchesFilter(r, activeFilter));
    body.innerHTML = '';
    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="7" class="loading-row">Нет кандидатов по этому фильтру</td></tr>';
      if (count) count.textContent = '0 candidates';
      return;
    }
    filtered.forEach((r) => {
      const tr = document.createElement('tr');
      const ch24Class = r.ch24 == null ? '' : r.ch24 >= 0 ? 'color:var(--green)' : 'color:var(--red)';
      const ch1Class = r.ch1 == null ? '' : r.ch1 >= 0 ? 'color:var(--green)' : 'color:var(--red)';
      const riskClass = r.risk === '—' ? 'muted' : r.risk === 'THIN' || r.risk === 'EXTREME' ? 'red' : 'amber';
      let forecastHtml = '—';
      if (r.ch24 != null && Number.isFinite(r.ch24)) {
        const out = 1 * (1 + r.ch24 / 100);
        const col = r.ch24 >= 0 ? 'var(--green)' : 'var(--red)';
        forecastHtml = '<span class="mono" style="color:' + col + ';font-weight:500">$1 → $' + out.toFixed(2) + '</span>';
      }
      tr.innerHTML =
        '<td><strong style="color:var(--text)">' + r.symbol + '</strong><div style="font-size:11px;color:var(--text-muted)">' + r.chain + '</div></td>' +
        '<td class="mono">' + (r.price != null ? '$' + fmt(r.price, 6) : '—') + '</td>' +
        '<td class="mono"><span style="' + ch1Class + '">' + pct(r.ch1) + '</span> / <span style="' + ch24Class + '">' + pct(r.ch24) + '</span></td>' +
        '<td class="mono">' + fmt(r.liq, 0) + '</td>' +
        '<td class="mono">' + fmt(r.vol, 0) + '</td>' +
        '<td><span class="tag ' + riskClass + '">' + r.risk + '</span></td>' +
        '<td>' + forecastHtml + '</td>';
      body.appendChild(tr);
    });
    if (count) count.textContent = filtered.length + ' candidates';
  }

  function bindFilters() {
    const bar = $('#discovery-filters');
    if (!bar) return;
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      e.preventDefault();
      activeFilter = btn.getAttribute('data-filter') || 'all';
      $$('#discovery-filters .chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      renderTable(allRows);
    });
  }

  async function loadDiscovery() {
    const body = $('#discovery-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="7" class="loading-row">Loading on-chain discovery feeds…</td></tr>';
    try {
      const data = await fetchJson('https://api.dexscreener.com/token-profiles/latest/v1');
      const list = Array.isArray(data) ? data.slice(0, 28) : [];
      const rows = [];
      for (const item of list.slice(0, 20)) {
        const chain = (item.chainId || '').toLowerCase();
        const addr = item.tokenAddress || '';
        let pair = null;
        try {
          const pairs = await fetchJson('https://api.dexscreener.com/latest/dex/tokens/' + addr, 5000);
          pair = (pairs && pairs.pairs && pairs.pairs[0]) || null;
        } catch (_) {}
        const price = pair && pair.priceUsd ? +pair.priceUsd : null;
        const ch24 = pair && pair.priceChange && pair.priceChange.h24 != null ? +pair.priceChange.h24 : null;
        const ch1 = pair && pair.priceChange && pair.priceChange.h1 != null ? +pair.priceChange.h1 : null;
        const liq = pair && pair.liquidity && pair.liquidity.usd != null ? +pair.liquidity.usd : null;
        const vol = pair && pair.volume && pair.volume.h24 != null ? +pair.volume.h24 : null;
        const symbol = ((pair && pair.baseToken && pair.baseToken.symbol) || item.description || 'TOKEN').slice(0, 12);
        let ageHours = null;
        if (pair && pair.pairCreatedAt) ageHours = Math.max(0, (Date.now() - pair.pairCreatedAt) / 3600000);
        let risk = '—';
        if (liq != null && liq < 5000) risk = 'THIN';
        else if (liq != null && vol != null && liq > 0 && vol / liq > 15) risk = 'VOL/LIQ';
        else if (ch24 != null && Math.abs(ch24) > 80) risk = 'EXTREME';
        const row = { symbol, chain: chain || '—', price, ch1, ch24, liq, vol, risk, boosted: false, ageHours };
        row.tags = classify(row);
        if (item.url && /boost/i.test(String(item.url))) {
          row.boosted = true;
          if (!row.tags.includes('boosted')) row.tags.push('boosted');
        }
        rows.push(row);
      }
      allRows = rows;
      const sc = $('#stat-candidates'); if (sc) sc.textContent = rows.length;
      const sp = $('#stat-pools'); if (sp) sp.textContent = rows.length;
      renderTable(allRows);
      renderMomentum(allRows);
      renderRisk(allRows);
      renderScatter(allRows);
    } catch (err) {
      console.warn('Discovery load failed', err);
      body.innerHTML = '<tr><td colspan="7" class="loading-row">Public DEX endpoints unavailable right now</td></tr>';
    }
  }

  function renderMomentum(rows) {
    const box = $('#momentum-chart');
    if (!box) return;
    const sorted = rows.filter((r) => r.ch24 != null).sort((a, b) => Math.abs(b.ch24) - Math.abs(a.ch24)).slice(0, 8);
    if (!sorted.length) { box.innerHTML = '<div class="empty-state">Нет данных по изменению 24ч</div>'; return; }
    const max = Math.max(...sorted.map((r) => Math.abs(r.ch24)), 1);
    box.innerHTML = '';
    box.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:12px;align-items:stretch';
    sorted.forEach((r) => {
      const w = Math.min(100, (Math.abs(r.ch24) / max) * 100);
      const color = r.ch24 >= 0 ? 'var(--green)' : 'var(--red)';
      box.appendChild(el('div', null,
        '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span class="mono">' + r.symbol +
        '</span><span class="mono" style="color:' + color + '">' + pct(r.ch24) + '</span></div>' +
        '<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + w +
        '%;background:' + color + ';border-radius:3px"></div></div>'));
    });
  }

  function renderRisk(rows) {
    const box = $('#risk-chart');
    if (!box) return;
    const counts = { ok: 0, review: 0, high: 0 };
    rows.forEach((r) => {
      if (r.risk === '—' || !r.risk) counts.ok++;
      else if (r.risk === 'THIN' || r.risk === 'EXTREME') counts.high++;
      else counts.review++;
    });
    const total = counts.ok + counts.review + counts.high || 1;
    box.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:10px;width:100%;padding:16px">' +
      '<div style="flex:1;height:10px;background:var(--border);border-radius:5px;overflow:hidden;display:flex">' +
      '<div style="width:' + (counts.ok / total) * 100 + '%;background:var(--green)"></div>' +
      '<div style="width:' + (counts.review / total) * 100 + '%;background:var(--amber)"></div>' +
      '<div style="width:' + (counts.high / total) * 100 + '%;background:var(--red)"></div></div>' +
      '<div style="display:flex;gap:16px;font-size:12px;color:var(--text-muted)">' +
      '<span><i style="color:var(--green)">●</i> Low ' + counts.ok + '</span>' +
      '<span><i style="color:var(--amber)">●</i> Review ' + counts.review + '</span>' +
      '<span><i style="color:var(--red)">●</i> High ' + counts.high + '</span></div></div>';
  }

  function renderScatter(rows) {
    const box = $('#liq-vol-chart');
    if (!box) return;
    const pts = rows.filter((r) => r.liq > 0 && r.vol > 0).slice(0, 30);
    if (!pts.length) { box.innerHTML = '<div class="empty-state">Недостаточно пар liq/vol</div>'; return; }
    const maxL = Math.max(...pts.map((p) => p.liq));
    const maxV = Math.max(...pts.map((p) => p.vol));
    box.innerHTML = '';
    box.style.position = 'relative';
    box.style.padding = '12px';
    const canvas = document.createElement('div');
    canvas.style.cssText = 'position:relative;width:100%;height:200px;background:repeating-linear-gradient(0deg,transparent,transparent 19px,var(--border) 20px),repeating-linear-gradient(90deg,transparent,transparent 19px,var(--border) 20px)';
    pts.forEach((p) => {
      const x = (p.liq / maxL) * 92 + 2;
      const y = 100 - ((p.vol / maxV) * 92 + 2);
      const color = p.risk === 'THIN' || p.risk === 'EXTREME' ? 'var(--red)' : p.risk === 'VOL/LIQ' ? 'var(--amber)' : 'var(--green)';
      const dot = document.createElement('div');
      dot.title = p.symbol + ' · liq ' + fmt(p.liq) + ' · vol ' + fmt(p.vol);
      dot.style.cssText = 'position:absolute;left:' + x + '%;top:' + y + '%;width:8px;height:8px;border-radius:50%;background:' + color + ';transform:translate(-50%,-50%);opacity:0.85';
      canvas.appendChild(dot);
    });
    box.appendChild(canvas);
  }

  async function loadMajors() {
    try {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'DOGEUSDT', 'ADAUSDT'];
      const res = await fetchJson('https://api.binance.com/api/v3/ticker/24hr');
      const map = {};
      (res || []).forEach((t) => { if (symbols.includes(t.symbol)) map[t.symbol] = t; });

      const changeBox = $('#majors-change-chart');
      if (changeBox) {
        const items = symbols.map((s) => map[s]).filter(Boolean)
          .sort((a, b) => Math.abs(+b.priceChangePercent) - Math.abs(+a.priceChangePercent));
        if (!items.length) changeBox.innerHTML = '<div class="empty-state">Котировки недоступны</div>';
        else {
          const max = Math.max(...items.map((t) => Math.abs(+t.priceChangePercent)), 1);
          changeBox.innerHTML = '';
          changeBox.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:14px;align-items:stretch';
          items.forEach((t) => {
            const ch = +t.priceChangePercent;
            const w = Math.min(100, (Math.abs(ch) / max) * 100);
            const color = ch >= 0 ? 'var(--green)' : 'var(--red)';
            const name = t.symbol.replace('USDT', '');
            changeBox.appendChild(el('div', null,
              '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">' +
              '<span class="mono" style="color:var(--text)">' + name + '</span>' +
              '<span class="mono" style="color:' + color + '">' + pct(ch) + ' · $' + fmt(+t.lastPrice, 2) + '</span></div>' +
              '<div style="height:7px;background:var(--border);border-radius:4px;overflow:hidden">' +
              '<div style="height:100%;width:' + w + '%;background:' + color + ';border-radius:4px"></div></div>'));
          });
        }
      }

      const breadth = $('#breadth-chart');
      if (breadth) {
        const items = symbols.map((s) => map[s]).filter(Boolean);
        const up = items.filter((t) => +t.priceChangePercent >= 0).length;
        const down = items.length - up;
        breadth.innerHTML =
          '<div style="padding:20px;text-align:center;width:100%"><div style="font-size:28px;font-weight:500;margin-bottom:8px">' +
          '<span style="color:var(--green)">' + up + '</span><span style="color:var(--text-muted)"> / </span>' +
          '<span style="color:var(--red)">' + down + '</span></div>' +
          '<div class="mono" style="font-size:11px;color:var(--text-muted)">ADV / DEC · selected majors</div></div>';
      }

      const volBox = $('#volume-chart');
      if (volBox) {
        const items = symbols.map((s) => map[s]).filter(Boolean).sort((a, b) => +b.quoteVolume - +a.quoteVolume);
        const maxV = Math.max(...items.map((t) => +t.quoteVolume), 1);
        volBox.innerHTML = '';
        volBox.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:14px;align-items:stretch';
        items.forEach((t) => {
          const w = (+t.quoteVolume / maxV) * 100;
          volBox.appendChild(el('div', null,
            '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
            '<span class="mono">' + t.symbol.replace('USDT', '') + '</span>' +
            '<span class="mono">' + fmt(+t.quoteVolume, 0) + '</span></div>' +
            '<div style="height:5px;background:var(--border);border-radius:3px">' +
            '<div style="height:100%;width:' + w + '%;background:var(--copper);border-radius:3px;opacity:0.8"></div></div>'));
        });
      }
    } catch (e) { console.warn('Majors', e); }
  }

  function animateRadarBlips() {
    const blips = $$('.ship-radar .blip');
    if (!blips.length) return;
    setInterval(() => {
      blips.forEach((b) => {
        if (Math.random() > 0.55) {
          b.style.top = 15 + Math.random() * 65 + '%';
          b.style.left = 15 + Math.random() * 65 + '%';
        }
      });
    }, 2800);
  }

  const refresh = $('#refresh-btn');
  if (refresh) refresh.addEventListener('click', () => { loadDiscovery(); loadMajors(); });

  bindFilters();
  animateRadarBlips();
  loadDiscovery();
  loadMajors();
})();
