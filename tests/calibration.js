/* ============================================================
   מדידת כיול המודל מול תוצאות אמת — out-of-sample
   הרצה: node tests/calibration.js
   ------------------------------------------------------------
   לכל משחק שהסתיים, בונים את תחזית המודל *כפי שהייתה לפני המשחק*
   (asOf = תאריך המשחק — לא לומד מעצמו), ומשווים להסתברות בפועל.
   מדדים: Brier score (כמה ריבוע השגיאה) ו-log-loss (קנס על ביטחון
   שגוי). נמוך יותר = טוב יותר. כולל baseline נאיבי להשוואה.
   ============================================================ */
global.DATA = require("../js/data.js");
const MODEL = require("../js/model.js");
const DATA = global.DATA;

function asOfDate(a, b) {
  const fx = (DATA.schedule || []).find(
    (x) => (x.h === a && x.a === b) || (x.h === b && x.a === a));
  return fx ? fx.d : null;
}
function oriented(a, b) {
  for (const r of DATA.results) {
    if (r.home === a && r.away === b) return { hg: r.hg, ag: r.ag, ht: r.htHg != null ? [r.htHg, r.htAg] : null, fs: r.firstScorer };
    if (r.home === b && r.away === a) return { hg: r.ag, ag: r.hg, ht: r.htHg != null ? [r.htAg, r.htHg] : null, fs: r.firstScorer === "H" ? "A" : r.firstScorer === "A" ? "H" : r.firstScorer };
  }
  return null;
}

// אוסף תחזיות (p) מול תוצאות (y∈{0,1}) על פני כל המשחקים שהסתיימו
const samples = [];        // { market, p, y }
const add = (market, p, y) => samples.push({ market, p, y });

for (const fx of DATA.schedule) {
  const res = oriented(fx.h, fx.a);
  if (!res) continue;
  const asOf = asOfDate(fx.h, fx.a);           // out-of-sample: לפני המשחק
  const A = DATA.teams[fx.h], B = DATA.teams[fx.a];
  const m = MODEL.markets(A, B, asOf);
  const tot = res.hg + res.ag;
  // 1X2
  add("1", m.p1, res.hg > res.ag ? 1 : 0);
  add("X", m.px, res.hg === res.ag ? 1 : 0);
  add("2", m.p2, res.hg < res.ag ? 1 : 0);
  // שערים
  add("O25", m.over25, tot > 2.5 ? 1 : 0);
  add("U25", m.under25, tot < 2.5 ? 1 : 0);
  add("BTTS", m.btts, res.hg > 0 && res.ag > 0 ? 1 : 0);
  add("O15", m.over15, tot > 1.5 ? 1 : 0);
}

function metrics(rows) {
  let brier = 0, logloss = 0;
  const eps = 1e-9;
  for (const r of rows) {
    brier += (r.p - r.y) ** 2;
    const p = Math.min(1 - eps, Math.max(eps, r.p));
    logloss += -(r.y * Math.log(p) + (1 - r.y) * Math.log(1 - p));
  }
  return { n: rows.length, brier: brier / rows.length, logloss: logloss / rows.length };
}

// baseline נאיבי: תמיד מנבא את שכיחות הבסיס של השוק (לא תלוי-משחק)
function baseline(rows) {
  const base = rows.reduce((s, r) => s + r.y, 0) / rows.length;
  return metrics(rows.map((r) => ({ ...r, p: base })));
}

console.log("📊 כיול המודל — out-of-sample (תחזית לפני כל משחק מול התוצאה)\n");
const byMarket = {};
for (const s of samples) (byMarket[s.market] = byMarket[s.market] || []).push(s);

console.log("שוק   |  n  | Brier(מודל) | Brier(בסיס) | LogLoss(מודל)");
console.log("------|-----|-------------|-------------|-------------");
for (const mk of Object.keys(byMarket)) {
  const mm = metrics(byMarket[mk]), bb = baseline(byMarket[mk]);
  const better = mm.brier <= bb.brier ? "✅" : "⚠️";
  console.log(
    `${mk.padEnd(5)} | ${String(mm.n).padStart(3)} | ${mm.brier.toFixed(4).padStart(11)} | ${bb.brier.toFixed(4).padStart(11)} | ${mm.logloss.toFixed(4).padStart(11)} ${better}`);
}
const all = metrics(samples), allBase = baseline(samples);
console.log("------|-----|-------------|-------------|-------------");
console.log(`כולל  | ${String(all.n).padStart(3)} | ${all.brier.toFixed(4).padStart(11)} | ${allBase.brier.toFixed(4).padStart(11)} | ${all.logloss.toFixed(4).padStart(11)}`);
console.log(`\n${all.brier <= allBase.brier ? "✅ המודל מנצח את ה-baseline הנאיבי" : "⚠️ המודל לא עדיף על baseline — דורש כיול"}`);
console.log("(Brier: 0=מושלם, 0.25=הטלת מטבע. נמוך יותר = טוב יותר.)");
