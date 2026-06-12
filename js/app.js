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
const tn = (id) => `${T(id).flag} ${T(id).nameHe}`;
const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

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

/* ---------- אתחול ---------- */
// כל שגיאה — על המסך במקום תקיעה שקטה על מסך הטעינה
window.addEventListener("error", (e) => {
  const el = document.querySelector("#content");
  if (el && !SIM) el.innerHTML =
    `<div class="card"><h3>😕 שגיאה בטעינה</h3><p class="note">${e.message || e.type}</p>
     <p class="note">נסו לפתוח את הקובץ בדפדפן מלא (Safari/Chrome) דרך כפתור השיתוף.</p></div>`;
});

document.addEventListener("DOMContentLoaded", () => {
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
  else if (activeTab === "ko") el.innerHTML = viewKO();
  else el.innerHTML = viewGuide();
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
      const base = { group: g, match: `${tn(a)} — ${tn(b)}` };

      // תקרה 0.85: מעליה היחס ההוגן < ~1.18 — עמלת הווינר הופכת זאת להימור גרוע תמיד
      if (m.p1 >= 0.58 && m.p1 <= 0.85)
        recs.push({ ...base, market: "1X2", pick: `ניצחון ${tn(a)} (1)`, p: m.p1,
          conf: MODEL.confidence(m.p1, gap), key: `${a}-${b}:1`,
          why: `פער כוח ${Math.abs(gap)} נק' Elo לטובת ${T(a).nameHe}` });
      else if (m.p2 >= 0.58 && m.p2 <= 0.85)
        recs.push({ ...base, market: "1X2", pick: `ניצחון ${tn(b)} (2)`, p: m.p2,
          conf: MODEL.confidence(m.p2, gap), key: `${a}-${b}:2`,
          why: `פער כוח ${Math.abs(gap)} נק' Elo לטובת ${T(b).nameHe}` });
      else {
        const dc = m.dc1x >= m.dcx2 ? { p: m.dc1x, lbl: `${tn(a)} או תיקו (1X)`, k: "1X" }
                                    : { p: m.dcx2, lbl: `${tn(b)} או תיקו (X2)`, k: "X2" };
        if (dc.p >= 0.66 && dc.p <= 0.88)
          recs.push({ ...base, market: "צ'אנס כפול", pick: dc.lbl, p: dc.p,
            conf: MODEL.confidence(dc.p, gap), key: `${a}-${b}:${dc.k}`,
            why: "משחק צמוד — גידור על שתי תוצאות" });
      }
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

function recHtml(r) {
  const edgeHtml = r.edge !== undefined
    ? (r.edge > 0
      ? `<span class="pill value-flag">VALUE +${(r.edge * 100).toFixed(1)}%</span>`
      : `<span class="pill">Edge ${(r.edge * 100).toFixed(1)}%</span>`)
    : "";
  return `<div class="rec">
    <div class="badge"><b>${pct(r.p)}</b>${r.market}</div>
    <div class="what">
      <b>${r.pick}</b> <span class="pill">${r.match}</span> ${edgeHtml}
      <div class="why">${r.why} · ביטחון: <span class="stars">${stars(r.conf)}</span></div>
    </div>
    <div class="nums">
      יחס הוגן: <b class="fair">${odds(r.fair)}</b><br>
      כדאי מ-: <b>${odds(r.minOdds)}</b><br>
      יחס ווינר: <input type="number" step="0.01" min="1" data-oddskey="${r.key}"
        value="${ODDS[r.key] || ""}" placeholder="הזן">
    </div>
  </div>`;
}

function viewRecs() {
  const recs = generateRecs();
  const valueRecs = recs.filter(r => r.edge !== undefined && r.edge > 0);
  return `
  <div class="card">
    <h3>🎯 איך לקרוא את ההמלצות</h3>
    <p class="note">
      לכל המלצה: <b>הסתברות המודל</b>, <b>יחס הוגן</b> (1/p) ו<b>"כדאי מ-"</b> — היחס המינימלי בווינר שממנו ההימור בעל ערך (כולל מרווח ביטחון 7%).
      הזינו את היחס בפועל מאתר הווינר — והמערכת תחשב Edge ותסמן <span class="pill value-flag">VALUE</span>.
      <b>כלל הברזל:</b> מהמרים רק כשהיחס בווינר ≥ "כדאי מ-". סינגלים, לא צירופים.
    </p>
  </div>
  ${valueRecs.length ? `<div class="card"><h3>💎 הימורי ערך מאומתים (לפי היחסים שהזנת)</h3>${valueRecs.map(recHtml).join("")}</div><h3 style="margin:14px 0">שאר ההמלצות</h3>` : ""}
  ${recs.filter(r => !valueRecs.includes(r)).map(recHtml).join("")}`;
}

/* ============================================================
   משחקים
   ============================================================ */
function viewMatches() {
  const groups = Object.keys(DATA.groups);
  const fixtures = MODEL.groupFixtures(selGroup);
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
    ${fixtures.map(([a, b]) => {
      const res = resultOf(a, b);
      return `<div class="fixture" data-fix="${a}|${b}">
        <span>${tn(a)} <span class="vs">נגד</span> ${tn(b)}</span>
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

/* ---------- מועמדים לכל השווקים של משחק (להמלצות-צמרת) ---------- */
function buildMatchCandidates(a, b, ko) {
  const m = MODEL.markets(T(a), T(b));
  const ex = MODEL.extendedMarkets(T(a), T(b));
  const k = (s) => `${a}-${b}:${s}`;
  const an = T(a).nameHe, bn = T(b).nameHe;
  const c = [
    { label: `ניצחון ${an} (1)`, p: m.p1, key: k("1"), family: "result", why: "תוצאת 90 דקות" },
    { label: `ניצחון ${bn} (2)`, p: m.p2, key: k("2"), family: "result", why: "תוצאת 90 דקות" },
    { label: "תיקו (X)", p: m.px, key: k("X"), family: "result", why: "תוצאת 90 דקות" },
    { label: `${an} או תיקו (1X)`, p: m.dc1x, key: k("1X"), family: "result", why: "צ'אנס כפול — גידור על שתי תוצאות" },
    { label: `${bn} או תיקו (X2)`, p: m.dcx2, key: k("X2"), family: "result", why: "צ'אנס כפול — גידור על שתי תוצאות" },
    { label: `יתרון 0:1 ל${bn} — ${an} (1)`, p: ex.hcapA_minus1.p1, key: k("H-1:1"), family: "result", why: "הנדיקאפ: הפייבוריט חייב לנצח בהפרש 2+ — יחס משופר" },
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
  const gap = Math.abs(MODEL.effElo(T(a)) - MODEL.effElo(T(b)));
  const scored = buildMatchCandidates(a, b, ko)
    .filter(x => x.p >= 0.33 && x.p <= 0.88)
    .map(x => ({ ...x, conf: MODEL.confidence(x.p, gap), score: sweet(x.p) * 10 + x.p * 5 + MODEL.confidence(x.p, gap) }))
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
  const gap = MODEL.effElo(T(a)) - MODEL.effElo(T(b));
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

function pickCard(x, idx) {
  const medals = ["🥇", "🥈", "🥉"];
  const userOdds = ODDS[x.key];
  const edgeHtml = userOdds
    ? (MODEL.edge(x.p, userOdds) > 0
      ? `<span class="pill value-flag">VALUE +${(MODEL.edge(x.p, userOdds) * 100).toFixed(1)}%</span>`
      : `<span class="pill">Edge ${(MODEL.edge(x.p, userOdds) * 100).toFixed(1)}%</span>`)
    : "";
  return `<div class="pick-card">
    <div class="odds-box"><b>${odds(MODEL.fairOdds(x.p))}</b><span>יחס הוגן</span></div>
    <div class="pick-body">
      <div class="pick-title">${medals[idx]} ${x.label} ${edgeHtml}</div>
      <div class="why">${x.why} · הסתברות: <b>${pct1(x.p)}</b> · ביטחון: <span class="stars">${stars(x.conf)}</span></div>
      <div class="bar" style="margin-top:6px"><i style="width:${(x.p * 100).toFixed(0)}%"></i></div>
    </div>
    <div class="nums">כדאי מ-: <b>${odds(MODEL.minWorthOdds(x.p))}</b><br>
      יחס ווינר: <input type="number" step="0.01" min="1" data-oddskey="${x.key}" value="${userOdds || ""}" placeholder="הזן"></div>
  </div>`;
}

function matchDetail(a, b, ko = false) {
  const res = resultOf(a, b);
  const m = MODEL.markets(T(a), T(b));
  const [lA, lB] = MODEL.lambdas(T(a), T(b));
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
  const ex = MODEL.extendedMarkets(T(a), T(b));
  const htftOrder = Object.entries(ex.htft).sort((x, y) => y[1] - x[1]).slice(0, 5);
  const exRows = [
    [`יתרון 0:1 — ${T(a).nameHe} (1)`, ex.hcapA_minus1.p1, k("H-1:1")],
    [`יתרון 0:1 — תיקו (X)`, ex.hcapA_minus1.px, k("H-1:X")],
    [`יתרון 0:1 — ${T(b).nameHe} (2)`, ex.hcapA_minus1.p2, k("H-1:2")],
    [`יתרון 1:0 — ${T(a).nameHe} (1)`, ex.hcapA_plus1.p1, k("H+1:1")],
    [`יתרון 1:0 — תיקו (X)`, ex.hcapA_plus1.px, k("H+1:X")],
    [`יתרון 1:0 — ${T(b).nameHe} (2)`, ex.hcapA_plus1.p2, k("H+1:2")],
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
  return `<div class="card" style="margin-top:16px">
    <h3>${tn(a)} נגד ${tn(b)} ${res ? `<span class="pill">הסתיים ${res} — לעיון בלבד</span>` : ""}
        ${ko ? `<span class="pill">נוק-אאוט: 1X2 = 90 דקות בלבד!</span>` : ""}</h3>
    <p class="note">Elo: ${T(a).nameHe} ${MODEL.effElo(T(a))}${T(a).host ? " (כולל ביתיות)" : ""} מול ${T(b).nameHe} ${MODEL.effElo(T(b))}${T(b).host ? " (כולל ביתיות)" : ""}
       · תוחלת שערים: ${lA.toFixed(2)} — ${lB.toFixed(2)}</p>
    <div class="narrative">🧠 <b>ניתוח:</b> ${matchNarrative(a, b, m, lA, lB)}</div>
    <h3 style="margin:16px 0 8px">🔥 3 ההמלצות החזקות למשחק</h3>
    ${matchTopPicks(a, b, ko).map(pickCard).join("")}
    <h3 style="margin:18px 0 8px">כל השווקים</h3>
    <table class="market-table">
      <tr><th>שוק</th><th>P מודל</th><th>יחס הוגן</th><th>כדאי מ-</th><th>יחס ווינר</th><th>Edge</th></tr>
      ${rows.map(([lbl, p, key]) => `<tr>
        <td class="lbl">${lbl}</td><td>${pct1(p)}</td>
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
          <td class="lbl">${lbl}</td><td>${pct1(p)}</td>
          <td class="fair">${odds(MODEL.fairOdds(p))}</td>
          <td>${odds(MODEL.minWorthOdds(p))}</td>
          ${oddsInputCell(key)}${edgeCell(p, key)}
        </tr>`).join("")}
      </table>
      <p class="note">שווקי המחציות מחושבים בהנחת חלוקת 45%/55% של תוחלת השערים בין המחציות (ממוצע היסטורי).
      ⚠️ ביחסים גבוהים (תוצאה מדויקת, מחצית/סיום) עמלת הווינר גבוהה במיוחד — דרשו פער גדול מ"כדאי מ-".</p>
    </details>
    <p class="note">🎯 תוצאות סבירות: ${m.topScores.map(s => `<b>${s.h}–${s.a}</b> (${pct1(s.p)})`).join(" · ")}</p>
  </div>`;
}

/* ============================================================
   בתים
   ============================================================ */
function viewGroups() {
  return `<div class="grid cols2">${Object.keys(DATA.groups).map(g => {
    const rows = DATA.groups[g].map(id => ({ id, ...SIM[id] }))
      .sort((x, y) => y.expPts - x.expPts);
    return `<div class="card group-card">
      <h3>בית ${g}</h3>
      <table>
        <tr><th style="text-align:right">נבחרת</th><th>תוחלת נק'</th><th>זוכת בית</th><th>העפלה</th><th></th></tr>
        ${rows.map(r => `<tr>
          <td class="team" data-team="${r.id}">${tn(r.id)}</td>
          <td>${r.expPts.toFixed(1)}</td>
          <td>${pct(r.pWinGroup)}</td>
          <td>${pct(r.pAdvance)}</td>
          <td style="min-width:70px"><div class="bar"><i style="width:${(r.pAdvance * 100).toFixed(0)}%"></i></div></td>
        </tr>`).join("")}
      </table>
    </div>`;
  }).join("")}</div>
  <p class="note">"העפלה" כוללת גם מסלול מקום-3 (8 השלישיות הטובות מ-12 עולות). לחצו על שם נבחרת לפרופיל 10 שנים מלא. תוצאות שכבר נרשמו (${DATA.results.length} משחקים) מקובעות בסימולציה.</p>`;
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

/* ============================================================
   מדריך
   ============================================================ */
function viewGuide() {
  return `<div class="card guide">
    <h3>📖 פורמט הווינר — מה חייבים לדעת</h3>
    <ul>
      <li><b>חישוב זכייה:</b> סכום ההימור × מכפלת היחסים. דוגמה: ₪100 על יחס 2.50 ויחס 1.50 בצירוף = ₪375.</li>
      <li><b>סכומים:</b> מינימום ₪10 לטופס, בכפולות של ₪5.</li>
      <li><b>סימוני אירועים:</b> S = מותר הימור בודד · D = חובה לצרף אירוע נוסף · ללא סימון = חובה צירוף 3+. רוב משחקי המונדיאל מסומנים S.</li>
      <li><b>1X2 נקבע ב-90 דקות בלבד</b> — בנוק-אאוט שוק "מי יעפיל" (כולל הארכה ופנדלים) הוא שוק נפרד!</li>
    </ul>
    <h3>🧠 חמשת כללי הזהב של המערכת</h3>
    <ol>
      <li><b>ערך לפני הכל:</b> מהמרים רק כש-P(מודל) × יחס ווינר &gt; 1.07. העמלה של הווינר (10%–18%) הופכת את רוב ההימורים לתוחלת שלילית.</li>
      <li><b>סינגלים, לא צירופים:</b> כל בחירה בצירוף מוסיפה את עמלת הבית שלה. צירוף 5 "בטוחים" = הימור גרוע.</li>
      <li><b>להימנע מיחסים מתחת 1.35:</b> שם העמלה היחסית הכי דורסנית.</li>
      <li><b>זהירות במחזור 3 של הבתים:</b> קבוצות שהעפילו מורידות הילוך — המודל (וגם השוק) פחות אמינים שם.</li>
      <li><b>ניהול בנקרול:</b> 1%–2% מהבנקרול להימור, קבוע. בלי "להכפיל כדי לחזור".</li>
    </ol>
    <h3>🌎 גורמים ייחודיים למונדיאל 2026 (מגולמים חלקית במודל)</h3>
    <table>
      <tr><th>גורם</th><th>השפעה</th></tr>
      <tr><td>ביתיות מקסיקו/ארה"ב/קנדה</td><td>+50 Elo במודל. אצטקה בגובה 2,240מ' — יתרון נוסף למקסיקו שלא מגולם במלואו</td></tr>
      <tr><td>חום קיץ בצהריים (משחקי 12:00)</td><td>פוגע בקבוצות פרסינג אירופיות; יתרון לדרום-אמריקאיות ואפריקאיות</td></tr>
      <tr><td>נסיעות ענק בין ערים</td><td>קבוצות עם בסיס-קבע (מארחות) נשחקות פחות</td></tr>
      <tr><td>פורמט 48 קבוצות חדש</td><td>8 שלישיות עולות מ-12 בתים → "העפלה" שווה יותר ממה שנדמה לאנדרדוגיות</td></tr>
      <tr><td>מוטיבציות מיוחדות</td><td>מסי (39) ורונאלדו (41) במונדיאל אחרון; דשאן נפרד מצרפת</td></tr>
    </table>
    <h3>⚠️ הימור אחראי</h3>
    <p>המערכת היא כלי ניתוח, לא מכונת כסף. גם הימור-ערך מפסיד בחלק גדול מהפעמים — היתרון הוא סטטיסטי וארוך-טווח בלבד.
    אם ההימורים מפסיקים להיות בידור — קו תמיכה: <b dir="ltr">*5777</b>.</p>
  </div>`;
}

/* ---------- אירועים ---------- */
function bindEvents() {
  const gs = $("#group-sel");
  if (gs) gs.addEventListener("change", () => { selGroup = gs.value; selFixture = null; render(); });

  document.querySelectorAll(".fixture").forEach(f =>
    f.addEventListener("click", () => { selFixture = f.dataset.fix.split("|"); render(); }));

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
      <h2>${t.flag} ${t.nameHe} <span class="pill">${t.nameEn}</span></h2>
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
