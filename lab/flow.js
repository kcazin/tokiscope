// Throughput lab: the tokens as they stream, read as speed rather than as loads. The stream pushes an update a second
// or two after each turn, with every agent's io so far (input, cache read, cache write, output): the growth of an
// agent's io is one turn. Each update's new tokens, per project and per agent, are handed out evenly over the time
// since the last ones came in (2.5–8 s; 15 s when polled), so everything below runs at the rate the tokens were made
// instead of jumping once a second. The pieces here are shown by flow.html; the bubbles, cards and fields built from
// them by bubble.js, and two fields join the lab's MACHINES (a dashboard, and the trucks at speed).
import { run, feed, onUpdate, haul, HAUL, haulH, MACHINES, PROJECTS, SHORT, RGB, shade, MONO, KINDS, KIND, countedToday, setCounting } from './lab.js';
import { t as say } from './i18n.js';

// ---- The flow ----------------------------------------------------------------------------------------------------
// Spreads: { a, b, n, p } a project's new tokens over [a, b) (performance.now ms); { a, b, n, o, id, p } an agent's
// turn, `o` its output tokens and `n` the rest. Totals and rates come from the projects, agents' figures from turns.
const P = [], A = [], turnListeners = [];
const per = (s, T) => T >= s.a && T < s.b ? 1000 / (s.b - s.a) : 0;
const rest = (s, T) => Math.max(0, Math.min(1, (s.b - T) / (s.b - s.a)));
const over = (since, live) => live ? Math.max(2500, Math.min(8000, since)) : 15000;
// `rate` tokens a second now and `out` output tokens a second (both smoothed), `of` the rate per project, `total`
// tokens today as published and `shown` less what is still being handed out, `history` the rate every half second
// for a minute, `turns` the last minute's turns ({ at, p, n }). `agents`: id → { project, model, state, io, rate, out,
// on (working now), first (seen), last (its last turn) and lastN (that turn's tokens) }.
// `kinds`: the tokens that count (?kinds=in,cr,cw,out, all by default; lab.js counts them). With all of them, or with
// some and an agent-stats that splits each project's tokens by kind (0.7 on), the totals and rates are the projects';
// otherwise they're the agents' turns, kind by kind, and `total` counts them from `since` (output alone from the
// relay's count for today). `what` names them ('' for all), `label` says what `total` is.
export const flow = { rate: 0, out: 0, of: {}, total: 0, shown: 0, history: [], turns: [], agents: new Map(), kinds: KINDS, what: '', label: say('{what} TODAY', { what: say('TOKENS') }), when: 'today', since: 0 };
export function setKinds(list) {
  const k = KINDS.filter(x => list.includes(x));
  flow.kinds = k.length ? k : KINDS;
  setCounting(flow.kinds);
  flow.what = flow.kinds.length === 4 ? '' : flow.kinds.map(x => KIND[x]).join(' + ');
  base = null; flow.history = []; flow.turns = []; flow.rate = flow.out = 0; flow.of = {};       // counted afresh
}
const all = () => flow.kinds.length === 4;
// f({ id, p, model, n, io, at }) for each turn as it lands; `at` in performance.now ms. With `node`, only while that
// element is on the page: a machine built again for new projects leaves its old one behind.
export const onTurn = (f, node) => turnListeners.push({ f, node });
let base = null, lastTok = {}, sampled = 0;
onUpdate((d, source, live) => {
  // `whole`: the projects' figures say what counts (all of it, or by kind from the split).
  const T = performance.now(), whole = all() || !!(d.projects.todayIo && Object.keys(d.projects.todayIo).length);
  const today = whole ? countedToday(d) : d.projects.today || {}, day = d.today?.day;
  const fresh = !base || base.source !== source || base.day !== day || base.whole !== whole;   // nothing to compare with
  if (fresh) { P.length = A.length = 0; flow.agents.clear(); lastTok = {}; flow.since = Date.now(); if (!whole) flow.total = 0; }
  else if (whole) for (const p in today) {
    const n = today[p] - (base.today[p] ?? today[p]);
    if (n > 0) { P.push({ a: T, b: T + over(T - (lastTok[p] ?? -1e9), live), n, p }); lastTok[p] = T; }
  }
  for (const a of d.live?.agents || []) {
    if (!a.io) continue;
    let g = flow.agents.get(a.id);
    if (!g) flow.agents.set(a.id, g = { id: a.id, io: { ...a.io }, first: T, last: T, rate: 0, out: 0 });
    const io = {}; let n = 0;
    for (const k of KINDS) io[k] = Math.max(0, (a.io[k] || 0) - (g.io[k] || 0));
    for (const k of flow.kinds) n += io[k];
    const o = flow.kinds.includes('out') ? io.out : 0;
    if (n > 0 && !fresh) {
      const b = T + over(T - g.last, live);
      A.push({ a: T, b, n: n - o, o, id: a.id, p: a.project });
      if (!whole) { P.push({ a: T, b, n, p: a.project || 'other' }); flow.total += n; }
      g.last = T; g.lastN = n; flow.turns.push({ at: T, p: a.project || 'other', n });
      for (const l of [...turnListeners]) {
        if (l.node && !l.node.isConnected) turnListeners.splice(turnListeners.indexOf(l), 1);
        else l.f({ id: a.id, p: a.project || 'other', model: a.model, n, io, at: T });
      }
    }
    Object.assign(g, { io: { ...a.io }, project: a.project || 'other', model: modelName(a.model) || a.agent || '', kind: a.kind, state: a.state, seen: T });
  }
  for (const [id, g] of flow.agents) { g.on = g.seen === T && !feed.stale; if (T - g.seen > 300000) flow.agents.delete(id); }
  base = { source, day, whole, today: { ...today } };
  const outToday = !whole && flow.kinds.length === 1 && flow.kinds[0] === 'out' ? d.today?.output : null;
  if (whole) flow.total = Object.values(today).reduce((a, b) => a + b, 0);
  else if (outToday != null) flow.total = outToday;
  flow.when = whole || outToday != null ? 'today' : 'since ' + new Date(flow.since).toTimeString().slice(0, 5);
  const what = all() ? say('TOKENS') : flow.kinds.map(x => say(KIND[x])).join(' + ').toUpperCase();
  flow.label = flow.when === 'today' ? say('{what} TODAY', { what }) : say('{what} SINCE {time}', { what, time: flow.when.slice(6) });
});
// For the labels: what counts ('tokens' for all of it), and today's total so far, in the page's language.
export const shownWhat = () => flow.what ? flow.kinds.map(x => say(KIND[x])).join(' + ') : say('tokens');
export const shownTotal = n => flow.when === 'today' ? say('{n} today', { n }) : say('{n} since {time}', { n, time: flow.when.slice(6) });
setKinds((new URLSearchParams(location.search).get('kinds') || KINDS.join()).split(','));
// Runs on its own, ahead of whatever draws from it.
function step(dt, T) {
  const k = 1 - Math.exp(-dt / 1.2), of = {};
  for (const L of [P, A]) for (let i = L.length - 1; i >= 0; i--) if (L[i].b <= T) L.splice(i, 1);
  let r = 0, o = 0, left = 0;
  for (const s of P) { const v = s.n * per(s, T); r += v; of[s.p] = (of[s.p] || 0) + v; left += s.n * rest(s, T); }
  for (const g of flow.agents.values()) g.rate = g.out = 0;
  for (const s of A) {
    const g = flow.agents.get(s.id), v = per(s, T); o += s.o * v;
    if (g) { g.rate += (s.n + s.o) * v; g.out += s.o * v; }
  }
  flow.rate += (r - flow.rate) * k; flow.out += (o - flow.out) * k;
  for (const p of new Set([...Object.keys(of), ...Object.keys(flow.of)])) flow.of[p] = (flow.of[p] || 0) + ((of[p] || 0) - (flow.of[p] || 0)) * k;
  flow.shown = flow.total - left;
  while (flow.turns.length && flow.turns[0].at < T - 60000) flow.turns.shift();
  if (T - sampled >= 500) { sampled = T; flow.history.push(flow.rate); if (flow.history.length > 120) flow.history.shift(); }
}
let ticked = 0;
const tick = T => { step(Math.min(0.05, (T - (ticked || T)) / 1000), T); ticked = T; requestAnimationFrame(tick); };
requestAnimationFrame(tick);
// The agents to show, in the order they turned up: those working, and those whose last turn was in the last minute.
export const shownAgents = max => [...flow.agents.values()].filter(g => g.on || performance.now() - g.last < 60000)
  .sort((a, b) => a.first - b.first).slice(0, max);

// ---- Drawing helpers ---------------------------------------------------------------------------------------------
export function hd(el, W, H) {
  const c = document.createElement('canvas'), dpr = Math.min(4, devicePixelRatio || 1);
  c.width = W * dpr; c.height = H * dpr;
  Object.assign(c.style, { width: W + 'px', height: H + 'px', display: 'block' });
  el.replaceChildren(c);
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
  return ctx;
}
export const INK = '#e8e8e8', DIM = 'rgba(232, 232, 232, .45)', FAINT = 'rgba(232, 232, 232, .1)';
export const rgba = (p, a = 1) => `rgba(${RGB[p] || RGB.other}, ${a})`;
// 45.2K, 312K, 1.2M, 2.3B: three figures at most.
export const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'K' : String(Math.round(n));
// Where a rate sits on a log scale from 10^lo to 10^hi a second, 0 to 1.
export const lg = (r, lo = 0, hi = 6) => Math.max(0, Math.min(1, (Math.log10(Math.max(1, r)) - lo) / (hi - lo)));
// How hard a turn of n tokens kicks, 0.18 to 1 (1K to 1M, log).
export const kickOf = n => Math.max(0.18, Math.min(1, (Math.log10(Math.max(1, n)) - 3) / 3));
export const lead = () => Object.keys(flow.of).reduce((m, p) => (flow.of[p] || 0) > (flow.of[m] || 0) ? p : m, PROJECTS[0]);
// 'claude-opus-5-5' as Opus 5.5; other names as they come.
export const modelName = m => { const r = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(m || ''); return r ? `${r[1][0].toUpperCase()}${r[1].slice(1)} ${r[2]}.${r[3]}` : m || ''; };
// s, cut short with an ellipsis to fit w px in the font set.
export const fit = (ctx, s, w) => {
  if (ctx.measureText(s).width <= w) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1);
  return s + '…';
};
export const font = (px, ctx, align = 'left', face = MONO) => { ctx.font = `${px}px ${face}`; ctx.textAlign = align; ctx.textBaseline = 'middle'; };
// Live, polled or not live, with a dot that flashes as a turn comes in; right-aligned at x, STATUS_W wide at most.
export const STATUS_W = 62;
let flashAt = -9;
onTurn(e => { flashAt = e.at / 1000; });
export function status(ctx, x, y, t) {
  const live = feed.live && !feed.stale, lit = Math.max(0, 1 - (t - flashAt) / 0.4);
  font(9, ctx, 'right'); ctx.fillStyle = DIM;
  ctx.fillText(say(feed.stale ? 'not live' : live ? 'live' : 'every 15 s'), x - 8, y);
  ctx.fillStyle = live ? `rgba(98, 214, 120, ${0.45 + lit * 0.55})` : DIM;
  ctx.beginPath(); ctx.arc(x - 2, y, 2 + lit * 1.2, 0, 7); ctx.fill();
}
// The last minute of the rate as an area, in the colour of the project making most of it.
export function spark(ctx, x, y, w, h) {
  const hist = flow.history, max = Math.max(1, ...hist), col = lead();
  ctx.fillStyle = FAINT; ctx.fillRect(x, y + h, w, 1);
  if (hist.length < 2) return;
  const px = i => x + w - (hist.length - 1 - i) * w / 119, py = v => y + h - v / max * h;
  ctx.beginPath(); ctx.moveTo(px(0), y + h); hist.forEach((v, i) => ctx.lineTo(px(i), py(v))); ctx.lineTo(px(hist.length - 1), y + h);
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, rgba(col, 0.45)); g.addColorStop(1, rgba(col, 0.02));
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); hist.forEach((v, i) => ctx.lineTo(px(i), py(v))); ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 1.2; ctx.stroke();
}

// Odometer wheels for `n` digits of v from the 10^lo place up, each dw wide and dh high: the lowest turns with the
// figure, each one above turns over while the one below goes from 9 to 0. A wheel turning more than a few digits a
// second blurs, in `col`; leading zeros are dim. A dot every three places, `sep` wide.
export function wheels(ctx, v, { x, y, n, dw, dh, size, lo = 0, rate = 0, col = INK, sep = 7 }) {
  const w = Math.max(0, v) / 10 ** lo;
  for (let j = n - 1; j >= 0; j--) {
    const place = 10 ** j, lower = w % place / place;
    const pos = j === 0 ? w % 10 : Math.floor(w / place) % 10 + Math.max(0, (lower - 0.92) / 0.08);
    wheel(ctx, x, y, dw, dh, size, pos, rate / 10 ** (lo + j), col, w < place && j > 0);
    x += dw;
    if (sep && j && (j + lo) % 3 === 0) { ctx.fillStyle = DIM; ctx.fillRect(x + sep / 2 - 2, y + dh - 6, 2, 3); x += sep; }
  }
}
function wheel(ctx, x, y, dw, dh, size, pos, speed, col, dim) {
  const iw = dw - Math.max(1, Math.round(dw / 8));
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, iw, dh, Math.min(3, dw / 6)); ctx.clip();
  ctx.fillStyle = '#151515'; ctx.fillRect(x, y, iw, dh);
  const blur = Math.max(0, Math.min(1, (speed - 4) / 24)), copies = blur ? 6 : 1;
  font(size, ctx, 'center');
  for (let c = 0; c < copies; c++) {
    const q = pos - c * 0.16 * blur, f = Math.floor(q);
    ctx.globalAlpha = (blur ? 0.32 - c * 0.04 : 1) * (dim ? 0.28 : 1);
    ctx.fillStyle = blur ? col : INK;
    for (let k = f - 1; k <= f + 2; k++) ctx.fillText(String((k % 10 + 10) % 10), x + iw / 2, y + dh / 2 + size * 0.04 + (k - q) * dh * 0.86);
  }
  ctx.globalAlpha = 1;
  const g = ctx.createLinearGradient(0, y, 0, y + dh);
  g.addColorStop(0, 'rgba(0,0,0,.85)'); g.addColorStop(0.32, 'rgba(0,0,0,0)'); g.addColorStop(0.68, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.85)');
  ctx.fillStyle = g; ctx.fillRect(x, y, iw, dh);
  ctx.restore();
}

// Traces: a line per agent scrolling left at `spd` px a second, a value per px in halves of its lane (`len` kept): a
// tremor while its tokens are being handed out, harder the faster they come, and a kick when a turn lands that rings
// down. `notes` hold each turn's size where it landed (`col`, against `head`). `node`: what it draws in.
export function traces(len, spd, node) {
  const lanes = new Map(), tr = { lanes, head: 0 };
  let acc = 0;
  onTurn(e => { const L = lanes.get(e.id); if (L) { L.kick = Math.max(L.kick, kickOf(e.n)); L.notes.push({ col: tr.head, text: fmt(e.n) }); } }, node);
  tr.step = dt => {
    for (const g of flow.agents.values()) if (!lanes.has(g.id)) lanes.set(g.id, { ys: [], kick: 0, ring: 0, notes: [] });
    for (const id of lanes.keys()) if (!flow.agents.has(id)) lanes.delete(id);
    for (acc += dt * spd; acc >= 1; acc--) {
      tr.head++;
      for (const [id, L] of lanes) {
        const g = flow.agents.get(id);
        let y = g.on || g.rate ? (Math.random() * 2 - 1) * (0.03 + 0.4 * lg(g.rate, 2, 6) ** 2) : 0;
        if (L.kick) { L.ring = L.kick; L.kick = 0; }
        if (Math.abs(L.ring) > 0.02) { y += L.ring; L.ring *= -0.66; }
        L.ys.push(y); if (L.ys.length > len) L.ys.shift();
        if (L.notes.length && tr.head - L.notes[0].col >= len) L.notes.shift();
      }
    }
  };
  // Strokes an agent's lane from x0 to x1 about y0, `amp` px to a half, fading out to the left.
  tr.stroke = (ctx, g, x0, x1, y0, amp, width = 1.2) => {
    const L = lanes.get(g.id); if (!L) return null;
    const n = L.ys.length, xs = j => x1 - (n - 1 - j) * (x1 - x0) / (len - 1), ys = j => y0 - Math.max(-1, Math.min(1, L.ys[j])) * amp;
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, rgba(g.project, 0)); grad.addColorStop(0.5, rgba(g.project, 0.6)); grad.addColorStop(1, rgba(g.project, 1));
    ctx.strokeStyle = grad; ctx.lineWidth = width; ctx.lineJoin = 'round';
    ctx.beginPath(); for (let j = 0; j < n; j++) ctx.lineTo(xs(j), ys(j)); ctx.stroke();
    return n ? [xs(n - 1), ys(n - 1)] : null;
  };
  return tr;
}

// The output typed out a letter a token: each agent working gets a band of the `cols` columns and a cursor or two that
// write down them at the speed its output comes (a letter for `each` tokens over `cap` letters a second), the letters
// fading behind; what it reads falls through its band as dust, a speck per `dustN` tokens. Positions in cells.
const GLYPHS = 'abcdefghijklmnopqrstuvwxyzabcdeeeiiooottnnss{}()[]<>=+-*/;:._$#ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function typist(cols, rows, { cap = 320, dustN = 2000, fade = 2.6 } = {}) {
  const n = cols * rows, typers = new Map();
  const ty = { cols, rows, ch: new Array(n).fill(''), life: new Float32Array(n), of: new Array(n), bands: [], each: 1, dust: [], heads: [] };
  ty.step = dt => {
    ty.bands = [...flow.agents.values()].filter(g => g.on || g.rate).sort((a, b) => a.first - b.first).slice(0, 6);
    ty.each = 2 ** Math.max(0, Math.ceil(Math.log2(flow.out / cap)));
    ty.heads = [];
    ty.bands.forEach((g, i) => {
      const lo = Math.floor(i * cols / ty.bands.length), hi = Math.floor((i + 1) * cols / ty.bands.length), wide = Math.max(1, hi - lo);
      let tp = typers.get(g.id);
      if (!tp) typers.set(g.id, tp = { acc: 0, dacc: 0, heads: [], k: 0 });
      const want = wide >= 8 ? 2 : 1;
      while (tp.heads.length < want) tp.heads.push({ c: lo + (Math.random() * wide | 0), r: Math.random() * rows | 0 });
      tp.heads.length = want;
      for (const h of tp.heads) if (h.c < lo || h.c >= hi) h.c = lo + (Math.random() * wide | 0);
      tp.acc = Math.min(tp.acc + g.out * dt / ty.each, 40);
      for (; tp.acc >= 1; tp.acc--) {
        const h = tp.heads[tp.k++ % tp.heads.length], i = h.r * cols + h.c;
        ty.ch[i] = GLYPHS[Math.random() * GLYPHS.length | 0]; ty.life[i] = 1; ty.of[i] = g.project;
        if (++h.r >= rows) { h.r = 0; h.c = lo + (Math.random() * wide | 0); }
      }
      tp.dacc += (g.rate - g.out) * dt / dustN;
      for (; tp.dacc >= 1; tp.dacc--) ty.dust.push({ c: lo + Math.random() * wide, y: 0, vy: (1 + Math.random()) * rows, p: g.project });
      if (g.out) for (const h of tp.heads) ty.heads.push({ c: h.c, r: h.r, p: g.project });
    });
    for (let i = 0; i < n; i++) if (ty.life[i] > 0) ty.life[i] = Math.max(0, ty.life[i] - dt / fade);
    for (let i = ty.dust.length - 1; i >= 0; i--) { ty.dust[i].y += ty.dust[i].vy * dt; if (ty.dust[i].y > rows) ty.dust.splice(i, 1); }
  };
  // Draws it with cells cw × ch from x, y.
  ty.draw = (ctx, x, y, cw, chh, size) => {
    for (const d of ty.dust) { ctx.fillStyle = rgba(d.p, 0.35); ctx.fillRect(x + d.c * cw, y + d.y * chh, 1, Math.max(2, chh / 3)); }
    font(size, ctx, 'center');
    for (let i = 0; i < n; i++) {
      if (ty.life[i] <= 0) continue;
      ctx.fillStyle = ty.life[i] > 0.96 ? '#ffffff' : rgba(ty.of[i], Math.pow(ty.life[i], 1.4) * 0.95);
      ctx.fillText(ty.ch[i], x + (i % cols) * cw + cw / 2, y + Math.floor(i / cols) * chh + chh / 2);
    }
    for (const h of ty.heads) {
      ctx.fillStyle = rgba(h.p, 0.8); ctx.shadowColor = rgba(h.p, 1); ctx.shadowBlur = 8;
      ctx.fillRect(x + h.c * cw + 1, y + h.r * chh + 1, cw - 2, chh - 2); ctx.shadowBlur = 0;
    }
  };
  return ty;
}

// The tachometer: the rate in the middle of an arc that fills on a log scale (10 to 1M a second), split by project; a
// ring of vanes turns faster the more tokens flow, and every turn sends a ripple out in its project's colour.
export function tachometer(ctx, D, { ball = true } = {}) {
  const ripples = [];
  let spin = 0;
  onTurn(e => ripples.push({ at: e.at / 1000, p: e.p }), ctx.canvas);
  return {
    step(dt) { spin += dt * (0.15 + 9 * lg(flow.rate, 1, 6) ** 2); },
    draw(t) {
      const c = D / 2;
      if (ball) {
        const bg = ctx.createRadialGradient(D * 0.35, D * 0.3, 0, c, c, c);
        bg.addColorStop(0, '#262626'); bg.addColorStop(0.7, '#0b0b0b');
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(c, c, c - 0.5, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1; ctx.stroke();
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const f = (t - ripples[i].at) / 0.9; if (f > 1) { ripples.splice(i, 1); continue; } if (f < 0) continue;
        ctx.strokeStyle = rgba(ripples[i].p, 0.7 * (1 - f)); ctx.lineWidth = D * 0.03;
        ctx.beginPath(); ctx.arc(c, c, D * (0.33 + 0.15 * f), 0, 7); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(232,232,232,.16)';
      for (let i = 0; i < 18; i++) {
        const a = spin + i / 18 * 6.283;
        ctx.beginPath(); ctx.arc(c + Math.cos(a) * D * 0.44, c + Math.sin(a) * D * 0.44, D * 0.012, 0, 7); ctx.fill();
      }
      const A0 = 0.75 * Math.PI, SPAN = 1.5 * Math.PI, r = D * 0.34;
      ctx.lineCap = 'butt'; ctx.lineWidth = D * 0.07;
      ctx.strokeStyle = FAINT; ctx.beginPath(); ctx.arc(c, c, r, A0, A0 + SPAN); ctx.stroke();
      const fill = lg(flow.rate, 1, 6) * SPAN, sum = Object.values(flow.of).reduce((a, b) => a + b, 0);
      let a = A0;
      for (const p of PROJECTS) {
        const s = sum > 1 ? (flow.of[p] || 0) / sum * fill : 0; if (s < 0.01) continue;
        ctx.strokeStyle = shade(p, 1.05); ctx.beginPath(); ctx.arc(c, c, r, a, a + s); ctx.stroke(); a += s;
      }
      font(Math.round(D * 0.2), ctx, 'center'); ctx.fillStyle = INK; ctx.fillText(fmt(flow.rate), c, c - D * 0.02);
      font(Math.round(D * 0.11), ctx, 'center'); ctx.fillStyle = DIM; ctx.fillText(say('tok/s'), c, c + D * 0.17);
    },
  };
}

// ---- A. Odometer -------------------------------------------------------------------------------------------------
// Today's tokens on mechanical wheels that roll at the rate they come in: the low wheels spin into a blur in the
// colour of the project making most of them, a wheel higher up steps along. A needle gauge on a log scale, the rate as
// a figure, and the last minute of it.
function odometer(el) {
  const W = 360, H = 158, ctx = hd(el, W, H), DW = 24, DH = 36, WY = 18;
  let needle = 0, vel = 0;
  return {
    step(dt) { vel += ((lg(flow.rate) - needle) * 70 - vel * 10) * dt; needle += vel * dt; },
    draw(t) {
      ctx.clearRect(0, 0, W, H);
      font(9, ctx); ctx.fillStyle = DIM; ctx.fillText(fit(ctx, flow.label, W - 70), 4, 7);
      status(ctx, W - 4, 7, t);
      const v = Math.max(0, flow.shown), n = Math.max(10, String(Math.floor(v)).length);
      wheels(ctx, v, { x: Math.round((W - n * DW - Math.floor((n - 1) / 3) * 7) / 2), y: WY, n, dw: DW, dh: DH, size: 24, rate: flow.rate, col: rgba(lead()) });
      // The gauge: decades from 1 to 1M tokens a second; the needle sways on a spring and hums with the rate.
      const cx = 66, cy = 146, R = 54, ang = f => Math.PI * (1 + f);
      ctx.lineCap = 'round';
      ctx.strokeStyle = FAINT; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI); ctx.stroke();
      ctx.strokeStyle = rgba(lead(), 0.75); ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, ang(Math.max(0.002, Math.min(1, needle)))); ctx.stroke();
      font(7, ctx, 'center');
      ['1', '10', '100', '1K', '10K', '100K', '1M'].forEach((s, d) => {
        const a = ang(d / 6); ctx.fillStyle = DIM;
        ctx.fillRect(cx + Math.cos(a) * (R - 6) - 0.5, cy + Math.sin(a) * (R - 6) - 0.5, 1.5, 1.5);
        if (d % 2 === 0 || d === 5) ctx.fillText(s, cx + Math.cos(a) * (R - 15), cy + Math.sin(a) * (R - 15));
      });
      const a = ang(Math.max(0, Math.min(1, needle)) + Math.sin(t * 57) * 0.0035 * lg(flow.rate));
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4)); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.fill();
      // The rate, output and turns, and the last minute.
      const X = 140;
      font(26, ctx); ctx.fillStyle = INK; ctx.fillText(fmt(flow.rate), X, 76);
      const rw = ctx.measureText(fmt(flow.rate)).width;
      font(9, ctx); ctx.fillStyle = DIM; ctx.fillText(fit(ctx, say('{what} / s', { what: shownWhat() }), W - X - rw - 10), X + rw + 6, 80);
      ctx.fillText(`${flow.kinds.includes('out') ? say('{n} out / s', { n: Math.round(flow.out) }) + ' · ' : ''}${say('{n} turns a minute', { n: flow.turns.length })}`, X, 98);
      spark(ctx, X, 108, W - 4 - X, 42);
      font(7, ctx, 'right'); ctx.fillStyle = DIM; ctx.fillText(say('a minute'), W - 4, 156);
    },
  };
}

// ---- B. Seismograph ----------------------------------------------------------------------------------------------
// A trace per agent, scrolling left: it trembles while the agent's tokens are being handed out, harder the faster
// they come, and kicks when a turn lands, as high as the turn is big (log), with its size written over the spike.
function seismo(el) {
  const W = 360, H = 176, ctx = hd(el, W, H), X0 = 92, TW = W - X0 - 8, SPD = 24, TOP = 16, tr = traces(TW, SPD, ctx.canvas);
  return {
    step: tr.step,
    draw() {
      ctx.clearRect(0, 0, W, H);
      font(9, ctx); ctx.fillStyle = DIM; ctx.fillText(say('TURNS'), 4, 7);
      font(8, ctx, 'right'); ctx.fillText(say('a spike is a turn · lines 5 s apart'), W - 8, 7);
      // The grid scrolls with the paper, so it moves even when nothing does.
      ctx.fillStyle = FAINT;
      for (let c = tr.head - (tr.head % (SPD * 5)); tr.head - c < TW; c -= SPD * 5) ctx.fillRect(X0 + TW - (tr.head - c), TOP, 1, H - TOP);
      const list = shownAgents(5), lh = Math.min(40, (H - TOP - 2) / Math.max(1, list.length));
      if (!list.length) { font(9, ctx, 'center'); ctx.fillStyle = DIM; ctx.fillText(say('no agent working'), X0 + TW / 2, TOP + (H - TOP) / 2); }
      // Each lane keeps to its own band: its kicks and their sizes don't reach the lanes round it.
      list.forEach((g, i) => {
        const top = TOP + lh * i, y0 = top + lh / 2, amp = lh / 2 - 2;
        ctx.fillStyle = shade(g.project, g.on ? 1 : 0.5); ctx.beginPath(); ctx.arc(8, y0 - 4, 2.5, 0, 7); ctx.fill();
        font(9, ctx); ctx.fillStyle = g.on ? INK : DIM; ctx.fillText(fit(ctx, (g.kind === 'subagent' ? '↳ ' : '') + g.model, X0 - 21), 15, y0 - 4);
        font(8, ctx); ctx.fillStyle = DIM; ctx.fillText(fit(ctx, `${SHORT[g.project] || g.project} · ${say(g.on ? g.state || 'on' : 'idle')}`, X0 - 21), 15, y0 + 7);
        ctx.save(); ctx.beginPath(); ctx.rect(X0 - 2, top, W - X0 + 2, lh); ctx.clip();
        const pen = tr.stroke(ctx, g, X0, X0 + TW, y0, amp);
        if (pen) { ctx.fillStyle = shade(g.project, 1.4); ctx.beginPath(); ctx.arc(pen[0], pen[1], 2, 0, 7); ctx.fill(); }
        // A turn's size beside its spike, unless the one before it is still in the way.
        font(7, ctx);
        let free = -Infinity;
        for (const note of tr.lanes.get(g.id)?.notes || []) {
          const x = X0 + TW - (tr.head - note.col), fade = Math.max(0, Math.min(1, (x - X0 - 16) / 50));
          if (x + 3 < free) continue;
          ctx.fillStyle = `rgba(232, 232, 232, ${0.75 * fade})`; ctx.fillText(note.text, x + 3, top + 5);
          free = x + 3 + ctx.measureText(note.text).width + 4;
        }
        ctx.restore();
      });
    },
  };
}

// ---- C. Token rain -----------------------------------------------------------------------------------------------
// The output, one letter per token, typed down each agent's band at the speed it comes; cache reads fall as dust.
function rain(el) {
  const W = 360, H = 200, CW = 9, CH = 12, TOP = 18, FOOT = 12, ctx = hd(el, W, H);
  const ty = typist(Math.floor((W - 4) / CW), Math.floor((H - TOP - FOOT) / CH));
  return {
    step: ty.step,
    draw() {
      ctx.clearRect(0, 0, W, H);
      font(9, ctx); ctx.fillStyle = DIM; ctx.fillText(say('OUTPUT'), 4, 7);
      font(8, ctx); ctx.fillText(fit(ctx, `${ty.each === 1 ? say('a letter is a token') : say('a letter is {n} tokens', { n: ty.each })} · ${say('a speck 2K read')}`, W - 100), 46, 7);
      font(9, ctx, 'right'); ctx.fillStyle = INK; ctx.fillText(say('{n} / s', { n: Math.round(flow.out) }), W - 4, 7);
      ty.draw(ctx, 2, TOP, CW, CH, 10);
      font(8, ctx);
      if (!ty.bands.length) { ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.fillText(say('waiting for output'), W / 2, TOP + (H - TOP - FOOT) / 2); }
      ty.bands.forEach((g, i) => {
        const x = Math.floor(i * ty.cols / ty.bands.length) * CW + 2, w = Math.floor((i + 1) * ty.cols / ty.bands.length) * CW + 2 - x;
        ctx.fillStyle = shade(g.project, 0.9); ctx.fillRect(x + 1, H - 7, 4, 4);
        ctx.fillStyle = DIM; ctx.fillText(fit(ctx, g.model, w - 12), x + 8, H - 5);
      });
    },
  };
}

// ---- D. Meters ---------------------------------------------------------------------------------------------------
// A level meter per project on a log scale (100 to 1M tokens a second): quick to rise, slow to fall, the peak held
// a moment. `levels` keeps them, for the card too.
export function levels() {
  const lv = {};
  lv.step = (dt, t) => {
    for (const p of PROJECTS) {
      const m = lv[p] ??= { v: 0, peak: 0, hold: 0 }, r = flow.of[p] || 0;
      const to = lg(r, 2, 6) * (r > 0 ? 1 + Math.sin(t * 31 + p.length) * 0.015 : 1);
      m.v = to > m.v ? m.v + (to - m.v) * Math.min(1, dt * 16) : Math.max(to, m.v - dt * 0.3);
      if (m.v >= m.peak) { m.peak = m.v; m.hold = 1.2; } else if ((m.hold -= dt) < 0) m.peak = Math.max(m.v, m.peak - dt * 0.2);
    }
  };
  // Draws p's meter of `seg` segments sw wide from x, y.
  lv.draw = (ctx, p, x, y, seg, sw, h) => {
    const m = lv[p] || { v: 0, peak: 0 }, lit = Math.round(m.v * seg), pk = Math.min(seg - 1, Math.round(m.peak * seg) - 1);
    for (let s = 0; s < seg; s++) {
      ctx.fillStyle = s < lit ? shade(p, 0.55 + 0.75 * s / seg) : s === pk && m.peak > 0.02 ? shade(p, 1.45) : FAINT;
      ctx.fillRect(x + s * (sw + 1), y, sw, h);
    }
  };
  return lv;
}
const metersH = () => 34 + 17 * PROJECTS.length;
function meters(el) {
  const W = 240, SEG = 24, X0 = 62, SW = 5, lv = levels();
  let ctx, H = 0;
  return {
    step: lv.step,
    draw() {
      if (metersH() !== H) { H = metersH(); ctx = hd(el, W, H); }
      ctx.clearRect(0, 0, W, H);
      font(9, ctx); ctx.fillStyle = DIM; ctx.fillText(say('BY PROJECT'), 4, 7);
      font(9, ctx, 'right'); ctx.fillStyle = INK; ctx.fillText(say('{n} / s', { n: fmt(flow.rate) }), W - 4, 7);
      PROJECTS.forEach((p, i) => {
        const y = 20 + i * 17, r = flow.of[p] || 0;
        font(9, ctx); ctx.fillStyle = shade(p, 1); ctx.fillText(fit(ctx, SHORT[p] || p, X0 - 10), 4, y + 4);
        lv.draw(ctx, p, X0, y, SEG, SW, 8);
        font(8, ctx, 'right'); ctx.fillStyle = r >= 1 ? INK : DIM; ctx.fillText(r >= 1 ? fmt(r) : '–', W - 4, y + 4);
      });
      font(7, ctx, 'center'); ctx.fillStyle = DIM;
      ['100', '1K', '10K', '100K', '1M'].forEach((s, d) => ctx.fillText(s, X0 + d / 4 * SEG * (SW + 1) - (d === 4 ? 4 : 0), H - 6));
    },
  };
}

// ---- E. Tachometer -----------------------------------------------------------------------------------------------
// The tachometer clears its own canvas through the ball it paints; without one it would smear.
const tachPiece = D => el => { const ctx = hd(el, D, D), m = tachometer(ctx, D); return { step: m.step, draw(t) { ctx.clearRect(0, 0, D, D); m.draw(t); } }; };

// ---- Fields for the bubble ---------------------------------------------------------------------------------------
// Opened from the bubble, or shown on their own like the lab's layouts. A dashboard: the odometer over the seismograph.
function dash(el) {
  const parts = [odometer, seismo].map((make, i) => { const d = document.createElement('div'); if (i) d.style.marginTop = '10px'; el.append(d); return make(d); });
  return { reorders: true, step: (dt, t) => parts.forEach(p => p.step(dt, t)), draw: t => parts.forEach(p => p.draw(t)) };
}
// The trucks at speed: a strip over the field with today's tokens on wheels and the rate; each project's line says
// its tokens a second, with a light running along its bar as fast, and an agent's cursor flares as its turn lands.
const kicked = new Map();
onTurn(e => kicked.set(e.id, e.at / 1000));
function haulFlow(el) {
  const top = document.createElement('div'), field = document.createElement('div'), W = 320, H = 34;
  el.append(top, field);
  const ctx = hd(top, W, H), m = haul(field, { ...HAUL.haul, rate: p => flow.of[p] || 0, kick: (a, t) => Math.max(0, 1 - (t - (kicked.get(a.id) ?? -9)) / 0.6) });
  return {
    reorders: m.reorders, step: m.step,
    draw(t) {
      m.draw(t);
      ctx.clearRect(0, 0, W, H);
      // As many wheels as the figure needs (ten at least), then the rate after them, the last minute at the right.
      const n = Math.max(10, String(Math.floor(Math.max(0, flow.shown))).length), X = 4 + n * 12 + Math.floor((n - 1) / 3) * 5 + 8;
      wheels(ctx, flow.shown, { x: 4, y: 6, n, dw: 12, dh: 22, size: 13, rate: flow.rate, col: rgba(lead()), sep: 5 });
      font(16, ctx); ctx.fillStyle = INK; ctx.fillText(fmt(flow.rate), X, 13);
      const rw = ctx.measureText(fmt(flow.rate)).width;
      font(8, ctx); ctx.fillStyle = DIM; ctx.fillText(say('tok/s'), X + rw + 4, 15);
      ctx.fillText(fit(ctx, `${flow.kinds.includes('out') ? say('{n} out/s', { n: Math.round(flow.out) }) + ' · ' : ''}${say('{n}/min', { n: flow.turns.length })}`, W - 70 - X), X, 28);
      status(ctx, W - 4, 6, t);
      spark(ctx, W - 64, 13, 60, 18);
    },
  };
}
MACHINES.dash = { make: dash, size: () => [360, 344], name: say('Throughput dashboard'),
  note: say('The odometer over the seismograph: today’s tokens rolling at their rate, and every agent’s turns as they land.') };
MACHINES.haulflow = { make: haulFlow, size: () => [320, 34 + haulH(HAUL.haul)], name: say('Trucks, at speed'), trucks: true,
  note: say('The trucks under an odometer strip; each line says its tokens a second, a light runs along its bar as fast, cursors flare on a turn.') };

// ---- Running them ------------------------------------------------------------------------------------------------
export const PIECES = {
  odometer: { make: odometer, size: () => [360, 158], name: say('Odometer'),
    note: say('Today’s tokens on wheels that roll at the rate they come in; a needle and the last minute of the rate.') },
  seismo: { make: seismo, size: () => [360, 176], name: say('Seismograph'),
    note: say('A trace per agent: it trembles while its tokens flow and kicks when a turn lands, the turn’s size over the spike.') },
  rain: { make: rain, size: () => [360, 200], name: say('Token rain'),
    note: say('The output, a letter per token, typed down each agent’s band at the speed it comes; cache reads fall as dust.') },
  meters: { make: meters, size: () => [240, metersH()], name: say('Level meters'),
    note: say('Tokens a second per project, on a log scale, with the peak held a moment.') },
  tach: { make: tachPiece(56), size: () => [56, 56], name: say('Tachometer bubble'),
    note: say('For bubble mode: the rate in an arc split by project, vanes that spin with it, a ripple per turn.') },
  tachL: { make: tachPiece(120), size: () => [120, 120], name: say('Tachometer, large'), note: say('The same, bigger, to see it.') },
};
// The pieces that make a widget on their own are layouts too (index.html ?only=<piece>, a field for the bubble).
for (const k of ['odometer', 'seismo', 'rain', 'meters']) MACHINES[k] = { ...PIECES[k], make: el => ({ reorders: true, ...PIECES[k].make(el) }), flow: true };
MACHINES.dash.flow = MACHINES.haulflow.flow = true;
export function start(slots) {
  run([], slots.map(([el, key]) => PIECES[key].make(el)));
  demo();
}

// ?relay=demo: made-up agents instead of the relay, to see the motion when nobody is working. Any page that loads this
// module takes it (flow.html, bubble.html).
let demoing = false;
export function demo() {
  if (demoing || new URLSearchParams(location.search).get('relay') !== 'demo') return;
  demoing = true;
  const keys = ['game', 'app', 'site', 'other'], day = new Date().toLocaleDateString('en-CA');
  const projectList = [{ key: 'game', name: 'My Game', color: '#e2502b' }, { key: 'app', name: 'The App', color: '#f0a030' },
    { key: 'site', name: 'Website', color: '#3987e5' }, { key: 'other', name: 'Other' }];
  const all = { game: 66.9e9, app: 8.98e8, site: 1.78e9, other: 9.51e9 }, today = { game: 1.12e9, app: 4.1e7, site: 8.2e6, other: 6.37e8 };
  // Today's tokens by kind, as agent-stats 0.7 splits them (most of them cache reads).
  const io = Object.fromEntries(keys.map(k => [k, { in: today[k] * 0.01, cr: today[k] * 0.88, cw: today[k] * 0.07, out: today[k] * 0.04 }]));
  const MODELS = ['Opus 5.5', 'Opus 5.5', 'Sonnet 5.5', 'Fable 5.1'], agents = [];
  let n = 0;
  const add = (project, kind = 'main') => agents.push({ id: 'demo' + n++, parent: null, agent: 'claude', kind, project, state: 'run',
    model: MODELS[Math.random() * MODELS.length | 0], io: { in: 0, cr: 0, cw: 0, out: 0 }, next: Date.now() + Math.random() * 4000, pace: 5000 + Math.random() * 12000 });
  ['game', 'game', 'other', 'site'].forEach(p => add(p));
  setInterval(() => {
    const now = Date.now();
    for (const a of agents) if (now >= a.next) {
      const t = { in: 2 + (Math.random() * 8 | 0), cr: Math.round(1.2e5 + Math.random() * 4e5), cw: Math.round(300 + Math.random() ** 3 * 2e4), out: Math.round(30 + Math.random() ** 3 * 1200) };
      a.io = { ...a.io };
      for (const k in t) { a.io[k] += t[k]; all[a.project] += t[k]; today[a.project] += t[k]; io[a.project][k] += t[k]; }
      a.state = Math.random() < 0.6 ? 'run' : 'thinking'; a.next = now + a.pace * (0.4 + Math.random());
    }
    if (Math.random() < 0.03 && agents.length < 6) add(keys[Math.random() * 4 | 0], 'subagent');
    else if (Math.random() < 0.015 && agents.length > 3) agents.splice(3 + (Math.random() * (agents.length - 3) | 0), 1);
    window.relayFeed({ updated: now, live: { agents: agents.map(({ next, pace, ...a }) => a) }, today: { day }, projectList,
      projects: { all: { ...all }, today: { ...today }, todayIo: structuredClone(io), last: Object.fromEntries(keys.map(k => [k, 1])), lastMs: 1000 } });
  }, 1000);
}
