/**
 * Catalyst Radar — Rebrand demo layer
 * Uses public endpoints. Graceful empty states when offline.
 */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

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

  async function loadDiscovery() {
    const body = $('#discovery-body');
    const count = $('#discovery-count');
    if (!body) return;

    try {
      const data = await fetchJson('https://api.dexscreener.com/token-profiles/latest/v1');
      const list = Array.isArray(data) ? data.slice(0, 24) : [];
      const rows = [];

      for (const item of list.slice(0, 18)) {
        const chain = (item.chainId || '').toLowerCase();
        const addr = item.tokenAddress || '';
        let pair = null;
        try {
          const pairs = await fetchJson('https://api.dexscreener.com/latest/dex/tokens/' + addr, 5000);
          pair = pairs && pairs.pairs && pairs.pairs[0] || null;
        } catch (_) {}

        const price = pair && pair.priceUsd ? +pair.priceUsd : null;
        const ch24 = pair && pair.priceChange && pair.priceChange.h24 != null ? +pair.priceChange.h24 : null;
        const ch1 = pair && pair.priceChange && pair.priceChange.h1 != null ? +pair.priceChange.h1 : null;
        const liq = pair && pair.liquidity && pair.liquidity.usd != null ? +pair.liquidity.usd : null;
        const vol = pair && pair.volume && pair.volume.h24 != null ? +pair.volume.h24 : null;
        const symbol = ((pair && pair.baseToken && pair.baseToken.symbol) || item.description || 'TOKEN').slice(0, 12);

        let risk = '—';
        if (liq != null && liq < 5000) risk = 'THIN';
        else if (liq != null && vol != null && liq > 0 && vol / liq > 15) risk = 'VOL/LIQ';
        else if (ch24 != null && Math.abs(ch24) > 80) risk = 'EXTREME';

        const scenario = ch24 != null && Number.isFinite(ch24) ? '$' + (1 * (1 + ch24 / 100)).toFixed(2) : '—';

        rows.push({ symbol, chain: chain || '—', price, ch1, ch24, liq, vol, risk, scenario });
      }

      body.innerHTML = '';
      if (!rows.length) {
        body.innerHTML = '<tr><td colspan="7" class="loading-row">No candidates returned</td></tr>';
        if (count) count.textContent = '0 candidates';
        return;
      }

      rows.forEach((r) => {
        const tr = document.createElement('tr');
        const ch24Class = r.ch24 == null ? '' : r.ch24 >= 0 ? 'color:var(--green)' : 'color:var(--red)';
        tr.innerHTML =
          '<td><strong style="color:var(--text)">' + r.symbol + '</strong>' +
          '<div style="font-size:11px;color:var(--text-muted)">' + r.chain + '</div></td>' +
          '<td class="mono">' + (r.price != null ? '$' + fmt(r.price, 6) : '—') + '</td>' +
          '<td class="mono"><span style="' + (r.ch1 == null ? '' : r.ch1 >= 0 ? 'color:var(--green)' : 'color:var(--red)') + '">' + pct(r.ch1) + '</span> / <span style="' + ch24Class + '">' + pct(r.ch24) + '</span></td>' +
          '<td class="mono">' + fmt(r.liq, 0) + '</td>' +
          '<td class="mono">' + fmt(r.vol, 0) + '</td>' +
          '<td><span class="tag ' + (r.risk === '—' ? 'muted' : r.risk === 'THIN' || r.risk === 'EXTREME' ? 'red' : 'amber') + '">' + r.risk + '</span></td>' +
          '<td class="mono">' + r.scenario + '</td>';
        body.appendChild(tr);
      });

      if (count) count.textContent = rows.length + ' candidates';
      const sc = $('#stat-candidates');
      if (sc) sc.textContent = rows.length;
      const sp = $('#stat-pools');
      if (sp) sp.textContent = rows.length;

      renderMomentum(rows);
      renderRisk(rows);
      renderScatter(rows);
    } catch (err) {
      console.warn('Discovery load failed', err);
      body.innerHTML = '<tr><td colspan="7" class="loading-row">Public DEX endpoints unavailable right now</td></tr>';
    }
  }

  function renderMomentum(rows) {
    const box = $('#momentum-chart');
    if (!box) return;
    const sorted = rows.filter((r) => r.ch24 != null).sort((a, b) => Math.abs(b.ch24) - Math.abs(a.ch24)).slice(0, 8);
    if (!sorted.length) {
      box.innerHTML = '<div class="empty-state">Нет данных по изменению 24ч</div>';
      return;
    }
    const max = Math.max(...sorted.map((r) => Math.abs(r.ch24)), 1);
    box.innerHTML = '';
    box.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:12px;align-items:stretch';
    sorted.forEach((r) => {
      const w = Math.min(100, (Math.abs(r.ch24) / max) * 100);
      const color = r.ch24 >= 0 ? 'var(--green)' : 'var(--red)';
      box.appendChild(el('div', null,
        '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
        '<span class="mono">' + r.symbol + '</span><span class="mono" style="color:' + color + '">' + pct(r.ch24) + '</span></div>' +
        '<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">' +
        '<div style="height:100%;width:' + w + '%;background:' + color + ';border-radius:3px"></div></div>'));
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
      '<div style="display:flex;align-items:center;gap:10px"><div style="flex:1;height:10px;background:var(--border);border-radius:5px;overflow:hidden;display:flex">' +
      '<div style="width:' + (counts.ok / total) * 100 + '%;background:var(--green)"></div>' +
      '<div style="width:' + (counts.review / total) * 100 + '%;background:var(--amber)"></div>' +
      '<div style="width:' + (counts.high / total) * 100 + '%;background:var(--red)"></div></div></div>' +
      '<div style="display:flex;gap:16px;font-size:12px;color:var(--text-muted)">' +
      '<span><i style="color:var(--green)">●</i> Low ' + counts.ok + '</span>' +
      '<span><i style="color:var(--amber)">●</i> Review ' + counts.review + '</span>' +
      '<span><i style="color:var(--red)">●</i> High ' + counts.high + '</span></div></div>';
  }

  function renderScatter(rows) {
    const box = $('#liq-vol-chart');
    if (!box) return;
    const pts = rows.filter((r) => r.liq > 0 && r.vol > 0).slice(0, 30);
    if (!pts.length) {
      box.innerHTML = '<div class="empty-state">Недостаточно пар liq/vol</div>';
      return;
    }
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

  async function loadBtcCandles() {
    const box = $('#btc-candles');
    if (!box) return;
    try {
      const klines = await fetchJson('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=48');
      if (!Array.isArray(klines) || !klines.length) throw new Error('empty');
      const closes = klines.map((k) => +k[4]);
      const highs = klines.map((k) => +k[2]);
      const lows = klines.map((k) => +k[3]);
      const opens = klines.map((k) => +k[1]);
      const min = Math.min(...lows);
      const max = Math.max(...highs);
      const range = max - min || 1;

      box.innerHTML = '';
      box.style.cssText = 'display:flex;align-items:flex-end;gap:2px;padding:12px 8px;height:240px';

      klines.forEach((k, i) => {
        const o = opens[i], c = closes[i], h = highs[i], l = lows[i];
        const up = c >= o;
        const color = up ? 'var(--green)' : 'var(--red)';
        const bodyTop = ((max - Math.max(o, c)) / range) * 100;
        const bodyH = (Math.abs(c - o) / range) * 100 || 0.5;
        const wickTop = ((max - h) / range) * 100;
        const wickH = ((h - l) / range) * 100;
        const col = document.createElement('div');
        col.style.cssText = 'flex:1;position:relative;height:100%;min-width:0';
        col.innerHTML =
          '<div style="position:absolute;left:50%;transform:translateX(-50%);width:1px;top:' + wickTop + '%;height:' + wickH + '%;background:' + color + ';opacity:0.5"></div>' +
          '<div style="position:absolute;left:15%;right:15%;top:' + bodyTop + '%;height:' + Math.max(bodyH, 0.8) + '%;background:' + color + ';border-radius:1px"></div>';
        box.appendChild(col);
      });
    } catch (e) {
      console.warn('BTC candles', e);
      box.innerHTML = '<div class="empty-state">Binance klines unavailable</div>';
    }
  }

  async function loadMajors() {
    try {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT'];
      const res = await fetchJson('https://api.binance.com/api/v3/ticker/24hr');
      const map = {};
      (res || []).forEach((t) => { if (symbols.includes(t.symbol)) map[t.symbol] = t; });

      const breadth = $('#breadth-chart');
      if (breadth) {
        const items = symbols.map((s) => map[s]).filter(Boolean);
        const up = items.filter((t) => +t.priceChangePercent >= 0).length;
        const down = items.length - up;
        breadth.innerHTML =
          '<div style="padding:20px;text-align:center;width:100%">' +
          '<div style="font-size:28px;font-weight:500;margin-bottom:8px">' +
          '<span style="color:var(--green)">' + up + '</span>' +
          '<span style="color:var(--text-muted)"> / </span>' +
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
    } catch (e) {
      console.warn('Majors', e);
    }
  }

  const refresh = $('#refresh-btn');
  if (refresh) {
    refresh.addEventListener('click', () => {
      loadDiscovery();
      loadBtcCandles();
      loadMajors();
    });
  }

  loadDiscovery();
  loadBtcCandles();
  loadMajors();
})();
