/* ============================================================
   הרכבת סוגריי נוק-אאוט מתוצאות ה-API — לוגיקה טהורה (ללא רשת),
   כדי שתהיה ניתנת לבדיקת-יחידה. נטענת ע"י scripts/update-results.js.

   הקלט: מערך משחקי-נוק-אאוט מנורמלים, כל אחד:
     { round: "R32"|"R16"|"QF"|"SF"|"F", a: idA, b: idB,
       winner: idOrNull, date: "YYYY-MM-DD..." }
     a/b — קודי-נבחרת בכיוון ה-API (בית/חוץ); winner — הנבחרת שהעפילה
     (כולל הארכה/פנדלים) או null אם טרם הוכרע.

   הפלט: { r32: [[a,b] × 16], winners: {matchId: id}, stage }
     r32 — 16 זוגות לפי סדר הסוגריים (זוגות ריקים = [null,null]).
     winners — מנצחת בפועל לכל משחק שהוכרע, לפי מזהה סוגריים.
     stage — הסיבוב הרחוק ביותר שנצפה, או null אם אין משחקי נוק-אאוט.
   ============================================================ */

const ROUNDS = ["R32", "R16", "QF", "SF", "F"];

// תיוג סיבוב לפי שדה stage של football-data.org (עמיד לגרסאות שם שונות).
// מחזיר null עבור שלב הבתים ומשחק המקום השלישי (לא חלק מהסוגריים).
function classifyRound(stage) {
  const s = String(stage || "").toUpperCase().replace(/[\s-]+/g, "_");
  if (/THIRD_PLACE|3RD_PLACE/.test(s)) return null;
  if (/(LAST_32|ROUND_OF_32)/.test(s)) return "R32";
  if (/(LAST_16|ROUND_OF_16)/.test(s)) return "R16";
  if (/QUARTER/.test(s)) return "QF";
  if (/SEMI/.test(s)) return "SF";
  if (/^FINAL$|_FINAL$|^FINAL_|GRAND_FINAL/.test(s)) return "F";
  return null; // GROUP_STAGE וכל השאר
}

// מיון יציב: לפי תאריך ואז לפי זוג הנבחרות (דטרמיניסטי).
function sortMatches(arr) {
  return arr.slice().sort((x, y) =>
    String(x.date || "").localeCompare(String(y.date || "")) ||
    (x.a + "|" + x.b).localeCompare(y.a + "|" + y.b));
}

// סידור סיבוב-הבן כך שזוג המשחקים שמזינים את משחק-האב k יופיעו במקומות
// 2k, 2k+1. משחקים שאב שלהם עדיין לא ידוע/לא הוכרע — נצמדים בסוף לפי הסדר.
// עמיד: אם מזין לא נמצא (טרם הוכרע) — מוצב placeholder null במקומו.
function orderByFeeders(children, parents) {
  const used = new Set();
  const out = [];
  const findChild = (teamId) => {
    if (!teamId) return -1;
    // האב הגיע ממשחק-בן שהמנצחת שלו היא teamId
    return children.findIndex((c, i) => !used.has(i) && c && c.winner === teamId);
  };
  for (const p of parents) {
    // אב חסר (placeholder מסיבוב גבוה יותר שטרם נודע) — שני סלוטים ריקים
    if (!p) { out.push(null, null); continue; }
    for (const part of [p.a, p.b]) {
      const idx = findChild(part);
      if (idx >= 0) { out.push(children[idx]); used.add(idx); }
      else out.push(null); // מזין טרם הוכרע
    }
  }
  // משחקי-בן שטרם משויכים לאב (הסיבוב הבא טרם שוחק) — בסוף, לפי הסדר
  children.forEach((c, i) => { if (!used.has(i)) out.push(c); });
  return out;
}

function assembleKnockout(koMatches) {
  const byRound = {};
  ROUNDS.forEach((r) => (byRound[r] = []));
  for (const m of koMatches || [])
    if (byRound[m.round] && m.a && m.b) byRound[m.round].push(m);
  ROUNDS.forEach((r) => (byRound[r] = sortMatches(byRound[r])));

  // הסיבוב הרחוק ביותר שנצפה מעגן את הסדר; משם יורדים ומסדרים לפי מזינים.
  let topIdx = -1;
  for (let i = ROUNDS.length - 1; i >= 0; i--)
    if (byRound[ROUNDS[i]].length) { topIdx = i; break; }
  if (topIdx < 0) return { r32: [], winners: {}, stage: null, matches: [] };

  const ordered = {};
  ordered[ROUNDS[topIdx]] = byRound[ROUNDS[topIdx]].slice();
  for (let i = topIdx - 1; i >= 0; i--)
    ordered[ROUNDS[i]] = orderByFeeders(byRound[ROUNDS[i]], ordered[ROUNDS[i + 1]]);

  const r32src = ordered["R32"] || [];
  const r32 = Array.from({ length: 16 }, (_, i) => {
    const m = r32src[i];
    return m ? [m.a, m.b] : [null, null];
  });

  const winners = {};
  // רשימה שטוחה של כל משחקי הנוק-אאוט הידועים (ששוחקו או שטרם שוחקו אך
  // הנבחרות בהם ידועות) עם מזהה-סוגריים, תאריך ותוצאה — לתצוגת
  // "תוצאות אחרונות" ו"משחקי היום" בעמוד הראשי.
  const matches = [];
  for (let i = 0; i <= topIdx; i++) {
    (ordered[ROUNDS[i]] || []).forEach((m, k) => {
      if (!m) return;
      const id = ROUNDS[i] + "-" + (k + 1);
      if (m.winner) winners[id] = m.winner;
      const row = { id, round: ROUNDS[i], a: m.a, b: m.b, d: m.date || null };
      if (m.hg != null) {
        row.hg = m.hg; row.ag = m.ag;
        if (m.et) row.et = true;
        if (m.penH != null) { row.penH = m.penH; row.penA = m.penA; }
      }
      if (m.winner) row.winner = m.winner;
      matches.push(row);
    });
  }

  return { r32, winners, stage: ROUNDS[topIdx], matches };
}

// הנבחרת שהעפילה ממשחק נוק-אאוט לפי אובייקט score של football-data
// (כולל הארכה/פנדלים), או null אם טרם הוכרע. idH/idA — קודי בית/חוץ.
function koAdvancer(score, idH, idA) {
  const sc = score || {};
  if (sc.winner === "HOME_TEAM") return idH;
  if (sc.winner === "AWAY_TEAM") return idA;
  const pen = sc.penalties || {};
  if (pen.home != null && pen.away != null) {
    if (+pen.home > +pen.away) return idH;
    if (+pen.away > +pen.home) return idA;
  }
  return null;
}

// המרת משחקי-API לצורה המנורמלת ({round,a,b,winner,date,hg,ag,et,penH,penA}).
// resolveId(teamObj) — פונקציה שמזהה קוד-נבחרת מאובייקט קבוצה של ה-API.
// נכללים גם משחקים עתידיים שהנבחרות בהם כבר ידועות (ללא תוצאה) — הם
// נותנים ללוח "משחקי היום" את מפגשי הנוק-אאוט הקרובים.
function normalizeKnockout(allMatches, resolveId) {
  const out = [];
  for (const m of allMatches || []) {
    const round = classifyRound(m.stage);
    if (!round) continue;
    const idH = resolveId(m.homeTeam || {});
    const idA = resolveId(m.awayTeam || {});
    if (!idH || !idA) continue; // נבחרות טרם נקבעו (TBD)
    const sc = m.score || {};
    const ft = sc.fullTime || {};
    const row = { round, a: idH, b: idA, winner: koAdvancer(sc, idH, idA),
      date: (m.utcDate || "").slice(0, 10) };
    if (ft.home != null && ft.away != null) {
      // fullTime כולל הארכה (לא פנדלים) — התוצאה הסופית להצגה
      row.hg = +ft.home; row.ag = +ft.away;
      if (sc.duration && sc.duration !== "REGULAR") row.et = true;
      const pen = sc.penalties || {};
      if (pen.home != null && pen.away != null) { row.penH = +pen.home; row.penA = +pen.away; }
    }
    out.push(row);
  }
  return out;
}

// סדרת בלוק הנוק-אאוט לכתיבה חזרה ל-data.js (בין הסמנים KO:START/END)
function serializeKnockout(ko) {
  const r32 = (ko.r32 && ko.r32.length)
    ? "[\n" + ko.r32.map(p =>
        `      [${p[0] ? `"${p[0]}"` : "null"}, ${p[1] ? `"${p[1]}"` : "null"}]`).join(",\n") + "\n    ]"
    : "[]";
  const wk = Object.keys(ko.winners || {});
  const winners = wk.length
    ? "{\n" + wk.map(k => `      "${k}": "${ko.winners[k]}"`).join(",\n") + "\n    }"
    : "{}";
  const ms = ko.matches || [];
  const matches = ms.length
    ? "[\n" + ms.map(m => {
        let s = `      { id: "${m.id}", round: "${m.round}", a: "${m.a}", b: "${m.b}", d: ${m.d ? `"${m.d}"` : "null"}`;
        if (m.hg != null) s += `, hg: ${m.hg}, ag: ${m.ag}`;
        if (m.et) s += ", et: true";
        if (m.penH != null) s += `, penH: ${m.penH}, penA: ${m.penA}`;
        if (m.winner) s += `, winner: "${m.winner}"`;
        return s + " }";
      }).join(",\n") + "\n    ]"
    : "[]";
  return `    r32: ${r32},\n    winners: ${winners},\n    stage: ${ko.stage ? `"${ko.stage}"` : "null"},\n    matches: ${matches}`;
}

module.exports = {
  classifyRound, orderByFeeders, assembleKnockout, ROUNDS,
  koAdvancer, normalizeKnockout, serializeKnockout
};
