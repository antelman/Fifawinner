#!/usr/bin/env node
/* ============================================================
   עדכון תוצאות אוטומטי — נקרא ע"י GitHub Action פעמיים ביום.
   מושך תוצאות מ-TheSportsDB (חינמי), ממפה שמות → קודי נבחרות,
   מתאים לכיוון הפיקסצ'ר בלוח, וכותב בחזרה ל-js/data.js בין הסמנים.
   בטוח: אם המשיכה נכשלת/אין חדש — יוצא ללא שינוי.
   הרצה ידנית:  node scripts/update-results.js
   ============================================================ */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const DATA = require(path.join(root, "js/data.js"));

const API_KEY = process.env.SPORTSDB_KEY || "3"; // מפתח-בדיקה ציבורי חינמי
const LEAGUE_QUERIES = ["FIFA_World_Cup", "FIFA World Cup"];

// נרמול שם לצורך התאמה: אותיות קטנות, ללא ניקוד/סימנים
const norm = (s) => (s || "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

// כינויים נפוצים של TheSportsDB → קוד נבחרת
const ALIAS = {
  unitedstates: "USA", usa: "USA", southkorea: "KOR", korearepublic: "KOR",
  turkey: "TUR", turkiye: "TUR", ivorycoast: "CIV", cotedivoire: "CIV",
  bosniaandherzegovina: "BIH", bosniaherzegovina: "BIH", southafrica: "RSA",
  capeverde: "CPV", caboverde: "CPV", drcongo: "COD", congodr: "COD",
  democraticrepublicofcongo: "COD", czechrepublic: "CZE", czechia: "CZE",
  iran: "IRN", saudiarabia: "KSA", newzealand: "NZL", uzbekistan: "UZB"
};

// מפה: שם מנורמל → קוד, מתוך nameEn של כל הנבחרות + הכינויים
const NAME2ID = {};
for (const id in DATA.teams) NAME2ID[norm(DATA.teams[id].nameEn)] = id;
Object.assign(NAME2ID, ALIAS);
function resolveId(name) {
  const n = norm(name);
  if (NAME2ID[n]) return NAME2ID[n];
  for (const key in NAME2ID) if (key && (key.includes(n) || n.includes(key))) return NAME2ID[key];
  return null;
}

// פיקסצ'ר בלוח עבור זוג נבחרות (ללא תלות בכיוון) → {g, home, away}
function fixtureFor(idX, idY) {
  for (const fx of DATA.schedule)
    if ((fx.h === idX && fx.a === idY) || (fx.h === idY && fx.a === idX))
      return fx;
  return null;
}

async function fetchDay(dateStr) {
  for (const lq of LEAGUE_QUERIES) {
    const url = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsday.php?d=${dateStr}&l=${encodeURIComponent(lq)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const j = await res.json();
      if (j && Array.isArray(j.events) && j.events.length) return j.events;
    } catch (e) { /* ננסה את הזיהוי הבא */ }
  }
  return [];
}

function tournamentDates() {
  const dates = [...new Set(DATA.schedule.map(x => x.d))].sort();
  const today = new Date().toLocaleDateString("en-CA");
  return dates.filter(d => d <= today);
}

(async () => {
  const existing = new Map(); // "HOME|AWAY" → row
  for (const r of DATA.results) existing.set(r.home + "|" + r.away, r);

  let added = 0;
  for (const d of tournamentDates()) {
    const events = await fetchDay(d);
    for (const ev of events) {
      const hs = ev.intHomeScore, as = ev.intAwayScore;
      if (hs == null || as == null || hs === "" || as === "") continue; // טרם הסתיים
      const status = (ev.strStatus || "").toUpperCase();
      if (status && !["FT", "MATCH FINISHED", "AET", "PEN", "FINISHED"].includes(status)) continue;
      const idH = resolveId(ev.strHomeTeam), idA = resolveId(ev.strAwayTeam);
      if (!idH || !idA) { console.warn("לא זוהה:", ev.strHomeTeam, "vs", ev.strAwayTeam); continue; }
      const fx = fixtureFor(idH, idA);
      if (!fx) continue;
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
  }

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
