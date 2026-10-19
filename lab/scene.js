// The sky behind the trucks: where you are, by its landmarks, under the sky over it right now. The Mac's time zone
// says which country (Asia/Tokyo is Japan: Tokyo Tower, the Skytree, Fuji, Osaka Castle, a Kyoto pagoda, a torii);
// nothing asks where you are. The sun and the moon
// stand where they are in that sky (suncalc's formulas), the moon in its phase; the sky goes through dawn, day, dusk
// and night with them, stars come out, a day's clouds drift by, windows and the landmark light up at night.
// ?scene=<place>|off picks another place or none (Settings does it live through setScene); ?at=<date> and ?speed=<n>
// show another moment, or the day going by n times as fast (for the lab).
const q = new URLSearchParams(location.search);
const AT = Date.parse(q.get('at') || ''), SPEED = +q.get('speed') || 1, T0 = Date.now();
const clock = () => (isNaN(AT) ? T0 : AT) + (Date.now() - T0) * SPEED;

// ---- The sky's clockwork ---------------------------------------------------------------------------------------
const RAD = Math.PI / 180, OBL = RAD * 23.4397;
const days = ms => ms / 864e5 + 2440587.5 - 2451545;
const rasc = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l));
const decl = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l));
function sunAt(d) {
  const M = RAD * (357.5291 + 0.98560028 * d), L = M + RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI;
  return { ra: rasc(L, 0), dec: decl(L, 0), dist: 149598000 };
}
function moonAt(d) {
  const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
  return { ra: rasc(l, b), dec: decl(l, b), dist: 385001 - 20905 * Math.cos(M) };
}
// Seen from (lat, lng): the height over the horizon, and the bearing from due south, west positive.
function seen(c, d, lat, lng) {
  const H = RAD * (280.16 + 360.9856235 * d) + RAD * lng - c.ra, phi = RAD * lat;
  return { alt: Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H)),
    az: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi)) };
}
// The sun's height (degrees) at ms from (lat, lng), for the lab.
export const sunHeight = (ms, lat, lng) => seen(sunAt(days(ms)), days(ms), lat, lng).alt / RAD;
// 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter.
function phaseOf(s, m) {
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(s.dist * Math.sin(phi), m.dist - s.dist * Math.cos(phi));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI;
}
// The hour (with its minutes) in a time zone.
const hourFmt = {};
function hourIn(zone, ms) {
  const f = hourFmt[zone] ??= new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
  const [h, m] = f.format(ms).split(':').map(Number);
  return h + m / 60;
}
// When it is hh:mm on the given day in a time zone (the lab's moments).
export function zoneTime(zone, y, mo, d, hh, mm = 0) {
  const guess = Date.UTC(y, mo, d, hh, mm), f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  const p = Object.fromEntries(f.formatToParts(guess).map(x => [x.type, +x.value]));
  return guess - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess);
}

// ---- Colour --------------------------------------------------------------------------------------------------------
const hexes = new Map();
const hex = h => { let c = hexes.get(h); if (!c) hexes.set(h, c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))); return c; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => a >= 1 ? `rgb(${c.map(Math.round)})` : `rgba(${c.map(Math.round)},${Math.max(0, a).toFixed(3)})`;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (...n) => {
  let h = 2166136261;
  for (const v of n) h = Math.imul(h ^ (v | 0), 16777619);
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
const rng = s => () => { s |= 0; s = s + 0x6d2b79f5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
// The sky by the sun's height (degrees): the colour overhead, and at the horizon. A city's glow keeps the night's
// horizon off black.
const SKY = [[-90, '#03050b', '#0b1020'], [-18, '#04071a', '#10162d'], [-12, '#091031', '#1b2046'], [-8, '#121a46', '#3b315d'],
  [-4, '#212d5c', '#874d5a'], [-1, '#2c406f', '#c46a4b'], [2, '#33517c', '#d38f5d'], [6, '#375a86', '#b3a48c'],
  [12, '#38628e', '#8eaec2'], [90, '#2e5a87', '#7fa4bf']].map(([a, z, h]) => [a, hex(z), hex(h)]);
function skyAt(alt) {
  let i = 1;
  while (i < SKY.length - 1 && SKY[i][0] < alt) i++;
  const [a0, z0, h0] = SKY[i - 1], [a1, z1, h1] = SKY[i], t = Math.max(0, Math.min(1, (alt - a0) / (a1 - a0)));
  return { top: mix(z0, z1, t), hor: mix(h0, h1, t) };
}
const NIGHT = [9, 11, 20];                                   // what a landmark is at night, unlit

// ---- The painter the landmarks draw with ---------------------------------------------------------------------------
// In CSS px, x across and y up from the ground (row 0 is the one standing on it).
function painter(ctx, s) {
  const memo = new Map(), B = s.B;
  const g = {
    ...s,
    at: f => Math.round(f * s.W),
    rect(x, y, w, h, c) { if (c && w > 0 && h > 0) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), B - Math.round(y) - Math.round(h), Math.round(w), Math.round(h)); } },
    px(x, y, c) { g.rect(x, y, 1, 1, c); },
    // A row across x, `hw` either side (always an odd width, about pixel cx), less a gap of `cut` either side of it.
    // `c` a colour, or a function of x.
    row(cx, y, hw, c, cut = 0) {
      cx = Math.round(cx);
      const n = Math.max(0, Math.round(hw - 0.5)), L = cx - n, R = cx + n + 1;
      const m = Math.round(cut - 0.5), cl = cut > 0 ? Math.max(L, cx - m) : R, cr = cut > 0 ? Math.min(R, cx + m + 1) : R;
      if (typeof c === 'function') { for (let x = L; x < R; x++) if (x < cl || x >= cr) g.px(x, y, c(x)); }
      else { g.rect(L, y, cl - L, 1, c); if (cut > 0) g.rect(cr, y, R - cr, 1, c); }
    },
    line(x0, y0, x1, y1, c, every = 1) {
      const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
      for (let i = 0; i <= n; i += every) g.px(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c);
    },
    // A colour as it looks from here now: by day itself, hazed toward the horizon with distance (depth 0 near, 1 far),
    // at night a silhouette; `dark` takes some of its light away (the shaded side).
    c(h, depth = 0, dark = 0) {
      const k = `${h}${depth}${dark}`;
      let v = memo.get(k);
      if (!v) {
        let c = mix(hex(h), NIGHT, s.night * 0.88);
        c = mix(c, s.hor, Math.min(0.9, 0.1 + depth * 0.6 * (0.55 + 0.45 * s.day)));
        memo.set(k, v = css(c.map(x => x * (1 - dark))));
      }
      return v;
    },
    // Floodlit at night (`on` 0 to 1): toward `glow` as it gets dark.
    lit(h, glow, on = 1, depth = 0, dark = 0) {
      const k = `${h}${glow}${on}${depth}${dark}`;
      let v = memo.get(k);
      if (!v) {
        let c = mix(hex(h), NIGHT, s.night * 0.88);
        c = mix(c, s.hor, Math.min(0.9, 0.1 + depth * 0.6 * (0.55 + 0.45 * s.day)));
        c = mix(c, hex(glow), s.night * on * 0.92);
        memo.set(k, v = css(c.map(x => x * (1 - dark))));
      }
      return v;
    },
    // A light that only shows once it is dark (a window), or always (`always`, an aviation light).
    lamp(h, a = 1, always = false) {
      const al = a * (always ? 0.45 + 0.55 * s.night : s.night);
      return al < 0.04 ? null : css(hex(h), al);
    },
    blink: (period, phase = 0, duty = 0.5) => ((s.t / period + phase) % 1 + 1) % 1 < duty,
    beacon(x, y, h = '#ff3b2f', period = 1.6) { if (g.blink(period, x * 0.013)) g.px(x, y, g.lamp(h, 1, true)); },
    // Lit windows at night: few after midnight, most in the evening; a few change every ten minutes.
    window(x, y, seed) {
      if (s.night < 0.05) return;
      const p = s.hour >= 17 || s.hour < 1 ? 0.34 : s.hour < 5 ? 0.1 : 0.22;
      const on = hash(seed, x, y) < p !== hash(seed, x, y, Math.floor(s.ms / 6e5)) < 0.04;
      if (on) g.px(x, y, g.lamp(hash(x, y, seed, 1) < 0.25 ? '#dfe8ff' : '#ffd27a', 0.55 + 0.4 * hash(x, y, 2)));
    },
    // A city, block by block, between x0 and x1, lo to hi tall.
    skyline(seed, x0, x1, lo, hi, depth = 0.5, hues = ['#6f7682', '#5f6774', '#7c818b', '#686c74']) {
      const r = rng(seed);
      for (let x = Math.round(x0); x < x1;) {
        const w = 4 + (r() * 8 | 0), h = Math.max(2, Math.round(lo + (hi - lo) * r() ** 1.4)), col = hues[r() * hues.length | 0];
        g.rect(x, 0, w, h, g.c(col, depth));
        if (r() < 0.18) g.rect(x + (w >> 1), h, 1, 2 + (r() * 3 | 0), g.c(col, depth));
        if (h > 3) for (let wy = 2; wy < h - 1; wy += 2) for (let wx = x + 1; wx < x + w - 1; wx += 2) g.window(wx, wy, seed);
        x += w + (r() < 0.3 ? 1 : 0);
      }
    },
    hill(cx, w, h, col, depth, rough = 0.15) {
      for (let y = 0; y < h; y++) g.row(cx, y, w * Math.pow(1 - y / h, 0.6), x => g.c(col, depth, hash(x, y, 77) < rough ? 0.12 : 0));
    },
  };
  return g;
}

// ---- Landmarks -----------------------------------------------------------------------------------------------------
// Each draws about pixel cx, at most h tall.
function tokyoTower(g, cx, h) {
  const on = g.hour >= 12 ? 1 : 0, top = Math.round(h * 0.79);   // lit from dusk till midnight; the lattice, then the mast
  const hw = y => 0.27 * h * Math.pow(Math.max(0, 1 - y / top), 2.1) + 0.5, legs = h * 0.13;
  const band = y => Math.floor(y / top * 9) % 2 ? '#e8e3d8' : '#d6532a';
  for (let y = 0; y < top; y++) {
    const a = g.lit(band(y), '#ffa040', on), b = g.lit(band(y), '#e07a26', on, 0, 0.22);
    g.row(cx, y, hw(y), x => (x + y) % 3 ? a : b, y < legs ? hw(y) * 0.8 * Math.sqrt(1 - y / legs) : 0);
  }
  const deck = (y, n, more) => {
    for (let k = 0; k < n; k++) g.row(cx, y + k, hw(y) + more, k === 1 ? g.lit('#545b67', '#fff0c4', 1) : g.lit('#e8e3d8', '#ffc070', on));
  };
  deck(Math.round(h * 0.44), 3, 2.2);
  deck(Math.round(h * 0.73), 2, 1.6);
  for (let y = top; y < h; y++) g.row(cx, y, y < top + 3 ? 1.5 : 0.5, g.lit(Math.floor((y - top) / 2) % 2 ? '#e8e3d8' : '#d6532a', '#ff9a40', on));
  g.beacon(cx, h);
}
function fuji(g, cx, h, depth = 0.72) {
  for (let y = 0; y < h; y++) {
    const u = y / h;
    g.row(cx, y, h * 0.1 + h * 1.9 * Math.pow(1 - u, 1.7), x => g.c(u > 0.6 + 0.14 * hash(x >> 1, 5) ? '#eef1f6' : '#56658a', depth));
  }
}
function eiffel(g, cx, h) {
  const top = Math.round(h * 0.93), hw = y => 0.3 * h * Math.pow(Math.max(0, 1 - y / top), 2.7) + 0.5;
  const archH = h * 0.17, archR = hw(0) * 0.66;
  const a = g.lit('#8e6c49', '#f2b24c'), b = g.lit('#8e6c49', '#c98a34', 1, 0, 0.28);
  for (let y = 0; y < top; y++) g.row(cx, y, hw(y), x => (x + y) % 2 ? a : b, y < archH ? archR * Math.sqrt(1 - (y / archH) ** 2) : 0);
  for (const [u, n, more] of [[0.17, 2, 1.6], [0.37, 1, 1.2], [0.82, 2, 1]]) {
    const y = Math.round(h * u);
    for (let k = 0; k < n; k++) g.row(cx, y + k, hw(y) + more, a);
  }
  for (let y = top; y < h; y++) g.px(cx, y, a);
  // Five minutes of sparkle on the hour, from nightfall to one in the morning.
  if (g.night > 0.5 && (g.hour >= 18 || g.hour < 1) && g.hour % 1 < 5 / 60) {
    for (let n = 0; n < 26; n++) {
      const y = Math.random() * top | 0, w = Math.round(hw(y) - 0.5);
      g.px(cx + Math.round((Math.random() * 2 - 1) * w), y, '#fffbea');
    }
  }
  g.beacon(cx, h, '#fff1c4', 2.4);
}
function bigBen(g, cx, h) {
  const w = Math.max(2, Math.round(h * 0.05)), shaft = Math.round(h * 0.58), clock = Math.max(3, Math.round(h * 0.11)), bel = Math.max(2, Math.round(h * 0.07));
  const st = g.lit('#b59c6c', '#e6c47c'), sh = g.lit('#b59c6c', '#c9a660', 1, 0, 0.25);
  for (let y = 0; y < shaft; y++) g.row(cx, y, w + 0.5, x => Math.abs(x - cx) === w ? sh : (x - cx) % 2 ? st : sh);
  for (let y = shaft; y < shaft + clock; y++) g.row(cx, y, w + 1.5, st);
  const r = Math.max(1, Math.round(clock * 0.34)), cy = shaft + (clock >> 1);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r * 0.6) g.px(cx + dx, cy + dy, g.lit('#e9e0c4', '#ffeaa4'));
  g.px(cx, cy, g.c('#3a352c'));
  for (let y = shaft + clock; y < shaft + clock + bel; y++) g.row(cx, y, w + 0.5, x => (x - cx) % 2 ? g.c('#3d3a33') : st);
  const s0 = shaft + clock + bel;
  for (let y = s0; y < h; y++) g.row(cx, y, (w + 1) * (1 - (y - s0) / (h - s0)), g.lit('#6e6a62', '#c4a464'));
  g.px(cx - w - 1, shaft + clock, st); g.px(cx + w + 1, shaft + clock, st);
}
function eye(g, cx, cy, R) {
  const rim = g.lit('#d4d8de', '#7fa8ff'), spoke = g.lit('#9aa2ac', '#4f6fb8', 1, 0.2);
  g.line(cx, cy, cx - R * 0.5, 0, g.c('#c8ccd2', 0.1)); g.line(cx, cy, cx - R * 0.2, 0, g.c('#c8ccd2', 0.1));
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.line(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R, spoke, 2); }
  for (let y = cy - R - 1; y <= cy + R + 1; y++) for (let x = cx - R - 1; x <= cx + R + 1; x++) if (Math.abs(Math.hypot(x - cx, y - cy) - R) < 0.55) g.px(x, y, rim);
  // Its pods go round once in half an hour.
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2 + g.ms / 18e5 * Math.PI * 2;
    g.px(Math.round(cx + Math.cos(a) * (R + 1)), Math.round(cy + Math.sin(a) * (R + 1)), g.lit('#eef0f2', '#d8ecff'));
  }
}
function westminster(g, x0, x1, h) {
  const top = Math.max(3, Math.round(h * 0.18)), st = g.c('#a99269', 0.2);
  g.rect(x0, 0, x1 - x0, top, st);
  for (let x = x0 + 1; x < x1; x += 4) g.rect(x, top, 1, 2, st);
  for (let x = x0 + 2; x < x1 - 1; x += 3) g.window(x, Math.round(top / 2), 11);
  const vt = Math.round(h * 0.4), vw = Math.max(2, Math.round(h * 0.06));
  g.rect(x0, 0, vw * 2 + 1, vt, st);
  g.px(x0, vt, st); g.px(x0 + vw * 2, vt, st);
}
function empireState(g, cx, h) {
  const steps = [[0.2, 0.15], [0.58, 0.1], [0.66, 0.075], [0.72, 0.055], [0.78, 0.035], [0.87, 0.018], [1, 0]];
  const st = g.c('#aaa497'), sd = g.c('#aaa497', 0, 0.2), top = g.lit('#aaa497', '#f6e6ae'), td = g.lit('#aaa497', '#e8c878', 1, 0, 0.15);
  for (let y = 0; y < h; y++) {
    const u = y / h, hw = steps.find(s => u < s[0])[1] * h + 0.5, lit = u >= 0.66;
    g.row(cx, y, hw, x => (x - cx) & 1 ? (lit ? top : st) : (lit ? td : sd));
    if (!lit && y % 2) for (let x = cx - Math.round(hw - 0.5) + 1; x < cx + hw - 1; x += 2) g.window(x, y, 3);
  }
  g.beacon(cx, h);
}
function chrysler(g, cx, h) {
  const st = g.c('#b8bbc1', 0.15), crownY = Math.round(h * 0.58), spire = Math.round(h * 0.82), w0 = h * 0.065;
  for (let y = 0; y < h; y++) {
    const hw = y < crownY ? w0 : y < spire ? w0 * (1 - (y - crownY) / (spire - crownY)) * 0.9 + 0.5 : 0.5;
    g.row(cx, y, hw, x => y >= crownY && y < spire && (y - crownY + Math.abs(x - cx)) % 3 === 0 ? g.lit('#c9ccd2', '#eaf2ff', 1, 0.15) : st);
    if (y < crownY && y % 2) for (let x = cx - Math.round(w0 - 0.5) + 1; x < cx + w0 - 1; x += 2) g.window(x, y, 5);
  }
}
function goldenGate(g, cx, h) {
  const span = Math.round(h * 0.95), side = Math.round(span * 0.55), deck = Math.round(h * 0.27), top = Math.round(h * 0.92);
  const red = g.lit('#bf4527', '#e8683a'), dim = g.lit('#bf4527', '#c85a30', 1, 0, 0.3);
  g.hill(cx - span - side - 6, h * 0.6, Math.round(h * 0.22), '#5a684e', 0.6);
  g.hill(cx + span + side + 4, h * 0.8, Math.round(h * 0.3), '#5a684e', 0.6);
  const cable = x => {
    const tL = cx - span, tR = cx + span;
    if (x >= tL && x <= tR) { const v = (x - cx) / span; return deck + 2 + (top - deck - 3) * v * v; }
    const v = x < tL ? (tL - x) / side : (x - tR) / side;
    return v > 1 ? null : deck + 2 + (top - deck - 3) * (1 - v) ** 1.6;
  };
  for (let x = cx - span - side; x <= cx + span + side; x++) {
    const y = cable(x);
    if (y == null) continue;
    if (x % 3 === 0) for (let k = deck + 2; k < Math.round(y); k++) g.px(x, k, g.c('#bf4527', 0.4, 0.2));
    g.px(x, Math.round(y), red);
  }
  g.rect(cx - span - side, deck, 2 * (span + side) + 1, 2, red);
  for (let x = cx - span - side; x <= cx + span + side; x += 2) g.px(x, deck - 1, dim);
  for (const t of [cx - span, cx + span]) {
    g.rect(t - 2, 0, 2, top, red); g.rect(t + 1, 0, 2, top, red);
    for (const y of [top - 1, top - Math.round(h * 0.18), top - Math.round(h * 0.36), deck + 4]) g.rect(t - 2, y, 5, 1, red);
    g.beacon(t - 1, top, '#ff3b2f', 1.4); g.beacon(t + 2, top, '#ff3b2f', 1.4);
  }
  for (let x = cx - span - side; x <= cx + span + side; x += 4) g.px(x, deck + 2, g.lamp('#ffd27a', 0.9));
}
function shell(g, x0, base, hk, lean, white, shade) {
  const R = hk * 1.8, d = Math.sqrt(R * R - hk * hk);
  for (let y = 0; y < hk; y++) {
    const s = Math.sqrt(R * R - y * y), sh = -lean * y, L = Math.round(x0 + d - s + sh), Rr = Math.round(x0 - d + s + sh);
    for (let x = L; x <= Rr; x++) g.px(x, y + base, x === L || x < (L + Rr) / 2 ? white : shade);
  }
}
function sydney(g, cx, h) {
  const bx = cx - Math.round(h * 0.7), half = Math.round(h * 0.8), deck = Math.round(h * 0.2), arch = Math.round(h * 0.55);
  const steel = g.lit('#7b838d', '#c8d4e8', 0.5, 0.35), stone = g.c('#b5a585', 0.35);
  for (let x = bx - half; x <= bx + half; x++) {
    const v = (x - bx) / half, up = deck + 2 + (arch - deck - 2) * (1 - v * v), low = 1 + (arch - 5) * (1 - v * v);
    for (let y = Math.round(low); y <= Math.round(up); y++) if (y === Math.round(up) || y === Math.round(low) || (x + y) % 3 === 0) g.px(x, y, steel);
    if (x % 3 === 0) for (let y = deck + 2; y < low; y++) g.px(x, y, g.c('#7b838d', 0.5));
    if (x % 3 === 0) g.px(x, Math.round(up) + 1, g.lamp('#f4f0e0', 0.8));
  }
  g.rect(bx - half - 4, deck, 2 * half + 9, 2, steel);
  for (const p of [bx - half, bx + half]) g.rect(p - 2, 0, 5, Math.round(h * 0.36), stone);
  const ox = cx + Math.round(h * 0.2), pod = Math.max(2, Math.round(h * 0.07));
  g.rect(ox - Math.round(h * 0.55), 0, Math.round(h * 1.1), pod, g.c('#b39a76'));
  const white = g.lit('#ece8dc', '#f6eedc', 0.8), shade = g.lit('#c9c3b4', '#d8ccb4', 0.8);
  for (const [dx, k] of [[-0.42, 0.24], [-0.24, 0.34], [-0.04, 0.4], [0.2, 0.22], [0.33, 0.3], [0.46, 0.18]]) shell(g, ox + Math.round(dx * h), pod, Math.round(k * h), 0.55, white, shade);
}
function fernsehturm(g, cx, h) {
  const r = Math.max(3, Math.round(h * 0.075)), cy = Math.round(h * 0.6), top = Math.round(h * 0.8);
  const con = g.lit('#bdbab2', '#d8d0c0', 0.4), steel = g.c('#a9b0ba'), facet = g.c('#a9b0ba', 0, 0.2);
  g.rect(cx - Math.round(h * 0.22), 0, Math.round(h * 0.44) + 1, Math.max(2, Math.round(h * 0.04)), g.c('#8a8780', 0.1));
  for (let y = 0; y < cy - r; y++) g.row(cx, y, h * 0.045 * (1 - y / (cy - r) * 0.45) + 0.5, con);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + r * 0.8) continue;
    g.px(cx + dx, cy + dy, dy === 0 || dy === -1 ? g.lit('#4e5866', '#ffe2a0') : (dx + dy) & 1 ? steel : facet);
  }
  for (let y = cy + r; y < top; y++) g.row(cx, y, y < cy + r + 3 ? 1.5 : 0.5, con);
  for (let y = top; y < h; y++) g.px(cx, y, g.lit(Math.floor((y - top) / 2) % 2 ? '#e8e8e8' : '#d0402e', '#e0473a', 0.6));
  g.beacon(cx, h);
}
function burj(g, cx, h) {
  const tiers = [0.14, 0.27, 0.39, 0.5, 0.6, 0.68, 0.75, 0.8], left = g.sunLeft;
  const lt = g.c('#b7c6d3'), dk = g.c('#b7c6d3', 0, 0.28);
  for (let y = 0; y < h; y++) {
    const u = y / h, k = tiers.findIndex(t => u < t);
    const hw = k < 0 ? 1.2 * (1 - (u - 0.8) / 0.2) : h * 0.085 * (1 - k / tiers.length * 0.82) * (1 - (u - (tiers[k - 1] || 0)) * 0.6) + 0.5;
    g.row(cx, y, hw, x => (x < cx) === left ? lt : dk);
    if (k >= 0) for (let x = cx - Math.round(hw - 0.5); x < cx + hw; x++) if (y % 2) g.window(x, y, 9);
  }
  if (g.blink(1.5, 0, 0.12)) g.px(cx, h, g.lamp('#ffffff', 1, true));
}
function mbs(g, cx, h) {
  const th = Math.round(h * 0.55), tw = Math.max(2, Math.round(h * 0.05)), gap = Math.round(h * 0.3);
  const st = g.c('#c3cad2'), sd = g.c('#c3cad2', 0, 0.22);
  for (const t of [cx - gap, cx, cx + gap]) for (let y = 0; y < th; y++) {
    const split = y < th * 0.6 ? (1 - y / (th * 0.6)) * tw * 0.9 : 0;
    g.row(t, y, tw + 0.5 + split * 0.6, x => x < t ? st : sd, split > 0.6 ? split * 0.6 : 0);
    if (y % 2) for (let x = t - tw + 1; x < t + tw; x += 2) g.window(x, y, 13);
  }
  const x0 = cx - gap - tw - 2, x1 = cx + gap + tw + Math.round(h * 0.2);
  g.rect(x0, th, x1 - x0, 2, g.lit('#d7dde3', '#bfe4ff', 0.7));
  g.rect(x0 + 2, th - 1, x1 - x0 - 8, 1, g.c('#9aa4ae'));
  for (const [dx, k, col] of [[-0.95, 0.28, '#c86bff'], [-0.78, 0.22, '#ff6bd0'], [-0.62, 0.3, '#c86bff']]) {
    const x = cx - gap + Math.round(dx * h), y = Math.round(k * h);
    g.rect(x, 0, 1, y, g.c('#5c6a5a', 0.1));
    for (const [w, dy] of [[1.5, 0], [3.5, 1], [2.5, 2]]) g.row(x, y + dy, w, g.lit('#5c6a5a', col, 1, 0.1));
  }
}
function pearl(g, cx, h) {
  const r1 = Math.max(3, Math.round(h * 0.085)), c1 = Math.round(h * 0.27), r2 = Math.max(2, Math.round(h * 0.055)), c2 = Math.round(h * 0.6);
  const r3 = Math.max(1, Math.round(h * 0.025)), c3 = Math.round(h * 0.82), con = g.c('#bab5ae');
  g.line(cx - r1 * 1.7, 0, cx - 1, c1, con); g.line(cx + r1 * 1.7, 0, cx + 1, c1, con); g.rect(cx, 0, 1, c1, con);
  for (const x of [cx - 2, cx, cx + 2]) g.rect(x, c1, 1, c2 - c1, con);
  g.rect(cx, c2, 1, h - c2, con);
  const ball = (cy, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r * 0.7) {
      g.px(cx + dx, cy + dy, (dx + dy) & 1 ? g.lit('#c4507a', '#ff5aa5') : g.lit('#c4507a', '#e0408a', 1, 0, 0.2));
    }
  };
  ball(c1, r1); ball(c2, r2); ball(c3, r3);
  g.beacon(cx, h);
}
function shanghaiTower(g, cx, h) {
  const gl = g.c('#8fa3b5', 0.2), dk = g.c('#8fa3b5', 0.2, 0.25);
  for (let y = 0; y < h; y++) {
    const u = y / h, hw = h * (0.075 - 0.045 * u) + 0.5, edge = Math.round(Math.sin(u * 6) * (hw - 0.5));
    g.row(cx, y, hw, x => x - cx === edge ? dk : gl);
    if (y % 3 === 1) g.window(cx + edge + 1, y, 17);
  }
}
function namsan(g, cx, h) {
  const hh = Math.round(h * 0.28), pod = Math.round(h * 0.68), top = Math.round(h * 0.8);
  g.hill(cx, h * 0.95, hh, '#40593f', 0.25, 0.25);
  const tw = g.lit('#d7d6d2', '#9fd6ff', 1);
  for (let y = hh; y < pod; y++) g.row(cx, y, y < hh + 3 ? 1.5 : 1, tw);
  for (let y = pod; y < pod + Math.max(3, Math.round(h * 0.07)); y++) g.row(cx, y, Math.max(2.5, h * 0.065) - (y === pod ? 1 : 0), y === pod + 1 ? g.lit('#545b67', '#fff0c4') : tw);
  for (let y = pod + Math.max(3, Math.round(h * 0.07)); y < h; y++) g.px(cx, y, g.lit(y > top && Math.floor(y / 2) % 2 ? '#d0402e' : '#e8e8e8', '#e0473a', 0.5));
  g.beacon(cx, h);
}
function cnTower(g, cx, h, pod = 0.58, podW = 0.085) {
  const p = Math.round(h * pod), ph = Math.max(3, Math.round(h * 0.07)), sky = Math.round(h * (pod + 0.17));
  const con = g.lit('#bcb7ad', '#dcd2ff', 0.5), legs = h * 0.07;
  for (let y = 0; y < p; y++) { const hw = h * 0.055 * Math.pow(1 - y / p, 1.2) + 0.8; g.row(cx, y, hw, con, y < legs ? hw * 0.5 * (1 - y / legs) : 0); }
  for (let y = p; y < p + ph; y++) g.row(cx, y, h * podW + 0.5 - (y === p || y === p + ph - 1 ? 1 : 0), y === p + 1 ? g.lit('#545b67', '#fff0c4') : con);
  for (let y = p + ph; y < sky; y++) g.px(cx, y, con);
  g.row(cx, sky, 1.5, con); g.row(cx, sky + 1, 1.5, con);
  for (let y = sky + 2; y < h; y++) g.px(cx, y, g.c('#9a968e'));
  g.beacon(cx, h);
}
function pyramid(g, cx, h, cap) {
  const lit = g.c('#d2ae72'), sh = g.c('#9e7e4c'), lit2 = g.c('#d2ae72', 0, 0.08), top = g.c('#e6d2a6');
  for (let y = 0; y < h; y++) {
    const hw = h - y, a = y % 2 ? lit : lit2, c = cap && y > h * 0.84 ? top : null;
    if (g.sunLeft) { g.rect(cx - hw, y, hw, 1, c || a); g.rect(cx, y, hw, 1, sh); }
    else { g.rect(cx - hw, y, hw, 1, sh); g.rect(cx, y, hw, 1, c || a); }
  }
}
function palm(g, x, h) {
  const c = g.c('#3f4a2e', 0.1);
  for (let y = 0; y < h; y++) g.px(x + Math.round(Math.sin(y / h * 1.2) * 1.5), y, c);
  const tx = x + Math.round(Math.sin(1.2) * 1.5);
  for (const [dx, dy] of [[-3, -1], [-2, 0], [-1, 0], [1, 0], [2, 0], [3, -1], [-2, 1], [2, 1], [0, 1]]) g.px(tx + dx, h + dy, c);
}
function taj(g, cx, h) {
  const marble = g.lit('#e9e4d9', '#9fb0d8', g.moonlight), sh = g.lit('#cbc4b6', '#8394bc', g.moonlight), dark = g.c('#6d6a66');
  const plinth = Math.max(2, Math.round(h * 0.06)), bw = Math.round(h * 0.34), bh = Math.round(h * 0.25), r = Math.max(3, Math.round(h * 0.14));
  g.rect(cx - Math.round(h * 0.75), 0, Math.round(h * 1.5) + 1, plinth, sh);
  for (let y = plinth; y < plinth + bh; y++) g.row(cx, y, bw + 0.5, x => x - cx > bw * 0.55 || cx - x > bw * 0.55 ? sh : marble);
  const iw = Math.max(1, Math.round(bw * 0.22)), ih = Math.round(bh * 0.78);
  for (let y = plinth; y < plinth + ih; y++) g.row(cx, y, Math.max(0.5, iw * Math.min(1, (plinth + ih - y) / 2.5)), dark);
  for (const s of [-1, 1]) for (const k of [0.62, 0.86]) {
    const ax = cx + s * Math.round(bw * k);
    for (let y = plinth + 1; y < plinth + Math.round(bh * 0.45); y++) g.px(ax, y, dark);
    for (let y = plinth + Math.round(bh * 0.55); y < plinth + bh - 1; y++) g.px(ax, y, dark);
  }
  const d0 = plinth + bh;
  for (let y = d0; y < d0 + Math.round(r * 0.45); y++) g.row(cx, y, r * 0.8, marble);
  const b0 = d0 + Math.round(r * 0.45);
  for (let dy = 0; dy < r * 1.9; dy++) {
    const d = dy - r * 0.8, s2 = r * r * 1.1 - d * d, hw = dy > r * 1.55 ? Math.max(0.5, (r * 1.9 - dy) * 0.8) : s2 > 0 ? Math.sqrt(s2) : 0.5;
    g.row(cx, b0 + dy, hw, x => x > cx + hw * 0.3 ? sh : marble);
  }
  g.rect(cx, b0 + Math.round(r * 1.9), 1, 2, g.c('#c9a85a'));
  for (const s of [-1, 1]) {
    const x = cx + s * Math.round(bw * 0.72);
    g.row(x, d0, 1.5, sh); g.row(x, d0 + 1, 1.5, marble); g.px(x, d0 + 2, marble);
    const mx = cx + s * Math.round(h * 0.68), mh = Math.round(h * 0.5);
    for (let y = plinth; y < plinth + mh; y++) g.row(mx, y, h >= 40 ? 1 : 0.5, (y - plinth) % 6 === 5 ? sh : marble);
    g.row(mx, plinth + mh, 1.5, marble); g.px(mx, plinth + mh + 1, marble);
  }
}
function rio(g, cx, h) {
  const peak = Math.round(h * 0.66), green = '#3d5c46';
  for (let y = 0; y < peak; y++) {
    const k = peak - y, L = Math.round(cx - k * 0.5 - 0.6 * Math.sin(y * 1.3)), R = Math.round(cx + k * 1.15 + 1.2 * Math.sin(y * 0.7));
    for (let x = L; x <= R; x++) g.px(x, y, g.c(y > peak * 0.82 ? '#59645a' : green, 0.15, hash(x, y, 3) < 0.2 ? 0.14 : 0));
  }
  const sH = Math.max(5, Math.round(h * 0.13)), st = g.lit('#e4e2da', '#ffffff');
  g.px(cx, peak, st);
  for (let y = peak + 1; y <= peak + sH; y++) g.px(cx, y, st);
  const arm = peak + Math.round(sH * 0.72), span = Math.max(2, Math.round(sH * 0.45));
  g.rect(cx - span, arm, span * 2 + 1, 1, st);
  if (h >= 40) g.rect(cx, peak + 1, 2, Math.round(sH * 0.5), st);
  const sx = cx + Math.round(h * 0.95), sh = Math.round(h * 0.42), sw = h * 0.19;
  const ux = sx - Math.round(h * 0.38), uh = Math.round(h * 0.17);
  for (let y = 0; y < uh; y++) g.row(ux, y, h * 0.14 * Math.sqrt(1 - (y / uh) ** 2), g.c(green, 0.3));
  for (let y = 0; y < sh; y++) g.row(sx, y, sw * Math.pow(1 - (y / sh) ** 2.6, 0.5), x => g.c(x > sx ? '#4b5a50' : '#5f6c62', 0.3));
  g.line(ux, uh, sx, sh, g.c('#2a2e30', 0.3), 1);
}
function willis(g, cx, h) {
  const bl = g.c('#3a3e46'), band = g.c('#2a2d33');
  const parts = [[0, 0.52, -0.13, 0.13], [0.52, 0.68, -0.13, 0.06], [0.68, 0.8, -0.13, -0.02]];
  for (const [u0, u1, a, b] of parts) for (let y = Math.round(u0 * h); y < Math.round(u1 * h); y++) {
    const L = cx + Math.round(a * h), R = cx + Math.round(b * h);
    g.rect(L, y, R - L + 1, 1, y % 11 === 10 ? band : bl);
    if (y % 2) for (let x = L + 1; x < R; x += 2) g.window(x, y, 21);
  }
  const top = Math.round(0.8 * h);
  for (const [x, t] of [[cx - Math.round(h * 0.11), h], [cx - Math.round(h * 0.06), Math.round(h * 0.96)]]) { g.rect(x, top, 1, t - top, bl); g.beacon(x, t); }
}
function hancock(g, cx, h) {
  const bl = g.c('#30333a', 0.2), x = g.c('#4a4e56', 0.2), top = Math.round(h * 0.85);
  for (let y = 0; y < top; y++) {
    const hw = h * (0.085 - 0.03 * y / top) + 0.5, p = Math.max(6, Math.round(top / 5));
    g.row(cx, y, hw, xx => Math.abs(Math.abs(xx - cx) - (hw - 0.5) * (1 - (y % p) / p * 2)) < 0.6 ? x : bl);
    if (y % 2) g.window(cx + (y * 3 % 5) - 2, y, 23);
  }
  for (const d of [-2, 2]) { g.rect(cx + d, top, 1, h - top - (d > 0 ? 2 : 0), bl); g.beacon(cx + d, h - (d > 0 ? 2 : 0)); }
}
function colosseum(g, cx, h) {
  const hw = Math.round(h * 0.9), th = Math.max(8, Math.round(h * 0.36)), tier = th / 4;
  for (let x = cx - hw; x <= cx + hw; x++) {
    const k = Math.abs(x - cx) / hw, v = (x - cx) / hw;
    // The outer ring stands to the top on the left; on the right only its inner tiers remain, stepping down.
    const top = v < 0.25 ? th : Math.round(th * (0.75 - 0.25 * Math.floor((v - 0.25) / 0.25)) - (hash(x, 1) < 0.3 ? 1 : 0));
    for (let y = 0; y < top; y++) {
      const t = Math.floor(y / tier), yy = y - t * tier, xx = ((x - cx) % 4 + 4) % 4;
      const arch = t < 3 && (xx === 1 || xx === 2) && yy >= 1 && yy < tier - (xx === 1 ? 1.5 : 1) && v > -0.97;
      const win = t === 3 && (x - cx) % 6 === 0 && yy > 1 && yy < tier - 1;
      g.px(x, y, arch || win ? g.lit('#5a4d3c', '#ffad55') : g.c('#c6b08a', 0, k * k * 0.32 + (Math.floor(yy) === 0 ? 0.08 : 0)));
    }
  }
}
function stPeters(g, cx, h, depth = 0.6) {
  const c = g.c('#b9ad96', depth), d = g.c('#9d927d', depth);
  g.rect(cx - Math.round(h * 0.26), 0, Math.round(h * 0.52) + 1, Math.round(h * 0.12), c);
  const y0 = Math.round(h * 0.12), drum = Math.max(2, Math.round(h * 0.08)), r = Math.max(3, Math.round(h * 0.12));
  g.rect(cx - Math.round(h * 0.12), y0, Math.round(h * 0.24) + 1, drum, c);
  for (let dy = 0; dy < r; dy++) g.row(cx, y0 + drum + dy, r * Math.sqrt(1 - (dy / r) ** 2) + 0.5, x => (x - cx) % 3 ? c : d);
  g.rect(cx, y0 + drum + r, 1, 3, c); g.rect(cx - 1, y0 + drum + r + 2, 3, 1, c);
}
function canalHouses(g, x0, x1, h) {
  const r = rng(42), cols = ['#8a4a3a', '#5a3a2e', '#3f3b38', '#7a5c3c', '#6b3a32'];
  for (let x = Math.round(x0); x < x1;) {
    const w = 5 + (r() * 3 | 0), hh = Math.round(h * (0.3 + r() * 0.16)), col = g.c(cols[r() * cols.length | 0]), kind = r() * 3 | 0;
    g.rect(x, 0, w, hh, col);
    if (kind === 0) for (let k = 0, s = 0; s * 2 < w - 1; k += 2, s++) g.rect(x + s, hh + k, w - s * 2, 2, col);
    else if (kind === 1) { g.rect(x + 1, hh, w - 2, 2, col); g.rect(x + 2, hh + 2, w - 4, 1, col); g.px(x + (w >> 1), hh + 3, col); }
    else { g.rect(x + 2, hh, w - 4, 3, col); g.px(x + 1, hh, col); g.px(x + w - 2, hh, col); g.px(x + (w >> 1), hh + 3, col); }
    for (let y = 2; y < hh - 1; y += 3) for (let wx = x + 1; wx < x + w - 1; wx += 2) {
      g.px(wx, y, g.c('#d8d4cc', 0, 0.1)); g.window(wx, y, 31);
    }
    x += w;
  }
}
function windmill(g, cx, h) {
  const th = Math.round(h * 0.42), wood = g.c('#5b4a3c'), frame = g.c('#d8cfc0', 0, 0.05), hub = th + 1;
  g.hill(cx, h * 0.3, Math.max(2, Math.round(h * 0.05)), '#4b5e3c', 0.1, 0);
  for (let y = 0; y < th; y++) g.row(cx, y, h * (0.085 - 0.035 * y / th) + 0.5, wood);
  g.row(cx, th, h * 0.06, g.c('#3c3029')); g.row(cx, th + 1, h * 0.04, g.c('#3c3029'));
  g.window(cx, Math.round(th * 0.4), 37);
  const L = Math.round(h * 0.36), a0 = g.t * 0.5;
  for (let k = 0; k < 4; k++) {
    const a = a0 + k * Math.PI / 2, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    for (let s = 1; s <= L; s++) for (let w = 0; w <= 2; w++) {
      if (s < 3 && w) continue;
      if (w === 0 || s % 2 === 0 || w === 2) g.px(Math.round(cx + ux * s + nx * w), Math.round(hub + uy * s + ny * w), frame);
    }
  }
}

// ---- More landmarks, so each time zone shows a few its people know ---------------------------------------------
function skytree(g, cx, h) {
  const glow = Math.floor(g.ms / 864e5) % 2 ? '#b48cff' : '#8fd4ff';   // lit Miyabi (purple) and Iki (pale blue) by turns
  const a = g.lit('#dfe5ec', glow), b = g.lit('#dfe5ec', glow, 1, 0, 0.25), win = g.lit('#545b67', '#fff0c4');
  const d1 = Math.round(h * 0.55), d2 = Math.round(h * 0.71), top = Math.round(h * 0.74);
  for (let y = 0; y < top; y++) {
    const hw = y < d1 ? h * 0.075 * (1 - y / d1) + h * 0.022 + 0.5 : h * 0.02 + 0.5;
    g.row(cx, y, hw, x => (x + y) % 3 === 0 ? b : a, y < h * 0.05 ? hw * 0.45 : 0);
  }
  for (let k = 0; k < 3; k++) g.row(cx, d1 + k, h * 0.06 + 0.5 - (k === 2 ? 1 : 0), k === 1 ? win : a);
  for (let k = 0; k < 2; k++) g.row(cx, d2 + k, h * 0.042 + 0.5, k === 0 ? win : a);
  for (let y = top; y < h; y++) g.row(cx, y, y < top + 3 ? 1 : 0.5, a);
  g.beacon(cx, h);
}
// A five-storey pagoda, Kyoto's.
function pagoda(g, cx, h) {
  const wood = g.lit('#4b3a30', '#c9844a', 0.6), roof = g.c('#3a3d43'), eave = g.lit('#3a3d43', '#7a5234', 0.5), fin = g.c('#8a7a5a');
  const body = Math.round(h * 0.78), th = body / 5, w0 = h * 0.26;
  for (let i = 0; i < 5; i++) {
    const y0 = Math.round(i * th), y1 = Math.round((i + 1) * th), rw = w0 * (1 - i * 0.11);
    for (let y = y0; y < y1 - 2; y++) g.row(cx, y, rw * 0.52, wood);
    g.row(cx, y1 - 2, rw, eave); g.row(cx, y1 - 1, rw - 1.5, roof);
    const n = Math.round(rw - 0.5); g.px(cx - n, y1 - 1, roof); g.px(cx + n, y1 - 1, roof);
  }
  for (let y = body; y < h; y++) g.px(cx, y, fin);
  for (let y = body + 1; y < h - 1; y += 2) g.row(cx, y, 1.5, fin);
}
function osakaCastle(g, cx, h) {
  const stone = g.c('#8d887e'), seam = g.c('#8d887e', 0, 0.2), wall = g.lit('#e9e7df', '#f2f4ff'), roof = g.lit('#5e9c8a', '#7ab8a6', 0.5);
  const gold = g.lit('#d8b04a', '#ffd76a'), win = g.lit('#3a3a3a', '#ffe6a0');
  const base = Math.round(h * 0.26), bw = h * 0.42;
  for (let y = 0; y < base; y++) g.row(cx, y, bw - y * 0.35, x => (x + y * 2) % 5 === 0 ? seam : stone);
  const tH = (h - base - 2) / 4;
  let w = bw - base * 0.35 - 1;
  for (let i = 0; i < 4; i++) {
    const y0 = base + Math.round(i * tH), y1 = base + Math.round((i + 1) * tH);
    for (let y = y0; y < y1 - 1; y++) g.row(cx, y, w, x => y === y0 + 1 && (x - cx) % 2 === 0 ? win : wall);
    g.row(cx, y1 - 1, w + 1.5, roof);
    w *= 0.74;
  }
  const top = base + Math.round(4 * tH), n = Math.round(w + 0.5);
  g.row(cx, top, w + 1, roof); g.row(cx, top + 1, Math.max(0.5, w - 0.5), roof);
  g.px(cx - n, top + 1, gold); g.px(cx + n, top + 1, gold);
}
function torii(g, cx, h) {
  const red = g.lit('#d4452a', '#ff6a3a', 0.6), black = g.c('#2a2626'), w = Math.max(4, Math.round(h * 0.45)), p = Math.round(w * 0.62);
  g.rect(cx - p, 0, 2, h - 2, red); g.rect(cx + p - 1, 0, 2, h - 2, red);
  g.rect(cx - p - 2, h - Math.max(4, Math.round(h * 0.3)), 2 * p + 5, 1, red);
  g.px(cx, h - 3, red);
  g.rect(cx - w, h - 2, 2 * w + 1, 1, red);
  g.rect(cx - w - 1, h - 1, 2 * w + 3, 1, black);
  g.px(cx - w - 2, h, black); g.px(cx + w + 2, h, black);
}
function lotteTower(g, cx, h) {
  const lt = g.c('#c9d3dd', 0.1), dk = g.c('#c9d3dd', 0.1, 0.22);
  for (let y = 0; y < h; y++) {
    const u = y / h, hw = h * 0.065 * Math.pow(1 - u, 0.85) + 0.5;
    g.row(cx, y, hw, x => u > 0.9 && (x + y) % 2 ? null : x < cx ? lt : dk);
    if (y % 2 && u < 0.88) for (let x = cx - Math.round(hw - 0.5) + 1; x < cx + hw - 1; x += 2) g.window(x, y, 41);
  }
  g.beacon(cx, h);
}
// Namdaemun: a stone gate under two tiers of tiled roof.
function namdaemun(g, cx, h) {
  const stone = g.c('#9a958c'), wood = g.lit('#8a3a2c', '#d8763c', 0.6), band = g.c('#4d7a62'), tile = g.c('#3e4246');
  const sb = Math.round(h * 0.38), ah = Math.round(h * 0.26);
  for (let y = 0; y < sb; y++) g.row(cx, y, h * 0.42, stone, y < ah ? h * 0.1 * Math.sqrt(Math.max(0, 1 - (y / ah) ** 6)) : 0);
  for (let y = sb; y < Math.round(h * 0.6); y++) g.row(cx, y, h * 0.3, y === sb + 1 ? band : wood);
  const roof = (y, hw) => { g.row(cx, y, hw, tile); g.row(cx, y + 1, hw - 1.5, tile); const n = Math.round(hw - 0.5); g.px(cx - n, y + 1, tile); g.px(cx + n, y + 1, tile); };
  roof(Math.round(h * 0.6), h * 0.48);
  for (let y = Math.round(h * 0.6) + 2; y < Math.round(h * 0.8); y++) g.row(cx, y, h * 0.22, wood);
  roof(Math.round(h * 0.8), h * 0.36);
  g.row(cx, Math.round(h * 0.8) + 2, h * 0.26, tile);
}
function templeOfHeaven(g, cx, h) {
  const big = h >= 30, marble = g.c('#dcdad2'), red = g.lit('#a8302a', '#e0603a', 0.6), redD = g.lit('#a8302a', '#c04a2a', 0.6, 0, 0.25);
  const blue = g.lit('#2f5a9a', '#4a7ad0', 0.4), gold = g.c('#d8b04a');
  let y = 0;
  for (const w of [0.55, 0.47, 0.39]) for (let k = 0; k < (big ? 2 : 1); k++) g.row(cx, y++, h * w - k, marble);
  for (let k = 0; k < 3; k++) {
    for (let r = 0; r < (big ? 2 : 1); r++) g.row(cx, y++, h * (0.2 - 0.04 * k), x => (x - cx) % 2 ? red : redD);
    const n = big ? 3 : 2;
    for (let r = 0; r < n; r++) g.row(cx, y++, h * (0.34 - 0.08 * k) * (1 - r / (n + 1)), blue);
  }
  g.px(cx, y, gold); g.px(cx, y + 1, gold);
}
// The Great Wall along a ridge from x0 to x1, its watchtowers on the way.
function greatWall(g, x0, x1, h, depth = 0.45) {
  const hill = g.c('#55634e', depth), wall = g.c('#a89a80', depth * 0.8), crest = x => Math.max(2, Math.round(h * (0.45 + 0.3 * Math.sin((x - x0) / (x1 - x0) * Math.PI * 1.6 + 0.4))));
  for (let x = Math.round(x0); x < x1; x++) {
    const r = crest(x);
    g.rect(x, 0, 1, r, hill);
    g.rect(x, r, 1, 2, wall);
    if (x % 2) g.px(x, r + 2, wall);
  }
  for (let k = 1; k <= 3; k++) { const x = Math.round(x0 + (x1 - x0) * k / 4), r = crest(x); g.rect(x - 2, r, 5, 4, wall); g.window(x, r + 2, 51); }
}
function burjAlArab(g, cx, h) {
  const white = g.lit('#eef0f2', '#9ec8ff'), seam = g.lit('#eef0f2', '#7aa8f0', 1, 0, 0.12), mast = g.c('#bfc5cc'), sail = Math.round(h * 0.86), w = h * 0.24;
  const left = Math.round(cx - w * 0.4);
  for (let y = 0; y < sail; y++) {
    const right = Math.round(left + 1 + w * Math.pow(Math.sin(Math.PI * Math.min(1, (y + 1) / sail) * 0.98), 0.8));
    for (let x = left + 1; x <= right; x++) g.px(x, y, y % 3 === 0 ? seam : white);
  }
  g.rect(left, 0, 1, h, mast);
  const hy = Math.round(h * 0.72), hx = Math.round(left + 1 + w * Math.pow(Math.sin(Math.PI * (hy + 1) / sail * 0.98), 0.8));
  g.rect(hx, hy, 4, 1, mast);
  g.beacon(left, h);
}
function grandMosque(g, cx, h) {
  const white = g.lit('#eef0f2', '#bcd2ff', 0.7), shade = g.lit('#d4d8dc', '#9ab4e8', 0.7), base = Math.max(3, Math.round(h * 0.18));
  g.rect(cx - Math.round(h * 0.55), 0, Math.round(h * 1.1) + 1, base, shade);
  const dome = (x, r, y0) => { for (let dy = 0; dy <= r; dy++) g.row(x, y0 + dy, r * Math.sqrt(1 - (dy / (r + 0.5)) ** 2) + 0.5, white); g.px(x, y0 + r + 1, g.c('#d8b04a')); };
  const r = Math.max(3, Math.round(h * 0.16));
  g.rect(cx - r, base, 2 * r + 1, 2, white);
  dome(cx, r, base + 2);
  for (const s of [-1, 1]) {
    dome(cx + s * Math.round(h * 0.3), Math.max(1, Math.round(h * 0.08)), base);
    const mx = cx + s * Math.round(h * 0.55), mh = Math.round(h * 0.62);
    g.rect(mx, 0, 1, mh, white); g.row(mx, mh, 1.5, white); g.px(mx, mh + 1, g.c('#d8b04a'));
  }
}
function indiaGate(g, cx, h) {
  const st = g.lit('#c9a77c', '#f0c890', 0.8), dark = g.c('#5a4636'), ah = Math.round(h * 0.55);
  for (let y = 0; y < Math.round(h * 0.78); y++) g.row(cx, y, h * 0.2, st, y < ah ? h * 0.09 * Math.sqrt(Math.max(0, 1 - (y / ah) ** 4)) : 0);
  for (let y = 0; y < ah; y++) g.row(cx, y, h * 0.09 * Math.sqrt(Math.max(0, 1 - (y / ah) ** 4)), g.lamp('#ffd27a', 0.25) || dark);
  g.row(cx, Math.round(h * 0.78), h * 0.24, st);
  for (let y = Math.round(h * 0.8); y < Math.round(h * 0.9); y++) g.row(cx, y, h * 0.17, st);
  for (let y = Math.round(h * 0.9); y < h; y++) g.row(cx, y, h * 0.08 * (1 - (y - h * 0.9) / (h * 0.12)), st);
}
function qutubMinar(g, cx, h) {
  const lt = g.c('#b2654a'), dk = g.c('#b2654a', 0, 0.22), ring = g.c('#cdb79a');
  const rings = [0.32, 0.55, 0.72, 0.86].map(u => Math.round(u * h));
  for (let y = 0; y < h; y++) {
    const hw = h * (0.065 - 0.035 * y / h) + 0.5;
    g.row(cx, y, rings.includes(y) ? hw + 1 : hw, rings.includes(y) ? ring : x => (x - cx) % 2 ? lt : dk);
  }
  g.row(cx, h, 1, ring);
}
function cairoTower(g, cx, h) {
  const c = g.lit('#c8b08a', '#7ad0a0', 0.7), d = g.lit('#c8b08a', '#5ab080', 0.7, 0, 0.3), top = Math.round(h * 0.82);
  for (let y = 0; y < top; y++) g.row(cx, y, h * 0.045 + 0.5, x => (x + y) % 3 ? c : d);
  for (let y = top; y < Math.round(h * 0.92); y++) g.row(cx, y, h * (0.045 + 0.05 * (y - top) / (h * 0.1)) + 0.5, x => (x - cx) % 2 ? c : d);
  g.row(cx, Math.round(h * 0.92), h * 0.07, c);
  for (let y = Math.round(h * 0.93); y < h; y++) g.px(cx, y, c);
  g.beacon(cx, h);
}
function sphinx(g, x, h) {
  const c = g.c('#c9a46a'), d = g.c('#a8844e'), L = Math.round(h * 3.2), bh = Math.max(2, Math.round(h * 0.45));
  g.rect(x, 0, L, bh, c); g.rect(x + L - 2, 0, 2, Math.round(bh * 0.6), d);
  g.rect(x - 2, 0, 3, 1, c);
  const hh = Math.max(3, Math.round(h * 0.6));
  g.rect(x, bh, Math.max(2, Math.round(h * 0.4)), hh - 1, c); g.px(x - 1, bh, d); g.px(x - 1, bh + 1, d);
}
function arc(g, cx, h) {
  const st = g.lit('#d6cdb8', '#f2dca0', 0.9), ah = Math.round(h * 0.6);
  for (let y = 0; y < Math.round(h * 0.84); y++) g.row(cx, y, h * 0.36, st, y < ah ? h * 0.13 * Math.sqrt(Math.max(0, 1 - (y / ah) ** 4)) : 0);
  g.row(cx, Math.round(h * 0.84), h * 0.39, st);
  for (let y = Math.round(h * 0.86); y < h; y++) g.row(cx, y, h * 0.37, st);
}
function notreDame(g, cx, h) {
  const st = g.lit('#bdb3a0', '#e8d4a0', 0.8), dk = g.c('#bdb3a0', 0, 0.2), roof = g.c('#5a5e66');
  const nave = Math.round(h * 0.45), x0 = cx + Math.round(h * 0.26), x1 = cx + Math.round(h * 0.95);
  g.rect(x0, 0, x1 - x0, nave, dk);
  for (let k = 0; k < 4; k++) g.rect(x0 + k, nave + k, x1 - x0 - 2 * k, 1, roof);
  const fx = cx + Math.round(h * 0.62);
  for (let y = nave; y < Math.round(h * 0.95); y++) g.px(fx, y, roof);
  for (const s of [-1, 1]) {
    const tx = cx + s * Math.round(h * 0.18), th = Math.round(h * 0.78);
    for (let y = 0; y < th; y++) g.row(tx, y, h * 0.09, x => y % 4 === 3 && x === tx ? dk : st);
    g.px(tx - Math.round(h * 0.09 - 0.5), th, st); g.px(tx + Math.round(h * 0.09 - 0.5), th, st);
  }
  for (let y = 0; y < Math.round(h * 0.62); y++) g.row(cx, y, h * 0.1, st);
  g.px(cx, Math.round(h * 0.48), g.lit('#6a5a8a', '#ffb070')); g.row(cx, Math.round(h * 0.47), 1.5, g.lit('#6a5a8a', '#ffb070'));
  g.row(cx, 0, h * 0.08, g.c('#3a3530')); g.row(cx, 1, h * 0.06, g.c('#3a3530'));
}
function towerBridge(g, cx, h) {
  const st = g.lit('#c9bfae', '#f0d8a8', 0.8), blue = g.lit('#7f9fc4', '#9ec0ff', 0.6), body = Math.round(h * 0.8), deck = Math.round(h * 0.22);
  const sep = Math.round(h * 0.4), tw = h * 0.075;
  for (const s of [-1, 1]) {
    const tx = cx + s * sep, end = cx + s * Math.round(h * 1.0);
    for (let x = Math.min(tx, end); x <= Math.max(tx, end); x++) {
      const v = Math.abs(x - tx) / Math.abs(end - tx), y = Math.round(deck + 1 + (h * 0.62 - deck - 1) * (1 - v) ** 1.8);
      g.px(x, y, blue);
      if (x % 3 === 0) for (let k = deck + 1; k < y; k++) g.px(x, k, g.c('#7f9fc4', 0.3));
    }
    g.rect(Math.min(tx, end), deck, Math.abs(end - tx) + 1, 1, st);
  }
  g.rect(cx - sep, deck, 2 * sep, 2, blue);
  for (const y of [Math.round(h * 0.68), Math.round(h * 0.72)]) g.rect(cx - sep, y, 2 * sep, 1, blue);
  for (const s of [-1, 1]) {
    const tx = cx + s * sep;
    for (let y = 0; y < body; y++) g.row(tx, y, tw + 0.5, x => y > deck && y % 4 === 1 && x === tx ? g.lit('#3a3a3a', '#ffe6a0') : st);
    for (let y = body; y < h; y++) g.row(tx, y, (tw + 0.5) * (1 - (y - body) / (h - body)), g.c('#5a5e66'));
    const n = Math.round(tw); g.px(tx - n, body, st); g.px(tx + n, body, st); g.px(tx - n, body + 1, st); g.px(tx + n, body + 1, st);
  }
}
function shard(g, cx, h) {
  const lt = g.c('#a9bccd', 0.15), dk = g.c('#a9bccd', 0.15, 0.22);
  for (let y = 0; y < h; y++) {
    const u = y / h, hw = h * 0.13 * (1 - u) + 0.5;
    g.row(cx, y, hw, x => u > 0.9 && (x - cx) % 2 ? null : x < cx ? lt : dk);
    if (y % 2 && u < 0.85) g.window(cx + (y * 7 % 5) - 2, y, 61);
  }
  g.beacon(cx, h - 1);
}
function brandenburg(g, cx, h) {
  const st = g.lit('#cfc2a2', '#f4d89a', 0.9), dk = g.c('#5a5040'), green = g.c('#5f7a68'), hw = Math.round(h * 0.42), colTop = Math.round(h * 0.62);
  g.rect(cx - hw, 0, 2 * hw + 1, colTop, dk);
  for (let k = 0; k < 6; k++) { const x = Math.round(cx - hw + k * (2 * hw) / 5); g.rect(x - (h >= 40 ? 1 : 0), 0, h >= 40 ? 2 : 1, colTop, st); }
  for (let y = colTop; y < Math.round(h * 0.76); y++) g.row(cx, y, hw + 1.5, st);
  for (let y = Math.round(h * 0.76); y < Math.round(h * 0.86); y++) g.row(cx, y, h * 0.3, st);
  for (let y = Math.round(h * 0.86); y < h; y++) g.row(cx, y, h * 0.12 * (y % 2 ? 1 : 0.7), green);
}
function cologne(g, cx, h) {
  const st = g.lit('#6e6a62', '#d8c08a', 0.8), dk = g.c('#4e4a44'), body = Math.round(h * 0.55);
  for (let y = 0; y < Math.round(h * 0.5); y++) g.row(cx, y, h * 0.1, y < Math.round(h * 0.2) ? (x => Math.abs(x - cx) < 2 ? dk : st) : st);
  for (const s of [-1, 1]) {
    const tx = cx + s * Math.round(h * 0.12);
    for (let y = 0; y < body; y++) g.row(tx, y, h * 0.07, x => y % 5 === 4 && x === tx ? g.lamp('#ffd27a', 0.6) || dk : st);
    for (let y = body; y < h; y++) {
      const hw = h * 0.07 * (1 - (y - body) / (h - body)) + 0.5;
      g.row(tx, y, hw, st);
      if (y % 2) { g.px(tx - Math.round(hw + 0.5), y, st); g.px(tx + Math.round(hw + 0.5), y, st); }
    }
  }
}
function pisa(g, cx, h) {
  const m = g.lit('#ebe6da', '#f8ecc8', 0.8), sh = g.c('#ebe6da', 0, 0.2), ring = g.c('#cfc8b8'), tiers = 7, body = Math.round(h * 0.86), tH = body / tiers, lean = 0.1;
  for (let y = 0; y < h; y++) {
    const off = Math.round(y * lean), t = Math.floor(y / tH), yy = y - t * tH;
    if (y >= body) { g.row(cx + off, y, h * 0.1, (x => (x - cx - off) % 2 ? m : sh)); continue; }
    g.row(cx + off, y, yy < 1 ? h * 0.15 : h * 0.13, yy < 1 ? ring : x => yy > 1 && yy < tH - 1 && (x - cx - off) % 2 === 0 ? sh : m);
  }
}
function duomo(g, cx, h) {
  const white = g.c('#e3ddd0'), green = g.c('#5d7a5e'), red = g.lit('#b5552e', '#e0844a', 0.6), rib = g.c('#ece6d8');
  const base = Math.round(h * 0.35), drum = Math.round(h * 0.47), dh = Math.round(h * 0.4), r = h * 0.22;
  for (let y = 0; y < base; y++) g.row(cx, y, h * 0.5, x => (x - cx) % 3 === 0 ? green : white);
  for (let y = base; y < drum; y++) g.row(cx, y, h * 0.2, x => y === drum - 1 ? green : white);
  for (let y = 0; y < dh; y++) {
    const hw = r * Math.sqrt(Math.max(0, 1 - (y / dh) ** 1.6)) + 0.5, n = Math.round(hw * 0.55);
    g.row(cx, drum + y, hw, x => x === cx || Math.abs(x - cx) === n ? rib : red);
  }
  for (let y = drum + dh; y < h; y++) g.row(cx, y, y === drum + dh ? 1.5 : 0.5, rib);
  const cx2 = cx - Math.round(h * 0.6);
  for (let y = 0; y < Math.round(h * 0.9); y++) g.row(cx2, y, h * 0.06 + 0.5, x => (y + x) % 4 === 0 ? green : white);
}
function liberty(g, cx, h) {
  const st = g.c('#b9ad96'), green = g.lit('#6fa58f', '#9fe0c8', 0.6), ped = Math.round(h * 0.42);
  for (let y = 0; y < Math.round(h * 0.1); y++) g.row(cx, y, h * 0.3, st);
  for (let y = Math.round(h * 0.1); y < ped; y++) g.row(cx, y, h * (0.12 - 0.03 * (y / ped)), st);
  const top = Math.round(h * 0.86);
  for (let y = ped; y < top; y++) g.row(cx, y, h * 0.07 * (1 - 0.5 * (y - ped) / (top - ped)) + 0.5, green);
  g.px(cx, top, green); g.px(cx - 1, top + 1, green); g.px(cx + 1, top + 1, green); g.px(cx, top + 1, green);
  g.line(cx + 1, Math.round(h * 0.78), cx + 2, h - 2, green);
  g.px(cx + 2, h - 1, g.lit('#c9a74a', '#ffd06a')); g.px(cx + 2, h, g.lit('#c9a74a', '#ffb040'));
  g.px(cx - 2, Math.round(h * 0.66), green);
}
function monument(g, cx, h) {
  const st = g.lit('#e8e6e0', '#f4ecd8', 0.8), sh = g.c('#e8e6e0', 0, 0.15), top = Math.round(h * 0.93);
  for (let y = 0; y < top; y++) g.row(cx, y, h * (0.05 - 0.015 * y / top) + 0.5, x => x > cx ? sh : st);
  for (let y = top; y < h; y++) g.row(cx, y, (h * 0.035 + 0.5) * (1 - (y - top) / (h - top)), st);
  g.beacon(cx, h);
}
function capitol(g, cx, h) {
  const w = g.lit('#e6e3da', '#f4ecd8', 0.9), sh = g.c('#e6e3da', 0, 0.18), wing = Math.round(h * 0.18);
  for (let y = 0; y < wing; y++) g.row(cx, y, h * 0.6, x => y < wing - 1 && (x - cx) % 2 ? sh : w);
  for (let y = wing; y < Math.round(h * 0.26); y++) g.row(cx, y, h * 0.2, w);
  for (let y = Math.round(h * 0.26); y < Math.round(h * 0.42); y++) g.row(cx, y, h * 0.14, x => (x - cx) % 2 ? sh : w);
  const d0 = Math.round(h * 0.42), r = Math.round(h * 0.15);
  for (let dy = 0; dy <= r; dy++) g.row(cx, d0 + dy, r * Math.sqrt(1 - (dy / (r + 0.5)) ** 2) + 0.5, w);
  for (let y = d0 + r + 1; y < Math.round(h * 0.86); y++) g.px(cx, y, w);
  g.row(cx, Math.round(h * 0.78), 1, w);
}
function gatewayArch(g, cx, h) {
  const lt = g.c('#c9ced4', 0.1), dk = g.c('#c9ced4', 0.1, 0.25), w = Math.round(h * 0.5), k = 1.9;
  const yAt = (x, ww) => h * (1 - (Math.cosh(k * x / ww) - 1) / (Math.cosh(k) - 1));
  const win = w - Math.max(2, Math.round(h * 0.06));
  for (let x = -w; x <= w; x++) {
    const out = Math.round(yAt(x, w)), inn = Math.abs(x) < win ? Math.round(yAt(x, win) * 0.94) : 0;
    for (let y = inn; y < out; y++) g.px(cx + x, y, x < 0 ? lt : dk);
  }
}
function spaceNeedle(g, cx, h) {
  const w = g.c('#e8e8e8', 0.1), saucer = g.lit('#d8dde2', '#ffe7b0', 0.7), ws = Math.round(h * 0.36), sa = Math.round(h * 0.72);
  for (let y = 0; y < sa; y++) {
    const hw = y < ws ? h * (0.13 - 0.105 * y / ws) : h * (0.025 + 0.035 * (y - ws) / (sa - ws));
    g.row(cx, y, hw + 0.5, w, hw > 1.6 ? hw - 1 : 0);
  }
  g.row(cx, sa, h * 0.15, saucer); g.row(cx, sa + 1, h * 0.18, g.lit('#545b67', '#fff0c4')); g.row(cx, sa + 2, h * 0.14, saucer);
  g.row(cx, sa + 3, h * 0.07, w);
  for (let y = sa + 4; y < h; y++) g.px(cx, y, w);
  g.beacon(cx, h);
}
// The hills over Los Angeles, the sign on them.
const LETTERS = { H: [5, 5, 7, 5, 5], O: [7, 5, 5, 5, 7], L: [4, 4, 4, 4, 7], Y: [5, 5, 2, 2, 2], W: [5, 5, 5, 7, 5], D: [6, 5, 5, 5, 6] };
function hollywood(g, cx, h) {
  const hh = Math.round(h * 0.42);
  g.hill(cx, h * 1.1, hh, '#6b6a4c', 0.35, 0.18);
  const white = g.c('#f0f0ee', 0.2), word = 'HOLLYWOOD', x0 = cx - Math.round(word.length * 4 / 2), y0 = Math.round(hh * 0.4);
  [...word].forEach((ch, i) => LETTERS[ch].forEach((bits, r) => { for (let b = 0; b < 3; b++) if (bits & (4 >> b)) g.px(x0 + i * 4 + b, y0 + 4 - r, white); }));
}
function peaceTower(g, cx, h) {
  const st = g.lit('#c2b49a', '#f0d8a0', 0.8), cu = g.c('#6f9c8a'), block = Math.round(h * 0.22), top = Math.round(h * 0.76);
  for (let y = 0; y < block; y++) g.row(cx, y, h * 0.48, y === block - 1 ? cu : st);
  for (let y = block; y < top; y++) g.row(cx, y, h * 0.07 + 0.5, st);
  const c = Math.round(h * 0.64); g.px(cx, c, g.lit('#e9e0c4', '#ffeaa4'));
  for (let y = top; y < Math.round(h * 0.94); y++) g.row(cx, y, (h * 0.08 + 0.5) * (1 - (y - top) / (h * 0.2)), cu);
  for (let y = Math.round(h * 0.94); y < h; y++) g.px(cx, y, g.c('#8a8a8a'));
  g.px(cx + 1, h - 1, g.c('#d0342c')); g.px(cx + 2, h - 1, g.c('#d0342c'));
}
function congress(g, cx, h) {
  const w = g.lit('#e6e6e0', '#f4ecd8', 0.8), sh = g.c('#e6e6e0', 0, 0.2);
  g.rect(cx - Math.round(h * 0.75), 0, Math.round(h * 1.5) + 1, 2, sh);
  g.rect(cx - 2, 2, 2, h - 2, w); g.rect(cx + 1, 2, 2, h - 2, sh);
  for (let y = Math.round(h * 0.82); y < Math.round(h * 0.86); y++) g.rect(cx - 2, y, 5, 1, w);
  const bowl = Math.max(3, Math.round(h * 0.16));
  for (let k = 0; k < bowl; k++) g.row(cx - Math.round(h * 0.45), 2 + k, h * 0.08 + k * 1.1, w);
  const r = Math.max(2, Math.round(h * 0.12));
  for (let dy = 0; dy <= r; dy++) g.row(cx + Math.round(h * 0.45), 2 + dy, r * Math.sqrt(1 - (dy / (r + 0.5)) ** 2) + 0.5, w);
}
function uluru(g, cx, h, depth = 0.4) {
  const red = '#b5532d';
  for (let y = 0; y < h; y++) {
    const hw = h * 2.4 * Math.pow(1 - (y / h) ** 3, 0.5);
    g.row(cx, y, hw, x => g.c(red, depth, (x * 5 + (y >> 1)) % 9 === 0 ? 0.25 : g.sunLeft === x < cx ? 0 : 0.12));
  }
}
function alps(g, x0, x1, h, depth = 0.7) {
  const peaks = [[0.1, 0.7], [0.28, 1], [0.45, 0.8], [0.62, 0.95], [0.8, 0.65], [0.95, 0.85]];
  for (let x = Math.round(x0); x < x1; x++) {
    const v = (x - x0) / (x1 - x0), top = Math.max(...peaks.map(([p, k]) => k * h - Math.abs(v - p) * (x1 - x0) * 1.1));
    for (let y = 0; y < top; y++) g.px(x, y, g.c(y > top - Math.max(2, h * 0.25) + hash(x, 3) * 2 ? '#eef1f6' : '#5f6b80', depth));
  }
}
function sagrada(g, cx, h) {
  const st = g.lit('#b8a888', '#f0d8a0', 0.8), dk = g.c('#6e6250'), body = Math.round(h * 0.3);
  for (let y = 0; y < body; y++) g.row(cx, y, h * 0.46, x => y > 1 && (x - cx) % 3 === 0 && y % 3 ? dk : st);
  const spires = [[-0.36, 0.6], [-0.26, 0.74], [-0.14, 0.82], [0, 1], [0.14, 0.86], [0.26, 0.76], [0.36, 0.62]];
  for (const [dx, k] of spires) {
    const x = cx + Math.round(dx * h), top = Math.round(k * h);
    for (let y = body; y < top; y++) {
      const u = (y - body) / (top - body);
      g.row(x, y, 1.6 - 1.1 * u * u, (y - body) % 3 === 2 && u < 0.8 ? dk : st);
    }
    g.px(x, top, g.lit(dx ? '#d84a3a' : '#e8e0d0', '#ffcf6a'));
  }
}
function glories(g, cx, h) {
  const night = ['#3a7bff', '#ff4a8a', '#ffd04a', '#4adf9a'];
  for (let y = 0; y < h; y++) {
    const u = y / h;
    g.row(cx, y, h * 0.11 * Math.sqrt(1 - u ** 4) + 0.5, g.lit('#7d8fa8', night[(y >> 2) % 4], 0.8, 0.1));
  }
}
function tulips(g, x0, x1) {
  for (let x = Math.round(x0); x < x1; x++) g.rect(x, 0, 1, 2, g.c(['#d8443a', '#e8c040', '#e05a8a', '#d8443a'][Math.floor(x / 5) % 4], 0.2, x % 2 ? 0.1 : 0));
}

// ---- Places --------------------------------------------------------------------------------------------------------
// A time zone stands for a whole country, or a part of one: each place shows a few of its landmarks, so that wherever
// you are in it, you know one. `zones`: the time zones it covers (a trailing / for all in a region); lat and lng
// where its sky is taken. `draw(g)`: g.cx is where its best known landmark stands (over the pile's ground, which the
// truck keeps clear), g.at(f) a fraction of the way across, g.H the most anything may rise.
export const PLACES = {
  japan: { name: 'Japan', sights: 'Tokyo Tower, the Skytree, Fuji, Osaka Castle, a Kyoto pagoda and a torii', lat: 35.68, lng: 139.69, zones: ['Asia/Tokyo', 'Japan'],
    draw: g => {
      fuji(g, g.at(0.42), g.H * 0.46);
      g.skyline(7, g.at(0.3), g.W, g.H * 0.06, g.H * 0.22, 0.55);
      pagoda(g, g.at(0.07), Math.round(g.H * 0.64));
      osakaCastle(g, g.at(0.15), Math.round(g.H * 0.5));
      skytree(g, g.cx - Math.round(g.H * 0.85), g.H);
      tokyoTower(g, g.cx, Math.round(g.H * 0.82));
      torii(g, g.at(0.93), Math.round(g.H * 0.36));
    } },
  korea: { name: 'South Korea', sights: 'N Seoul Tower, Lotte World Tower and Namdaemun', lat: 37.55, lng: 126.99, zones: ['Asia/Seoul', 'ROK'],
    draw: g => {
      g.hill(g.at(0.3), g.H * 1.1, g.H * 0.4, '#4a5d58', 0.75, 0);
      namdaemun(g, g.at(0.1), Math.round(g.H * 0.42));
      lotteTower(g, g.at(0.42), g.H);
      namsan(g, g.cx, Math.round(g.H * 0.92));
      g.skyline(8, g.at(0.2), g.W, g.H * 0.04, g.H * 0.16, 0.3);
    } },
  china: { name: 'China', sights: 'the Oriental Pearl and Shanghai Tower, the Temple of Heaven and the Great Wall', lat: 31.23, lng: 121.47,
    zones: ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Chungking', 'Asia/Harbin', 'Asia/Urumqi', 'PRC'],
    draw: g => {
      greatWall(g, g.at(0.2), g.at(0.6), g.H * 0.36);
      templeOfHeaven(g, g.at(0.09), Math.round(g.H * 0.52));
      g.skyline(9, g.at(0.6), g.W, g.H * 0.08, g.H * 0.36, 0.55);
      shanghaiTower(g, g.cx + Math.round(g.H * 0.6), Math.round(g.H * 0.98));
      pearl(g, g.cx, Math.round(g.H * 0.9));
    } },
  singapore: { name: 'Singapore', sights: 'Marina Bay Sands, the Supertrees and the Flyer', lat: 1.28, lng: 103.85, zones: ['Asia/Singapore', 'Singapore'],
    draw: g => {
      g.skyline(10, g.at(0.25), g.W, g.H * 0.08, g.H * 0.4, 0.6);
      const R = Math.round(g.H * 0.36); eye(g, g.at(0.14), R + 2, R);
      mbs(g, g.cx, g.H);
    } },
  uae: { name: 'UAE', sights: 'the Burj Khalifa, the Burj Al Arab and the Sheikh Zayed Mosque', lat: 25.2, lng: 55.27, zones: ['Asia/Dubai', 'Asia/Muscat'],
    draw: g => {
      grandMosque(g, g.at(0.13), Math.round(g.H * 0.5));
      g.skyline(11, g.at(0.3), g.W, g.H * 0.08, g.H * 0.36, 0.55, ['#8e9aa6', '#a3adb6', '#7d8894']);
      burjAlArab(g, g.cx - Math.round(g.H * 0.9), Math.round(g.H * 0.62));
      burj(g, g.cx, g.H);
    } },
  india: { name: 'India', sights: 'the Taj Mahal, India Gate and the Qutub Minar', lat: 28.61, lng: 77.21, zones: ['Asia/Kolkata', 'Asia/Calcutta'],
    draw: g => {
      indiaGate(g, g.at(0.1), Math.round(g.H * 0.55));
      qutubMinar(g, g.cx - Math.round(g.H * 1.2), Math.round(g.H * 0.9));
      taj(g, g.cx, g.H);
    } },
  egypt: { name: 'Egypt', sights: 'the Pyramids of Giza, the Sphinx and the Cairo Tower', lat: 30.04, lng: 31.24, zones: ['Africa/Cairo', 'Egypt'],
    draw: g => {
      g.skyline(12, 0, g.at(0.3), g.H * 0.03, g.H * 0.12, 0.6, ['#a99a80', '#9a8c74']);
      cairoTower(g, g.at(0.1), Math.round(g.H * 0.86));
      g.hill(g.cx, g.H * 2.4, 3, '#c2a372', 0.3, 0);
      pyramid(g, g.cx - Math.round(g.H * 0.95), Math.round(g.H * 0.22));
      pyramid(g, g.cx - Math.round(g.H * 0.3), Math.round(g.H * 0.46), true);
      pyramid(g, g.cx + Math.round(g.H * 0.36), Math.round(g.H * 0.5));
      sphinx(g, g.cx - Math.round(g.H * 1.45), Math.round(g.H * 0.16));
      palm(g, g.at(0.3), Math.round(g.H * 0.24));
    } },
  france: { name: 'France', sights: 'the Eiffel Tower, the Arc de Triomphe and Notre-Dame', lat: 48.86, lng: 2.35, zones: ['Europe/Paris', 'Europe/Monaco'],
    draw: g => {
      g.skyline(13, 0, g.W, g.H * 0.08, g.H * 0.17, 0.5, ['#bcb2a0', '#a9a090', '#b5ab9a']);
      arc(g, g.at(0.1), Math.round(g.H * 0.46));
      notreDame(g, g.cx - Math.round(g.H * 1.35), Math.round(g.H * 0.55));
      eiffel(g, g.cx, g.H);
    } },
  uk: { name: 'United Kingdom', sights: 'Big Ben, the London Eye, Tower Bridge and the Shard', lat: 51.5, lng: -0.12, zones: ['Europe/London', 'Europe/Belfast', 'GB', 'GB-Eire'],
    draw: g => {
      g.skyline(14, 0, g.W, g.H * 0.06, g.H * 0.22, 0.6);
      towerBridge(g, g.at(0.13), Math.round(g.H * 0.62));
      shard(g, g.at(0.42), Math.round(g.H * 0.96));
      const R = Math.round(g.H * 0.36);
      eye(g, g.cx + Math.round(g.H * 0.8), R + Math.round(g.H * 0.06), R);
      westminster(g, g.cx - Math.round(g.H * 0.8), g.cx, g.H);
      bigBen(g, g.cx, g.H);
    } },
  germany: { name: 'Germany', sights: 'the Fernsehturm, the Brandenburg Gate and Cologne Cathedral', lat: 52.52, lng: 13.4, zones: ['Europe/Berlin', 'Europe/Busingen'],
    draw: g => {
      g.skyline(15, 0, g.W, g.H * 0.08, g.H * 0.2, 0.5);
      brandenburg(g, g.at(0.12), Math.round(g.H * 0.44));
      cologne(g, g.at(0.43), Math.round(g.H * 0.94));
      fernsehturm(g, g.cx, g.H);
    } },
  italy: { name: 'Italy', sights: 'the Colosseum, the Leaning Tower of Pisa and Florence’s Duomo', lat: 41.9, lng: 12.5, zones: ['Europe/Rome', 'Europe/Vatican', 'Europe/San_Marino'],
    draw: g => {
      g.skyline(16, 0, g.W, g.H * 0.05, g.H * 0.13, 0.55, ['#b8a080', '#a88e70', '#c0a888']);
      pisa(g, g.at(0.08), Math.round(g.H * 0.62));
      duomo(g, g.at(0.36), Math.round(g.H * 0.62));
      colosseum(g, g.cx, g.H);
    } },
  spain: { name: 'Spain', sights: 'the Sagrada Família and Torre Glòries', lat: 41.39, lng: 2.17, zones: ['Europe/Madrid'],
    draw: g => {
      g.skyline(24, 0, g.W, g.H * 0.06, g.H * 0.18, 0.5, ['#c2b096', '#b09c84', '#a89880']);
      glories(g, g.at(0.15), Math.round(g.H * 0.7));
      sagrada(g, g.cx, g.H);
    } },
  netherlands: { name: 'Netherlands', sights: 'canal houses, windmills and tulips', lat: 52.37, lng: 4.9, zones: ['Europe/Amsterdam'],
    draw: g => {
      tulips(g, 0, g.at(0.3));
      windmill(g, g.at(0.12), g.H);
      canalHouses(g, g.at(0.35), g.at(0.82), g.H);
      windmill(g, g.at(0.92), Math.round(g.H * 0.7));
    } },
  useast: { name: 'US East', sights: 'the Empire State Building, the Statue of Liberty and the Capitol', lat: 40.71, lng: -74.0,
    zones: ['America/New_York', 'America/Detroit', 'America/Indiana/', 'America/Kentucky/', 'US/Eastern', 'EST5EDT'],
    draw: g => {
      liberty(g, g.at(0.06), Math.round(g.H * 0.62));
      capitol(g, g.at(0.24), Math.round(g.H * 0.5));
      monument(g, g.at(0.4), Math.round(g.H * 0.82));
      g.skyline(17, g.at(0.48), g.W, g.H * 0.12, g.H * 0.42, 0.55);
      chrysler(g, g.cx + Math.round(g.H * 0.55), Math.round(g.H * 0.72));
      empireState(g, g.cx, g.H);
    } },
  uscentral: { name: 'US Central', sights: 'the Willis Tower, the Hancock and the Gateway Arch', lat: 41.88, lng: -87.63, zones: ['America/Chicago', 'US/Central', 'CST6CDT'],
    draw: g => {
      gatewayArch(g, g.at(0.15), Math.round(g.H * 0.78));
      g.skyline(19, g.at(0.38), g.W, g.H * 0.1, g.H * 0.36, 0.55);
      hancock(g, g.cx + Math.round(g.H * 0.62), Math.round(g.H * 0.82));
      willis(g, g.cx, g.H);
    } },
  uswest: { name: 'US West', sights: 'the Golden Gate Bridge, the Space Needle and the Hollywood sign', lat: 37.77, lng: -122.42, zones: ['America/Los_Angeles', 'US/Pacific', 'PST8PDT'],
    draw: g => {
      hollywood(g, g.at(0.32), Math.round(g.H * 0.7));
      spaceNeedle(g, g.at(0.08), Math.round(g.H * 0.92));
      palm(g, g.at(0.48), Math.round(g.H * 0.4));
      goldenGate(g, g.cx + Math.round(g.H * 0.25), Math.round(g.H * 0.82));
    } },
  canada: { name: 'Canada East', sights: 'the CN Tower and the Peace Tower', lat: 43.65, lng: -79.38, zones: ['America/Toronto', 'America/Montreal', 'America/Nipigon', 'Canada/Eastern'],
    draw: g => {
      peaceTower(g, g.at(0.13), Math.round(g.H * 0.66));
      g.skyline(18, g.at(0.3), g.W, g.H * 0.08, g.H * 0.34, 0.5);
      cnTower(g, g.cx, g.H);
    } },
  brazil: { name: 'Brazil', sights: 'Christ the Redeemer, Sugarloaf and the Congress in Brasília', lat: -22.95, lng: -43.21, zones: ['America/Sao_Paulo', 'Brazil/East'],
    draw: g => {
      congress(g, g.at(0.12), Math.round(g.H * 0.46));
      rio(g, g.cx - Math.round(g.H * 0.3), g.H);
      g.skyline(20, g.at(0.3), g.W, g.H * 0.03, g.H * 0.12, 0.35);
    } },
  australia: { name: 'Australia', sights: 'the Opera House, the Harbour Bridge and Uluru', lat: -33.86, lng: 151.21, zones: ['Australia/'],
    draw: g => { uluru(g, g.at(0.12), Math.round(g.H * 0.2)); sydney(g, g.cx + Math.round(g.H * 0.3), g.H); } },
  newzealand: { name: 'New Zealand', sights: 'the Sky Tower and the Southern Alps', lat: -36.85, lng: 174.76, zones: ['Pacific/Auckland', 'NZ'],
    draw: g => { alps(g, 0, g.at(0.62), g.H * 0.55); g.skyline(22, g.at(0.4), g.W, g.H * 0.06, g.H * 0.26, 0.5); cnTower(g, g.cx, g.H, 0.62, 0.075); } },
};
for (const k in PLACES) PLACES[k].key = k;
const SOUTH = ['Australia/', 'Pacific/Auckland', 'America/Argentina', 'America/Santiago', 'America/Sao_Paulo', 'America/Lima', 'Africa/Johannesburg', 'Africa/Maputo', 'Indian/'];
// Anywhere else: a city of blocks, the sun over the time zone's longitude.
function somewhere(zone) {
  const name = (zone.split('/').pop() || 'Here').replace(/_/g, ' ');
  return { key: 'auto', name, sights: 'a city skyline', zones: [zone], lat: SOUTH.some(s => zone.startsWith(s)) ? -35 : 40,
    lng: -new Date().getTimezoneOffset() / 4, draw: g => { g.skyline(31, 0, g.W, g.H * 0.12, g.H * 0.55, 0.55); g.skyline(32, 0, g.W, g.H * 0.05, g.H * 0.28, 0.3); } };
}
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export function placeOf(zone = ZONE) {
  return Object.values(PLACES).find(c => c.zones.some(z => z.endsWith('/') ? zone.startsWith(z) : zone === z)) || somewhere(zone);
}
let chosen = q.get('scene') || 'auto';
export function setScene(k) { chosen = k || 'auto'; }
const placeNow = () => chosen === 'off' ? null : PLACES[chosen] || placeOf();

// ---- The scene -----------------------------------------------------------------------------------------------------
// A backdrop W wide down to the ground at B, the best known landmark standing at `at`; `city` (a place, its key or a
// time zone) and `clock` for one that doesn't
// follow the setting and the time (the lab's). Painted ten times a second into its own canvas, then laid in the field.
export function backdrop(W, B, { at = Math.round(W * 0.36), city, clock: time = clock } = {}) {
  const dpr = Math.min(4, devicePixelRatio || 1), cv = document.createElement('canvas');
  cv.width = W * dpr; cv.height = B * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  let paintedAt = -1, shown = null;
  const stars = Array.from({ length: 34 }, (_, i) => ({ x: hash(i, 1) * W | 0, y: 2 + hash(i, 2) * (B - 16) | 0, b: 0.35 + 0.65 * hash(i, 3), tw: hash(i, 4) < 0.35 }));
  const fade = y => Math.min(1, Math.max(0, y / B) ** 1.2 * 1.1);
  // Keeps what is painted as much as the gradient's stops say ([where, how much]).
  function mask(gr, stops) {
    for (const [at, a] of stops) gr.addColorStop(at, `rgba(0,0,0,${a})`);
    ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = gr; ctx.fillRect(0, 0, W, B);
    ctx.globalCompositeOperation = 'source-over';
  }
  function paint(t) {
    const c = typeof city === 'string' ? PLACES[city] || placeOf(city) : city || placeNow();
    shown = c;
    if (!c) return;
    const ms = time(), d = days(ms), so = sunAt(d), mo = moonAt(d), sun = seen(so, d, c.lat, c.lng), moon = seen(mo, d, c.lat, c.lng);
    const alt = sun.alt / RAD, sky = skyAt(alt), day = smooth(-7, 3, alt), night = 1 - day, warm = Math.max(0, 1 - Math.abs(alt + 1) / 7);
    // Looking south (north below the equator): the sun comes up on the left and goes down on the right.
    const face = c.lat >= 0 ? 0 : Math.PI, X = az => W / 2 + Math.atan2(Math.sin(az - face), Math.cos(az - face)) / (0.85 * Math.PI) * W / 2;
    const Y = a => B - 1 - (a > 0 ? Math.pow(a / (Math.PI / 2), 0.75) * (B - 12) : a / RAD * 1.5);
    const sx = X(sun.az), sy = Y(sun.alt), mx = X(moon.az), my = Y(moon.alt), phase = phaseOf(so, mo);
    const moonUp = moon.alt > -0.02, moonlight = moonUp ? smooth(0, 0.15, moon.alt) * Math.sin(Math.PI * phase) * night : 0;
    ctx.clearRect(0, 0, W, B);
    for (let y = 0; y < B; y += 2) { ctx.fillStyle = css(mix(sky.top, sky.hor, Math.pow(y / B, 1.4))); ctx.fillRect(0, y, W, 2); }
    // The glow where the sun is about to rise or has just set, and round it by day.
    if (warm > 0) {
      const gr = ctx.createRadialGradient(sx, B, 0, sx, B, W * 0.5);
      gr.addColorStop(0, css([255, 150, 90], 0.42 * warm)); gr.addColorStop(1, css([255, 150, 90], 0));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, B);
    }
    if (sun.alt > 0) {
      const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, 26);
      gr.addColorStop(0, css([255, 244, 214], 0.28 * day)); gr.addColorStop(1, css([255, 244, 214], 0));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, B);
    }
    const starsOut = smooth(-4, -12, alt) * (1 - moonlight * 0.4);
    if (starsOut > 0.02) for (const s of stars) {
      const a = starsOut * s.b * (s.tw ? 0.55 + 0.45 * Math.sin(t * (1.3 + s.b * 2) + s.x) : 1);
      ctx.fillStyle = css([236, 240, 255], a); ctx.fillRect(s.x, s.y, 1, 1);
    }
    // Today's clouds: how many, where and how fast, the same all day.
    const today = Math.floor((ms + c.lng * 24e4) / 864e5), cr = rng(today * 7 + 3), n = cr() * 5 | 0;
    const cloud = mix(mix([224, 230, 236], [242, 160, 122], warm * 0.8), [38, 43, 62], night), under = mix(cloud, [0, 0, 0], 0.18);
    for (let i = 0; i < n; i++) {
      const w = 10 + cr() * 22 | 0, y0 = 5 + cr() * B * 0.4 | 0, v = 0.6 + cr() * 0.9, x0 = cr() * (W + 50);
      const x = Math.round((x0 + ms / 6000 * v) % (W + 50)) - 25, a = 0.5 + 0.25 * night;
      for (const [dx, dy, len, col] of [[0, 0, w, under], [2, -1, w - 4, cloud], [3, -2, w * 0.4, cloud], [w * 0.5, -2, w * 0.32, cloud], [4, -3, w * 0.22, cloud], [w * 0.55, -3, w * 0.18, cloud]]) {
        ctx.fillStyle = css(col, a); ctx.fillRect(x + Math.round(dx), y0 + dy, Math.round(len), 1);
      }
    }
    // The sky fades up into the window's glass; the sun and the moon hold on a little more.
    mask(ctx.createLinearGradient(0, 0, 0, B), [[0, 0], [0.3, fade(B * 0.3)], [0.6, fade(B * 0.6)], [1, 1]]);
    // The moon in its phase (lit on the right while it waxes, from the north), faint by day.
    if (moonUp) {
      ctx.globalAlpha = 0.4 + 0.6 * fade(my);
      const r = 3.6, flip = c.lat < 0 ? -1 : 1, lit = css([236, 232, 214], 0.45 + 0.55 * night), dim = css([236, 232, 214], 0.07 + 0.08 * night);
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx + dy * dy > r * r + 0.8) continue;
        const ny = (dy + 0.5) / (r + 0.5), nx = flip * (dx + 0.5) / (r + 0.5), w = Math.sqrt(Math.max(0, 1 - ny * ny)), k = w * Math.cos(2 * Math.PI * phase);
        ctx.fillStyle = (phase < 0.5 ? nx > k : nx < -k) ? lit : dim;
        ctx.fillRect(Math.round(mx) + dx, Math.round(my) + dy, 1, 1);
      }
    }
    if (sun.alt > -0.03) {
      const col = alt < 3 ? [255, 138, 74] : alt < 10 ? [255, 192, 112] : [255, 241, 194];
      ctx.globalAlpha = 0.4 + 0.6 * fade(sy); ctx.fillStyle = css(col);
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dy * dy <= 17) ctx.fillRect(Math.round(sx) + dx, Math.round(sy) + dy, 1, 1);
    }
    ctx.globalAlpha = 1;
    const g = painter(ctx, { W, B, H: B - 14, cx: Math.round(at), t, ms, hour: hourIn(c.zones[0].endsWith('/') ? ZONE : c.zones[0], ms),
      day, night, warm, hor: sky.hor, sunLeft: sx < at, moonlight });
    c.draw(g);
    // And the whole of it away at the sides.
    mask(ctx.createLinearGradient(0, 0, W, 0), [[0, 0], [0.06, 1], [0.94, 1], [1, 0]]);
  }
  return {
    // Lays the backdrop into the field's canvas (at the field's own scale).
    draw(into, t) {
      if (t - paintedAt >= 0.1 || paintedAt < 0) { paintedAt = t; paint(t); }
      if (shown) into.drawImage(cv, 0, 0, W, B);
    },
    get city() { return shown; },
  };
}
