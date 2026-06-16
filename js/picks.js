/* ============================================================
   FifaWinner — ליבת בחירת ההמלצות (משותף ל-UI ולסקריפט העדכון)
   ------------------------------------------------------------
   "מקור האמת" לאילו 3 שווקים המלצנו לכל משחק. גם הממשק וגם
   scripts/update-results.js נשענים עליו, כך שהעדכון האוטומטי
   יודע בדיוק אילו נתונים משלימים צריך למשוך (מבקיע ראשון/מחצית)
   לכל סוג המלצה שנתנו — בלי מילוי ידני.

   הערה: ה-UI מוסיף מעל זה כיול-משפחה עדין (familyBoost) שמשנה
   רק את *סדר* ההמלצות; קבוצת השווקים שנבחרת זהה ברובם המכריע.
   לצורך החלטה "אילו נתונים למשוך" די בבחירה הבסיסית הזו.
   ============================================================ */
(function (root) {
  // הנתון המשלים שכל סיומת-שוק דורשת לשם שיפוט:
  //   "ht"    — תוצאת מחצית ראשונה (htHg/htAg)
  //   "first" — מי הבקיע ראשון (firstScorer)
  //   null    — נגזר מתוצאת 90 דקות (לא דרוש נתון משלים)
  function dataNeededFor(suffix) {
    if (suffix === "FG1" || suffix === "FG2" || suffix === "FG0") return "first";
    if (suffix === "GBH") return "ht";
    if (suffix === "HT1" || suffix === "HTX" || suffix === "HT2") return "ht";
    if (suffix.startsWith("HTFT")) return "ht";
    return null;
  }

  // בונה את רשימת מועמדי השווקים למשחק (זהה ל-buildMatchCandidates ב-UI,
  // אך מחזיר רק suffix+p+family — מה שצריך לבחירה ולמשיכת נתונים).
  function buildCandidates(MODEL, A, B, asOf) {
    const m = MODEL.markets(A, B, asOf);
    const ex = MODEL.extendedMarkets(A, B, asOf);
    return [
      { s: "1", p: m.p1, family: "result" },
      { s: "2", p: m.p2, family: "result" },
      { s: "X", p: m.px, family: "result" },
      { s: "1X", p: m.dc1x, family: "result" },
      { s: "X2", p: m.dcx2, family: "result" },
      { s: "H-1:1", p: ex.hcapA_minus1.p1, family: "result" },
      { s: "H-2:1", p: ex.hcapA_minus2.p1, family: "result" },
      { s: "WB2A", p: ex.winBy2A, family: "result" },
      { s: "WB2B", p: ex.winBy2B, family: "result" },
      { s: "O25", p: m.over25, family: "goals" },
      { s: "U25", p: m.under25, family: "goals" },
      { s: "O15", p: m.over15, family: "goals" },
      { s: "BTTS", p: m.btts, family: "goals" },
      { s: "NBTTS", p: m.noBtts, family: "goals" },
      { s: "R23", p: ex.range23, family: "goals" },
      { s: "FG1", p: ex.firstGoalA, family: "halves" },
      { s: "FG2", p: ex.firstGoalB, family: "halves" },
      { s: "HT1", p: ex.ht1, family: "halves" },
      { s: "HTX", p: ex.htx, family: "halves" },
      { s: "GBH", p: ex.goalBothHalves, family: "halves" }
    ];
  }

  // 3 ההמלצות הבסיסיות: סינון לטווח השימושי, ניקוד sweet-spot+הסתברות+ביטחון,
  // המלצה אחת לכל היותר לכל משפחה. מחזיר מערך של suffixes (עד 3).
  function topPickSuffixes(MODEL, A, B, asOf) {
    const sweet = (p) => p >= 0.45 && p <= 0.8 ? 2 : p > 0.8 && p <= 0.88 ? 1 : p >= 0.35 && p < 0.45 ? 1 : 0;
    const gap = Math.abs(MODEL.effElo(A, asOf) - MODEL.effElo(B, asOf));
    const scored = buildCandidates(MODEL, A, B, asOf)
      .filter((x) => x.p >= 0.33 && x.p <= 0.88)
      .map((x) => ({ ...x, score: sweet(x.p) * 10 + x.p * 5 + MODEL.confidence(x.p, gap) }))
      .sort((x, y) => y.score - x.score);
    const out = [], used = new Set();
    for (const x of scored) {
      if (used.has(x.family)) continue;
      used.add(x.family);
      out.push(x.s);
      if (out.length === 3) break;
    }
    return out;
  }

  // אילו נתונים משלימים צריך למשוך למשחק לפי ההמלצות שנתנו לו.
  // מחזיר { ht: bool, first: bool }.
  function neededExtras(MODEL, A, B, asOf) {
    const need = { ht: false, first: false };
    for (const s of topPickSuffixes(MODEL, A, B, asOf)) {
      const d = dataNeededFor(s);
      if (d === "ht") need.ht = true;
      else if (d === "first") need.first = true;
    }
    return need;
  }

  const api = { dataNeededFor, topPickSuffixes, neededExtras };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PICKS = api;
})(typeof window !== "undefined" ? window : globalThis);
