/**
 * Builds standalone HTML mockups of the rankings board so a design direction
 * can be chosen before any of it is wired into the app.
 *
 * Uses the real 2025 final ratings rather than the current preseason payload —
 * the preseason rows have no efficiency or scoring figures yet, and a board
 * full of em-dashes tells you nothing about how the design reads.
 *
 * Usage: npx tsx scripts/make-variants.ts
 */
import { readFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";

/**
 * Inter, lifted out of the built app and inlined.
 *
 * The mockups must render in the same face the site actually uses, and the
 * sandbox has no Inter installed and no network — falling back to the system
 * sans would make the comparison about the wrong thing.
 */
function interFace(): string {
  const dir = ".next/static/media";
  let file: string | undefined;
  try {
    file = readdirSync(dir).find((f) => f.endsWith("-s.p.woff2"));
  } catch {
    /* not built yet */
  }
  if (!file) {
    console.warn("  (no built font found — run `npm run build` first)");
    return "";
  }
  const b64 = readFileSync(`${dir}/${file}`).toString("base64");
  return `@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
}

interface Row {
  rank: number;
  name: string;
  cls: string;
  region: number;
  w: number;
  l: number;
  rating: number;
  sos: number;
  oEff: number;
  dEff: number;
  ppg: number;
  papg: number;
}

function load(): Row[] {
  const lines = readFileSync("data/validation_2025_expected.csv", "utf8")
    .trim()
    .split("\n")
    .slice(1);
  return lines.map((line) => {
    const c = line.split(",");
    return {
      rank: Number(c[0]),
      name: c[1],
      // 2025's 7A is the current 6A.
      cls: c[2] === "7A" ? "6A" : c[2],
      region: Number(c[3]),
      w: Number(c[4]),
      l: Number(c[5]),
      rating: Number(c[6]),
      sos: Number(c[8]),
      oEff: Number(c[9]),
      dEff: Number(c[10]),
      ppg: Number(c[11]),
      papg: Number(c[12]),
    };
  });
}

const rows = load();
const shown = rows.slice(0, 16);
const maxRating = Math.max(...rows.map((r) => r.rating));

/** Rank of a team within one column, across the whole field. */
function colRank(get: (r: Row) => number, high = true) {
  const m = new Map<string, number>();
  [...rows]
    .sort((a, b) => (high ? get(b) - get(a) : get(a) - get(b)))
    .forEach((r, i) => m.set(r.name, i + 1));
  return m;
}
const R = {
  sos: colRank((r) => r.sos),
  oEff: colRank((r) => r.oEff),
  dEff: colRank((r) => r.dEff),
  ppg: colRank((r) => r.ppg),
  papg: colRank((r) => r.papg, false),
};

const CLS = ["6A", "5A", "4A", "3A", "2A", "1A", "AA", "A"];

// ---- shared shell ---------------------------------------------------------

/**
 * One palette across all three so the comparison is about layout and the use
 * of colour, not about three different colour schemes. Richer than the current
 * flat navy: the canvas carries a slight violet lift and surfaces step up
 * three levels instead of two.
 */
const TOKENS = `
${interFace()}
:root{
  --canvas:8 12 22; --canvas-2:12 17 31;
  --surface:16 23 40; --surface-2:22 31 52; --surface-3:30 41 66;
  --border:34 47 73; --border-strong:52 70 102;
  --text:228 234 245; --muted:143 158 184; --faint:100 116 143;
  --brand:244 63 63; --gold:250 204 21;
  --good:74 222 128; --bad:248 113 113;
  --c-6A:167 139 250; --c-5A:96 165 250; --c-4A:56 189 248; --c-3A:45 212 191;
  --c-2A:74 222 128; --c-1A:250 204 21; --c-AA:251 146 60; --c-A:244 114 182;
}
*{box-sizing:border-box;margin:0;padding:0}
body{
  background:
    radial-gradient(1200px 600px at 15% -10%, rgb(37 45 90 / .30), transparent 60%),
    radial-gradient(900px 500px at 92% 0%, rgb(90 26 40 / .22), transparent 55%),
    rgb(var(--canvas));
  color:rgb(var(--text));
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  letter-spacing:-.011em;
  -webkit-font-smoothing:antialiased;
  min-height:100vh;
}
.tnum{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.wrap{max-width:1240px;margin:0 auto;padding:0 22px}

/* masthead */
.top{
  border-bottom:1px solid rgb(var(--border));
  background:linear-gradient(180deg,rgb(18 26 46 / .92),rgb(11 16 29 / .82));
  backdrop-filter:blur(8px);
}
.topin{display:flex;align-items:center;gap:26px;height:60px}
.mark{display:flex;align-items:baseline;gap:7px;font-size:17px;font-weight:800;letter-spacing:-.03em}
.mark .a{color:rgb(var(--text))}
.mark .b{color:rgb(var(--brand))}
.tabs{display:flex;gap:22px;margin-left:8px}
.tab{font-size:13.5px;font-weight:500;color:rgb(var(--muted));padding:19px 0;position:relative}
.tab.on{color:rgb(var(--text));font-weight:650}
.tab.on:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:rgb(var(--brand));border-radius:2px 2px 0 0}
.spacer{flex:1}
.updated{
  display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:600;
  color:rgb(var(--muted));background:rgb(var(--surface-2));
  border:1px solid rgb(var(--border));border-radius:8px;padding:6px 10px;
}
.dot{width:6px;height:6px;border-radius:99px;background:rgb(var(--good));box-shadow:0 0 0 3px rgb(74 222 128 / .16)}

/* filter bar */
.filters{display:flex;align-items:center;gap:8px;margin:20px 0 14px}
.flabel{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgb(var(--faint));margin-right:2px}
.pill{
  border:1px solid rgb(var(--border));background:rgb(var(--surface));
  color:rgb(var(--muted));border-radius:8px;padding:6px 11px;font-size:12px;font-weight:600;
}
.pill.on{background:rgb(var(--text));border-color:rgb(var(--text));color:rgb(var(--canvas))}
.count{margin-left:auto;font-size:12px;color:rgb(var(--muted))}
.foot{padding:26px 0 40px;font-size:11.5px;color:rgb(var(--faint));text-align:center}
`;

const clsColor = (c: string) => `rgb(var(--c-${c}))`;
const clsTint = (c: string, a: number) => `rgb(var(--c-${c}) / ${a})`;
const sgn = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));
const tone = (n: number) =>
  n > 0.5 ? "rgb(var(--good))" : n < -0.5 ? "rgb(var(--bad))" : "rgb(var(--muted))";

function shell(title: string, blurb: string, css: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<style>${TOKENS}${css}</style></head>
<body>
<header class="top"><div class="wrap topin">
  <div class="mark"><span class="a">ALPREPS</span><span class="b">INDEX</span></div>
  <nav class="tabs">
    <span class="tab on">Power Index</span><span class="tab">Teams</span><span class="tab">Schedule</span>
  </nav>
  <div class="spacer"></div>
  <div class="updated"><span class="dot"></span>Updated Dec 5, 2025 · 11:42 PM</div>
</div></header>
<main class="wrap">
  <div class="filters">
    <span class="flabel">Class</span>
    <button class="pill on">All</button>
    ${CLS.map((c) => `<button class="pill">${c}</button>`).join("")}
    <span class="count">387 teams</span>
  </div>
  ${body}
  <div class="foot">${blurb}</div>
</main></body></html>`;
}

// ---- variant 1: Ledger ----------------------------------------------------

const ledgerCss = `
.board{border:1px solid rgb(var(--border));border-radius:14px;overflow:hidden;background:rgb(var(--surface))}
.bhead{
  display:grid;grid-template-columns:56px minmax(0,1fr) 84px 78px 78px 78px 74px 74px 128px;
  gap:10px;padding:10px 16px;background:rgb(var(--surface-2));
  border-bottom:1px solid rgb(var(--border));
  font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgb(var(--faint));
}
.bhead span:not(:nth-child(2)){text-align:right}
.bhead span:nth-child(1){text-align:center}
.bhead span:nth-child(3){text-align:center}
.grp{
  display:flex;align-items:center;gap:10px;padding:9px 16px;
  background:linear-gradient(90deg,rgb(244 63 63 / .12),transparent 70%);
  border-bottom:1px solid rgb(var(--border));
  font-size:10.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:rgb(var(--brand));
}
.grp.rest{background:rgb(var(--surface-2));color:rgb(var(--faint))}
.row{
  display:grid;grid-template-columns:56px minmax(0,1fr) 84px 78px 78px 78px 74px 74px 128px;
  gap:10px;align-items:center;padding:11px 16px;
  border-bottom:1px solid rgb(var(--border) / .7);position:relative;
}
.row:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--bar)}
.row.top{background:linear-gradient(90deg,rgb(244 63 63 / .045),transparent 55%)}
.rk{text-align:center;font-size:14px;font-weight:800;color:rgb(var(--faint))}
.row.top .rk{color:rgb(var(--brand))}
.nm{font-size:16.5px;font-weight:700;letter-spacing:-.02em;line-height:1.15}
.sub{margin-top:2px;font-size:11px;color:rgb(var(--faint));display:flex;gap:6px;align-items:center}
.ctag{font-weight:800;font-size:10.5px;letter-spacing:.03em}
.rec{text-align:center;font-size:13px;font-weight:650;color:rgb(var(--muted))}
.st{text-align:right;font-size:13px;font-weight:650}
.st i{font-style:normal;font-size:9.5px;font-weight:700;color:rgb(var(--brand) / .8);margin-left:3px}
.rt{text-align:right}
.rtv{font-size:19px;font-weight:800;letter-spacing:-.03em;color:rgb(var(--good))}
.bar{height:3px;border-radius:99px;background:rgb(var(--surface-3));margin-top:5px;overflow:hidden}
.bar span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,rgb(var(--good) / .5),rgb(var(--good)))}
`;

function ledgerRow(r: Row, top: boolean) {
  return `<div class="row${top ? " top" : ""}" style="--bar:${clsTint(r.cls, 0.85)}">
    <div class="rk tnum">${r.rank}</div>
    <div>
      <div class="nm">${r.name}</div>
      <div class="sub"><span class="ctag" style="color:${clsColor(r.cls)}">${r.cls}</span>· Region ${r.region}</div>
    </div>
    <div class="rec tnum">${r.w}–${r.l}</div>
    <div class="st tnum">${r.sos.toFixed(1)}<i>#${R.sos.get(r.name)}</i></div>
    <div class="st tnum" style="color:${tone(r.oEff)}">${sgn(r.oEff)}<i>#${R.oEff.get(r.name)}</i></div>
    <div class="st tnum" style="color:${tone(r.dEff)}">${sgn(r.dEff)}<i>#${R.dEff.get(r.name)}</i></div>
    <div class="st tnum">${r.ppg.toFixed(1)}</div>
    <div class="st tnum">${r.papg.toFixed(1)}</div>
    <div class="rt">
      <div class="rtv tnum">${r.rating.toFixed(1)}</div>
      <div class="bar"><span style="width:${(r.rating / maxRating) * 100}%"></span></div>
    </div>
  </div>`;
}

const ledger = shell(
  "ALPreps Index — Ledger",
  "Variant 1 · Ledger — sample board built from the real 2025 final ratings.",
  ledgerCss,
  `<div class="board">
    <div class="bhead"><span>#</span><span>Team</span><span>Record</span><span>SOS</span>
      <span>O-Eff</span><span>D-Eff</span><span>PF/G</span><span>PA/G</span><span>Index Rating</span></div>
    <div class="grp">Top 25</div>
    ${shown.slice(0, 12).map((r) => ledgerRow(r, true)).join("")}
    ${shown.slice(12).map((r) => ledgerRow(r, true)).join("")}
  </div>`,
);

// ---- variant 2: Cards -----------------------------------------------------

const cardsCss = `
.list{display:flex;flex-direction:column;gap:8px}
.card{
  display:grid;grid-template-columns:60px minmax(0,1fr) auto 150px;gap:18px;align-items:center;
  background:linear-gradient(180deg,rgb(var(--surface-2)),rgb(var(--surface)));
  border:1px solid rgb(var(--border));border-left:4px solid var(--bar);
  border-radius:13px;padding:14px 16px;
}
.card.top{
  border-color:rgb(var(--border-strong));border-left-color:var(--bar);
  background:linear-gradient(100deg,rgb(244 63 63 / .07),rgb(var(--surface-2)) 42%,rgb(var(--surface)));
  box-shadow:0 1px 0 rgb(255 255 255 / .03) inset, 0 10px 26px -20px rgb(0 0 0 / .9);
}
.rk{font-size:30px;font-weight:800;letter-spacing:-.05em;color:rgb(var(--faint));text-align:center;line-height:1}
.card.top .rk{color:rgb(var(--brand))}
.nm{font-size:21px;font-weight:750;letter-spacing:-.03em;line-height:1.1}
.meta{margin-top:5px;display:flex;align-items:center;gap:8px;font-size:11.5px;color:rgb(var(--faint))}
.chip{
  border-radius:6px;padding:2px 7px;font-size:10.5px;font-weight:800;letter-spacing:.04em;
}
.recb{font-weight:700;color:rgb(var(--muted));font-size:12px}
.stats{display:flex;gap:7px}
.sc{
  min-width:66px;background:rgb(var(--canvas-2));border:1px solid rgb(var(--border));
  border-radius:9px;padding:7px 9px;text-align:right;
}
.sc b{display:block;font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgb(var(--faint));margin-bottom:3px;text-align:left}
.sc u{text-decoration:none;font-size:14px;font-weight:750}
.sc i{font-style:normal;font-size:9.5px;font-weight:700;color:rgb(var(--brand) / .75);margin-left:3px}
.rtbox{
  background:linear-gradient(160deg,rgb(74 222 128 / .13),rgb(74 222 128 / .04));
  border:1px solid rgb(74 222 128 / .22);border-radius:11px;padding:10px 13px;text-align:right;
}
.rtl{font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgb(var(--good) / .8)}
.rtv{font-size:26px;font-weight:800;letter-spacing:-.04em;color:rgb(var(--good));line-height:1.05;margin-top:1px}
.bar{height:3px;border-radius:99px;background:rgb(255 255 255 / .07);margin-top:7px;overflow:hidden}
.bar span{display:block;height:100%;background:rgb(var(--good) / .85);border-radius:99px}
`;

function card(r: Row, top: boolean) {
  const sc = (label: string, val: string, rank?: number, color?: string) =>
    `<div class="sc"><b>${label}</b><u class="tnum"${color ? ` style="color:${color}"` : ""}>${val}</u>${
      rank ? `<i>#${rank}</i>` : ""
    }</div>`;
  return `<div class="card${top ? " top" : ""}" style="--bar:${clsColor(r.cls)}">
    <div class="rk tnum">${r.rank}</div>
    <div>
      <div class="nm">${r.name}</div>
      <div class="meta">
        <span class="chip" style="background:${clsTint(r.cls, 0.14)};color:${clsColor(r.cls)}">${r.cls}</span>
        <span>Region ${r.region}</span><span>·</span><span class="recb tnum">${r.w}–${r.l}</span>
      </div>
    </div>
    <div class="stats">
      ${sc("SOS", r.sos.toFixed(1), R.sos.get(r.name))}
      ${sc("O-Eff", sgn(r.oEff), R.oEff.get(r.name), tone(r.oEff))}
      ${sc("D-Eff", sgn(r.dEff), R.dEff.get(r.name), tone(r.dEff))}
      ${sc("PF/G", r.ppg.toFixed(1))}
      ${sc("PA/G", r.papg.toFixed(1))}
    </div>
    <div class="rtbox">
      <div class="rtl">Index Rating</div>
      <div class="rtv tnum">${r.rating.toFixed(1)}</div>
      <div class="bar"><span style="width:${(r.rating / maxRating) * 100}%"></span></div>
    </div>
  </div>`;
}

const cards = shell(
  "ALPreps Index — Cards",
  "Variant 2 · Cards — sample board built from the real 2025 final ratings.",
  cardsCss,
  `<div class="list">${shown.slice(0, 9).map((r) => card(r, true)).join("")}</div>`,
);

// ---- variant 3: Split -----------------------------------------------------

const splitCss = `
.hero{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px}
.hc{
  position:relative;overflow:hidden;border-radius:15px;padding:17px 18px 15px;
  background:linear-gradient(155deg,var(--tint),rgb(var(--surface)) 55%);
  border:1px solid rgb(var(--border-strong));
}
.hc:before{content:"";position:absolute;inset:0 0 auto 0;height:3px;background:var(--bar)}
.hrk{
  display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;
  border-radius:8px;background:var(--bar);color:rgb(8 12 22);
  font-size:13px;font-weight:800;
}
.hnm{margin-top:11px;font-size:25px;font-weight:780;letter-spacing:-.035em;line-height:1.05}
.hmeta{margin-top:6px;font-size:11.5px;color:rgb(var(--muted));display:flex;gap:7px;align-items:center}
.hrt{display:flex;align-items:flex-end;justify-content:space-between;margin-top:15px;padding-top:13px;border-top:1px solid rgb(var(--border))}
.hrtv{font-size:32px;font-weight:820;letter-spacing:-.045em;color:rgb(var(--good));line-height:1}
.hrtl{font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgb(var(--faint))}
.hst{text-align:right;font-size:11px;color:rgb(var(--muted));line-height:1.6}
.hst b{color:rgb(var(--text));font-weight:700}
.sect{display:flex;align-items:center;gap:11px;margin:0 0 10px}
.sect h2{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:rgb(var(--faint))}
.sect .ln{flex:1;height:1px;background:rgb(var(--border))}
.board{border:1px solid rgb(var(--border));border-radius:13px;overflow:hidden;background:rgb(var(--surface))}
.bhead{
  display:grid;grid-template-columns:48px minmax(0,1fr) 74px 72px 72px 72px 104px;
  gap:10px;padding:9px 15px;background:rgb(var(--surface-2));
  border-bottom:1px solid rgb(var(--border));
  font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgb(var(--faint));
}
.bhead span{text-align:right}
.bhead span:nth-child(1){text-align:center}
.bhead span:nth-child(2){text-align:left}
.row{
  display:grid;grid-template-columns:48px minmax(0,1fr) 74px 72px 72px 72px 104px;
  gap:10px;align-items:center;padding:10px 15px;border-bottom:1px solid rgb(var(--border) / .7);
  position:relative;
}
.row:last-child{border-bottom:0}
.row:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--bar)}
.row.top{background:rgb(244 63 63 / .04)}
.rk{text-align:center;font-size:13.5px;font-weight:800;color:rgb(var(--faint))}
.row.top .rk{color:rgb(var(--brand))}
.nm{font-size:15.5px;font-weight:700;letter-spacing:-.02em}
.sub{margin-top:1px;font-size:10.5px;color:rgb(var(--faint))}
.ctag{font-weight:800}
.st{text-align:right;font-size:12.5px;font-weight:650}
.st i{font-style:normal;font-size:9px;font-weight:700;color:rgb(var(--brand) / .75);margin-left:3px}
.rtv{text-align:right;font-size:17px;font-weight:800;letter-spacing:-.03em;color:rgb(var(--good))}
`;

function heroCard(r: Row) {
  return `<div class="hc" style="--bar:${clsColor(r.cls)};--tint:${clsTint(r.cls, 0.13)}">
    <span class="hrk">${r.rank}</span>
    <div class="hnm">${r.name}</div>
    <div class="hmeta"><span style="color:${clsColor(r.cls)};font-weight:800">${r.cls}</span>
      <span>Region ${r.region}</span><span>·</span><span class="tnum">${r.w}–${r.l}</span></div>
    <div class="hrt">
      <div><div class="hrtl">Index Rating</div><div class="hrtv tnum">${r.rating.toFixed(1)}</div></div>
      <div class="hst tnum">SOS <b>${r.sos.toFixed(1)}</b><br>${r.ppg.toFixed(1)} / ${r.papg.toFixed(1)} PF·PA</div>
    </div>
  </div>`;
}

function splitRow(r: Row, top: boolean) {
  return `<div class="row${top ? " top" : ""}" style="--bar:${clsTint(r.cls, 0.8)}">
    <div class="rk tnum">${r.rank}</div>
    <div><div class="nm">${r.name}</div>
      <div class="sub"><span class="ctag" style="color:${clsColor(r.cls)}">${r.cls}</span> · Region ${r.region} · ${r.w}–${r.l}</div></div>
    <div class="st tnum">${r.sos.toFixed(1)}<i>#${R.sos.get(r.name)}</i></div>
    <div class="st tnum" style="color:${tone(r.oEff)}">${sgn(r.oEff)}</div>
    <div class="st tnum" style="color:${tone(r.dEff)}">${sgn(r.dEff)}</div>
    <div class="st tnum">${r.ppg.toFixed(1)}</div>
    <div class="rtv tnum">${r.rating.toFixed(1)}</div>
  </div>`;
}

const split = shell(
  "ALPreps Index — Split",
  "Variant 3 · Split — sample board built from the real 2025 final ratings.",
  splitCss,
  `<div class="hero">${rows.slice(0, 3).map(heroCard).join("")}</div>
   <div class="sect"><h2>Top 25</h2><span class="ln"></span></div>
   <div class="board">
     <div class="bhead"><span>#</span><span>Team</span><span>SOS</span><span>O-Eff</span>
       <span>D-Eff</span><span>PF/G</span><span>Rating</span></div>
     ${rows.slice(3, 14).map((r) => splitRow(r, true)).join("")}
   </div>`,
);

mkdirSync("scripts/out", { recursive: true });
for (const [name, html] of [
  ["ledger", ledger],
  ["cards", cards],
  ["split", split],
] as const) {
  writeFileSync(`scripts/out/variant-${name}.html`, html);
  console.log(`  scripts/out/variant-${name}.html`);
}
