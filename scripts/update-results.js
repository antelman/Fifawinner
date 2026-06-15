#!/usr/bin/env node
/* ============================================================
   עדכון תוצאות אוטומטי — נקרא ע"י GitHub Action שלוש פעמים ביום.
   מקור: football-data.org (תחרות World Cup, קוד "WC").
   ממפה שמות/קודי-נבחרת → קודי DATA.teams, מתאים לכיוון הפיקסצ'ר
   בלוח, וכותב בחזרה ל-js/data.js בין הסמנים.
   בטוח: אם המשיכה נכשלת/אין חדש — יוצא ללא שינוי (לא מוחק כלום).
   דורש secret:  FOOTBALL_DATA_KEY  (מפתח חינמי מ-football-data.org)
   הרצה ידנית:  FOOTBALL_DATA_KEY=xxx node scripts/update-results.js
   ============================================================ */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const DATA = require(path.join(root, "js/data.js"));

const API_KEY = process.env.FOOTBALL_DATA_KEY || "";
const COMPETITION = process.env.FOOTBALL_DATA_COMP || "WC"; // World Cup
const BASE = "https://api.football-data.org/v4";

// נרמול שם לצורך התאמה: אותיות קטנות, ללא ניקוד/סימנים
const norm = (s) => (s || "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

// כינויים נפוצים → קוד נבחרת (כשהשם/הקוד מהמקור אינו תואם ישירות)
const ALIAS = {
  unitedstates: "USA", usa: "USA", southkorea: "KOR", korearepublic: "KOR",
  turkey: "TUR", turkiye: "TUR", ivorycoast: "CIV", cotedivoire: "CIV",
  bosniaandherzegovina: "BIH", bosniaherzegovina: "BIH", southafrica: "RSA",
  capeverde: "CPV", caboverde: "CPV", drcongo: "COD", congodr: "COD",
  democraticrepublicofcongo: "COD", czechrepublic: "CZE", czechia: "CZE",
  iran: "IRN", saudiarabia: "KSA", newzealand: "NZL", uzbekistan: "UZB",
  algeria: "ALG"
};

// מפה: שם מנורמל → קוד, מתוך nameEn של כל הנבחרות + הכינויים
const NAME2ID = {};
for (const id in DATA.teams) NAME2ID[norm(DATA.teams[id].nameEn)] = id;
Object.assign(NAME2ID, ALIAS);

function resolveId(team) {
  // team = אובייקט מ-football-data: { name, shortName, tla }
  const tla = (team.tla || "").toUpperCase();
  if (tla && DATA.teams[tla]) return tla;            // קוד שלוש-אותיות תואם ישירות
  for (const cand of [team.shortName, team.name]) {
    const n = norm(cand);
    if (!n) continue;
    if (NAME2ID[n]) return NAME2ID[n];
    for (const key in NAME2ID)
      if (key && (key.includes(n) || n.includes(key))) return NAME2ID[key];
  }
  return null;
}

// פיקסצ'ר בלוח עבור זוג נבחרות (ללא תלות בכיוון) → {g, h, a}
function fixtureFor(idX, idY) {
  for (const fx of DATA.schedule)
    if ((fx.h === idX && fx.a === idY) || (fx.h === idY && fx.a === idX))
      return fx;
  return null;
}

async function fetchFinishedMatches() {
  if (!API_KEY) {
    console.error("⚠️  אין FOOTBALL_DATA_KEY — הגדירו secret במאגר. יוצא ללא שינוי.");
    return null;
  }
  const url = `${BASE}/competitions/${COMPETITION}/matches?status=FINISHED`;
  try {
    const res = await fetch(url, {
      headers: { "X-Auth-Token": API_KEY },
      signal: AbortSignal.timeout(20000)
    });
    console.log(`HTTP ${res.status} ${url}`);
    if (!res.ok) {
      console.error("⚠️  תגובה לא תקינה מהמקור:", (await res.text()).slice(0, 300));
      return null;
    }
    const j = await res.json();
    const matches = Array.isArray(j.matches) ? j.matches : [];
    console.log(`נמשכו ${matches.length} משחקים שהסתיימו מהמקור.`);
    return matches;
  } catch (e) {
    console.error("⚠️  שגיאת רשת/timeout:", e.message, "— יוצא ללא שינוי.");
    return null;
  }
}

(async () => {
  const matches = await fetchFinishedMatches();
  if (matches === null) return; // כשל משיכה — לא נוגעים בנתונים

  const existing = new Map(); // "HOME|AWAY" → row
  for (const r of DATA.results) existing.set(r.home + "|" + r.away, r);

  let added = 0, skippedUnmatched = 0, skippedNoFixture = 0;
  for (const m of matches) {
    const ft = (m.score && m.score.fullTime) || {};
    const hs = ft.home, as = ft.away;
    if (hs == null || as == null) continue; // ללא תוצאת 90 דקות

    const idH = resolveId(m.homeTeam || {});
    const idA = resolveId(m.awayTeam || {});
    if (!idH || !idA) {
      const nh = (m.homeTeam || {}).name, na = (m.awayTeam || {}).name;
      console.warn("לא זוהה:", nh, "vs", na);
      skippedUnmatched++;
      continue;
    }
    const fx = fixtureFor(idH, idA);
    if (!fx) { skippedNoFixture++; continue; } // לא בלוח שלב הבתים שלנו
    if (existing.has(fx.h + "|" + fx.a)) continue; // כבר קיים

    // התאמת התוצאה לכיוון הלוח
    const hg = fx.h === idH ? +hs : +as;
    const ag = fx.h === idH ? +as : +hs;
    const row = { g: fx.g, home: fx.h, away: fx.a, hg, ag };
    DATA.results.push(row);
    existing.set(fx.h + "|" + fx.a, row);
    added++;
    console.log(`+ ${fx.h} ${hg}-${ag} ${fx.a}`);
  }

  console.log(`סיכום: נוספו ${added}, לא-זוהו ${skippedUnmatched}, מחוץ-ללוח ${skippedNoFixture}.`);
  if (!added) { console.log("אין תוצאות חדשות — אין שינוי."); return; }

  // סדר התוצאות לפי הופעתן בלוח (יציב), ושכתוב הבלוק בין הסמנים
  const order = new Map(DATA.schedule.map((x, i) => [x.h + "|" + x.a, i]));
  DATA.results.sort((a, b) => (order.get(a.home + "|" + a.away) ?? 99) - (order.get(b.home + "|" + b.away) ?? 99));
  const lines = DATA.results.map(r =>
    `    { g: "${r.g}", home: "${r.home}", away: "${r.away}", hg: ${r.hg}, ag: ${r.ag} }`).join(",\n");
  const today = new Date().toLocaleDateString("en-CA");

  const file = path.join(root, "js/data.js");
  let src = fs.readFileSync(file, "utf8");
  src = src.replace(
    /\/\* RESULTS:START[\s\S]*?RESULTS:END \*\//,
    `/* RESULTS:START — נערך אוטומטית; אל תוסיפו טקסט בתוך הבלוק הזה */\n${lines}\n    /* RESULTS:END */`);
  src = src.replace(/updated:\s*"[^"]*"/, `updated: "${today}"`);
  fs.writeFileSync(file, src);
  console.log(`עודכנו ${added} תוצאות חדשות. סה"כ ${DATA.results.length}. תאריך: ${today}`);
})();
