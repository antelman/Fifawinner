/* ============================================================
   FifaWinner — ממשק משתמש
   ============================================================ */

/* אחסון עמיד: בסביבות sandbox (תצוגה מקדימה בנייד, iframe) localStorage חסום
   וזריקת SecurityError הפילה את כל האפליקציה — נופלים לאחסון בזיכרון */
const STORE = (() => {
  try {
    localStorage.setItem("__fw_t", "1");
    localStorage.removeItem("__fw_t");
    return localStorage;
  } catch (e) {
    const mem = {};
    return { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  }
})();

let SIM = null;   // תוצאות סימולציית בתים
let KO = null;    // תוצאות סימולציית אלוף
let ODDS = JSON.parse(STORE.getItem("fw_odds") || "{}");
// סוגריים הנוק-אאוט — ממולאים בממשק בסוף שלב הבתים (27.6)
let BRACKET = JSON.parse(STORE.getItem("fw_bracket") || "null")
  || { r32: Array.from({ length: 16 }, () => [null, null]), winners: {} };
let selKoMatch = null;
let activeTab = "recs";
let selGroup = "A";
let selFixture = null;

const $ = (sel) => document.querySelector(sel);
const pct = (p) => (p * 100).toFixed(p >= 0.1 ? 0 : 1) + "%";
const pct1 = (p) => (p * 100).toFixed(1) + "%";
const odds = (x) => x === Infinity ? "—" : x.toFixed(2);
const T = (id) => DATA.teams[id];
// דגל נבחרת כתמונה מ-flagcdn (לפי קוד ISO); fallback לאימוג'י אם אין iso.
// alt = אימוג'י הדגל, כך שגם אם התמונה לא נטענת מוצג סימן סביר.
const flag = (id) => {
  const t = T(id);
  return t.iso
    ? `<img class="flag" src="https://flagcdn.com/h20/${t.iso}.png" srcset="https://flagcdn.com/h40/${t.iso}.png 2x" width="27" height="20" alt="${t.flag}" loading="lazy">`
    : t.flag;
};
const tn = (id) => `${flag(id)} ${T(id).nameHe}`;
const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);
// תאריך YYYY-MM-DD → D.M.YYYY (ללא אפסים מובילים); מחזיר "" אם אין/לא תקין
const fmtDate = (iso) => {
  const p = (iso || "").split("-");
  return p.length === 3 ? `${+p[2]}.${+p[1]}.${p[0]}` : "";
};

function saveOdds() { STORE.setItem("fw_odds", JSON.stringify(ODDS)); }
function saveBracket() { STORE.setItem("fw_bracket", JSON.stringify(BRACKET)); }

function playedSet() {
  const s = new Set();
  for (const r of DATA.results) { s.add(r.home + "|" + r.away); s.add(r.away + "|" + r.home); }
  return s;
}
function resultOf(a, b) {
  for (const r of DATA.results) {
    if (r.home === a && r.away === b) return `${r.hg}–${r.ag}`;
    if (r.home === b && r.away === a) return `${r.ag}–${r.hg}`;
  }
  return null;
}
// טבלת בית מתוצאות אמת בלבד — מתעדכנת אוטומטית לפי DATA.results
function groupStandings(groupId) {
  const table = {};
  for (const id of DATA.groups[groupId]) {
    table[id] = { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  }
  for (const r of DATA.results) {
    if (!(r.home in table) || !(r.away in table)) continue;
    const home = table[r.home], away = table[r.away];
    home.p++; away.p++;
    home.gf += r.hg; home.ga += r.ag;
    away.gf += r.ag; away.ga += r.hg;
    if (r.hg > r.ag) { home.w++; home.pts += 3; away.l++; }
    else if (r.hg < r.ag) { away.w++; away.pts += 3; home.l++; }
    else { home.d++; away.d++; home.pts++; away.pts++; }
  }
  for (const id in table) table[id].gd = table[id].gf - table[id].ga;
  // מיון: נקודות, הפרש שערים, שערי זכות (כללי FIFA), ואז שם לדטרמיניזם
  return Object.values(table).sort((x, y) =>
    y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || (x.id < y.id ? -1 : 1));
}

// תוצאה מכוונת לפי סדר הפיקסצ'ר (a=בית, b=חוץ) — לשיפוט שווקים.
// כולל נתוני-על מכוונים: תוצאת מחצית (htHg/htAg) ומבקיע ראשון (firstScorer).
// אם השורה ב-DATA.results בכיוון ההפוך — מחליפים בית↔חוץ בכל הנתונים.
function orientedResult(a, b) {
  for (const r of DATA.results) {
    if (r.home === a && r.away === b)
      return { hg: r.hg, ag: r.ag, htHg: r.htHg, htAg: r.htAg, firstScorer: r.firstScorer };
    if (r.home === b && r.away === a)
      return {
        hg: r.ag, ag: r.hg, htHg: r.htAg, htAg: r.htHg,
        firstScorer: r.firstScorer === "H" ? "A" : r.firstScorer === "A" ? "H" : r.firstScorer
      };
  }
  return null;
}
// שיפוט מפתח-יחס (key = "ABC-DEF:suffix") מול התוצאה. null אם אין/לא ניתן.
function gradeKey(key) {
  const idx = key.indexOf(":");
  if (idx < 0) return null;
  const fix = key.slice(0, idx).split("-"), suffix = key.slice(idx + 1);
  if (fix.length !== 2) return null;
  const res = orientedResult(fix[0], fix[1]);
  if (!res) return null;
  return MODEL.gradeMarket(suffix, res.hg, res.ag, res);
}
function verdictBadge(hit) {
  if (hit === true) return `<span class="pill verdict-hit">✓ פגעה</span>`;
  if (hit === false) return `<span class="pill verdict-miss">✗ החטיאה</span>`;
  return "";
}
// שמות בעברית למשפחות השווקים — לתצוגת הפילוח
const FAMILY_LABELS = {
  result: "תוצאה (1X2 / הנדיקאפ / העפלה)",
  goals: "שערים (מעל/מתחת · שתיהן מבקיעות)",
  halves: "מחציות (מבקיעה ראשונה · יתרון במחצית)",
};
// מאזן ההמלצות: כל ה-top-picks של משחקים שהסתיימו, כולל פילוח לפי משפחת שוק
function trackRecord() {
  let hit = 0, miss = 0;
  const byFamily = {};   // family → { hit, miss }
  for (const fx of DATA.schedule) {
    if (!orientedResult(fx.h, fx.a)) continue;
    for (const p of matchTopPicks(fx.h, fx.a, false)) {
      const g = gradeKey(p.key);
      if (g !== true && g !== false) continue;
      const f = byFamily[p.family] || (byFamily[p.family] = { hit: 0, miss: 0 });
      if (g === true) { hit++; f.hit++; } else { miss++; f.miss++; }
    }
  }
  // פילוח ממוין מהמדויק לפחות מדויק (רק משפחות עם משחקים שנשפטו)
  const breakdown = Object.entries(byFamily)
    .map(([family, s]) => ({
      family,
      label: FAMILY_LABELS[family] || family,
      hit: s.hit, miss: s.miss, total: s.hit + s.miss,
      pct: Math.round(s.hit / (s.hit + s.miss) * 100),
    }))
    .sort((a, b) => b.pct - a.pct);
  return { hit, miss, total: hit + miss, breakdown };
}

// פילוח אחוז ההצלחה לפי סוג הימור — מראה במה אנחנו חזקים יותר
function trackBreakdownHtml(breakdown) {
  if (!breakdown || breakdown.length < 2) return "";
  const rows = breakdown.map(b => `
    <div class="bd-row">
      <div class="bd-head">
        <span class="bd-label">${b.label}</span>
        <span class="bd-pct ${b.pct >= 50 ? "good" : "bad"}">${b.pct}%</span>
      </div>
      <div class="bd-bar"><i class="${b.pct >= 50 ? "good" : "bad"}" style="width:${b.pct}%"></i></div>
      <div class="note bd-count">${b.hit} פגעו · ${b.miss} החטיאו (${b.total} נשפטו)</div>
    </div>`).join("");
  return `<div class="card track-breakdown">
    <h3>📊 באיזה הימור אנחנו מדויקים יותר?</h3>
    <p class="note">פילוח אחוז הפגיעה לפי סוג ההימור — ככל שהאחוז גבוה יותר, ההמלצות בקטגוריה הזו אמינות יותר.</p>
    ${rows}
  </div>`;
}

/* ---------- כיול לפי משפחת שווקים (calibration) ----------
   לומדים מתוך הביצועים בפועל: איזו משפחת שווקים (תוצאה/שערים/מחציות)
   באמת פוגעת ומחטיאה, ומטים את דירוג ההמלצות בהתאם. מחקרים מראים
   שבחירה לפי כיול עדיפה על בחירה לפי דיוק גולמי.
   החלקה בייסיאנית (פריור 60% עם משקל 4) כדי שמדגם קטן לא יקפיץ.   */
const CALIB_PRIOR = 0.60;     // שיעור פגיעה מצופה לפני נתונים
const CALIB_WEIGHT = 4;       // עוצמת הפריור (כמשחקים וירטואליים)
let _calib = null;

// מחשב hit-rate מוחלק לכל משפחה, ללא קריאה ל-matchTopPicks (מונע רקורסיה)
function familyCalibration() {
  if (_calib) return _calib;
  const acc = {};   // family → {hit, miss}
  for (const fx of DATA.schedule) {
    if (!orientedResult(fx.h, fx.a)) continue;
    for (const x of buildMatchCandidates(fx.h, fx.a, false)) {
      // רק מועמדים בטווח ההמלצות הממשי — אלו ש"היו על השולחן"
      if (x.p < 0.33 || x.p > 0.88) continue;
      const g = gradeKey(x.key);
      if (g === null) continue;
      const f = acc[x.family] || (acc[x.family] = { hit: 0, miss: 0 });
      if (g === true) f.hit++; else f.miss++;
    }
  }
  const rate = {};
  for (const fam in acc) {
    const { hit, miss } = acc[fam];
    rate[fam] = (hit + CALIB_PRIOR * CALIB_WEIGHT) / (hit + miss + CALIB_WEIGHT);
  }
  _calib = rate;
  return rate;
}

// מכפיל דירוג עדין למשפחה: 1.0 בנייטרל, ±~15% בקצוות (סביב הפריור)
function familyBoost(family) {
  const r = familyCalibration()[family];
  if (r == null) return 1;
  return 1 + (r - CALIB_PRIOR) * 0.8;   // 0.8 = רגישות מתונה
}

/* ---------- אתחול ---------- */
// כל שגיאה — על המסך במקום תקיעה שקטה על מסך הטעינה
window.addEventListener("error", (e) => {
  const el = document.querySelector("#content");
  if (el && !SIM) el.innerHTML =
    `<div class="card"><h3>😕 שגיאה בטעינה</h3><p class="note">${e.message || e.type}</p>
     <p class="note">נסו לפתוח את הקובץ בדפדפן מלא (Safari/Chrome) דרך כפתור השיתוף.</p></div>`;
});

document.addEventListener("DOMContentLoaded", () => {
  // תאריך עדכון הנתונים בפוטר — דינמי מ-DATA.meta.updated
  const _ddEl = document.getElementById("dataDate");
  const _dd = fmtDate(DATA.meta.updated);
  if (_ddEl && _dd) _ddEl.textContent = _dd;
  document.querySelectorAll(".tab-btn").forEach(btn =>
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTab = btn.dataset.tab;
      render();
    }));
  setTimeout(() => {
    SIM = MODEL.simulateGroups(20000);
    KO = MODEL.simulateChampion(6000);
    render();
  }, 50);
});

function render() {
  if (!SIM) return;
  const el = $("#content");
  if (activeTab === "recs") el.innerHTML = viewRecs();
  else if (activeTab === "matches") el.innerHTML = viewMatches();
  else if (activeTab === "groups") el.innerHTML = viewGroups();
  else if (activeTab === "futures") el.innerHTML = viewFutures();
  else el.innerHTML = viewKO();
  bindEvents();
}

/* ============================================================
   המלצות
   ============================================================ */
function generateRecs() {
  const recs = [];
  const played = playedSet();

  for (const g of Object.keys(DATA.groups)) {
    for (const [a, b] of MODEL.groupFixtures(g)) {
      if (played.has(a + "|" + b)) continue;
      const m = MODEL.markets(T(a), T(b));
      const gap = MODEL.effElo(T(a)) - MODEL.effElo(T(b));
      // פילוח 1X2 מלא — מוצג תמיד בכרטיס ההמלצה, ללא קשר לבחירה
      const odds1x2 = { p1: m.p1, px: m.px, p2: m.p2,
        n1: `ניצחון ${tn(a)} (1)`, nx: "תיקו (X)", n2: `ניצחון ${tn(b)} (2)` };
      const base = { group: g, match: `${tn(a)} — ${tn(b)}`, odds1x2 };

      // המלצה חד-משמעית: התוצאה היחידה (1 / X / 2) שהמודל מעריך כסבירה ביותר.
      // בלי צ'אנס כפול — או ניצחון, או הפסד, או תיקו.
      const outcomes = [
        { p: m.p1, lbl: `ניצחון ${tn(a)} (1)`, k: "1",
          why: `הסיכוי הגבוה ביותר — פער ${Math.abs(gap)} נק' Elo לטובת ${T(a).nameHe}` },
        { p: m.px, lbl: "תיקו (X)", k: "X",
          why: "משחק צמוד — התיקו הוא התוצאה הסבירה ביותר" },
        { p: m.p2, lbl: `ניצחון ${tn(b)} (2)`, k: "2",
          why: `הסיכוי הגבוה ביותר — פער ${Math.abs(gap)} נק' Elo לטובת ${T(b).nameHe}` },
      ];
      const best = outcomes.sort((x, y) => y.p - x.p)[0];
      // תקרה 0.85: מעליה היחס ההוגן < ~1.18 — עמלת הווינר הופכת זאת להימור גרוע תמיד.
      // רף תחתון 0.40: התוצאה הסבירה ביותר חייבת להיות מספיק בולטת כדי להמליץ עליה.
      if (best.p >= 0.40 && best.p <= 0.85)
        recs.push({ ...base, market: "1X2", pick: best.lbl, p: best.p,
          conf: MODEL.confidence(best.p, gap), key: `${a}-${b}:${best.k}`,
          why: best.why });
      if (m.under25 >= 0.62)
        recs.push({ ...base, market: "שערים", pick: "מתחת 2.5 שערים", p: m.under25,
          conf: MODEL.confidence(m.under25, 0), key: `${a}-${b}:U25`,
          why: "שתי קבוצות עם פרופיל הגנתי/ניטרלי — תוחלת שערים נמוכה" });
      else if (m.over25 >= 0.60)
        recs.push({ ...base, market: "שערים", pick: "מעל 2.5 שערים", p: m.over25,
          conf: MODEL.confidence(m.over25, 0), key: `${a}-${b}:O25`,
          why: "תוחלת שערים גבוהה (פער כוח גדול או שתי התקפות חזקות)" });
    }
  }

  // עתידיים: זוכות בתים
  for (const g of Object.keys(DATA.groups)) {
    const best = DATA.groups[g].map(id => [id, SIM[id].pWinGroup]).sort((x, y) => y[1] - x[1])[0];
    if (best[1] >= 0.5 && best[1] <= 0.9)
      recs.push({ group: g, match: `בית ${g}`, market: "זוכת הבית", pick: tn(best[0]), p: best[1],
        conf: MODEL.confidence(best[1], 150), key: `WIN:${g}:${best[0]}`,
        why: `תוחלת ${SIM[best[0]].expPts.toFixed(1)} נק' — הפער מהשנייה משמעותי` });
  }

  // עתידיים: העפלה בטווח יחסים מעניין
  for (const g of Object.keys(DATA.groups)) {
    for (const id of DATA.groups[g]) {
      const p = SIM[id].pAdvance;
      if (p >= 0.72 && p <= 0.9)
        recs.push({ group: g, match: `בית ${g}`, market: "העפלה משלב הבתים", pick: tn(id), p,
          conf: MODEL.confidence(p, 100), key: `ADV:${id}`,
          why: `כולל מסלול מקום-3 (8 שלישיות עולות) — בטוח מכפי שהשוק נוטה לתמחר` });
    }
  }

  // נוק-אאוט: "מי יעפיל" לכל משחק שמולא בסוגריים וטרם הוכרע
  for (const [name, matches] of koRounds()) {
    for (const mt of matches) {
      if (!mt.a || !mt.b || BRACKET.winners[mt.id]) continue;
      const adv = MODEL.koAdvanceProb(mt.a, mt.b);
      const pick = adv >= 0.5 ? { id: mt.a, p: adv } : { id: mt.b, p: 1 - adv };
      const gap = MODEL.effElo(T(mt.a)) - MODEL.effElo(T(mt.b));
      if (pick.p >= 0.58 && pick.p <= 0.85)
        recs.push({ group: "🥊", match: `${KO_ROUND_NAMES[name]}: ${tn(mt.a)} — ${tn(mt.b)}`,
          market: "מי יעפיל", pick: tn(pick.id), p: pick.p,
          conf: MODEL.confidence(pick.p, gap),
          key: `${mt.a}-${mt.b}:${pick.id === mt.a ? "ADV1" : "ADV2"}`,
          why: "כולל הארכה ופנדלים — שוק נפרד מ-1X2 (שנסגר ב-90 דקות)" });
    }
  }

  // אלופה — שלוש מובילות המודל
  const champs = Object.keys(DATA.teams).map(id => [id, KO[id].pChampion])
    .sort((x, y) => y[1] - x[1]).slice(0, 3);
  for (const [id, p] of champs) {
    const mkt = DATA.meta.marketChampion[id];
    recs.push({ group: "🏆", match: "זוכת המונדיאל", market: "אלופה", pick: tn(id), p,
      conf: 2, key: `CHAMP:${id}`,
      why: mkt ? `המודל: ${pct1(p)} · השוק העולמי: ${pct1(mkt)}` : `המודל: ${pct1(p)}` });
  }

  for (const r of recs) {
    r.fair = MODEL.fairOdds(r.p);
    r.minOdds = MODEL.minWorthOdds(r.p);
    const userOdds = ODDS[r.key];
    if (userOdds) r.edge = MODEL.edge(r.p, userOdds);
  }
  recs.sort((x, y) => (y.edge ?? -9) - (x.edge ?? -9) || y.conf - x.conf || y.p - x.p);
  return recs;
}

/* פילוח 1/X/2 — מוצג תמיד ליד המלצת תוצאה, ללא קשר לבחירה.
   מסמן את התוצאה שעליה הומלץ (לפי סיומת המפתח). */
function odds1x2Html(o, key) {
  if (!o) return "";
  const picked = key ? key.slice(key.lastIndexOf(":") + 1) : "";
  const cell = (lbl, p, code) => `<span class="o1x2-cell${picked === code ? " picked" : ""}">
      <span class="o1x2-lbl">${lbl}</span><b>${pct(p)}</b></span>`;
  return `<div class="o1x2" title="הסתברות לכל תוצאה ב-90 דקות">
    ${cell("1", o.p1, "1")}${cell("X", o.px, "X")}${cell("2", o.p2, "2")}
  </div>`;
}

function recHtml(r) {
  const isVal = r.edge !== undefined && r.edge > 0;
  const edgeHtml = r.edge !== undefined
    ? (isVal
      ? `<span class="pill value-flag">VALUE +${(r.edge * 100).toFixed(1)}%</span>`
      : `<span class="pill">Edge ${(r.edge * 100).toFixed(1)}%</span>`)
    : "";
  return `<div class="rec${isVal ? " is-value" : ""}">
    <div class="badge"><b>${pct(r.p)}</b>${r.market}</div>
    <div class="what">
      <b>${r.pick}</b> <span class="pill">${r.match}</span> ${edgeHtml}
      <div class="why">${r.why} · ביטחון: <span class="stars">${stars(r.conf)}</span></div>
      ${odds1x2Html(r.odds1x2, r.key)}
    </div>
    <div class="nums">
      יחס הוגן: <b class="fair">${odds(r.fair)}</b><br>
      כדאי מ-: <b>${odds(r.minOdds)}</b><br>
      יחס ווינר: <input type="number" step="0.01" min="1" data-oddskey="${r.key}"
        value="${ODDS[r.key] || ""}" placeholder="הזן">
    </div>
  </div>`;
}

/* תאריך מקומי בפורמט YYYY-MM-DD */
function localISO(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 864e5).toLocaleDateString("en-CA");
}
function hebDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric" });
}

/* פילוח 1/X/2 ישירות ממודל המשחק — להצגה בכותרת כל כרטיס משחק */
function match1x2Html(a, b) {
  const m = MODEL.markets(T(a), T(b), matchAsOf(a, b));
  const o = { p1: m.p1, px: m.px, p2: m.p2 };
  // מסמן את התוצאה הסבירה ביותר
  const top = o.p1 >= o.px && o.p1 >= o.p2 ? "1" : o.px >= o.p2 ? "X" : "2";
  return odds1x2Html(o, `:${top}`);
}

/* כרטיס משחק יומי: כותרת + 3 ההמלצות שלו (פגע/החטיא אם הסתיים) */
function dayMatchCard(fx) {
  const res = resultOf(fx.h, fx.a);
  const head = `<h3>${tn(fx.h)} <span class="vs">נגד</span> ${tn(fx.a)}
    <span class="pill">בית ${fx.g}${fx.est ? " · תאריך משוער" : ""}</span>
    ${res ? `<span class="pill score-pill">הסתיים ${res}</span>` : ""}</h3>
    ${match1x2Html(fx.h, fx.a)}`;
  const picks = matchTopPicks(fx.h, fx.a, false);
  if (res) {
    // משחק שהסתיים: מציג את ההמלצות שניתנו עם פסיקת פגע/החטיא
    const rows = picks.map(p => {
      const g = gradeKey(p.key);
      return `<div class="settled-row ${g === true ? "ok" : g === false ? "bad" : ""}">
        <span>${p.label}</span> ${verdictBadge(g)}</div>`;
    }).join("");
    return `<div class="card finished">${head}
      <div class="settled-list">${rows}</div>
      <button class="tab-btn open-match" data-g="${fx.g}" data-h="${fx.h}" data-a="${fx.a}"
        style="padding:5px 14px;font-size:.85rem;margin-top:8px">📊 פירוט</button></div>`;
  }
  return `<div class="card">${head}
    ${picks.map(pickCard).join("")}
    <button class="tab-btn open-match" data-g="${fx.g}" data-h="${fx.h}" data-a="${fx.a}"
      style="padding:6px 16px;font-size:.9rem">📊 ניתוח מלא + כל השווקים</button>
  </div>`;
}

// לוח תוצאות אחרונות (עד 6 משחקים אחרונים שהסתיימו, לפי סדר הלוח)
function scoreboardHtml() {
  const finished = DATA.schedule.filter(fx => orientedResult(fx.h, fx.a));
  if (!finished.length) return "";
  const recent = finished.slice(-6).reverse();
  return `<div class="card scoreboard">
    <h3>📋 תוצאות אחרונות <span class="pill">${fmtDate(DATA.meta.updated)}</span></h3>
    <div class="score-grid">
      ${recent.map(fx => {
        const r = orientedResult(fx.h, fx.a);
        let h = 0, mm = 0, pending = 0;
        for (const p of matchTopPicks(fx.h, fx.a, false)) {
          const g = gradeKey(p.key);
          if (g === true) h++; else if (g === false) mm++; else pending++;
        }
        // "לא נשפט" = המלצה על שוק מחצית/מבקיע-ראשון שחסר לה נתון משלים
        const pendTxt = pending ? ` · ${pending} ממתינות לנתון` : "";
        const footer = (h + mm)
          ? `<div class="score-verdict ${h >= mm ? "good" : "bad"}">🎯 ${h} מתוך ${h + mm} המלצות פגעו${pendTxt}</div>`
          : (pending ? `<div class="score-verdict pending">🎯 ${pending} המלצות ממתינות לנתון משלים</div>` : "");
        return `<div class="score-item open-match" data-g="${fx.g}" data-h="${fx.h}" data-a="${fx.a}">
          <div class="score-line">
            <span>${flag(fx.h)} <span class="team-name">${T(fx.h).nameHe}</span></span>
            <b>${r.hg} – ${r.ag}</b>
            <span><span class="team-name">${T(fx.a).nameHe}</span> ${flag(fx.a)}</span>
          </div>
          ${footer}</div>`;
      }).join("")}
    </div>
  </div>`;
}

function viewRecs() {
  const today = localISO(0), tomorrow = localISO(1);
  const todayFx = DATA.schedule.filter(m => m.d === today);
  const tomFx = DATA.schedule.filter(m => m.d === tomorrow);
  const daySection = (title, fxs) => fxs.length
    ? `<h2 style="margin:18px 0 10px">${title}</h2>${fxs.map(dayMatchCard).join("")}` : "";

  const recs = generateRecs();
  const valueRecs = recs.filter(r => r.edge !== undefined && r.edge > 0);
  // נבחרות כלליות: מגוונות, בלי משחקי היום/מחר (כבר מוצגים למעלה)
  const shown = new Set([...todayFx, ...tomFx].map(f => `${f.h}-${f.a}`));
  const top = [], seen = new Set();
  for (const r of recs) {
    if (valueRecs.includes(r)) continue;
    if (r.key && [...shown].some(s => r.key.startsWith(s + ":"))) continue;
    if (seen.has(r.group)) continue;
    seen.add(r.group);
    top.push(r);
    if (top.length === 5) break;
  }
  const rest = recs.filter(r => !valueRecs.includes(r) && !top.includes(r));
  const tr = trackRecord();
  const successPct = tr.total ? Math.round(tr.hit / tr.total * 100) : 0;
  const trBanner = tr.total
    ? `<div class="card track-banner">
        <div class="track-big ${successPct >= 50 ? "good" : "bad"}">${successPct}%</div>
        <div class="track-text">
          <h3>אחוז הצלחת ההמלצות</h3>
          <div class="track-sub"><b>${tr.hit}</b> מתוך <b>${tr.total}</b> ההמלצות החזקות פגעו${tr.miss ? ` · ${tr.miss} החטיאו` : ""}</div>
          <div class="note">מתעדכן אוטומטית לפי תוצאות המשחקים שהסתיימו</div>
        </div></div>
      ${trackBreakdownHtml(tr.breakdown)}`
    : "";
  return `
  ${trBanner}
  ${scoreboardHtml()}
  ${valueRecs.length ? `<div class="card value-band"><h3><span class="pulse-dot"></span>הימורי ערך מאומתים <span class="note" style="display:inline;font-weight:400">לפי היחסים שהזנת</span></h3>${valueRecs.map(recHtml).join("")}</div>` : ""}
  ${daySection("⚽ משחקי היום — " + hebDate(today), todayFx)}
  ${daySection("📅 משחקי מחר — " + hebDate(tomorrow), tomFx)}
  ${todayFx.length || tomFx.length ? "" : `<div class="card"><p class="note">אין משחקים היום או מחר בלוח.</p></div>`}
  <h2 style="margin:22px 0 10px">🎯 הזדמנויות נוספות מכל הטורניר</h2>
  <p class="note">"כדאי מ-" = היחס המינימלי בווינר שממנו יש ערך. גבוה ממנו — מהמרים; נמוך — מוותרים. הזנת יחס מחשבת Edge ומסמנת <span class="pill value-flag">VALUE</span>.</p>
  ${top.map(recHtml).join("")}
  <details style="margin-top:16px">
    <summary style="cursor:pointer;color:var(--gold);font-weight:700;padding:10px">📋 עוד ${rest.length} המלצות (כל הבתים, העפלות, אלופה...)</summary>
    ${rest.map(recHtml).join("")}
  </details>`;
}

/* ============================================================
   משחקים
   ============================================================ */
function viewMatches() {
  const groups = Object.keys(DATA.groups);
  const fixtures = DATA.schedule.filter(x => x.g === selGroup)
    .sort((x, y) => x.d.localeCompare(y.d)).map(x => [x.h, x.a, x.d]);
  let detail = "";
  if (selFixture) {
    const [a, b] = selFixture;
    detail = matchDetail(a, b);
  }
  return `
  <div class="select-row">
    <label>בית:&nbsp;<select id="group-sel">${groups.map(g =>
      `<option value="${g}" ${g === selGroup ? "selected" : ""}>בית ${g} — ${DATA.groups[g].map(id => T(id).nameHe).join(", ")}</option>`).join("")}
    </select></label>
  </div>
  <div class="fixture-list">
    ${fixtures.map(([a, b, d]) => {
      const res = resultOf(a, b);
      return `<div class="fixture" data-fix="${a}|${b}">
        <span>${tn(a)} <span class="vs">נגד</span> ${tn(b)} <span class="pill">${hebDate(d)}</span></span>
        <span class="${res ? "played" : "vs"}">${res ? "הסתיים " + res : "לחצו לניתוח ←"}</span>
      </div>`;
    }).join("")}
  </div>
  ${detail}`;
}

function oddsInputCell(key) {
  return `<td><input type="number" step="0.01" min="1" data-oddskey="${key}" value="${ODDS[key] || ""}" placeholder="—"></td>`;
}
function edgeCell(p, key) {
  const o = ODDS[key];
  if (!o) return "<td>—</td>";
  const e = MODEL.edge(p, o);
  return `<td class="${e > 0 ? "edge-pos" : "edge-neg"}">${e > 0 ? "+" : ""}${(e * 100).toFixed(1)}%</td>`;
}
// סימון ✓/✗ קטן לתא שם-שוק בטבלה (אם המשחק הסתיים והשוק ניתן לשיפוט)
function verdictMark(key) {
  const g = gradeKey(key);
  if (g === true) return `<span class="vmark ok">✓</span> `;
  if (g === false) return `<span class="vmark bad">✗</span> `;
  return "";
}

/* ---------- מועמדים לכל השווקים של משחק (להמלצות-צמרת) ---------- */
// תאריך משחק מהלוח — משמש כ-asOf אחיד: כל משחק נבנה תמיד מ-Elo כפי
// שהיה לפני תאריכו. משחק עתידי → כל התוצאות מוקדמות ממנו (= הלמידה המלאה);
// משחק שהסתיים → לא לומד מהתוצאה של עצמו (out-of-sample). כך אין שינוי רטרו.
function matchAsOf(a, b) {
  const fx = DATA.schedule.find(x =>
    (x.h === a && x.a === b) || (x.h === b && x.a === a));
  return fx ? fx.d : null;
}

function buildMatchCandidates(a, b, ko) {
  const asOf = matchAsOf(a, b);
  const m = MODEL.markets(T(a), T(b), asOf);
  const ex = MODEL.extendedMarkets(T(a), T(b), asOf);
  const k = (s) => `${a}-${b}:${s}`;
  const an = T(a).nameHe, bn = T(b).nameHe;
  const c = [
    { label: `ניצחון ${an} (1)`, p: m.p1, key: k("1"), family: "result", why: "תוצאת 90 דקות" },
    { label: `ניצחון ${bn} (2)`, p: m.p2, key: k("2"), family: "result", why: "תוצאת 90 דקות" },
    { label: "תיקו (X)", p: m.px, key: k("X"), family: "result", why: "תוצאת 90 דקות" },
    { label: `${an} בהפרש 2+ שערים (הנדיקאפ: יתרון 0:1 ל${bn})`, p: ex.hcapA_minus1.p1, key: k("H-1:1"), family: "result", why: `הנדיקאפ +1: ${an} מנצחת גם אחרי שמזכים את ${bn} בשער — ניצחון בהפרש 2+` },
    { label: `${an} בהפרש 3+ שערים (הנדיקאפ ווינר: יתרון 0:2 ל${bn})`, p: ex.hcapA_minus2.p1, key: k("H-2:1"), family: "result", why: `קו ה-+2 של ווינר: ${an} מנצחת גם אחרי שמזכים את ${bn} בשני שערים — ניצחון בהפרש 3+` },
    { label: `${an} מנצחת ביותר משער`, p: ex.winBy2A, key: k("WB2A"), family: "result", why: "ניצחון בהפרש 2+ שערים" },
    { label: `${bn} מנצחת ביותר משער`, p: ex.winBy2B, key: k("WB2B"), family: "result", why: "ניצחון בהפרש 2+ שערים" },
    { label: "מעל 2.5 שערים", p: m.over25, key: k("O25"), family: "goals", why: "תוחלת שערים גבוהה במשחק" },
    { label: "מתחת 2.5 שערים", p: m.under25, key: k("U25"), family: "goals", why: "פרופיל הגנתי — תוחלת שערים נמוכה" },
    { label: "מעל 1.5 שערים", p: m.over15, key: k("O15"), family: "goals", why: "לפחות שני שערים במשחק" },
    { label: "שתי הקבוצות מבקיעות", p: m.btts, key: k("BTTS"), family: "goals", why: "שתי התקפות מתפקדות מול הגנות פגיעות" },
    { label: "לא — שתיהן מבקיעות", p: m.noBtts, key: k("NBTTS"), family: "goals", why: "לפחות צד אחד צפוי לשמור על רשת נקייה" },
    { label: "סה\"כ שערים: 2–3", p: ex.range23, key: k("R23"), family: "goals", why: "הטווח השכיח ביותר במונדיאל" },
    { label: `מבקיעה ראשונה: ${an}`, p: ex.firstGoalA, key: k("FG1"), family: "halves", why: "מרוץ לשער הראשון לפי תוחלות ההבקעה" },
    { label: `מבקיעה ראשונה: ${bn}`, p: ex.firstGoalB, key: k("FG2"), family: "halves", why: "מרוץ לשער הראשון לפי תוחלות ההבקעה" },
    { label: `מחצית ראשונה: ${an} (1)`, p: ex.ht1, key: k("HT1"), family: "halves", why: "יתרון כבר במחצית" },
    { label: "מחצית ראשונה: תיקו (X)", p: ex.htx, key: k("HTX"), family: "halves", why: "מחציות ראשונות נוטות להיפתח בזהירות — תיקו שכיח" },
    { label: "שער בשתי המחציות", p: ex.goalBothHalves, key: k("GBH"), family: "halves", why: "קצב שערים שמתפרס על כל המשחק" }
  ];
  if (ko) {
    const advA = MODEL.koAdvanceProb(a, b);
    c.push(
      { label: `${an} מעפילה`, p: advA, key: k("ADV1"), family: "result", why: "כולל הארכה ופנדלים — שוק נפרד מ-1X2" },
      { label: `${bn} מעפילה`, p: 1 - advA, key: k("ADV2"), family: "result", why: "כולל הארכה ופנדלים — שוק נפרד מ-1X2" });
  }
  return c;
}

/* 3 ההמלצות החזקות למשחק: עדיפות לטווח ההסתברויות השימושי (יחס 1.25–2.2),
   מקסימום המלצה אחת לכל משפחת שווקים — כדי לתת 3 כיוונים שונים באמת */
function matchTopPicks(a, b, ko) {
  const sweet = (p) => p >= 0.45 && p <= 0.8 ? 2 : p > 0.8 && p <= 0.88 ? 1 : p >= 0.35 && p < 0.45 ? 1 : 0;
  const asOf = matchAsOf(a, b);
  const gap = Math.abs(MODEL.effElo(T(a), asOf) - MODEL.effElo(T(b), asOf));
  // ראיות: מס' המשחקים הנלמדים של שתי הנבחרות יחד — ביטחון נמוך כשמעט נתונים
  const evid = MODEL.teamGamesPlayed(T(a), asOf) + MODEL.teamGamesPlayed(T(b), asOf);
  const scored = buildMatchCandidates(a, b, ko)
    .filter(x => x.p >= 0.33 && x.p <= 0.88)
    .map(x => {
      const conf = MODEL.confidence(x.p, gap, evid);
      // כיול לפי משפחה: מגביר משפחות שפגעו, מנמיך משפחות שהחטיאו
      const base = sweet(x.p) * 10 + x.p * 5 + conf;
      return { ...x, conf, score: base * familyBoost(x.family) };
    })
    .sort((x, y) => y.score - x.score);
  const picks = [], used = new Set();
  for (const x of scored) {
    if (used.has(x.family)) continue;
    used.add(x.family);
    picks.push(x);
    if (picks.length === 3) break;
  }
  return picks;
}

/* ניתוח מילולי אוטומטי למשחק */
function matchNarrative(a, b, m, lA, lB) {
  const gap = MODEL.effElo(T(a), matchAsOf(a, b)) - MODEL.effElo(T(b), matchAsOf(a, b));
  const fav = gap >= 0 ? a : b, dog = gap >= 0 ? b : a, ag = Math.abs(gap);
  const s = [];
  if (ag >= 250) s.push(`פער כוח גדול: ${T(fav).nameHe} חזקה מ${T(dog).nameHe} ב-${ag} נקודות Elo — תרחיש של שליטה חד-צדדית.`);
  else if (ag >= 120) s.push(`${T(fav).nameHe} פייבוריטית ברורה (פער ${ag} נק' Elo), אבל לא מובטחת — ${T(dog).nameHe} מסוגלת לגנוב נקודות.`);
  else s.push(`משחק צמוד: ${ag} נק' Elo בלבד בין הקבוצות — התיקו (${pct1(m.px)}) הוא שחקן מרכזי כאן.`);
  if (T(a).host || T(b).host) s.push(`${T(a).host ? T(a).nameHe : T(b).nameHe} משחקת בבית — בונוס הביתיות כבר מגולם במספרים.`);
  const lT = lA + lB;
  if (lT <= 2.3) s.push(`המודל צופה משחק סגור (${lT.toFixed(1)} שערים בממוצע) — שווקי ה"מתחת" והתוצאות הנמוכות מעניינים.`);
  else if (lT >= 2.9) s.push(`המודל צופה משחק פתוח (${lT.toFixed(1)} שערים בממוצע) — שווקי ה"מעל" וה-BTTS נכנסים למשחק.`);
  const defStrong = [a, b].filter(id => (T(id).defMod || 1) <= 0.94);
  if (defStrong.length) s.push(`${defStrong.map(id => T(id).nameHe).join(" ו")} מביאה הגנה מהחזקות בטורניר.`);
  return s.join(" ");
}

/* ============================================================
   ניתוח מורחב — השוואת נבחרות צד-מול-צד (אנושי, ללא Elo גולמי)
   ============================================================ */

// נקודת טופס: עיגול צבעוני W/D/L עם tooltip של התוצאה
function formDot(f) {
  const cls = f.res === "W" ? "w" : f.res === "L" ? "l" : "d";
  const lbl = f.res === "W" ? "ניצחון" : f.res === "L" ? "הפסד" : "תיקו";
  return `<span class="form-dot ${cls}" title="${lbl} ${f.score} מול ${T(f.opp).nameHe}">${f.res === "W" ? "נ" : f.res === "L" ? "ה" : "ת"}</span>`;
}

// בר 0–10 בתוך כרטיס נבחרת (התקפה/הגנה)
function statBar(label, val, color) {
  return `<div class="stat-row"><span class="stat-lbl">${label}</span>
    <span class="stat-bar"><i style="width:${val * 10}%;background:${color}"></i></span>
    <b class="stat-val">${val}</b></div>`;
}

// כרטיס נבחרת אחד (צד אחד של ההשוואה)
function teamCardHtml(c) {
  const formHtml = c.form.length
    ? `<div class="tc-form">${c.form.slice(0, 3).map(formDot).join("")}</div>`
    : `<div class="tc-form tc-form-empty">טרם שיחקה</div>`;
  return `<div class="team-card">
    <div class="tc-head">${flag(c.id)} <b>${c.nameHe}</b>${c.host ? ` <span class="pill host-pill">🏟️ בית</span>` : ""}</div>
    <div class="tc-rank">מקום <b>${c.power.rank}</b> מתוך ${c.power.total} בכוח</div>
    ${statBar("🔥 התקפה", c.attack, "var(--red)")}
    ${statBar("🛡️ הגנה", c.defense, "var(--blue)")}
    <div class="tc-meta">${c.head.star ? `⭐ ${c.head.star}` : ""}</div>
    <div class="tc-meta tc-timing">${c.timing.label}</div>
    <div class="tc-form-wrap"><span class="tc-form-lbl">טופס:</span> ${formHtml}</div>
  </div>`;
}

// בר מתפצל אחד: מי מנצח את המֵמד (RTL: a מימין, b משמאל)
function divergeBar(label, va, vb, max) {
  const total = va + vb || 1;
  const pa = (va / total) * 100, pb = (vb / total) * 100;
  const aWins = va > vb, bWins = vb > va;
  return `<div class="dv-row">
    <span class="dv-val ${aWins ? "win" : ""}">${va}</span>
    <span class="dv-track">
      <i class="dv-a ${aWins ? "win" : ""}" style="width:${pa}%"></i><i class="dv-b ${bWins ? "win" : ""}" style="width:${pb}%"></i>
    </span>
    <span class="dv-val ${bWins ? "win" : ""}">${vb}</span>
    <span class="dv-lbl">${label}</span>
  </div>`;
}

// כל בלוק הניתוח המורחב: כרטיסים + ברים מתפצלים + תרגום אנושי + עובדות.
function h2hAnalysis(a, b, asOf) {
  const cmp = PROFILE.compare(a, b, asOf);
  const ca = cmp.a, cb = cmp.b;
  const sentences = [`<b>${cmp.dominance.text}</b>`];
  if (cmp.upset) sentences.push(cmp.upset.text);
  sentences.push(matchNarrative(a, b, MODEL.markets(T(a), T(b), asOf),
    ...MODEL.lambdas(T(a), T(b), asOf)));

  const facts = cmp.facts.length
    ? `<div class="h2h-facts">${cmp.facts.map(f => `<span class="fact-chip">${f}</span>`).join("")}</div>`
    : "";

  // כוח כללי כציון 1–10 (מקום נמוך → ציון גבוה) כדי שהבר והמספר יתאימו
  const powScore = (c) => Math.max(1, Math.round((c.power.total - c.power.rank + 1) / c.power.total * 10));

  return `<div class="h2h">
    <div class="h2h-cards">${teamCardHtml(ca)}<span class="h2h-vs">VS</span>${teamCardHtml(cb)}</div>
    <div class="h2h-diverge">
      ${divergeBar("🔥 התקפה", ca.attack, cb.attack)}
      ${divergeBar("🛡️ הגנה", ca.defense, cb.defense)}
      ${divergeBar("⚡ כוח כללי", powScore(ca), powScore(cb))}
    </div>
    <div class="narrative h2h-narrative">🧠 <b>ניתוח:</b> ${sentences.join(" ")}</div>
    ${facts}
    ${likelyScoresHtml(a, b, asOf)}
  </div>`;
}

// תוצאות סבירות — כרטיסי תוצאה עם בר עוצמה יחסי (במקום שורת note נסתרת).
// s.h = שערי קבוצה a (ראשונה), s.a = שערי קבוצה b — מצמידים דגלים כדי
// שלא יהיה ספק מי הבקיע כמה (בלי דגלים "2–0" נקרא הפוך בפריסת RTL).
function likelyScoresHtml(a, b, asOf) {
  const m = MODEL.markets(T(a), T(b), asOf);
  const top = m.topScores.slice(0, 5);
  const maxP = top[0] ? top[0].p : 1;
  return `<div class="likely-scores">
    <div class="ls-head">🎯 התוצאות הסבירות ביותר</div>
    <div class="ls-legend">${flag(a)} ${T(a).nameHe} <span class="ls-dash">–</span> ${T(b).nameHe} ${flag(b)}</div>
    <div class="ls-grid">
      ${top.map((s, i) => {
        const won = gradeKey(`${a}-${b}:CS${s.h}${s.a}`) === true;
        // פריסת RTL: קבוצה a מימין → השער שלה (s.h) מימין, שער b (s.a) משמאל
        return `<div class="ls-card${i === 0 ? " top" : ""}${won ? " hit" : ""}">
          <div class="ls-score">
            <span class="ls-side">${flag(a)}<b>${s.h}</b></span>
            <span class="ls-dash">–</span>
            <span class="ls-side"><b>${s.a}</b>${flag(b)}</span>
            ${won ? `<span class="ls-check">✓</span>` : ""}
          </div>
          <div class="ls-bar"><i style="width:${(s.p / maxP * 100).toFixed(0)}%"></i></div>
          <div class="ls-pct">${pct1(s.p)}</div>
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

function pickCard(x, idx) {
  const medals = ["🥇", "🥈", "🥉"];
  const userOdds = ODDS[x.key];
  const edgeHtml = userOdds
    ? (MODEL.edge(x.p, userOdds) > 0
      ? `<span class="pill value-flag">VALUE +${(MODEL.edge(x.p, userOdds) * 100).toFixed(1)}%</span>`
      : `<span class="pill">Edge ${(MODEL.edge(x.p, userOdds) * 100).toFixed(1)}%</span>`)
    : "";
  const verdict = gradeKey(x.key);            // ✓/✗ אם המשחק הסתיים והשוק ניתן לשיפוט
  const cls = verdict === true ? " ok" : verdict === false ? " bad" : "";
  return `<div class="pick-card${cls}">
    <div class="odds-box"><b>${odds(MODEL.fairOdds(x.p))}</b><span>יחס הוגן</span></div>
    <div class="pick-body">
      <div class="pick-title">${medals[idx]} ${x.label} ${verdictBadge(verdict)} ${edgeHtml}</div>
      <div class="why">${x.why} · הסתברות: <b>${pct1(x.p)}</b> · ביטחון: <span class="stars">${stars(x.conf)}</span></div>
      <div class="bar" style="margin-top:6px"><i style="width:${(x.p * 100).toFixed(0)}%"></i></div>
    </div>
    <div class="nums">כדאי מ-: <b>${odds(MODEL.minWorthOdds(x.p))}</b><br>
      יחס ווינר: <input type="number" step="0.01" min="1" data-oddskey="${x.key}" value="${userOdds || ""}" placeholder="הזן"></div>
  </div>`;
}

function matchDetail(a, b, ko = false) {
  const res = resultOf(a, b);
  const asOf = matchAsOf(a, b);
  const m = MODEL.markets(T(a), T(b), asOf);
  const [lA, lB] = MODEL.lambdas(T(a), T(b), asOf);
  const k = (suffix) => `${a}-${b}:${suffix}`;
  const advA = ko ? MODEL.koAdvanceProb(a, b) : 0;
  const rows = [
    [`ניצחון ${T(a).nameHe} (1)`, m.p1, k("1")],
    ["תיקו (X)", m.px, k("X")],
    [`ניצחון ${T(b).nameHe} (2)`, m.p2, k("2")],
    ["צ'אנס כפול 1X", m.dc1x, k("1X")],
    ["צ'אנס כפול X2", m.dcx2, k("X2")],
    ["צ'אנס כפול 12", m.dc12, k("12")],
    ["מעל 1.5 שערים", m.over15, k("O15")],
    ["מעל 2.5 שערים", m.over25, k("O25")],
    ["מתחת 2.5 שערים", m.under25, k("U25")],
    ["מעל 3.5 שערים", m.over35, k("O35")],
    ["שתי הקבוצות מבקיעות", m.btts, k("BTTS")],
    ["לא — שתיהן מבקיעות", m.noBtts, k("NBTTS")]
  ];
  if (ko) rows.push(
    [`🥊 ${T(a).nameHe} מעפילה (כולל הארכה/פנדלים)`, advA, k("ADV1")],
    [`🥊 ${T(b).nameHe} מעפילה (כולל הארכה/פנדלים)`, 1 - advA, k("ADV2")]
  );

  // שווקים מורחבים של ווינר
  const ex = MODEL.extendedMarkets(T(a), T(b), asOf);
  const htftOrder = Object.entries(ex.htft).sort((x, y) => y[1] - x[1]).slice(0, 5);
  const exRows = [
    [`יתרון 0:1 — ${T(a).nameHe} (1)`, ex.hcapA_minus1.p1, k("H-1:1")],
    [`יתרון 0:1 — תיקו (X)`, ex.hcapA_minus1.px, k("H-1:X")],
    [`יתרון 0:1 — ${T(b).nameHe} (2)`, ex.hcapA_minus1.p2, k("H-1:2")],
    [`יתרון 1:0 — ${T(a).nameHe} (1)`, ex.hcapA_plus1.p1, k("H+1:1")],
    [`יתרון 1:0 — תיקו (X)`, ex.hcapA_plus1.px, k("H+1:X")],
    [`יתרון 1:0 — ${T(b).nameHe} (2)`, ex.hcapA_plus1.p2, k("H+1:2")],
    [`יתרון 0:2 — ${T(a).nameHe} (1)`, ex.hcapA_minus2.p1, k("H-2:1")],
    [`יתרון 0:2 — תיקו (X)`, ex.hcapA_minus2.px, k("H-2:X")],
    [`יתרון 0:2 — ${T(b).nameHe} (2)`, ex.hcapA_minus2.p2, k("H-2:2")],
    [`יתרון 2:0 — ${T(a).nameHe} (1)`, ex.hcapA_plus2.p1, k("H+2:1")],
    [`יתרון 2:0 — תיקו (X)`, ex.hcapA_plus2.px, k("H+2:X")],
    [`יתרון 2:0 — ${T(b).nameHe} (2)`, ex.hcapA_plus2.p2, k("H+2:2")],
    ["סה\"כ שערים: 0–1", ex.range01, k("R01")],
    ["סה\"כ שערים: 2–3", ex.range23, k("R23")],
    ["סה\"כ שערים: 4+", ex.range4plus, k("R4P")],
    ["מספר שערים אי-זוגי", ex.odd, k("ODD")],
    ["מספר שערים זוגי", ex.even, k("EVEN")],
    [`${T(a).nameHe} מנצחת ביותר משער`, ex.winBy2A, k("WB2A")],
    [`${T(b).nameHe} מנצחת ביותר משער`, ex.winBy2B, k("WB2B")],
    [`מבקיעה ראשונה: ${T(a).nameHe}`, ex.firstGoalA, k("FG1")],
    [`מבקיעה ראשונה: ${T(b).nameHe}`, ex.firstGoalB, k("FG2")],
    ["ללא שערים במשחק", ex.firstGoalNone, k("FG0")],
    [`מחצית ראשונה: ${T(a).nameHe} (1)`, ex.ht1, k("HT1")],
    ["מחצית ראשונה: תיקו (X)", ex.htx, k("HTX")],
    [`מחצית ראשונה: ${T(b).nameHe} (2)`, ex.ht2, k("HT2")],
    ...htftOrder.map(([combo, p]) => [`מחצית/סיום ${combo}`, p, k("HTFT" + combo)]),
    ["שער בשתי המחציות", ex.goalBothHalves, k("GBH")],
    // תוצאות מדויקות — 5 הסבירות כשוק
    ...m.topScores.map(s => [`תוצאה מדויקת ${s.h}–${s.a}`, s.p, k(`CS${s.h}${s.a}`)])
  ];
  // תקציר פגיעות 3 ההמלצות אם המשחק הסתיים
  let matchVerdict = "";
  if (res) {
    const picks = matchTopPicks(a, b, ko);
    let h = 0, mm = 0;
    for (const p of picks) { const g = gradeKey(p.key); if (g === true) h++; else if (g === false) mm++; }
    matchVerdict = `<div class="match-verdict ${h >= mm ? "good" : "bad"}">
      🎯 מתוך ${h + mm} ההמלצות שנשפטו במשחק זה: <b>${h} פגעו</b>${mm ? ` · ${mm} החטיאו` : ""}</div>`;
  }
  return `<div class="card" style="margin-top:16px">
    <h3>${tn(a)} נגד ${tn(b)} ${res ? `<span class="pill score-pill">הסתיים <span dir="ltr">${res}</span></span>` : ""}
        ${ko ? `<span class="pill">נוק-אאוט: 1X2 = 90 דקות בלבד!</span>` : ""}</h3>
    ${odds1x2Html({ p1: m.p1, px: m.px, p2: m.p2 }, `:${m.p1 >= m.px && m.p1 >= m.p2 ? "1" : m.px >= m.p2 ? "X" : "2"}`)}
    ${matchVerdict}
    ${h2hAnalysis(a, b, asOf)}
    <h3 style="margin:16px 0 8px">🔥 3 ההמלצות החזקות למשחק</h3>
    ${matchTopPicks(a, b, ko).map(pickCard).join("")}
    <details style="margin-top:18px">
    <summary style="cursor:pointer;color:var(--gold);font-weight:700;padding:6px 0">📊 למתקדמים: כל השווקים והמספרים המלאים</summary>
    <p class="note">Elo: ${T(a).nameHe} ${MODEL.effElo(T(a), asOf)}${T(a).host ? " (כולל ביתיות)" : ""} מול ${T(b).nameHe} ${MODEL.effElo(T(b), asOf)}${T(b).host ? " (כולל ביתיות)" : ""}
       · תוחלת שערים: ${lA.toFixed(2)} — ${lB.toFixed(2)}</p>
    <table class="market-table">
      <tr><th>שוק</th><th>P מודל</th><th>יחס הוגן</th><th>כדאי מ-</th><th>יחס ווינר</th><th>Edge</th></tr>
      ${rows.map(([lbl, p, key]) => `<tr>
        <td class="lbl">${verdictMark(key)}${lbl}</td><td>${pct1(p)}</td>
        <td class="fair">${odds(MODEL.fairOdds(p))}</td>
        <td>${odds(MODEL.minWorthOdds(p))}</td>
        ${oddsInputCell(key)}${edgeCell(p, key)}
      </tr>`).join("")}
    </table>
    <details style="margin-top:14px">
      <summary style="cursor:pointer;color:var(--gold);font-weight:700">➕ שווקים מורחבים (יתרון, מחציות, מבקיעה ראשונה, תוצאה מדויקת...)</summary>
      <table class="market-table" style="margin-top:10px">
        <tr><th>שוק</th><th>P מודל</th><th>יחס הוגן</th><th>כדאי מ-</th><th>יחס ווינר</th><th>Edge</th></tr>
        ${exRows.map(([lbl, p, key]) => `<tr>
          <td class="lbl">${verdictMark(key)}${lbl}</td><td>${pct1(p)}</td>
          <td class="fair">${odds(MODEL.fairOdds(p))}</td>
          <td>${odds(MODEL.minWorthOdds(p))}</td>
          ${oddsInputCell(key)}${edgeCell(p, key)}
        </tr>`).join("")}
      </table>
      <p class="note">שווקי המחציות מחושבים בהנחת חלוקת 45%/55% של תוחלת השערים בין המחציות (ממוצע היסטורי).
      ⚠️ ביחסים גבוהים (תוצאה מדויקת, מחצית/סיום) עמלת הווינר גבוהה במיוחד — דרשו פער גדול מ"כדאי מ-".</p>
    </details>
    </details>
  </div>`;
}

/* ============================================================
   בתים
   ============================================================ */
function viewGroups() {
  return `<div class="grid cols2">${Object.keys(DATA.groups).map(g => {
    const standings = groupStandings(g);
    const anyPlayed = standings.some(s => s.p > 0);
    const proj = {};
    for (const id of DATA.groups[g]) proj[id] = SIM[id];
    return `<div class="card group-card">
      <h3>בית ${g}${anyPlayed ? "" : ` <span class="note" style="font-weight:400">· טרם נפתח</span>`}</h3>
      <table>
        <colgroup><col style="width:30%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:13%"><col style="width:9%"><col style="width:13%"></colgroup>
        <tr>
          <th style="text-align:right">נבחרת</th>
          <th title="משחקים">מ׳</th><th title="ניצחונות">נ׳</th><th title="תיקו">ת׳</th><th title="הפסדים">ה׳</th>
          <th title="שערים זכות:חובה">שערים</th><th title="הפרש שערים">הפרש</th><th>נק׳</th>
        </tr>
        ${standings.map((s, i) => `<tr${i === 1 ? ' style="border-bottom:2px solid var(--gold)"' : ''}>
          <td class="team" data-team="${s.id}">${tn(s.id)}</td>
          <td>${s.p}</td><td>${s.w}</td><td>${s.d}</td><td>${s.l}</td>
          <td>${s.gf}:${s.ga}</td>
          <td>${s.gd > 0 ? "+" + s.gd : s.gd}</td>
          <td><b>${s.pts}</b></td>
        </tr>`).join("")}
      </table>
      <details style="margin-top:8px">
        <summary style="cursor:pointer;color:var(--muted);font-size:.82rem">תחזית סימולציה (זוכת בית / העפלה)</summary>
        <table style="margin-top:6px">
          <colgroup><col style="width:40%"><col style="width:18%"><col style="width:18%"><col style="width:24%"></colgroup>
          <tr><th style="text-align:right">נבחרת</th><th>זוכת<br>בית</th><th>העפלה</th><th></th></tr>
          ${standings.map(s => ({ id: s.id, ...proj[s.id] })).sort((x, y) => y.pAdvance - x.pAdvance).map(r => `<tr>
            <td class="team" data-team="${r.id}">${tn(r.id)}</td>
            <td>${pct(r.pWinGroup)}</td>
            <td>${pct(r.pAdvance)}</td>
            <td><div class="bar"><i style="width:${(r.pAdvance * 100).toFixed(0)}%"></i></div></td>
          </tr>`).join("")}
        </table>
      </details>
    </div>`;
  }).join("")}</div>
  <p class="note">הטבלה למעלה היא <b>מצב אמת</b> לפי תוצאות שכבר נרשמו (${DATA.results.length} משחקים) — מתעדכנת אוטומטית עם כל תוצאה חדשה. הקו הזהוב מסמן את גבול 2 הראשונים. "העפלה" בתחזית כוללת גם מסלול מקום-3 (8 השלישיות הטובות מ-12 עולות). לחצו על שם נבחרת לפרופיל מלא.</p>`;
}

/* ============================================================
   עתידיים
   ============================================================ */
function viewFutures() {
  const ids = Object.keys(DATA.teams);
  const champRows = ids.map(id => ({ id, p: KO[id].pChampion, f: KO[id].pFinal, s: KO[id].pSemi }))
    .sort((x, y) => y.p - x.p).slice(0, 16);
  return `
  <div class="card">
    <h3>🏆 זוכת המונדיאל — מודל מול שוק עולמי</h3>
    <table class="market-table">
      <tr><th>נבחרת</th><th>אלופה</th><th>גמר</th><th>חצי גמר</th><th>יחס הוגן</th><th>כדאי מ-</th><th>שוק עולמי</th><th>יחס ווינר</th><th>Edge</th></tr>
      ${champRows.map(r => {
        const mkt = DATA.meta.marketChampion[r.id];
        const key = `CHAMP:${r.id}`;
        return `<tr>
          <td class="lbl">${tn(r.id)}</td>
          <td><b>${pct1(r.p)}</b></td><td>${pct1(r.f)}</td><td>${pct1(r.s)}</td>
          <td class="fair">${odds(MODEL.fairOdds(r.p))}</td>
          <td>${odds(MODEL.minWorthOdds(r.p))}</td>
          <td>${mkt ? pct1(mkt) : "—"}</td>
          ${oddsInputCell(key)}${edgeCell(r.p, key)}
        </tr>`;
      }).join("")}
    </table>
    <p class="note">סימולציית הנוק-אאוט מקורבת (הגרלת מסלולים אקראית תחת אילוצים) — ראו docs/methodology.md.
    פערים בין המודל לשוק: המודל מאמין בארגנטינה (Elo גבוה) יותר מהשוק; השוק מאמין בצרפת ובברזיל יותר מהמודל.</p>
  </div>
  <div class="card">
    <h3>📈 העפלה משלב הבתים — הבטוחות והמסוכנות</h3>
    <table class="market-table">
      <tr><th>נבחרת</th><th>בית</th><th>העפלה</th><th>יחס הוגן</th><th>כדאי מ-</th><th>יחס ווינר</th><th>Edge</th></tr>
      ${ids.map(id => ({ id, p: SIM[id].pAdvance })).sort((x, y) => y.p - x.p)
        .filter(r => r.p >= 0.45 && r.p <= 0.97)
        .map(r => `<tr>
          <td class="lbl">${tn(r.id)}</td><td>${T(r.id).group || groupOfTeam(r.id)}</td>
          <td><b>${pct1(r.p)}</b></td>
          <td class="fair">${odds(MODEL.fairOdds(r.p))}</td>
          <td>${odds(MODEL.minWorthOdds(r.p))}</td>
          ${oddsInputCell("ADV:" + r.id)}${edgeCell(r.p, "ADV:" + r.id)}
        </tr>`).join("")}
    </table>
    <p class="note">מוצגות רק נבחרות בטווח 45%–97% — מתחת/מעל לזה היחסים בווינר בדרך כלל לא מעניינים.</p>
  </div>`;
}

function groupOfTeam(id) {
  for (const g of Object.keys(DATA.groups)) if (DATA.groups[g].includes(id)) return g;
  return "?";
}

/* ============================================================
   נוק-אאוט
   ============================================================ */
const KO_ROUND_NAMES = { R32: "שלב ה-32", R16: "שמינית גמר", QF: "רבע גמר", SF: "חצי גמר", F: "🏆 הגמר" };

// בניית כל הסיבובים: משתתפי סיבוב עוקב = מנצחות מסומנות של הסיבוב הקודם
function koRounds() {
  let prev = BRACKET.r32.map((p, i) => ({ id: "R32-" + (i + 1), a: p[0], b: p[1] }));
  const rounds = [["R32", prev]];
  for (const name of ["R16", "QF", "SF", "F"]) {
    const cur = [];
    for (let i = 0; i < prev.length; i += 2)
      cur.push({
        id: name + "-" + (i / 2 + 1),
        a: BRACKET.winners[prev[i].id] || null,
        b: BRACKET.winners[prev[i + 1].id] || null,
        feeders: [prev[i], prev[i + 1]]
      });
    rounds.push([name, cur]);
    prev = cur;
  }
  return rounds;
}

function teamSelect(attrs, selected) {
  const ids = Object.keys(DATA.teams)
    .sort((x, y) => SIM[y].pAdvance - SIM[x].pAdvance);
  return `<select ${attrs}>
    <option value="">— בחרו נבחרת —</option>
    ${ids.map(id => `<option value="${id}" ${id === selected ? "selected" : ""}>${T(id).flag} ${T(id).nameHe} (העפלה ${pct(SIM[id].pAdvance)})</option>`).join("")}
  </select>`;
}

function koMatchRow(match, roundName, editable) {
  const { id, a, b } = match;
  const both = a && b;
  const winner = BRACKET.winners[id];
  let body;
  if (editable) {
    body = `${teamSelect(`class="ko-team" data-mi="${parseInt(id.split("-")[1]) - 1}" data-side="0"`, a)}
            <span class="vs">נגד</span>
            ${teamSelect(`class="ko-team" data-mi="${parseInt(id.split("-")[1]) - 1}" data-side="1"`, b)}`;
  } else {
    const lbl = (x, f) => x ? tn(x) : `<span class="vs">מנצחת ${f}</span>`;
    body = `${lbl(a, match.feeders ? match.feeders[0].id : "")} <span class="vs">נגד</span> ${lbl(b, match.feeders ? match.feeders[1].id : "")}`;
  }
  let tools = "";
  if (both) {
    const advA = MODEL.koAdvanceProb(a, b);
    tools = `<span class="pill">${T(a).nameHe} מעפילה: ${pct1(advA)}</span>
      <button class="tab-btn ko-analyze" data-a="${a}" data-b="${b}" style="padding:4px 12px;font-size:.85rem">ניתוח 📊</button>
      <select class="ko-winner" data-mid="${id}">
        <option value="">מנצחת בפועל?</option>
        <option value="${a}" ${winner === a ? "selected" : ""}>${T(a).nameHe}</option>
        <option value="${b}" ${winner === b ? "selected" : ""}>${T(b).nameHe}</option>
      </select>`;
  }
  return `<div class="fixture" style="cursor:default;flex-wrap:wrap;gap:8px">
    <span class="vs">${id}</span><span style="flex:1">${body}</span>${tools}
  </div>`;
}

function viewKO() {
  const rounds = koRounds();
  const filled = BRACKET.r32.filter(p => p[0] && p[1]).length;
  const allIds = BRACKET.r32.flat().filter(Boolean);
  const dupes = allIds.length !== new Set(allIds).size;

  // טבלת התקדמות מדויקת — רק כשכל 16 המשחקים מולאו בלי כפילויות
  let propagation = "";
  if (filled === 16 && !dupes) {
    const { perTeam } = MODEL.koPropagate(BRACKET.r32, BRACKET.winners);
    const rows = Object.keys(perTeam).map(id => ({ id, ...perTeam[id] }))
      .sort((x, y) => y.pChampion - x.pChampion).slice(0, 16);
    propagation = `<div class="card">
      <h3>📐 חישוב מסלול מדויק (מחליף את הסימולציה המקורבת)</h3>
      <table class="market-table">
        <tr><th>נבחרת</th><th>שמינית</th><th>רבע</th><th>חצי</th><th>גמר</th><th>אלופה</th><th>יחס הוגן (אלופה)</th><th>כדאי מ-</th><th>יחס ווינר</th><th>Edge</th></tr>
        ${rows.map(r => `<tr>
          <td class="lbl">${tn(r.id)}</td>
          <td>${pct1(r.pR16)}</td><td>${pct1(r.pQF)}</td><td>${pct1(r.pSF)}</td><td>${pct1(r.pF)}</td>
          <td><b>${pct1(r.pChampion)}</b></td>
          <td class="fair">${odds(MODEL.fairOdds(r.pChampion))}</td>
          <td>${odds(MODEL.minWorthOdds(r.pChampion))}</td>
          ${oddsInputCell("KOCHAMP:" + r.id)}${edgeCell(r.pChampion, "KOCHAMP:" + r.id)}
        </tr>`).join("")}
      </table>
      <p class="note">מנצחות שסומנו "בפועל" מקובעות (הסתברות 1) והחישוב מתעדכן בהתאם. שוק "מי יעפיל" של כל משחק — בכפתור ניתוח.</p>
    </div>`;
  }

  return `
  <div class="card">
    <h3>🥊 שלב הנוק-אאוט — עדכון בסוף שלב הבתים</h3>
    <p class="note">
      המסלולים הרשמיים ננעלים ב-<b>27.6.2026</b> בסוף שלב הבתים (שיבוץ השלישיות תלוי ב-495 תרחישי FIFA — אי אפשר לדעת מראש).
      ברגע שהלוח יתפרסם: מלאו כאן את 16 מפגשי שלב ה-32 <b>לפי סדר הסוגריים הרשמי</b>
      (מנצחות משחקים 1–2 נפגשות בשמינית הגמר הראשונה, 3–4 בשנייה וכן הלאה).
      הנתונים נשמרים בדפדפן. סטטוס: <b>${filled}/16</b> ${dupes ? '<span class="pill" style="color:var(--red)">⚠️ נבחרת מופיעה פעמיים!</span>' : ""}
    </p>
    <p class="note">💡 <b>חשוב לווינר:</b> בנוק-אאוט שוק 1X2 נסגר ב-90 דקות (תיקו = X משלם!), ושוק "מי יעפיל" כולל הארכה ופנדלים — המערכת מציגה את שניהם.</p>
  </div>
  ${propagation}
  ${rounds.map(([name, matches], idx) => `<div class="card">
    <h3>${KO_ROUND_NAMES[name]}</h3>
    <div class="fixture-list">
      ${matches.map(mt => koMatchRow(mt, name, idx === 0)).join("")}
    </div>
  </div>`).join("")}
  ${selKoMatch ? matchDetail(selKoMatch[0], selKoMatch[1], true) : ""}`;
}

/* ---------- אירועים ---------- */
function bindEvents() {
  const gs = $("#group-sel");
  if (gs) gs.addEventListener("change", () => { selGroup = gs.value; selFixture = null; render(); });

  document.querySelectorAll(".fixture").forEach(f =>
    f.addEventListener("click", () => { selFixture = f.dataset.fix.split("|"); render(); }));

  // מעבר מהעמוד הראשי לניתוח מלא של משחק
  document.querySelectorAll(".open-match").forEach(btn =>
    btn.addEventListener("click", () => {
      selGroup = btn.dataset.g;
      selFixture = [btn.dataset.h, btn.dataset.a];
      activeTab = "matches";
      document.querySelectorAll(".tab-btn[data-tab]").forEach(b =>
        b.classList.toggle("active", b.dataset.tab === "matches"));
      render();
      window.scrollTo({ top: 0 });
    }));

  document.querySelectorAll("td.team").forEach(td =>
    td.addEventListener("click", () => showTeam(td.dataset.team)));

  document.querySelectorAll("select.ko-team").forEach(sel =>
    sel.addEventListener("change", () => {
      BRACKET.r32[+sel.dataset.mi][+sel.dataset.side] = sel.value || null;
      // איפוס מנצחות שכבר לא רלוונטיות
      const mid = "R32-" + (+sel.dataset.mi + 1);
      const [a, b] = BRACKET.r32[+sel.dataset.mi];
      if (BRACKET.winners[mid] && BRACKET.winners[mid] !== a && BRACKET.winners[mid] !== b)
        delete BRACKET.winners[mid];
      saveBracket(); render();
    }));

  document.querySelectorAll("select.ko-winner").forEach(sel =>
    sel.addEventListener("change", () => {
      if (sel.value) BRACKET.winners[sel.dataset.mid] = sel.value;
      else delete BRACKET.winners[sel.dataset.mid];
      saveBracket(); render();
    }));

  document.querySelectorAll(".ko-analyze").forEach(btn =>
    btn.addEventListener("click", () => {
      selKoMatch = [btn.dataset.a, btn.dataset.b];
      render();
      const d = document.querySelector(".card[style]");
      if (d) d.scrollIntoView({ behavior: "smooth" });
    }));

  document.querySelectorAll("input[data-oddskey]").forEach(inp =>
    inp.addEventListener("change", () => {
      const v = parseFloat(inp.value);
      if (v > 1) ODDS[inp.dataset.oddskey] = v; else delete ODDS[inp.dataset.oddskey];
      saveOdds(); render();
    }));
}

function showTeam(id) {
  const t = T(id);
  $("#modal-root").innerHTML = `<div class="modal-bg" id="modal-bg">
    <div class="modal">
      <button class="close" id="modal-close">✕</button>
      <h2>${flag(id)} ${t.nameHe} <span class="pill">${t.nameEn}</span></h2>
      <p class="note">בית ${groupOfTeam(id)} · ${t.confed} · דירוג FIFA: ${t.fifa} · Elo מודל: ${t.elo}${t.host ? " (+50 ביתיות)" : ""} · מאמן: ${t.coach}</p>
      <dl>
        <dt>סימולציה</dt><dd>זוכת בית: ${pct1(SIM[id].pWinGroup)} · העפלה: ${pct1(SIM[id].pAdvance)} · אלופה: ${pct1(KO[id].pChampion)}</dd>
        <dt>מונדיאל 2018</dt><dd>${t.wc18}</dd>
        <dt>מונדיאל 2022</dt><dd>${t.wc22}</dd>
        <dt>אליפויות יבשתיות (10 שנים)</dt><dd>${t.continental}</dd>
        <dt>מוקדמות 2026</dt><dd>${t.qual26}</dd>
        <dt>תמונת עשור</dt><dd>${t.tenYear}</dd>
        <dt>כוכבים</dt><dd>${t.stars.join(" · ")}</dd>
        <dt>שורה תחתונה</dt><dd>${t.note}</dd>
      </dl>
    </div>
  </div>`;
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal-bg").addEventListener("click", (e) => { if (e.target.id === "modal-bg") closeModal(); });
}
function closeModal() { $("#modal-root").innerHTML = ""; }
