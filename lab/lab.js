// Compact widget prototypes: small pixel-art machines that carry today's AI tokens to the projects.
// Each machine has its own little canvas, drawn at a low resolution and scaled up, and moves only when real tokens
// arrive: every publish's new tokens per project become units (crates, bricks, grains) handed out over the time
// until the next one. A project's figure is its tokens today less the units still on their way to it.

import { backdrop } from './scene.js';

// Where the stats come from. In the desktop app, the hub (window.hubFeed): the app hands over its /api/state and
// /api/repos, and each repository shows under its own name, those of a configured project under the project's. A
// relay too when one is given (?relay=<url>): its projects are the hub's public ones, and every other repository
// counts as `other`. On the web, only the relay.
const RELAY = (new URLSearchParams(location.search).get('relay') || '').replace(/\/(stats)?\/?$/, '');
// The projects come from the feed, and the machines are rebuilt to make room when they change. Until it answers,
// just `other`. A new project gets its key as its name and a spare colour unless the feed says otherwise.
export const PROJECTS = ['other'];
export const NAMES = { other: 'Other' };
export const RGB = { other: [196, 188, 174] };
export const SHORT = { other: 'Other' };
const SPARE = [[86, 178, 98], [160, 110, 226], [40, 180, 168], [226, 96, 150], [206, 196, 72], [110, 146, 255], [214, 128, 80], [150, 200, 230]];
export const shade = (p, k) => `rgb(${(RGB[p] || RGB.other).map(v => Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)))})`;
export const SHADES = [1, 0.84, 0.7];
const hexRGB = c => /^#[0-9a-f]{6}$/i.test(c || '') ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : null;
// A label for the tight spots: the name's first word (or all of it when that word says little), at most 11 characters.
const shortName = s => { const w = s.split(/\s+/)[0], t = w.length >= 4 ? w : s; return t.length > 11 ? t.slice(0, 10) + '…' : t; };
// A spare colour that no other project shows, starting from one picked by the key, so it stays put between runs.
const spare = (k, keys) => {
  const used = new Set(keys.filter(q => q !== k && RGB[q]).map(q => String(RGB[q])));
  const h = [...k].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  for (let i = 0; i < SPARE.length; i++) { const c = SPARE[(h + i) % SPARE.length]; if (!used.has(String(c))) return c; }
  return SPARE[h % SPARE.length];
};
// A repository's key as a name: words split at dashes, underscores and case changes, capitalised, the usual acronyms
// in capitals ('llm-widget' is LLM Widget). A domain, or a key that already reads as a name, stays as it is.
const ACRONYMS = { ai: 'AI', api: 'API', ios: 'iOS', llm: 'LLM', mcp: 'MCP', sdk: 'SDK', ui: 'UI', tf: 'TF' };
const prettyName = k => /\.[a-z]{2,}$/i.test(k) || !/[-_]|[a-z][A-Z]|^[a-z]/.test(k) ? k
  : k.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[-_\s]+/).filter(Boolean)
    .map(w => ACRONYMS[w.toLowerCase()] || w[0].toUpperCase() + w.slice(1)).join(' ');
// A project shows while it is being worked on: for RECENT after its tokens last grew or an agent was last busy in it
// (?recent=<hours> picks another window). When each was, kept across reloads.
const RECENT = (+new URLSearchParams(location.search).get('recent') || 2) * 3600000;
const lastActive = (() => { try { return JSON.parse(localStorage.getItem('lastActive')) || {}; } catch { return {}; } })();
function markActive(k, at) { if (k && at > (lastActive[k] || 0)) lastActive[k] = at; }
function keepSeen(now) {
  for (const k in lastActive) if (now - lastActive[k] > RECENT) delete lastActive[k];
  try { localStorage.setItem('lastActive', JSON.stringify(lastActive)); } catch {}
}
const projectListeners = [];
// `projectList` [{key, name, color}]: names and colours. A feed that lists exactly the projects to consider says
// `listed`; otherwise they're those with tokens today. Either way only the recent ones show, biggest first by tokens
// today, with `other` last, and `other` alone when none is.
function setProjects(d) {
  const list = (Array.isArray(d.projectList) ? d.projectList : []).filter(p => p && typeof p.key === 'string' && p.key);
  const today = d.projects.today || {};
  for (const p of list) {
    if (p.name) { NAMES[p.key] = p.name; SHORT[p.key] = shortName(p.name); }
    RGB[p.key] = hexRGB(p.color) || RGB[p.key];
  }
  const keys = [...new Set([...(d.listed ? list.map(p => p.key) : Object.keys(today).filter(k => today[k] > 0)),
    ...(d.live?.agents || []).map(a => a.project)])].filter(k => d.updated - (lastActive[k] || 0) <= RECENT);
  if (!keys.length) keys.push('other');
  for (const k of keys) { NAMES[k] ??= prettyName(k); SHORT[k] ??= shortName(NAMES[k]); RGB[k] ??= spare(k, keys); }
  keys.sort((a, b) => (a === 'other') - (b === 'other') || (today[b] || 0) - (today[a] || 0));
  if (keys.join() === PROJECTS.join()) return;
  const moved = keys.length === PROJECTS.length && keys.every(k => PROJECTS.includes(k));   // the same ones, reordered
  PROJECTS.splice(0, PROJECTS.length, ...keys);
  for (const f of projectListeners) f(moved);
}

// The hub's private view, in the relay's shape: the projects worked on today or right now. Sessions with no
// repository count as `other`. `active`: when each project's sessions were last busy, for a page that just opened.
function fromHub(state, repos) {
  const all = {}, today = {}, active = {}, of = new Map(), todayIo = {};
  for (const r of repos) {
    const k = r.project || r.repo;
    of.set(r.repo, k); all[k] = (all[k] || 0) + r.tokensAll; today[k] = (today[k] || 0) + r.tokensToday;
    if (r.ioToday) { const t = todayIo[k] ??= { in: 0, cr: 0, cw: 0, out: 0 }; for (const x of KINDS) t[x] += r.ioToday[x] || 0; }
  }
  const sessions = state.sessions || [], busy = s => s.working ?? state.now - s.lastActivity < 60000;
  const project = s => of.get(s.repo) || s.repo || 'other';
  for (const s of sessions) active[project(s)] = Math.max(active[project(s)] || 0, s.working ? state.now : s.lastActivity || 0);
  const agents = sessions.filter(s => busy(s) || sessions.some(c => busy(c) && c.parent === s.id && c.machine === s.machine)).map(s => ({
    id: `${s.machine}|${s.id}`, parent: s.parent ? `${s.machine}|${s.parent}` : null, agent: s.agent, kind: s.kind, model: s.model,
    project: project(s), state: s.state, io: s.io,
  }));
  const keys = [...new Set([...Object.keys(today).filter(k => today[k] > 0), ...agents.map(a => a.project)])];
  return {
    updated: state.now, listed: true, live: { agents }, today: { day: new Date(state.now).toLocaleDateString('en-CA') },
    projects: { all, today, last: {}, active, todayIo },
    projectList: keys.map(k => ({ key: k, name: k === 'other' ? 'Other' : null })),
  };
}

// ---- What counts -----------------------------------------------------------------------------------------------
// The tokens that count (?kinds=, Settings): any of fresh input, cache reads, cache writes and output, all by default.
// From agent-stats 0.7 each project's tokens today come split by kind (`projects.todayIo`), so everything counts only
// those; without a split (an older hub or relay) it counts them all. A unit (a square, a crate) is worth its machine's
// base amount times the share of today's tokens that count, rounded to 1, 2 or 5, so the machines stay about as busy.
export const KINDS = ['in', 'cr', 'cw', 'out'];
export const KIND = { in: 'input', cr: 'cache read', cw: 'cache write', out: 'output' };
// `split`: the last update had one, so the kinds are what counts.
export const counting = { kinds: KINDS, split: false, share: 1 };
const everything = () => counting.kinds.length === KINDS.length;
const splitOf = d => { const io = d.projects?.todayIo; return io && Object.keys(io).length ? io : null; };
// Each project's tokens today that count.
export function countedToday(d) {
  const today = d.projects.today || {}, io = splitOf(d);
  if (everything() || !io) return { ...today };
  return Object.fromEntries([...new Set([...Object.keys(today), ...Object.keys(io)])]
    .map(p => [p, counting.kinds.reduce((n, k) => n + (io[p]?.[k] || 0), 0)]));
}
// What counts, for a label: 'tokens' when it's all of them, else the kinds ('output', 'in + out').
export const countedWhat = () => everything() || !counting.split ? 'tokens'
  : counting.kinds.length === 1 ? KIND[counting.kinds[0]] : counting.kinds.join(' + ');
export function setCounting(list) {
  const k = KINDS.filter(x => list.includes(x));
  counting.kinds = k.length ? k : KINDS;
  prevCounted = null;
  for (const c of feed.channels) Object.assign(c, { U: 0, carry: {}, owed: {}, shown: {}, queue: [] });   // counted afresh
}
const nice = n => { const e = 10 ** Math.floor(Math.log10(n)), m = n / e; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e; };

// ---- Feed ------------------------------------------------------------------------------------------------------
// `rate` is tokens a second over the last 30 s, `history` the rate every 15 s for ten minutes (the last one live),
// `updated` when the hub last published, `beat` when new tokens last came in. `stale`: the hub hasn't published for two
// minutes, so nobody is shown working. `source`: 'hub' or 'relay'. `live`: the last update was pushed by a stream.
export const feed = { today: {}, agents: [], channels: [], rate: 0, history: [], updated: 0, beat: 0, stale: false, source: '', live: false };
// A channel hands out units of U tokens per project (`base` when every token counts, scaled to what counts: see
// above). `arrive(p)` is called for each; the machine calls `delivered(p)` once that unit reaches its project.
// `count(p)` is the project's tokens today less what is still on its way.
export function channel(base, cap = 200) {
  const c = { base, U: 0, cap, carry: {}, owed: {}, shown: {}, queue: [], arrive: () => {} };
  c.delivered = p => { c.owed[p] = Math.max(0, (c.owed[p] || 0) - 1); };
  c.count = p => (c.shown[p] = Math.max(c.shown[p] || 0, (feed.today[p] || 0) - (c.owed[p] || 0) * c.U));
  feed.channels.push(c);
  return c;
}
// Every update that brings something new, as it comes in, for pages that read more of it than the machines do
// (flow.html follows each agent's io): `onUpdate(f)`, then f(d, source, live).
const updateListeners = [];
export const onUpdate = f => updateListeners.push(f);
let prevAll = null, prevAt = 0, day = null, hubAt = 0, relayAt = 0, seen = 0, since = 0, slot = 0, lastTok = {}, spans = [];
let prevCounted = null;
// Takes one update in the relay's shape; returns how long to wait before asking the relay again. A polled one says
// what came in over the 15 s since the last; a pushed one (`live`) comes within a second of a change, so its tokens
// are a turn or two that just finished.
function ingest(d, source, live = false) {
  if (source !== feed.source) { feed.source = source; prevAll = null; prevCounted = null; prevAt = 0; spans = []; lastTok = {}; }   // totals from the other don't compare
  feed.stale = !!d.stale || Date.now() - d.updated > 120000;
  if (feed.stale) feed.agents = [];
  if (d.updated === prevAt && Object.keys(d.projects.all).every(k => d.projects.all[k] === prevAll[k])) return feed.stale ? 15000 : 2500;
  // What's being worked on: whose total grew since last time (the relay's first publish says its last interval), who
  // has an agent busy now, and, from the hub, when each project's sessions were last busy.
  const grew = prevAll ? Object.keys(d.projects.all).filter(k => k in prevAll && d.projects.all[k] > prevAll[k])
    : Object.keys(d.projects.last || {}).filter(k => d.projects.last[k] > 0);
  for (const k of grew) markActive(k, d.updated);
  if (!feed.stale) for (const a of d.live.agents || []) markActive(a.project, d.updated);
  for (const [k, at] of Object.entries(d.projects.active || {})) markActive(k, at);
  keepSeen(d.updated);
  setProjects(d);
  const now = Date.now(), at = performance.now(), first = !prevAll;
  const io = splitOf(d), some = !everything() && !!io, counted = countedToday(d);
  if (d.today.day !== day) {
    if (day && prevCounted) prevCounted = Object.fromEntries(Object.keys(prevCounted).map(p => [p, 0]));   // a new day starts from nothing
    day = d.today.day; for (const c of feed.channels) c.shown = {};
  }
  // The share of today's tokens that count: from the split, or as a whole.
  const all4 = io ? Object.values(io).reduce((n, v) => n + KINDS.reduce((m, k) => m + (v[k] || 0), 0), 0) : 0;
  counting.split = !!io;
  counting.share = some && all4 ? Math.max(1e-4, Object.values(counted).reduce((a, b) => a + b, 0) / all4) : 1;
  for (const c of feed.channels) if (!c.U) c.U = nice(Math.max(1, c.base * counting.share));
  feed.today = counted; feed.agents = feed.stale ? [] : d.live.agents || []; feed.live = live;
  for (const f of updateListeners) f(d, source, live);
  // A key that wasn't there last time has nothing to compare with: its tokens so far are counted, not hauled.
  // A polled first update replays the relay's last interval, so the machines start working straight away (a pushed
  // one doesn't: the next pushes come within seconds, and it would show those tokens twice as fast).
  // With only some kinds counting, the growth of what counts today; replayed, the last interval's tokens in their share.
  const delta = some
    ? prevCounted ? Object.fromEntries(PROJECTS.map(p => [p, p in prevCounted ? Math.max(0, (counted[p] || 0) - prevCounted[p]) : 0]))
      : live ? {} : Object.fromEntries(Object.entries(d.projects.last || {}).map(([p, n]) => [p, n * counting.share]))
    : prevAll ? Object.fromEntries(PROJECTS.map(p => [p, p in prevAll ? Math.max(0, (d.projects.all[p] || 0) - prevAll[p]) : 0])) : live ? {} : { ...d.projects.last };
  prevCounted = counted;
  const total = PROJECTS.reduce((n, p) => n + (delta[p] || 0), 0);
  // The rate on a fixed time base: each update's tokens over the time it covers, summed over the last 30 s.
  const from = first ? now - (live ? 1000 : d.projects.lastMs || 15000) : Math.max(seen, now - 60000);
  if (first) since = from;
  spans = [...spans.filter(s => s.b > now - 30000), { a: Math.min(from, now - 1), b: now, n: total }];
  rated(now);
  if (total || !live) feed.beat = now;
  // Each project's units are handed out over a window, evenly with a little jitter. Polled: the time since the last
  // update (5–60 s), as the tokens came in over it. Pushed: the time since that project's last tokens (2–8 s), so
  // one agent's turns run into each other and many agents' make a steady stream, with no 15 s bursts.
  const gap = first ? 15000 : Math.max(5000, Math.min(60000, d.updated - prevAt));
  feed.updated = d.updated; prevAll = d.projects.all; prevAt = d.updated; seen = now;
  for (const p of PROJECTS) {
    if (!delta[p]) continue;
    const w = live && !first ? Math.max(2000, Math.min(8000, now - (lastTok[p] ?? 0))) : gap;
    lastTok[p] = now;
    for (const c of feed.channels) {
      const t = (c.carry[p] || 0) + delta[p], n = Math.floor(t / c.U), k = Math.min(n, Math.ceil(c.cap * w / 15000));
      c.carry[p] = t - n * c.U;
      c.owed[p] = (c.owed[p] || 0) + k;         // units over the cap are counted at once, not drawn
      for (let i = 0; i < k; i++) c.queue.push({ at: at + w * (i + Math.random()) / k, p });
    }
  }
  for (const c of feed.channels) c.queue.sort((a, b) => a.at - b.at);
  return Math.max(2000, Math.min(16500, d.updated + 16500 - Date.now()));
}
// Live, the data reaches the present, so the rate also falls between updates when the tokens stop (or go stale).
function rated(now) {
  const over = s => s.n * Math.max(0, s.b - Math.max(s.a, now - 30000)) / (s.b - s.a);
  feed.rate = spans.reduce((n, s) => n + over(s), 0) / (Math.max(1000, Math.min(30000, now - since)) / 1000);
  if (Math.floor(now / 15000) !== slot) { for (let i = Math.min(40, slot ? Math.floor(now / 15000) - slot : 1); i > 0; i--) feed.history.push(feed.rate); slot = Math.floor(now / 15000); }
  feed.history = feed.history.slice(-40); feed.history[feed.history.length - 1] = feed.rate;
}
setInterval(() => { if (feed.live && seen) rated(Date.now()); }, 1000);
// The relay, polled when nothing is pushed: no hub view from the app in the last 45 s, no relay stream in the last 20 s.
async function poll() {
  let next = 5000;
  if (RELAY && RELAY !== 'demo' && Date.now() - hubAt > 45000 && Date.now() - relayAt > 20000) try {
    const res = await fetch(RELAY + '/stats', { cache: 'no-store' });
    if (res.status === 503) throw 0;                       // nothing published yet
    const d = await res.json();
    if (Date.now() - hubAt > 45000 && Date.now() - relayAt > 20000) next = ingest(d, 'relay');   // unless a push came in meanwhile
  } catch { next = 15000; }
  setTimeout(poll, next);
}
// The relay's stream: a full `stats`, then merge patches as the hub publishes. In a browser the page opens it itself;
// in the app, whose built-in pages can't reach the relay, the app holds it and pushes each document (relayFeed).
const merge = (a, p) => { if (p === null || typeof p !== 'object' || Array.isArray(p)) return p;
  const o = (a && typeof a === 'object' && !Array.isArray(a)) ? { ...a } : {};
  for (const k in p) p[k] === null ? delete o[k] : (o[k] = merge(o[k], p[k])); return o; };
const pushed = d => { relayAt = Date.now(); if (Date.now() - hubAt > 45000) ingest(d, 'relay', true); };
function stream() {
  if (!window.EventSource || !/^https?:/.test(RELAY)) return;
  const es = new EventSource(RELAY + '/stream');
  let doc = null;
  es.addEventListener('stats', e => pushed(doc = JSON.parse(e.data)));
  es.addEventListener('patch', e => { if (doc) pushed(doc = merge(doc, JSON.parse(e.data))); });
  es.onerror = () => { if (es.readyState === EventSource.CLOSED) { doc = null; setTimeout(stream, 300000); } };   // no stream (an old relay): polls, tries again later
}
window.relayFeed = pushed;
// `live`: the app streams the hub, rather than asking it every 15 s (an older app passes only the two).
window.hubFeed = (state, repos, live) => { hubAt = Date.now(); ingest(fromHub(state, repos), 'hub', !!live); };
window.webkit?.messageHandlers?.hub?.postMessage('ready');      // the app answers with the hub's view at once

// ---- Drawing helpers -------------------------------------------------------------------------------------------
function stage(el, W, H, scale) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  Object.assign(c.style, { width: W * scale + 'px', height: H * scale + 'px', imageRendering: 'pixelated', display: 'block' });
  el.appendChild(c);
  return c.getContext('2d');
}
function rect(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
function line(ctx, x0, y0, x1, y1, col) {
  ctx.fillStyle = col;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
// A 3 × 5 pixel font for the figures.
const FONT = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001011001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
  K: '101101110101101', M: '101111111101101', B: '110101110101110' };
const textW = s => [...s].reduce((w, ch) => w + (ch === '.' ? 1 : 3), 0) + s.length - 1;
function text(ctx, s, x, y, col) {
  ctx.fillStyle = col;
  for (const ch of s) {
    if (ch === '.') { ctx.fillRect(x, y + 4, 1, 1); x += 2; continue; }
    const g = FONT[ch] || '';
    for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(x + i % 3, y + (i / 3 | 0), 1, 1);
    x += 4;
  }
}
const textC = (ctx, s, cx, y, col) => text(ctx, s, Math.round(cx - textW(s) / 2), y, col);
// Short figures that never round up: 3.3B, 898M, 64B, 12K.
const fix = v => v < 10 ? String(Math.floor(v * 10) / 10) : String(Math.floor(v));
export const short = n => n >= 1e9 ? fix(n / 1e9) + 'B' : n >= 1e6 ? fix(n / 1e6) + 'M' : n >= 1e3 ? Math.floor(n / 1e3) + 'K' : String(Math.floor(n));
const approach = (v, to, step) => v < to ? Math.min(to, v + step) : Math.max(to, v - step);
// Each project's figure, brighter for a moment when something reaches it.
function label(ctx, ch, flash, p, cx, y, t) {
  textC(ctx, short(ch.count(p)), cx, y, shade(p, (flash[p] || 0) > t ? 1.35 : 0.85));
}
const STEEL = '#8f8f8f', DARK = '#4c4c4c', PALE = '#e4e4e4', GROUND = '#3a3a3a', BEACON = '#e2502b';

// ---- A. Gantry crane -------------------------------------------------------------------------------------------
// Crates (250K tokens each) drop into a bay on the left. A gantry crane on a beam across the top lifts them, a few
// at a time, onto each project's stack. A full stack sinks into the ground, into the project.
function gantry(el) {
  const W = 28 + 18 * PROJECTS.length, H = 40, G = 31, TOP = 6, ctx = stage(el, W, H, 3), ch = channel(2.5e5);
  const BAY = [4, 8, 12, 16], bay = BAY.map(() => []), air = [];
  const SX = PROJECTS.map((_, i) => 28 + 18 * i), stacks = PROJECTS.map(() => ({ crates: [], sink: 0 })), flash = {};
  const cr = { x: 10, y: TOP, phase: 'idle', load: [], col: 0, to: 0 };
  const crateTop = r => G - 3 - 4 * r;
  ch.arrive = p => {
    const min = Math.min(...bay.map(b => b.length));
    if (min >= 5) { ch.delivered(p); return; }
    const cols = BAY.map((_, i) => i).filter(i => bay[i].length === min), col = cols[Math.random() * cols.length | 0];
    air.push({ col, y: -4, vy: 0, c: { p, k: SHADES[Math.random() * 3 | 0] } });
  };
  const stackTop = s => { const rows = Math.ceil(s.crates.length / 3); return G - 4 * rows + s.sink; };
  return {
    step(dt, t) {
      for (let i = air.length - 1; i >= 0; i--) {
        const a = air[i]; a.vy += 160 * dt; a.y += a.vy * dt;
        if (a.y >= crateTop(bay[a.col].length)) { bay[a.col].push(a.c); air.splice(i, 1); }
      }
      for (const s of stacks) if (s.sink) { s.sink += 24 * dt; if (s.sink >= 20) { s.sink = 0; s.crates = []; } }
      const backlog = bay.reduce((n, b) => n + b.length, 0), vx = 45 * (backlog > 10 ? 2 : 1) * dt, vy = 35 * (backlog > 10 ? 2 : 1) * dt;
      if (cr.phase === 'idle') {
        if (!backlog) return;
        cr.col = bay.reduce((m, b, i) => b.length > bay[m].length ? i : m, 0); cr.to = BAY[cr.col] + 1; cr.phase = 'pick';
      }
      if (cr.y > TOP && (cr.phase === 'pick' || cr.phase === 'carry') && Math.round(cr.x) !== cr.to) { cr.y = approach(cr.y, TOP, vy); return; }
      if (cr.phase === 'pick') {
        if (cr.x !== cr.to) { cr.x = approach(cr.x, cr.to, vx); return; }
        const b = bay[cr.col], target = crateTop(b.length - 1) - 1;
        if (cr.y !== target) { cr.y = approach(cr.y, target, vy); return; }
        // Grab the top crate, and the ones under it while they go to the same project (up to three).
        do cr.load.push(b.pop()); while (b.length && cr.load.length < 3 && b[b.length - 1].p === cr.load[0].p);
        cr.to = SX[PROJECTS.indexOf(cr.load[0].p)] + 5; cr.phase = 'carry';
        return;
      }
      if (cr.phase === 'carry') {
        if (cr.y > TOP && cr.x !== cr.to) { cr.y = approach(cr.y, TOP, vy); return; }
        if (cr.x !== cr.to) { cr.x = approach(cr.x, cr.to, vx); return; }
        const s = stacks[PROJECTS.indexOf(cr.load[0].p)];
        if (s.sink) return;                                    // wait for the full stack to go down
        const target = stackTop(s) - 4 * cr.load.length;
        if (cr.y !== target) { cr.y = approach(cr.y, target, vy); return; }
        for (const c of cr.load.reverse()) { s.crates.push(c); ch.delivered(c.p); flash[c.p] = t + 0.4; }
        if (s.crates.length >= 15) s.sink = 0.01;
        cr.load = []; cr.phase = 'up';
        return;
      }
      if (cr.phase === 'up') { cr.y = approach(cr.y, TOP, vy); if (cr.y === TOP) cr.phase = 'idle'; }
    },
    draw(t) {
      ctx.clearRect(0, 0, W, H);
      const crate = (x, y, c) => { rect(ctx, x, y, 3, 3, shade(c.p, c.k)); rect(ctx, x, y, 1, 1, shade(c.p, 1.25)); };
      // Bay, stacks (clipped at the ground while they sink), crates in the air.
      rect(ctx, 2, G - 5, 1, 5, DARK); rect(ctx, 20, G - 5, 1, 5, DARK);
      bay.forEach((b, i) => b.forEach((c, r) => crate(BAY[i], crateTop(r), c)));
      for (const a of air) crate(BAY[a.col], a.y, a.c);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, G); ctx.clip();
      stacks.forEach((s, i) => s.crates.forEach((c, n) => crate(SX[i] + 4 * (n % 3), crateTop(n / 3 | 0) + s.sink, c)));
      ctx.restore();
      rect(ctx, 0, G, W, 1, GROUND);
      stacks.forEach((s, i) => { if (s.sink) rect(ctx, SX[i] - 1, G, 13, 1, shade(PROJECTS[i], 0.6)); });
      // The gantry: legs, beam, trolley with its beacon, cable, claw and load.
      rect(ctx, 0, 1, 1, G - 1, DARK); rect(ctx, W - 1, 1, 1, G - 1, DARK);
      rect(ctx, 0, 1, W, 1, STEEL); rect(ctx, 0, 2, W, 1, DARK);
      const x = Math.round(cr.x), y = Math.round(cr.y);
      rect(ctx, x - 2, 3, 5, 2, PALE);
      if (cr.phase !== 'idle' && Math.sin(t * 9) > 0) rect(ctx, x, 3, 1, 1, BEACON);
      rect(ctx, x, 5, 1, Math.max(0, y - 5), '#7a7a7a');
      rect(ctx, x - 2, y, 5, 1, '#cfcfcf'); rect(ctx, x - 2, y + 1, 1, 1, '#cfcfcf'); rect(ctx, x + 2, y + 1, 1, 1, '#cfcfcf');
      cr.load.forEach((c, i) => crate(x - 1, y + 1 + 4 * i, c));
      PROJECTS.forEach((p, i) => label(ctx, ch, flash, p, SX[i] + 5, G + 3, t));
    },
  };
}

// ---- B. Tower crane city ---------------------------------------------------------------------------------------
// Bricks (100K tokens each) are dropped beside a tower crane, which builds a tower for each project, brick by brick.
// When the tallest reaches the top, the city zooms out: every brick is worth twice as much and the towers halve.
function towerCity(el) {
  const W = 20 + 17 * PROJECTS.length, H = 50, G = 42, U = 1e5, MAXF = 13, TOP = 11, ctx = stage(el, W, H, 3), ch = channel(U);
  const BX = PROJECTS.map((_, i) => 20 + 17 * i), built = PROJECTS.map(() => 0), pile = [], air = [], flash = {};
  let zoom = 1;
  const cr = { x: 12, y: TOP, phase: 'idle', load: [], to: 12 };
  ch.arrive = p => air.push({ x: 9 + 2 * (Math.random() * 3 | 0), y: -3, vy: 0, p });
  const pileTop = n => G - 2 * (Math.floor(n / 3) + 1);
  const bricks = i => built[i] / (U * zoom);
  const roof = i => G - 2 * Math.ceil(bricks(i) / 5);
  const night = () => { const h = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false }).format(new Date()); return h >= 18 || h < 6; };
  let isNight = night(), nightAt = 0;
  return {
    step(dt, t) {
      if (t - nightAt > 60) { isNight = night(); nightAt = t; }
      for (let i = air.length - 1; i >= 0; i--) {
        const a = air[i]; a.vy += 160 * dt; a.y += a.vy * dt;
        if (a.y < pileTop(pile.length)) continue;
        air.splice(i, 1);
        if (pile.length < 18) pile.push(a.p); else ch.delivered(a.p);   // no room: counted, not drawn
      }
      const fast = pile.length > 9 ? 2 : 1, vx = 40 * fast * dt, vy = 35 * fast * dt;
      if (cr.phase === 'idle') { if (pile.length) { cr.to = 12; cr.phase = 'pick'; } else return; }
      if (cr.phase === 'pick') {
        if (cr.y > TOP && cr.x !== cr.to) { cr.y = approach(cr.y, TOP, vy); return; }
        if (cr.x !== cr.to) { cr.x = approach(cr.x, cr.to, vx); return; }
        const target = pileTop(pile.length - 1) - 1;
        if (cr.y !== target) { cr.y = approach(cr.y, target, vy); return; }
        do cr.load.push(pile.pop()); while (pile.length && cr.load.length < 3 && pile[pile.length - 1] === cr.load[0]);
        cr.to = BX[PROJECTS.indexOf(cr.load[0])] + 5; cr.phase = 'carry';
        return;
      }
      if (cr.phase === 'carry') {
        if (cr.y > TOP && cr.x !== cr.to) { cr.y = approach(cr.y, TOP, vy); return; }
        if (cr.x !== cr.to) { cr.x = approach(cr.x, cr.to, vx); return; }
        const i = PROJECTS.indexOf(cr.load[0]), target = roof(i) - 3;
        if (cr.y !== target) { cr.y = approach(cr.y, target, vy); return; }
        for (const p of cr.load) { built[i] += U; ch.delivered(p); flash[p] = t + 0.4; }
        while (Math.max(...PROJECTS.map((_, j) => Math.ceil(bricks(j) / 5))) > MAXF) zoom *= 2;
        cr.load = []; cr.phase = 'up';
        return;
      }
      if (cr.phase === 'up') { cr.y = approach(cr.y, TOP, vy); if (cr.y === TOP) cr.phase = 'idle'; }
    },
    draw(t) {
      ctx.clearRect(0, 0, W, H);
      // Towers: walls in the project's colour, windows lit more at night in Tokyo; the last brick fades in by how
      // much of it has been delivered.
      BX.forEach((bx, i) => {
        const n = bricks(i), p = PROJECTS[i];
        for (let k = 0; k < Math.ceil(n); k++) {
          const x = bx + 2 * (k % 5), y = G - 2 * (Math.floor(k / 5) + 1), lit = ((k * 7 + i * 13) % 11) < (isNight ? 6 : 2);
          ctx.globalAlpha = k < Math.floor(n) ? 1 : Math.max(0.25, n - k);
          rect(ctx, x, y, 2, 2, shade(p, 0.62)); rect(ctx, x, y, 2, 1, shade(p, 0.9));
          rect(ctx, x + 1, y + 1, 1, 1, lit ? '#ffd98a' : shade(p, 0.35));
        }
        ctx.globalAlpha = 1;
      });
      rect(ctx, 0, G, W, 1, GROUND);
      const brick = (x, y, p) => { rect(ctx, x, y, 2, 1, shade(p, 0.95)); rect(ctx, x, y + 1, 2, 1, shade(p, 0.62)); };
      pile.slice(0, 18).forEach((p, n) => brick(9 + 2 * (n % 3), pileTop(n), p));
      for (const a of air) brick(a.x, a.y, a.p);
      // The crane: mast, cab, jib and counter-jib, ties to the apex, trolley, cable, hook and load.
      for (let y = 9; y < G; y++) { rect(ctx, 3, y, 1, 1, STEEL); rect(ctx, 5, y, 1, 1, STEEL); if (y % 2) rect(ctx, 4, y, 1, 1, DARK); }
      rect(ctx, 4, 2, 1, 5, STEEL);
      line(ctx, 4, 2, 44, 7, DARK); line(ctx, 4, 2, 0, 7, DARK);   // ties from the apex
      rect(ctx, 0, 7, W, 1, STEEL);
      for (let x = 7; x < W; x += 2) rect(ctx, x, 8, 1, 1, DARK);
      rect(ctx, 0, 8, 3, 2, '#5c5c5c');
      rect(ctx, 2, 8, 5, 3, PALE); rect(ctx, 5, 9, 1, 1, '#101215');
      const x = Math.round(cr.x), y = Math.round(cr.y);
      rect(ctx, x - 1, 8, 3, 1, PALE);
      if (cr.phase !== 'idle' && Math.sin(t * 9) > 0) rect(ctx, 4, 1, 1, 1, BEACON);
      rect(ctx, x, 9, 1, Math.max(0, y - 9), '#7a7a7a');
      rect(ctx, x - 1, y, 3, 1, '#cfcfcf');
      cr.load.forEach((p, k) => brick(x - 3 + 2 * k, y + 1, p));
      PROJECTS.forEach((p, i) => label(ctx, ch, flash, p, BX[i] + 5, G + 3, t));
    },
  };
}

// ---- C. Sorting belt -------------------------------------------------------------------------------------------
// One line high. Each agent working right now is a cursor on the left; its tokens (100K a grain) drop onto a belt,
// which flicks each grain into its project's bin. A full bin empties out of the bottom, into the project.
function belt(el) {
  const W = 64 + 16 * PROJECTS.length, H = 16, Y = 9, END = 60, ctx = stage(el, W, H, 3), ch = channel(1e5);
  const BX = PROJECTS.map((_, i) => 66 + 16 * i), bins = PROJECTS.map(() => ({ n: 0, flush: 0 })), flash = {};
  const onBelt = [], flying = [], falling = [];
  const agentX = i => 2 + 3 * (i % 3), agentY = i => 1 + 4 * Math.floor(i / 3);
  ch.arrive = p => {
    const ag = feed.agents.slice(0, 6), i = ag.findIndex(a => a.project === p);
    onBelt.push({ x: i >= 0 ? agentX(i) : 4, y: i >= 0 ? agentY(i) + 3 : 0, vy: -20, p, k: SHADES[Math.random() * 3 | 0], drop: true });
  };
  const slot = n => ({ x: 1 + 2 * (n % 5), y: 13 - 2 * Math.floor(n / 5) });
  return {
    step(dt, t) {
      // Drop onto the start of the belt, then ride it, a pixel apart, to the end.
      let ahead = Infinity;
      onBelt.sort((a, b) => b.x - a.x);
      for (let i = 0; i < onBelt.length; i++) {
        const g = onBelt[i];
        if (g.drop) {
          g.vy += 120 * dt; g.y += g.vy * dt; g.x = approach(g.x, 13, 30 * dt);
          if (g.y < Y - 2) continue;
          g.y = Y - 2; g.vy = 0;
          if (g.x !== 13 || ahead <= 16) continue;            // wait for room at the start of the belt
          g.drop = false;
        }
        g.x = Math.min(g.x + 18 * dt, ahead - 3); ahead = g.x;
        if (g.x >= END) {
          // Flicked in an arc into its bin.
          const b = BX[PROJECTS.indexOf(g.p)] + 6, T = 0.55;
          flying.push({ x: g.x, y: g.y, vx: (b - g.x) / T, vy: (8 - g.y - 0.5 * 160 * T * T) / T, p: g.p, k: g.k });
          onBelt.splice(i--, 1); ahead = Infinity;
        }
      }
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i]; f.vy += 160 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
        const bi = PROJECTS.indexOf(f.p), b = bins[bi];
        if (f.vy > 0 && f.y >= slot(b.n).y - 1) {
          flying.splice(i, 1); ch.delivered(f.p); flash[f.p] = t + 0.4;
          if (b.flush) continue;
          b.n++;
          if (b.n >= 10) { b.flush = 0.01; for (let n = 0; n < b.n; n++) falling.push({ x: BX[bi] + slot(n).x, y: slot(n).y, vy: 0, p: f.p }); b.n = 0; }
        }
      }
      for (const b of bins) if (b.flush) { b.flush += dt; if (b.flush > 0.5) b.flush = 0; }
      for (let i = falling.length - 1; i >= 0; i--) { const f = falling[i]; f.vy += 160 * dt; f.y += f.vy * dt; if (f.y > H) falling.splice(i, 1); }
    },
    draw(t) {
      ctx.clearRect(0, 0, W, H);
      // Agents: cursors in their project's colour, blinking while they think.
      feed.agents.slice(0, 6).forEach((a, i) => {
        const on = a.state === 'thinking' || a.state === 'waiting' ? Math.sin(t * 6 + i) > 0 : true;
        rect(ctx, agentX(i), agentY(i), 1, 3, shade(a.project, on ? 1.2 : 0.5));
      });
      // The belt, its surface moving right, and its two rollers.
      for (let x = 13; x <= END + 1; x++) rect(ctx, x, Y, 1, 1, (x - Math.floor(t * 18)) % 4 === 0 ? '#9a9a9a' : '#5a5a5a');
      rect(ctx, 13, Y + 1, END - 11, 1, '#262626');
      rect(ctx, 12, Y, 1, 2, STEEL); rect(ctx, END + 2, Y, 1, 2, STEEL);
      const grain = (x, y, p, k) => rect(ctx, x, y, 2, 2, shade(p, k));
      for (const g of onBelt) grain(g.x, g.y, g.p, g.k);
      for (const f of flying) grain(f.x, f.y, f.p, f.k);
      for (const f of falling) grain(f.x, f.y, f.p, 0.7);
      // Bins: walls, the grains in them, a floor that opens to empty them, and the figure above.
      BX.forEach((bx, i) => {
        const p = PROJECTS[i], b = bins[i];
        rect(ctx, bx, 8, 1, 7, DARK); rect(ctx, bx + 11, 8, 1, 7, DARK);
        if (!b.flush) rect(ctx, bx, 15, 12, 1, DARK); else { rect(ctx, bx, 15, 2, 1, DARK); rect(ctx, bx + 10, 15, 2, 1, DARK); }
        for (let n = 0; n < b.n; n++) { const s = slot(n); grain(bx + s.x, s.y, p, SHADES[n % 3]); }
        label(ctx, ch, flash, p, bx + 6, 1, t);
      });
    },
  };
}

// ---- D. Silos --------------------------------------------------------------------------------------------------
// The smallest. A hopper on a rail pours tokens (20K a grain of sand) into each project's silo; a full silo
// drains out of the bottom, into the project.
function silos(el) {
  const W = 16 * PROJECTS.length, H = 52, TOP = 12, BOT = 40, IN = 12, ctx = stage(el, W, H, 2), ch = channel(2e4, 400);
  const SX = PROJECTS.map((_, i) => 1 + 16 * i), queue = [], drops = [], flash = {};
  const silo = PROJECTS.map(() => ({ cols: Array.from({ length: IN }, () => []), drain: false, out: [] }));
  const hop = { x: SX[0] + 7, p: null, pour: 0 };
  ch.arrive = p => queue.push(p);
  const total = s => s.cols.reduce((n, c) => n + c.length, 0);
  return {
    step(dt, t) {
      // Pour one project's grains at a time: the one with the most waiting.
      if (!hop.p || !queue.includes(hop.p)) {
        const counts = PROJECTS.map(p => queue.filter(q => q === p).length);
        hop.p = queue.length ? PROJECTS[counts.indexOf(Math.max(...counts))] : null;
      }
      if (hop.p) {
        const to = SX[PROJECTS.indexOf(hop.p)] + 7;
        hop.x = approach(hop.x, to, 40 * dt);
        if (hop.x === to) {
          hop.pour += dt * (queue.length > 40 ? 30 : 10);
          while (hop.pour >= 1 && queue.includes(hop.p)) {
            hop.pour--; queue.splice(queue.indexOf(hop.p), 1);
            drops.push({ x: to - 1 + (Math.random() * 2 | 0), y: 7, vy: 10, p: hop.p, k: SHADES[Math.random() * 3 | 0] });
          }
        }
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i], si = PROJECTS.indexOf(d.p), s = silo[si], c = Math.max(0, Math.min(IN - 1, Math.round(d.x - SX[si] - 1)));
        d.vy += 140 * dt; d.y += d.vy * dt;
        if (d.y < BOT - s.cols[c].length) continue;
        drops.splice(i, 1); ch.delivered(d.p); flash[d.p] = t + 0.3;
        // Sand slides off any neighbour more than one grain lower, so each silo fills as a heap.
        let x = c;
        for (let moved = true; moved;) {
          moved = false;
          for (const nx of Math.random() < 0.5 ? [x - 1, x + 1] : [x + 1, x - 1])
            if (nx >= 0 && nx < IN && s.cols[nx].length < s.cols[x].length - 1) { x = nx; moved = true; break; }
        }
        s.cols[x].push(d.k);
        if (total(s) > IN * (BOT - TOP) * 0.8) s.drain = true;
      }
      // A full silo opens at the bottom and drains to a fifth.
      for (const [si, s] of silo.entries()) {
        if (s.drain && (s.tick = (s.tick || 0) + dt) > 0.03) {
          s.tick = 0;
          s.cols.forEach((c, x) => { if (c.length) s.out.push({ x: SX[si] + 1 + x, y: BOT + 1, vy: 20, k: c.shift() }); });
          if (total(s) < IN * (BOT - TOP) * 0.2) s.drain = false;
        }
        for (let i = s.out.length - 1; i >= 0; i--) { const o = s.out[i]; o.vy += 140 * dt; o.y += o.vy * dt; if (o.y > 43) s.out.splice(i, 1); }
      }
    },
    draw(t) {
      ctx.clearRect(0, 0, W, H);
      SX.forEach((sx, i) => {
        const p = PROJECTS[i], s = silo[i];
        rect(ctx, sx, TOP - 2, 1, BOT - TOP + 3, DARK); rect(ctx, sx + 13, TOP - 2, 1, BOT - TOP + 3, DARK);
        rect(ctx, sx, TOP - 2, 3, 1, DARK); rect(ctx, sx + 11, TOP - 2, 3, 1, DARK);
        if (!s.drain) rect(ctx, sx, BOT + 1, 14, 1, DARK); else { rect(ctx, sx, BOT + 1, 4, 1, DARK); rect(ctx, sx + 10, BOT + 1, 4, 1, DARK); }
        s.cols.forEach((c, x) => c.forEach((k, y) => { if (BOT - y >= TOP) rect(ctx, sx + 1 + x, BOT - y, 1, 1, shade(p, k)); }));
        for (const o of s.out) rect(ctx, o.x, o.y, 1, 1, shade(p, o.k));
        label(ctx, ch, flash, p, sx + 7, 46, t);
      });
      for (const d of drops) rect(ctx, d.x, d.y, 1, 1, shade(d.p, d.k));
      // Rail and hopper, its funnel tinted with what it is pouring.
      rect(ctx, 0, 1, W, 1, STEEL);
      const x = Math.round(hop.x), tint = hop.p ? shade(hop.p, 0.85) : DARK;
      rect(ctx, x - 1, 2, 2, 1, PALE);
      rect(ctx, x - 4, 3, 8, 1, PALE); rect(ctx, x - 3, 4, 6, 1, tint); rect(ctx, x - 2, 5, 4, 1, tint); rect(ctx, x - 1, 6, 2, 1, PALE);
    },
  };
}

// ---- Trucks -----------------------------------------------------------------------------------------------------
// The homepage's field, small: each agent working right now is a cursor in the corner, and throws its tokens
// (50K a square) onto the pile. A pixel dump truck scoops the pile, backs up to the hole and tips its load in; out of
// the hole each square runs to its project, named with today's tokens. Drawn at screen resolution like the site.
export const MONO = '"Geist Mono", ui-monospace, monospace';
const TRUCK_PX = [
  '.....................R..',
  '..DDDDDDDDDDDDDD.BBBBBB.',
  '..DdDDdDDdDDdDDD.BWWWBBB',
  '..DdDDdDDdDDdDDD.BWWWWBB',
  '..DdDDdDDdDDdDDD.BBBBBBB',
  '..YyYyYyYyYyYyYy.BBBBBBL',
  '.SSSSSSSSSSSSSSSSSSSSSS.',
  '...KKK..KKK.......KKK...',
  '..KKHKKKKHKK.....KKHKK..',
  '...KKK..KKK.......KKK...',
];
const INK = { D: '#8f8f8f', d: '#666666', Y: '#e8e8e8', y: '#141414', B: '#e4e4e4', W: '#101215', S: '#4c4c4c', K: '#1a1a1a', H: '#c4c4c4', L: '#ffffff', R: '#e2502b', r: '#4a1a0e', A: '#cfcfcf' };
const BEDK = new Set(['D', 'd', 'Y', 'y']), REST = -2.5, SCOOP = 0.75;
function stageHD(el, W, H) {
  const c = document.createElement("canvas"), dpr = Math.min(4, devicePixelRatio || 1);
  c.width = W * dpr; c.height = H * dpr;
  Object.assign(c.style, { width: W + 'px', height: H + 'px', display: 'block' });
  el.appendChild(c);
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
  return ctx;
}
// layout 'rows': a line per project under the field, its bar growing as its squares arrive (the site in small).
// layout 'cells': the projects as a legend of `across` cells per row; squares run along a rail to theirs.
// `rate(p)`: the project's tokens a second now, written by its figure, with a light running along its bar as fast as
// they come; `kick(a, t)`: 0 to 1, an agent's cursor flaring as its turn lands (both for flow.js, which follows them).
// H is the height for four projects; it grows or shrinks by a line (or a row of cells) per project more or less.
export const haulH = ({ H, layout, across = 4 }, n = PROJECTS.length) =>
  layout === 'rows' ? H + 13 * (n - 4) : H + 14 * (Math.ceil(n / across) - Math.ceil(4 / across));
export function haul(el, opt) {
  const { W, ground, hole, layout, across = 4, rate, kick } = opt, H = haulH(opt);
  const ctx = stageHD(el, W, H), ch = channel(5e4, 120), S = 3, P = 2, TW = 24 * P, TH = 10 * P, G = 420, HOLE = 6;
  const wall = hole + TW + 20, cols = Math.floor((W - 2 - wall) / S), x0 = W - 2 - cols * S, maxH = Math.floor((ground - 22) / S);
  // Where you are, under its sky now (scene.js): the landmark over the pile's ground, which the truck keeps clear.
  const sky = backdrop(W, ground, { at: Math.round(wall + (W - wall) * 0.55) });
  const hgt = new Array(cols).fill(0), stack = hgt.map(() => []), air = [], down = [], flash = {};
  const tr = { x: hole + 8, phase: 'wait', bed: [], bucket: [], arm: REST, tip: 0, odo: 0, f: 0, took: false, pour: 0 };
  let sweep = 0, lastDraw = 0;
  const lamps = {};                                          // where the light on each project's bar is
  const pileN = () => hgt.reduce((a, b) => a + b, 0);
  const colX = i => x0 + i * S, topOf = i => ground - hgt[i] * S;
  function push(i, c) {
    for (let d = 0; d < cols; d++) for (const j of [i + d, i - d]) if (j >= 0 && j < cols && hgt[j] < maxH) { stack[j].push(c); hgt[j]++; return; }
    ch.delivered(c.p);                                       // no room left: counted, not drawn
  }
  const pop = i => { hgt[i]--; return stack[i].pop(); };
  // Where each project's squares end up.
  const rowsY = PROJECTS.map((_, i) => ground + 10 + i * 13);
  const RAIL = ground + 6, cellW = (W - 8) / across;
  const cell = i => ({ x: 4 + (i % across) * cellW, y: ground + 17 + Math.floor(i / across) * 14 });
  // Agents in the top right corner, over the pile: one cursor each, in its project's colour; subagents shorter.
  const agentAt = i => ({ x: W - 6 - (Math.min(12, feed.agents.length) - 1 - i) * 4, y: 5 });
  ch.arrive = p => {
    const c = { p, k: SHADES[Math.random() * 3 | 0] }, ag = feed.agents.slice(0, 12), i = ag.findIndex(a => a.project === p);
    const tc = Math.floor(cols * (0.35 + Math.random() * 0.6)), tx = colX(tc), ty = topOf(tc) - S, T = 0.8 + Math.random() * 0.3;
    if (i < 0) { air.push({ x: tx, y: -4, vx: 0, vy: 30, c }); return; }   // not on screen: falls from above
    const a = agentAt(i);
    air.push({ x: a.x, y: a.y + 3, vx: (tx - a.x) / T, vy: (ty - a.y) / T - 0.5 * G * T, c });
  };
  function avalanche() {
    for (let pass = 0; pass < 2; pass++) {
      const dir = sweep++ & 1 ? 1 : -1;
      for (let k = 0; k < cols; k++) {
        const i = dir > 0 ? k : cols - 1 - k;
        for (const j of [i + dir, i - dir]) if (j >= 0 && j < cols && hgt[i] - hgt[j] > 1) { stack[j].push(pop(i)); hgt[j]++; }
      }
    }
  }
  // The truck works the pile's left foot, reaching about 16 px ahead of its cab.
  const reach = () => { const r = []; for (let i = 0; i < cols; i++) if (colX(i) >= tr.x + 44 && colX(i) <= tr.x + 62 && hgt[i]) r.push(i); return r; };
  const parkX = () => { for (let i = 0; i < cols; i++) if (hgt[i]) return Math.max(hole + 8, colX(i) - 46); return null; };
  const load = () => Math.max(9, Math.min(30, Math.round(pileN() / 3)));
  function drive(to, dt, speed) { const d = Math.sign(to - tr.x) * Math.min(Math.abs(to - tr.x), speed * dt); tr.x += d; tr.odo += d; return tr.x === to; }
  function stepTruck(dt) {
    switch (tr.phase) {
      case 'wait': if (pileN() >= 3) tr.phase = 'toPile'; break;
      case 'toPile': { const to = parkX(); if (to == null) { tr.phase = 'wait'; break; } if (drive(to, dt, 45)) { tr.phase = 'load'; tr.f = 0; } break; }
      case 'load': {
        tr.f += dt / 0.7;
        tr.arm = REST + (SCOOP - REST) * Math.sin(Math.PI * Math.min(1, tr.f));
        if (!tr.took && tr.f >= 0.5) {
          tr.took = true;
          for (let k = 0; k < 3; k++) { const r = reach(); if (!r.length) break; tr.bucket.push(pop(r.reduce((m, i) => hgt[i] > hgt[m] ? i : m, r[0]))); }
        }
        if (tr.f >= 1) {
          tr.bed.push(...tr.bucket); tr.bucket = []; tr.f = 0; tr.took = false; tr.arm = REST;
          if (tr.bed.length >= load() || !reach().length) tr.phase = tr.bed.length ? 'toHole' : 'toPile';
        }
        break;
      }
      case 'toHole': if (drive(hole - 4, dt, 50)) tr.phase = 'tip'; break;
      case 'tip':
        tr.tip = Math.min(1, tr.tip + dt * 2);
        if (tr.tip > 0.6 && (tr.pour += dt) > 0.035) {
          tr.pour = 0;
          const c = tr.bed.pop();
          if (c) down.push({ x: hole - 2, y: ground - 10, vx: -8, vy: 0, c, stage: 'hole' });
          else tr.phase = 'untip';
        }
        break;
      case 'untip': tr.tip = Math.max(0, tr.tip - dt * 2.5); if (!tr.tip) tr.phase = pileN() ? 'toPile' : 'wait'; break;
    }
  }
  // Out of the hole: down the chute, then along to the project.
  function stepDown(dt, t) {
    for (let n = down.length - 1; n >= 0; n--) {
      const g = down[n], i = PROJECTS.indexOf(g.c.p);
      const arrive = () => { down.splice(n, 1); ch.delivered(g.c.p); flash[g.c.p] = t + 0.5; };
      if (g.stage === 'hole') {
        g.vy += G * dt; g.y += g.vy * dt; g.x += (hole - 1 - g.x) * Math.min(1, dt * 14);
        if (g.y > ground) { g.stage = 'chute'; g.x = hole - 1; }
        continue;
      }
      if (layout === 'rows') {
        const y = rowsY[i] - 1;
        if (g.stage === 'chute') { g.vy = Math.min(150, g.vy + G * dt); g.y += g.vy * dt; if (g.y >= y) { g.y = y; g.stage = 'run'; g.vx = 60; } }
        else { g.y = y; g.vx = Math.min(260, g.vx + 400 * dt); g.x += g.vx * dt; if (g.x >= barEnd(g.c.p) - S) arrive(); }
      } else {
        const m = cell(i), mx = m.x;
        if (g.stage === 'chute') { g.vy = Math.min(150, g.vy + G * dt); g.y += g.vy * dt; if (g.y >= RAIL) { g.y = RAIL; g.stage = 'rail'; g.vx = 60; g.dir = mx >= g.x ? 1 : -1; } }
        else if (g.stage === 'rail') { g.vx = Math.min(240, g.vx + 400 * dt); g.x += g.vx * g.dir * dt; if ((g.x - mx) * g.dir >= 0) { g.x = mx; g.stage = 'drop'; g.vy = 40; } }
        else { g.vy += G * dt; g.y += g.vy * dt; if (g.y >= m.y - 2) arrive(); }
      }
    }
  }
  // Bars to scale with the busiest project today, ending before the figures.
  const barStart = hole + 5, barMax = W - 54 - (rate ? 34 : 0) - barStart;
  function barEnd(p) {
    const max = Math.max(1, ...PROJECTS.map(q => ch.count(q))), n = ch.count(p);
    return barStart + (n ? Math.max(S, Math.round(n / max * barMax / S) * S) : 0);
  }
  const sq = (x, y, c) => { ctx.fillStyle = shade(c.p, c.k); ctx.fillRect(Math.round(x), Math.round(y), S - 1, S - 1); };
  function drawTruck(t) {
    const ox = Math.round(tr.x), oy = ground - TH;
    const put = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(ox + Math.round(x) * P, oy + Math.round(y) * P, P, P); };
    const turn = Math.floor(Math.abs(tr.odo) / 4) % 2, beacon = tr.phase !== 'wait' && Math.sin(t * 9) > 0;
    TRUCK_PX.forEach((row, y) => [...row].forEach((k, x) => {
      if (k === '.' || BEDK.has(k)) return;
      put(x, y, INK[k === 'H' && turn ? 'K' : k === 'R' && !beacon ? 'r' : k]);
    }));
    // Bed and load tip together about the hinge at the bed's rear corner.
    const a = -0.75 * tr.tip, ca = Math.cos(a), sa = Math.sin(a), rot = (x, y) => [2 + (x - 2) * ca - (y - 6) * sa, 6 + (x - 2) * sa + (y - 6) * ca];
    TRUCK_PX.forEach((row, y) => [...row].forEach((k, x) => { if (BEDK.has(k)) { const [rx, ry] = rot(x, y); put(rx, ry, INK[k]); } }));
    const per = S / P;
    let w = 1, i = 0;
    while (w * (w + 1) / 2 < tr.bed.length && w < 9) w++;
    for (let r = 0; i < tr.bed.length; r++, w = Math.max(1, w - 1))
      for (let j = 0; j < w && i < tr.bed.length; j++, i++) {
        const [rx, ry] = rot(2 + (14 - w * per) / 2 + j * per, 1 - (r + 1) * per);
        sq(ox + rx * P, oy + ry * P, tr.bed[i]);
      }
    // Loader arm and bucket.
    for (let k = 1; k <= 11; k++) put(18 + Math.cos(tr.arm) * k, 1 + Math.sin(tr.arm) * k, k < 3 ? INK.S : INK.A);
    put(18, 1, INK.S);
    const bx = 18 + Math.cos(tr.arm) * 12, by = 1 + Math.sin(tr.arm) * 12;
    for (const [dx, dy] of [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) put(bx + dx, by + dy, INK.D);
    tr.bucket.forEach((c, j) => sq(ox + (bx - 1 + j) * P, oy + (by - 1) * P - 1, c));
  }
  return {
    reorders: true,                                          // finds each project's line by its place every frame
    step(dt, t) {
      for (let n = air.length - 1; n >= 0; n--) {
        const a = air[n]; a.vy += G * dt; a.x += a.vx * dt; a.y += a.vy * dt;
        const i = Math.max(0, Math.min(cols - 1, Math.floor((a.x - x0) / S)));
        if (a.vy > 0 && a.y >= topOf(i) - S) { air.splice(n, 1); push(i, a.c); }
      }
      avalanche(); stepTruck(dt); stepDown(dt, t);
    },
    draw(t) {
      const dtDraw = Math.min(0.05, t - (lastDraw || t)); lastDraw = t;
      ctx.clearRect(0, 0, W, H);
      sky.draw(ctx, t);
      ctx.font = `9px ${MONO}`; ctx.textBaseline = 'middle';
      // Agents, how many, and what a square is worth.
      const ag = feed.agents.slice(0, 12);
      ag.forEach((a, i) => {
        const { x, y } = agentAt(i), on = a.state === 'thinking' || a.state === 'waiting' ? Math.sin(t * 6 + i) > 0 : true;
        const k = kick ? kick(a, t) : 0, up = Math.round(k * 4);
        ctx.fillStyle = shade(a.project || 'other', on ? 1.15 + k * 0.3 : 0.45 + k);
        ctx.fillRect(x, y + (a.kind === 'subagent' ? 2 : 0) - up, 2, (a.kind === 'subagent' ? 5 : 7) + up);
      });
      const n = feed.agents.length;
      ctx.fillStyle = `rgba(232, 232, 232, ${feed.stale ? .45 : .75})`; ctx.textAlign = 'right';
      ctx.fillText(feed.stale ? 'not live' : `${n} agent${n === 1 ? '' : 's'}`, W - 6 - Math.max(1, ag.length) * 4 - 2, 9);
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(232, 232, 232, .6)'; ctx.fillRect(4, 8, S - 1, S - 1);
      ctx.fillStyle = 'rgba(232, 232, 232, .45)'; ctx.fillText(`= ${short(ch.U || ch.base)} ${countedWhat()}`, 9, 9);
      // Pile, squares in the air, the truck.
      for (let i = 0; i < cols; i++) stack[i].forEach((c, k) => sq(colX(i), ground - (k + 1) * S, c));
      for (const a of air) sq(a.x, a.y, a.c);
      drawTruck(t);
      // Ground, and the hole between two hazard posts.
      ctx.fillStyle = 'rgba(232, 232, 232, .22)';
      ctx.fillRect(0, ground, hole - HOLE - 2, 1); ctx.fillRect(hole + HOLE + 2, ground, W, 1);
      for (const px of [hole - HOLE - 2, hole + HOLE]) for (let k = 0; k < 3; k++) { ctx.fillStyle = k % 2 ? '#202020' : '#e2e2e2'; ctx.fillRect(px, ground - (k + 1) * 2 + 1, 2, 2); }
      // Projects.
      ctx.textAlign = 'left';
      if (layout === 'rows') {
        ctx.fillStyle = 'rgba(232, 232, 232, .2)';
        for (let y = ground + 2; y < rowsY[rowsY.length - 1]; y += S * 2) ctx.fillRect(hole - 1 + (S - 1) / 2 - 0.5, y, 1, S - 1);
        PROJECTS.forEach((p, i) => {
          const y = rowsY[i], lit = (flash[p] || 0) > t;
          ctx.fillStyle = shade(p, lit ? 1.3 : 1); ctx.fillText(SHORT[p], 4, y);
          const r = rate ? rate(p) : 0, lamp = lamps[p] = ((lamps[p] || 0) + dtDraw * (2 + 22 * Math.max(0, Math.log10(Math.max(1, r)) - 2) / 4)) % 10;
          for (let x = barStart, k = 0; x < barEnd(p); x += S, k++) {
            ctx.fillStyle = shade(p, r >= 1 && Math.abs(k % 10 - lamp) < 1 ? 1.45 : 0.9); ctx.fillRect(x, y - 1, S - 1, S - 1);
          }
          ctx.textAlign = 'right'; ctx.fillStyle = lit ? '#ffffff' : 'rgba(232, 232, 232, .85)';
          ctx.fillText(short(ch.count(p)), W - 4, y);
          if (rate) { ctx.fillStyle = r >= 1 ? shade(p, 1.2) : 'rgba(232, 232, 232, .3)'; ctx.fillText(r >= 1 ? short(r) + '/s' : '–', W - 40, y); }
          ctx.textAlign = 'left';
        });
      } else {
        const xs = PROJECTS.map((_, i) => cell(i).x);
        ctx.fillStyle = 'rgba(232, 232, 232, .2)';
        for (let x = Math.min(hole, ...xs); x < Math.max(hole, ...xs); x += S * 2) ctx.fillRect(x, RAIL + 1, S - 1, 1);
        for (let y = ground + 2; y < RAIL; y += 2) ctx.fillRect(hole - 1, y, 1, 1);
        PROJECTS.forEach((p, i) => {
          const { x, y } = cell(i), lit = (flash[p] || 0) > t;
          ctx.fillStyle = shade(p, lit ? 1.4 : 1); ctx.fillRect(x - 1, y - 3, 5, 5);
          ctx.fillStyle = shade(p, lit ? 1.3 : 1); ctx.fillText(SHORT[p], x + 8, y);
          ctx.fillStyle = lit ? '#ffffff' : 'rgba(232, 232, 232, .85)';
          ctx.fillText(short(ch.count(p)), x + 8 + ctx.measureText(SHORT[p] + ' ').width, y);
        });
      }
      for (const g of down) if (g.y > ground - 8) sq(g.x, g.y, g.c);
    },
  };
}

// ---- Running them ----------------------------------------------------------------------------------------------
// size() is in CSS px, for the projects there are now.
export const HAUL = {
  haul: { W: 320, H: 120, ground: 62, hole: 70, layout: 'rows' },
  pocket: { W: 240, H: 96, ground: 56, hole: 30, layout: 'cells', across: 2 },
  strip: { W: 380, H: 66, ground: 42, hole: 30, layout: 'cells', across: 4 },
};
const n = () => PROJECTS.length;
export const MACHINES = {
  haul: { make: el => haul(el, HAUL.haul), size: () => [320, haulH(HAUL.haul)], name: 'Trucks, with project lines', trucks: true,
    note: 'The site in small: agents throw squares on the pile, the truck tips them down the hole, each runs along its project\u2019s line.' },
  pocket: { make: el => haul(el, HAUL.pocket), size: () => [240, haulH(HAUL.pocket)], name: 'Trucks, pocket', trucks: true,
    note: 'A shorter field; out of the hole the squares run along a rail to a two-by-two legend.' },
  strip: { make: el => haul(el, HAUL.strip), size: () => [380, haulH(HAUL.strip)], name: 'Trucks, strip', trucks: true,
    note: 'One row: the field over a single line of projects, for the top or bottom edge of the screen.' },
  gantry: { make: gantry, size: () => [3 * (28 + 18 * n()), 120], name: 'Gantry crane', note: 'Crates of 250K drop into a bay; the crane lifts them onto each project’s stack, which sinks into the ground when full.' },
  city: { make: towerCity, size: () => [3 * (20 + 17 * n()), 150], name: 'Tower crane city', note: 'A tower crane builds a tower per project from 100K bricks; the city zooms out when one reaches the top.' },
  belt: { make: belt, size: () => [3 * (64 + 16 * n()), 48], name: 'Sorting belt', note: 'One line: agents drop 100K grains on a belt that flicks them into their project’s bin.' },
  silos: { make: silos, size: () => [2 * 16 * n(), 104], name: 'Silos', note: 'A hopper pours 20K grains of sand into each project’s silo; full silos drain.' },
};
// Runs the machines in `slots` ([element, key] pairs) plus any `extra` objects with step(dt, t) and draw(t).
// When the projects change, each machine is built again for them, and then `onChange` is called. When they only
// change places (a project passes another), the trucks carry on; the others are built again.
let polling = false;
export function run(slots, extra = [], onChange = () => {}) {
  const build = ([el, key]) => {
    el.replaceChildren();
    const from = feed.channels.length, m = MACHINES[key].make(el);
    m.channels = feed.channels.slice(from);
    return m;
  };
  let built = slots.map(build);
  projectListeners.push(moved => {
    built = built.map((m, i) => {
      if (moved && m.reorders) return m;
      for (const c of m.channels) feed.channels.splice(feed.channels.indexOf(c), 1);
      return build(slots[i]);
    });
    onChange();
  });
  let last = 0;
  const frame = now => {
    const dt = Math.min(0.05, (now - (last || now)) / 1000), t = now / 1000; last = now;
    for (const c of feed.channels) while (c.queue.length && c.queue[0].at <= now) c.arrive(c.queue.shift().p);
    for (const m of [...built, ...extra]) { m.step(dt, t); m.draw(t); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // Where a stream may push (the app, or a relay the page can open one on), the first poll waits for it a moment.
  if (!polling) { polling = true; stream(); setTimeout(poll, window.webkit?.messageHandlers?.hub || (window.EventSource && /^https?:/.test(RELAY)) ? 2500 : 0); }
}
