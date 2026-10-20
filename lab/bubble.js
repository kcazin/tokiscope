// The bubble: a small floating bubble that shows one live thing and opens, on click, into a card or one of the lab's
// layouts. Everything is anchored to the bottom right and laid out at its full size, the opened view just invisible,
// so nothing moves or resizes as it shows. In the app (?app=1) the window is told that full size once, and where the
// visible parts are, so it can let clicks through everywhere else; it passes hover in, and hears today at a glance
// every second for its menu.
import { run, feed, channel, MACHINES, PROJECTS, NAMES, SHORT, RGB, SHADES, shade, short, MONO, countedWhat } from './lab.js';
import { flow, onTurn, shownAgents, shownWhat, shownTotal, hd, font, fit, status, STATUS_W, spark, wheels, traces, typist, tachometer, levels, fmt, lg, kickOf, lead, rgba, INK, DIM, FAINT, demo } from './flow.js';
import { t as say, tn as sayN, JA_FONTS } from './i18n.js';

const D = 56;                                                     // the bubble's diameter, CSS px
const rgb = (p, a = 1) => `rgba(${RGB[p]}, ${a})`;
function disc(el) {
  const c = document.createElement('canvas'), dpr = Math.min(4, devicePixelRatio || 1);
  c.width = c.height = D * dpr; c.style.width = c.style.height = D + 'px';
  el.append(c);
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
  return ctx;
}
const STATES = { writing: 'writing', edit: 'writing', thinking: 'thinking', run: 'running', read: 'reading', tool: 'using tools', delegate: 'delegating', waiting: 'waiting on me' };
const busiest = () => PROJECTS.reduce((m, p) => (feed.today[p] || 0) > (feed.today[m] || 0) ? p : m, PROJECTS[0]);

// ---- What the bubble can show -----------------------------------------------------------------------------------
// Each draws into the disc every frame and reacts to tokens arriving (units of 50K).
const STYLES = {
  // Agents: a dot per agent circling the count, in its project's colour; subagents on an inner ring. Each 50K
  // tokens flies from one of its project's agents into the middle.
  orb: { name: say('Agents orb'), note: say('How many agents are working, circling in their projects’ colours.'), make(ctx) {
    let spin = 0; const sparks = [];
    const pos = (i, n, r) => { const a = spin + i / Math.max(1, n) * 6.283; return [D / 2 + Math.cos(a) * r, D / 2 + Math.sin(a) * r]; };
    return {
      arrive(p) {
        const main = feed.agents.filter(a => a.kind !== 'subagent'), i = main.findIndex(a => a.project === p);
        const [x, y] = i < 0 ? [D / 2, 2] : pos(i, main.length, 20);
        sparks.push({ x, y, p, life: 0 });
      },
      draw(dt, t) {
        spin += dt * 0.5;
        const main = feed.agents.filter(a => a.kind !== 'subagent'), sub = feed.agents.filter(a => a.kind === 'subagent');
        for (const [list, r, size] of [[main, 20, 2.4], [sub, 13, 1.5]]) list.forEach((a, i) => {
          const [x, y] = pos(i, list.length, r), on = a.state === 'thinking' || a.state === 'waiting' ? Math.sin(t * 5 + i) > 0 : true;
          ctx.fillStyle = shade(a.project || 'other', on ? 1.1 : 0.45); ctx.beginPath(); ctx.arc(x, y, size, 0, 6.283); ctx.fill();
        });
        for (const s of sparks) {
          s.life += dt / 0.6; const f = Math.min(1, s.life);
          ctx.fillStyle = rgb(s.p, 1 - f * 0.6); ctx.fillRect(s.x + (D / 2 - s.x) * f - 1, s.y + (D / 2 - s.y) * f - 1, 2, 2);
        }
        sparks.splice(0, sparks.length, ...sparks.filter(s => s.life < 1));
        ctx.fillStyle = '#e8e8e8'; ctx.font = `15px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(feed.agents.length), D / 2, D / 2 + 1);
      },
    };
  } },
  // Today: a ring split by project, the day's total in the middle; a project's arc brightens as its tokens arrive.
  ring: { name: say('Today ring'), note: say('Today’s tokens, split by project round a ring.'), make(ctx) {
    const lit = {};
    return {
      arrive(p, t) { lit[p] = t; },
      draw(dt, t) {
        const total = PROJECTS.reduce((n, p) => n + (feed.today[p] || 0), 0);
        let a = -Math.PI / 2;
        for (const p of PROJECTS) {
          const share = total ? (feed.today[p] || 0) / total : 0;
          if (share < 0.004) continue;
          const span = share * 6.283, glow = Math.max(0, 1 - (t - (lit[p] ?? -9)) / 0.6);
          ctx.strokeStyle = shade(p, 0.85 + glow * 0.5); ctx.lineWidth = 5 + glow * 1.5;
          ctx.beginPath(); ctx.arc(D / 2, D / 2, 21, a + 0.05, a + Math.max(0.06, span - 0.05)); ctx.stroke();
          a += span;
        }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#e8e8e8'; ctx.font = `11px ${MONO}`; ctx.fillText(short(total), D / 2, D / 2 - 2);
        ctx.fillStyle = 'rgba(232, 232, 232, .5)'; ctx.font = `7px ${MONO}`; ctx.fillText(say('today'), D / 2, D / 2 + 8);
      },
    };
  } },
  // Squares: a little pile in a glass ball. Squares drop in as tokens arrive and slip out through the bottom once
  // the ball is half full, on their way to the projects. The agent count sits at the top.
  globe: { name: say('Squares globe'), note: say('The site’s pile in a ball: squares drop in and slip out of the bottom.'), make(ctx) {
    const S = 3, cols = Math.floor(D / S), hgt = new Array(cols).fill(0), stack = hgt.map(() => []), fall = [], out = [];
    const floor = c => { const x = (c + 0.5) * S - D / 2; return D / 2 + Math.sqrt(Math.max(0, 26 * 26 - x * x)) - 2; };
    let drain = 0;
    return {
      arrive(p) { fall.push({ x: D / 2 - 9 + Math.random() * 18, y: 10, vy: 0, c: { p, k: SHADES[Math.random() * 3 | 0] } }); },
      draw(dt, t) {
        for (let i = fall.length - 1; i >= 0; i--) {
          const f = fall[i], c = Math.max(0, Math.min(cols - 1, Math.floor(f.x / S)));
          f.vy += 300 * dt; f.y += f.vy * dt;
          if (f.y >= floor(c) - (hgt[c] + 1) * S) { fall.splice(i, 1); stack[c].push(f.c); hgt[c]++; }
        }
        for (let pass = 0; pass < 2; pass++) for (let c = 0; c < cols; c++)
          for (const n of [c - 1, c + 1]) if (n >= 0 && n < cols && floor(n) - hgt[n] * S > floor(c) - hgt[c] * S + S * 1.5 && hgt[c]) { stack[n].push(stack[c].pop()); hgt[c]--; hgt[n]++; }
        // Half full: the squares at the bottom middle slip out, one at a time.
        const n = hgt.reduce((a, b) => a + b, 0), mid = cols >> 1;
        if (n > 70 && (drain += dt) > 0.08 && hgt[mid]) {
          drain = 0; const c = stack[mid].shift(); hgt[mid]--; out.push({ y: floor(mid), c, vy: 30 });
        }
        for (let c = 0; c < cols; c++) stack[c].forEach((q, k) => { ctx.fillStyle = shade(q.p, q.k); ctx.fillRect(c * S, floor(c) - (k + 1) * S, S - 1, S - 1); });
        for (const f of fall) { ctx.fillStyle = shade(f.c.p, f.c.k); ctx.fillRect(Math.round(f.x), Math.round(f.y), S - 1, S - 1); }
        for (const o of out) { o.vy += 300 * dt; o.y += o.vy * dt; ctx.fillStyle = shade(o.c.p, o.c.k); ctx.fillRect(mid * S, o.y, S - 1, S - 1); }
        out.splice(0, out.length, ...out.filter(o => o.y < D));
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `9px ${MONO}`; ctx.fillStyle = 'rgba(232, 232, 232, .8)';
        ctx.fillText(String(feed.agents.length), D / 2, 9);
      },
    };
  } },
  // Rate: tokens a second, with the last ten minutes as a line, and a ring that beats as new tokens come in (at most
  // every 2.5 s, so a live stream doesn't make it flicker).
  pulse: { name: say('Token rate'), note: say('Tokens a second now, the last ten minutes as a line; it beats as new tokens come in.'), make(ctx) {
    let seen = 0, beat = -9;
    return {
      arrive() {},
      draw(dt, t) {
        if (feed.beat !== seen && t - beat > 2.5) { seen = feed.beat; beat = t; }
        const h = feed.history, max = Math.max(1, ...h), p = busiest();
        if (h.length > 1) {
          ctx.beginPath();
          h.forEach((v, i) => { const x = 8 + i / (h.length - 1) * (D - 16), y = 40 - v / max * 12; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
          ctx.strokeStyle = shade(p, 1); ctx.lineWidth = 1.25; ctx.stroke();
          ctx.lineTo(D - 8, 41); ctx.lineTo(8, 41); ctx.fillStyle = rgb(p, 0.18); ctx.fill();
        }
        const k = Math.min(1, (t - beat) / 1.2);
        if (k < 1) { ctx.strokeStyle = rgb(p, 0.5 * (1 - k)); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(D / 2, D / 2, 12 + k * 14, 0, 6.283); ctx.stroke(); }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#e8e8e8'; ctx.font = `11px ${MONO}`; ctx.fillText(short(feed.rate), D / 2, 19);
        ctx.fillStyle = 'rgba(232, 232, 232, .5)'; ctx.font = `7px ${MONO}`; ctx.fillText(say('tokens/s'), D / 2, 29);
      },
    };
  } },

  // ---- Speed: the tokens as they stream (flow.js), each turn handed out over the time since the agent's last ----
  tach: { name: say('Tachometer'), note: say('Tokens a second in an arc split by project; vanes spin with it, every turn sends out a ripple.'), make(ctx) {
    const m = tachometer(ctx, D, { ball: false });
    return { arrive() {}, draw(dt, t) { m.step(dt); m.draw(t); } };
  } },
  // Today's thousands on four wheels: the low ones spin at the rate, the high ones step along.
  odo: { name: say('Odometer'), note: say('Today’s tokens on wheels, in thousands, rolling as fast as they come; the rate under them.'), make(ctx) {
    return { arrive() {}, draw() {
      font(7, ctx, 'center'); ctx.fillStyle = DIM; ctx.fillText(fit(ctx, say(flow.when === 'today' ? '{n} today' : '{n} since', { n: short(flow.shown) }), 40), D / 2, 13);
      wheels(ctx, flow.shown, { x: 9, y: 19, n: 4, dw: 9, dh: 16, size: 10, lo: 3, rate: flow.spin, col: rgba(lead()), sep: 0 });
      font(7, ctx); ctx.fillStyle = DIM; ctx.fillText('K', 46.5, 28);
      font(8, ctx, 'center'); ctx.fillStyle = INK; ctx.fillText(say('{n}/s', { n: fmt(flow.rate) }), D / 2, 44);
    } };
  } },
  // A trace per agent across the ball, trembling while its tokens flow and kicking as a turn lands.
  quake: { name: say('Seismograph'), note: say('A trace per agent across the ball: it trembles while its tokens flow and kicks as a turn lands.'), make(ctx) {
    const tr = traces(46, 14, ctx.canvas);
    return { arrive() {}, draw(dt) {
      tr.step(dt);
      const list = shownAgents(4), lh = Math.min(10, 28 / Math.max(1, list.length)), y0 = 32 - lh * (list.length - 1) / 2;
      ctx.save(); ctx.beginPath(); ctx.arc(D / 2, D / 2, D / 2 - 1, 0, 7); ctx.clip();
      if (!list.length) { ctx.fillStyle = FAINT; ctx.fillRect(5, 32, 46, 1); }
      list.forEach((g, i) => {
        const pen = tr.stroke(ctx, g, 5, 50, y0 + i * lh, lh * 0.9, 1);
        if (pen) { ctx.fillStyle = shade(g.project, 1.4); ctx.fillRect(pen[0] - 1, pen[1] - 1, 2, 2); }
      });
      ctx.restore();
      font(8, ctx, 'center'); ctx.fillStyle = INK; ctx.fillText(fmt(flow.rate), D / 2, 11);
    } };
  } },
  // The output typed down the ball, a letter a token in each agent's colour; what they read falls through as dust.
  rain: { name: say('Token rain'), note: say('The output typed down the ball, a letter a token in each agent’s colour; what they read falls as dust.'), make(ctx) {
    const ty = typist(9, 7, { cap: 120, dustN: 4000, fade: 1.6 });
    return { arrive() {}, draw(dt) {
      ty.step(dt);
      ctx.save(); ctx.beginPath(); ctx.arc(D / 2, D / 2, D / 2 - 1, 0, 7); ctx.clip();
      ty.draw(ctx, 1, 0, 6, 8, 7);
      ctx.restore();
      ctx.fillStyle = 'rgba(11, 11, 11, .85)'; ctx.beginPath(); ctx.roundRect(14, 40, 28, 11, 5.5); ctx.fill();
      font(7, ctx, 'center'); ctx.fillStyle = INK; ctx.fillText(say('{n}/s', { n: Math.round(flow.out) }), D / 2, 45.5);
    } };
  } },
  // One line through the ball that blips as each turn lands, as high as the turn is big, in its project's colour;
  // turns a minute over it.
  ecg: { name: say('Heartbeat'), note: say('One line that blips as each turn lands, as high as it is big, in its project’s colour; turns a minute over it.'), make(ctx) {
    const N = 48, cols = [], blips = [], BEAT = [0.12, -0.18, 1, -0.55, 0.22, 0.08];
    let acc = 0, beat = [];
    onTurn(e => blips.push({ k: kickOf(e.n), p: e.p }), ctx.canvas);
    return { arrive() {}, draw(dt) {
      for (acc += dt * 16; acc >= 1; acc--) {
        if (!beat.length && blips.length) { const b = blips.shift(); beat = BEAT.map(v => ({ y: v * b.k, p: b.p })); }
        cols.push(beat.shift() || { y: (Math.random() * 2 - 1) * 0.05 * lg(flow.rate, 2, 6), p: null });
        if (cols.length > N) cols.shift();
      }
      const y0 = 32, amp = 13, x0 = 4 + N - cols.length, y = c => y0 - c.y * amp;
      ctx.lineWidth = 1.3; ctx.lineJoin = ctx.lineCap = 'round';
      for (let j = 1; j < cols.length; j++) {
        const p = cols[j].p || cols[j - 1].p;
        ctx.strokeStyle = p ? shade(p, 1.1) : `rgba(232, 232, 232, ${0.12 + 0.4 * j / N})`;
        ctx.beginPath(); ctx.moveTo(x0 + j - 1, y(cols[j - 1])); ctx.lineTo(x0 + j, y(cols[j])); ctx.stroke();
      }
      if (cols.length) { ctx.fillStyle = INK; ctx.fillRect(x0 + cols.length - 2, y(cols[cols.length - 1]) - 1, 2, 2); }
      font(10, ctx, 'center'); ctx.fillStyle = INK; ctx.fillText(String(flow.turns.length), D / 2, 12);
      font(6, ctx, 'center'); ctx.fillStyle = DIM; ctx.fillText(say('turns/min'), D / 2, 47);
    } };
  } },
};
export const BUBBLES = STYLES;

// ---- The cards --------------------------------------------------------------------------------------------
// Each fills the card's element; one that draws every frame returns its step(dt, t) and draw(t).
function card(el) {
  const ago = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? say('{n}s ago', { n: s }) : s < 5400 ? say('{n} min ago', { n: Math.round(s / 60) }) : say('{n} h ago', { n: Math.round(s / 3600) }); };
  const render = () => {
    const by = {};
    for (const a of feed.agents) { const s = STATES[a.state] || 'working'; by[s] = (by[s] || 0) + 1; }
    const states = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([s, n]) => say('{n} {state}', { n, state: say(s) })).join(' · ');
    const total = PROJECTS.reduce((n, p) => n + (feed.today[p] || 0), 0), max = Math.max(1, ...PROJECTS.map(p => feed.today[p] || 0));
    const subs = feed.agents.filter(a => a.kind === 'subagent').length;
    el.innerHTML = `<p class="hd"><b>${feed.stale ? say('Not live') : sayN(feed.agents.length, '{n} agent', '{n} agents')}</b>${subs ? ` <span>${say('{n} of them subagents', { n: subs })}</span>` : ''}</p>
      <p class="st">${states || say('all quiet')}</p>
      <p class="rt">${say('{rate} tokens/s · {total} today', { rate: `<b>${short(feed.rate)}</b>`, total: `<b>${short(total)}</b>` })}</p>
      <ul>${PROJECTS.map(p => `<li><i style="background:${rgb(p)}"></i><span>${NAMES[p]}</span><em>${short(feed.today[p] || 0)}</em>
        <s style="width:${(feed.today[p] || 0) / max * 100}%;background:${rgb(p, 0.55)}"></s></li>`).join('')}</ul>
      <p class="ft">${!feed.updated ? say('Connecting…') : `${feed.stale ? say('Not live') + ' · ' : feed.live ? say('Live') + ' · ' : ''}${ago(Date.now() - feed.updated)}`}</p>`;
  };
  render(); setInterval(render, 1000);
}
// Speed: the rate large, output and turns, the last minute with a tick for each turn, and a level meter per project.
function speedCard(el) {
  const W = 228, lv = levels();
  let ctx, H = 0;
  return {
    step: lv.step,
    draw(t) {
      if (118 + 16 * PROJECTS.length !== H) { H = 118 + 16 * PROJECTS.length; ctx = hd(el, W, H); }
      ctx.clearRect(0, 0, W, H);
      font(24, ctx); ctx.fillStyle = INK; ctx.fillText(fmt(flow.rate), 0, 13);
      const rw = ctx.measureText(fmt(flow.rate)).width;
      font(11, ctx); ctx.fillStyle = DIM; ctx.fillText(fit(ctx, say('{what} a second', { what: shownWhat() }), W - STATUS_W - rw - 7), rw + 7, 16);
      status(ctx, W, 5, t);
      font(10, ctx); ctx.fillStyle = '#bdbdbd';
      ctx.fillText(fit(ctx, `${flow.kinds.includes('out') ? say('{n} output', { n: Math.round(flow.out) }) + ' · ' : ''}${say('{n} turns a minute', { n: flow.turns.length })}`, W), 0, 36);
      spark(ctx, 0, 48, W, 34);
      const T = performance.now();
      for (const e of flow.turns) { ctx.fillStyle = rgb(e.p, 0.9); ctx.fillRect(W - (T - e.at) / 60000 * W - 1, 86, 2, 4); }
      font(8, ctx); ctx.fillStyle = '#7a7a7a'; ctx.fillText(say('a minute ago'), 0, 97);
      font(8, ctx, 'right'); ctx.fillText(say('a tick a turn · now'), W, 97);
      PROJECTS.forEach((p, i) => {
        const y = 113 + i * 16, r = flow.of[p] || 0;
        ctx.fillStyle = rgb(p); ctx.fillRect(0, y - 3.5, 7, 7);
        font(10, ctx); ctx.fillStyle = '#d4d4d4'; ctx.fillText(fit(ctx, SHORT[p] || p, 63), 13, y);
        lv.draw(ctx, p, 80, y - 4, 18, 5, 8);
        font(10, ctx, 'right'); ctx.fillStyle = r >= 1 ? INK : DIM; ctx.fillText(r >= 1 ? fmt(r) : '–', W, y);
      });
      font(10, ctx); ctx.fillStyle = '#7a7a7a'; ctx.fillText(shownTotal(short(flow.total)), 0, H - 5);
    },
  };
}
// Agents, live: a row per agent with its rate, a trace that trembles while its tokens flow and kicks as a turn
// lands, what it is doing, and its last turn.
function agentsCard(el) {
  const W = 228, ROW = 42, tr = traces(W, 22, el);
  let ctx, H = 0;
  const ago = ms => { const s = Math.round(ms / 1000); return s < 60 ? say('{n}s ago', { n: s }) : say('{n} min ago', { n: Math.round(s / 60) }); };
  return {
    step: tr.step,
    draw(t) {
      const list = shownAgents(5), want = 30 + Math.max(1, list.length) * ROW + 10;
      if (want !== H) { H = want; ctx = hd(el, W, H); }
      ctx.clearRect(0, 0, W, H);
      const head = feed.stale ? say('Not live') : sayN(feed.agents.length, '{n} agent', '{n} agents');
      font(13, ctx, 'left', `"Schibsted Grotesk", system-ui, ${JA_FONTS}, sans-serif`); ctx.fillStyle = INK; ctx.fillText(head, 0, 8);
      const hw = ctx.measureText(head).width;
      font(11, ctx); ctx.fillStyle = DIM; ctx.fillText(fit(ctx, say('· {rate} {what}/s', { rate: fmt(flow.rate), what: shownWhat() }), W - STATUS_W - hw - 6), hw + 6, 9);
      status(ctx, W, 8, t);
      if (!list.length) { font(10, ctx); ctx.fillStyle = DIM; ctx.fillText(say('all quiet'), 0, 30 + ROW / 2); }
      const T = performance.now();
      list.forEach((g, i) => {
        const y = 32 + i * ROW;
        ctx.fillStyle = rgb(g.project, g.on ? 1 : 0.5); ctx.fillRect(0, y - 3.5, 7, 7);
        // The right-hand figures first, then the names in what room they leave.
        font(10, ctx, 'right'); ctx.fillStyle = g.rate >= 1 ? INK : DIM;
        const rate = g.rate >= 1 ? say('{n}/s', { n: fmt(g.rate) }) : '–', rw = ctx.measureText(rate).width;
        ctx.fillText(rate, W, y);
        font(11, ctx); ctx.fillStyle = g.on ? INK : DIM; ctx.fillText(fit(ctx, (g.kind === 'subagent' ? '↳ ' : '') + g.model, W - 13 - rw - 8), 13, y);
        tr.stroke(ctx, g, 0, W, y + 14, 7, 1);
        font(9, ctx, 'right'); ctx.fillStyle = DIM;
        const last = g.lastN ? `${fmt(g.lastN)} · ${ago(T - g.last)}` : '', lw = ctx.measureText(last).width;
        ctx.fillText(last, W, y + 28);
        font(9, ctx); ctx.fillText(fit(ctx, `${NAMES[g.project] || g.project} · ${say(g.on ? STATES[g.state] || 'working' : 'idle')}`, W - lw - 8), 0, y + 28);
      });
    },
  };
}
export const CARDS = {
  classic: { name: say('Agents and today'), note: say('What they’re doing, the rate, and each project’s tokens today.'), make: el => { card(el); } },
  speed: { name: say('Speed'), note: say('The rate large, the last minute with a tick per turn, and a level meter per project.'), make: speedCard },
  agents: { name: say('Agents, live'), note: say('A row per agent: its rate, a trace that kicks as its turns land, what it’s doing, its last turn.'), make: agentsCard },
};

// ---- One bubble -------------------------------------------------------------------------------------------------
// `open`: what it opens into on click, one of the cards (`card:<key>`) or of the lab's layouts (null: nothing, for a
// bubble shown alone); `pin`: 'open' starts it open (for the lab).
export const isCard = k => typeof k === 'string' && k.startsWith('card:') && !!CARDS[k.slice(5)];
export function bubble(root, { style = 'orb', open: what = 'haul', app = false, pin = null }) {
  root.insertAdjacentHTML('beforeend', `<div class="bw"><div class="shell"><div class="art"></div><span class="ball"></span></div></div>`);
  const wrap = root.lastElementChild, artEl = wrap.querySelector('.art');
  const shell = wrap.querySelector('.shell'), ball = wrap.querySelector('.ball');
  const ctx = disc(ball), view = STYLES[style].make(ctx), ch = channel(5e4, 60);
  let hovering = false, open = pin === 'open';
  ch.arrive = p => { view.arrive(p, performance.now() / 1000); ch.delivered(p); shell.classList.remove('flash'); void shell.offsetWidth; shell.classList.add('flash'); };
  // A card opens in a box of its own; a layout fills the field.
  let cv = null, layout = null;
  if (isCard(what)) { artEl.innerHTML = '<div class="card"></div>'; cv = CARDS[what.slice(5)].make(artEl.firstElementChild); }
  else if (what && MACHINES[what]) layout = what;
  // Until the first stats come in: a ring turns round the ball, and what it opens into says so.
  const wait = document.createElement('div');
  wait.className = 'wait'; wait.textContent = say('Reading your tokens…');
  const born = performance.now();
  // For the app: the full size the window needs (CSS px from the bottom right), and the parts that take the pointer.
  const msg = (name, body) => window.webkit?.messageHandlers?.[name]?.postMessage(body);
  // The window holds the bubble, or the opened field, whichever is bigger.
  let lastFrame = '', aw = 56, ah = 56, top = false, left = false;
  let gone = false;                                  // stopped: it says nothing more to the app
  const frame = () => {
    if (gone) return;
    const a = artEl.getBoundingClientRect();
    aw = a.width; ah = a.height;
    shell.style.setProperty('--aw', aw + 'px'); shell.style.setProperty('--ah', ah + 'px');
    const f = { w: Math.ceil(Math.max(56, aw) + 28), h: Math.ceil(Math.max(56, ah) + 28), aw, ah, top, left };
    if (JSON.stringify(f) !== lastFrame) { lastFrame = JSON.stringify(f); msg('frame', f); }
  };
  // Where the pointer counts: the bubble's full open size while it is open or opening, so the window takes the click
  // to close it; otherwise the ball. Measured from the corner the bubble is pinned to (x and y are the gaps to its two
  // edges), which stays put as the window resizes.
  const rects = () => {
    if (gone) return;
    const s = shell.getBoundingClientRect();
    const box = (x, y, w, h) => ({ x: (left ? x : innerWidth - x - w) - 4, y: (top ? y : innerHeight - y - h) - 4, w: w + 8, h: h + 8 });
    const [w, h] = open ? [aw, ah] : [56, 56];
    msg('rects', { rects: [box(left ? s.left : s.right - w, top ? s.top : s.bottom - h, w, h)], top, left });
  };
  const sized = new ResizeObserver(() => { frame(); rects(); });
  sized.observe(artEl);
  addEventListener('resize', rects);
  const update = () => { shell.classList.toggle('open', open); shell.classList.toggle('hover', hovering); rects(); };
  const api = {
    hover(on) { if (on !== hovering) { hovering = on; update(); } },
    toggle() { open = !open; update(); },
    get isOpen() { return open; },
    // Pin the bubble to a corner; the field then opens away from it (down from the top, right from the left).
    anchor(t, l) { top = t; left = l; wrap.classList.toggle('top', t); wrap.classList.toggle('left', l); rects(); frame(); },
  };
  if (!app) {
    shell.addEventListener('mouseenter', () => api.hover(true));
    shell.addEventListener('mouseleave', () => api.hover(false));
    shell.addEventListener('click', api.toggle);
  }
  const glow = { step() {}, draw(t) {
    ctx.clearRect(0, 0, D, D);
    view.draw(Math.min(0.05, t - (glow.t ?? t)), t); glow.t = t;
    // The ring turns till the machines can move; the field's cover lifts as soon as there are figures to show.
    const loading = !feed.ready;
    shell.classList.toggle('loading', loading);
    if (!feed.updated !== wait.isConnected) { if (!feed.updated) artEl.append(wait); else wait.remove(); }
    if (loading && performance.now() - born > 15000) wait.textContent = say('Waiting for agent-stats…');
  } };
  const stop = run(layout ? [[artEl, layout]] : [], cv ? [glow, cv] : [glow]);
  demo();
  update();
  frame();
  // For the app's menu: today at a glance, every second.
  const ticking = app ? setInterval(() => msg('today', today()), 1000) : 0;
  // Stops it, for a bubble (or a preview) that was replaced: taken out of the page, it would otherwise tell the app
  // it's 0 px wide.
  api.stop = () => {
    gone = true; sized.disconnect(); removeEventListener('resize', rects);
    stop(); clearInterval(ticking); feed.channels.splice(feed.channels.indexOf(ch), 1); wrap.remove();
  };
  return api;
}

// Today at a glance: the tokens that count, the rate now, the agents, and the projects (biggest first, five at most).
export function today() {
  const total = PROJECTS.reduce((n, p) => n + (feed.today[p] || 0), 0);
  const working = feed.agents.filter(a => a.state && a.state !== 'waiting').length;
  return {
    total, what: countedWhat(), rate: flow.rate, agents: feed.agents.length, working, stale: feed.stale, live: feed.live,
    updated: feed.updated, history: flow.history.slice(-60),
    projects: [...PROJECTS].sort((a, b) => (feed.today[b] || 0) - (feed.today[a] || 0)).slice(0, 5)
      .map(p => ({ name: NAMES[p] || p, color: RGB[p] || RGB.other, n: feed.today[p] || 0 })),
  };
}
