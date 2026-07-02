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
// המודל ניגש ל-DATA כגלובל (כמו בדפדפן עם תגי script) — חושפים אותו לפני הטעינה
const DATA = require(path.join(root, "js/data.js"));
global.DATA = DATA;
const MODEL = require(path.join(root, "js/model.js"));
const PICKS = require(path.join(root, "js/picks.js"));
const KOA = require(path.join(__dirname, "ko-assemble.js"));

const API_KEY = process.env.FOOTBALL_DATA_KEY || "";
const COMPETITION = process.env.FOOTBALL_DATA_COMP || "WC"; // World Cup
const BASE = "https://api.football-data.org/v4";

// מקור משלים למבקיע-ראשון (חסר ב-football-data.org החינמי).
// נמשך אך ורק למשחקים שבהם המלצנו על "מבקיעה ראשונה" — חוסך בקשות
// (ציר-הזמן מוגבל ל-5 בקשות במפתח החינמי "123").
const TSDB_KEY = process.env.THESPORTSDB_KEY || "123";
const TSDB_BASE = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}`;

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

/* ---------- שלב הנוק-אאוט ----------
   מושך את כל משחקי התחרות (כל הסטטוסים) כדי לקבל גם זיווגים שטרם שוחקו,
   מסנן לשלבי הנוק-אאוט, וממיר לצורה מנורמלת ל-ko-assemble. */
async function fetchAllMatches() {
  if (!API_KEY) return null;
  const url = `${BASE}/competitions/${COMPETITION}/matches`;
  try {
    const res = await fetch(url, {
      headers: { "X-Auth-Token": API_KEY },
      signal: AbortSignal.timeout(20000)
    });
    console.log(`HTTP ${res.status} ${url}`);
    if (!res.ok) return null;
    const j = await res.json();
    return Array.isArray(j.matches) ? j.matches : [];
  } catch (e) {
    console.error("⚠️  שגיאת רשת (נוק-אאוט):", e.message);
    return null;
  }
}

/* ---------- מבקיע-ראשון מ-TheSportsDB ----------
   מאתר את האירוע (event) לפי שמות הנבחרות + עונה, מושך את ציר-הזמן,
   ומחזיר "H" / "A" / "none" בכיוון הלוח (fx.h=בית). מחזיר null אם
   לא נמצא/אין נתון — אז השוק פשוט יישאר "ממתין לנתון" (לעולם לא ניחוש). */
async function fetchJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn("TSDB שגיאת רשת:", e.message);
    return null;
  }
}

// מאתר event id של משחק לפי שמות הנבחרות (nameEn) ועונה (שנת המשחק)
async function tsdbFindEventId(idH, idA, dateISO) {
  const nH = encodeURIComponent(DATA.teams[idH].nameEn);
  const nA = encodeURIComponent(DATA.teams[idA].nameEn);
  const season = (dateISO || "").slice(0, 4) || "2026";
  // searchevents מחזיר את כל המפגשים בשם "Home vs Away"
  const j = await fetchJson(`${TSDB_BASE}/searchevents.php?e=${nH}_vs_${nA}&s=${season}`);
  let ev = j && Array.isArray(j.event) ? j.event[0] : null;
  if (!ev) { // ניסיון בכיוון ההפוך (יתכן שהמקור רשם בית/חוץ אחרת)
    const j2 = await fetchJson(`${TSDB_BASE}/searchevents.php?e=${nA}_vs_${nH}&s=${season}`);
    ev = j2 && Array.isArray(j2.event) ? j2.event[0] : null;
  }
  return ev ? { id: ev.idEvent, homeName: ev.strHomeTeam } : null;
}

// קובע אם אירוע ציר-זמן שייך לקבוצת הבית של המקור. עמיד למבני-API שונים:
// מנסה strHome (yes/1/home), ואז התאמת שם קבוצה (strTeam/strPlayerTeam) מול הבית.
function timelineEventIsHome(t, srcHomeName, srcAwayName) {
  const sh = String(t.strHome || "").toLowerCase();
  if (sh === "yes" || sh === "1" || sh === "home" || sh === "true") return true;
  if (sh === "no" || sh === "0" || sh === "away" || sh === "false") return false;
  // גיבוי: שם הקבוצה באירוע מול שמות הבית/חוץ של המשחק
  const team = norm(t.strTeam || t.strPlayerTeam || t.strEventTeam || "");
  if (team) {
    if (team === norm(srcHomeName) || norm(srcHomeName).includes(team) || team.includes(norm(srcHomeName))) return true;
    if (team === norm(srcAwayName) || norm(srcAwayName).includes(team) || team.includes(norm(srcAwayName))) return false;
  }
  return null; // לא ניתן לקבוע — נתעלם מהאירוע
}

// מבקיע-ראשון בכיוון הלוח (fx.h). norm מנורמל להשוואת שמות.
async function tsdbFirstScorer(idH, idA, dateISO) {
  const ev = await tsdbFindEventId(idH, idA, dateISO);
  if (!ev) return null;
  const tl = await fetchJson(`${TSDB_BASE}/lookuptimeline.php?id=${ev.id}`);
  const items = tl && Array.isArray(tl.timeline) ? tl.timeline : null;
  if (!items || !items.length) return null;
  // אירועי שער בלבד (לא פנדלים בתום משחק), ממוינים לפי דקה
  const goals = items
    .filter((t) => /goal/i.test(t.strTimeline || "") && !/penalty\s*shoot/i.test((t.strTimelineDetail || "") + (t.strTimeline || "")))
    .map((t) => ({ min: parseInt(t.intTime, 10) || 0, isHome: timelineEventIsHome(t, ev.homeName, ev.awayName) }))
    .filter((g) => g.isHome !== null)
    .sort((a, b) => a.min - b.min);
  if (!goals.length) return "none"; // אין שערים מזוהים — תיקו 0-0
  // הצד שהבקיע ראשון לפי המקור → כיוון הלוח (fx.h)
  const firstSideHomeInSource = goals[0].isHome;
  const evHomeIsOurH = norm(ev.homeName) === norm(DATA.teams[idH].nameEn);
  const scorerIsOurHome = evHomeIsOurH ? firstSideHomeInSource : !firstSideHomeInSource;
  return scorerIsOurHome ? "H" : "A";
}

(async () => {
  const matches = await fetchFinishedMatches();
  if (matches === null) return; // כשל משיכה — לא נוגעים בנתונים

  const existing = new Map(); // "HOME|AWAY" → row
  for (const r of DATA.results) existing.set(r.home + "|" + r.away, r);

  let added = 0, enriched = 0, skippedUnmatched = 0, skippedNoFixture = 0;
  for (const m of matches) {
    const ft = (m.score && m.score.fullTime) || {};
    const hs = ft.home, as = ft.away;
    if (hs == null || as == null) continue; // ללא תוצאת 90 דקות
    const htScore = (m.score && m.score.halfTime) || {};
    const htHsrc = htScore.home, htAsrc = htScore.away; // תוצאת מחצית מהמקור (אם קיימת)

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

    // התאמת התוצאה לכיוון הלוח
    const hg = fx.h === idH ? +hs : +as;
    const ag = fx.h === idH ? +as : +hs;
    const htHg = (htHsrc != null && htAsrc != null) ? (fx.h === idH ? +htHsrc : +htAsrc) : null;
    const htAg = (htHsrc != null && htAsrc != null) ? (fx.h === idH ? +htAsrc : +htHsrc) : null;
    // אילו נתונים משלימים נדרשים לפי ההמלצות שנתנו למשחק
    const need = PICKS.neededExtras(MODEL, DATA.teams[fx.h], DATA.teams[fx.a], fx.d);

    const prev = existing.get(fx.h + "|" + fx.a);
    if (prev) {
      // שורה קיימת — משלימים נתון חסר (לא נוגעים בתוצאה)
      let changed = false;
      // תוצאת מחצית: נשמרת תמיד כשזמינה — נחוצה ללמידת נטיית-מחציות לכל נבחרת
      if (prev.htHg == null && htHg != null) { prev.htHg = htHg; prev.htAg = htAg; changed = true; }
      // מבקיע-ראשון: נמשך רק אם המלצנו על השוק (חוסך בקשות TheSportsDB)
      if (need.first && !prev.firstScorer) {
        const fs1 = await tsdbFirstScorer(fx.h, fx.a, fx.d);
        if (fs1) { prev.firstScorer = fs1; changed = true; }
        else console.warn(`  ⚠️ מבקיע-ראשון לא נמצא ל-${fx.h}-${fx.a} (יישאר ממתין)`);
      }
      if (changed) {
        enriched++;
        console.log(`~ ${fx.h}-${fx.a} הושלם:${prev.htHg != null ? ` מחצית ${prev.htHg}-${prev.htAg}` : ""}${prev.firstScorer ? ` מבקיע ${prev.firstScorer}` : ""}`);
      }
      continue;
    }

    const row = { g: fx.g, home: fx.h, away: fx.a, hg, ag };
    // תוצאת מחצית — נשמרת תמיד כשזמינה (חינם מאותו אובייקט; נחוצה ללמידה ולשיפוט)
    if (htHg != null) { row.htHg = htHg; row.htAg = htAg; }
    // מבקיע-ראשון — נמשך מ-TheSportsDB רק אם המלצנו על השוק במשחק זה
    if (need.first) {
      const fs1 = await tsdbFirstScorer(fx.h, fx.a, fx.d);
      if (fs1) row.firstScorer = fs1;
      else console.warn(`  ⚠️ מבקיע-ראשון לא נמצא ל-${fx.h}-${fx.a} (יישאר ממתין)`);
    }
    DATA.results.push(row);
    existing.set(fx.h + "|" + fx.a, row);
    added++;
    console.log(`+ ${fx.h} ${hg}-${ag} ${fx.a}` +
      `${row.htHg != null ? ` (מחצית ${row.htHg}-${row.htAg})` : ""}` +
      `${row.firstScorer ? ` (מבקיע ראשון: ${row.firstScorer})` : ""}`);
  }

  console.log(`סיכום: נוספו ${added}, הושלמו ${enriched}, לא-זוהו ${skippedUnmatched}, מחוץ-ללוח ${skippedNoFixture}.`);

  // ---------- שלב הנוק-אאוט ----------
  // נמשך בנפרד (כל הסטטוסים) ומורכב לסוגריים. אי-משיכה → משאירים כמו שהוא.
  let koChanged = false, ko = DATA.knockout;
  const allMatches = await fetchAllMatches();
  if (allMatches !== null) {
    const koMatches = KOA.normalizeKnockout(allMatches, resolveId);
    const built = KOA.assembleKnockout(koMatches);
    if (JSON.stringify(built) !== JSON.stringify({
      r32: DATA.knockout.r32 || [], winners: DATA.knockout.winners || {},
      stage: DATA.knockout.stage ?? null, matches: DATA.knockout.matches || []
    })) {
      ko = built; koChanged = true;
      console.log(`נוק-אאוט עודכן: שלב=${built.stage}, זיווגי R32=${built.r32.filter(p => p[0] && p[1]).length}, מנצחות=${Object.keys(built.winners).length}, משחקים=${(built.matches || []).length}`);
    } else {
      console.log(`נוק-אאוט: אין שינוי (${koMatches.length} משחקי נוק-אאוט במקור).`);
    }
  } else {
    console.log("נוק-אאוט: משיכה נכשלה/אין מפתח — נשאר כפי שהוא.");
  }

  // אין תוצאה חדשה, לא הושלם נתון-על, ואין שינוי בנוק-אאוט → אין מה לכתוב.
  // יוצאים מיד בלי לגעת בקובץ, כדי שלא ייווצר קומיט מיותר (כל קומיט = build/deploy).
  // התאריך בפוטר מתרענן רק כשבאמת נדחף עדכון — ריצות "ריקות" שקופות לחלוטין.
  if (!added && !enriched && !koChanged) {
    console.log("אין תוצאות חדשות ואין שינוי בנוק-אאוט — אין שינוי (לא נדחף קומיט).");
    return;
  }

  const today = new Date().toLocaleDateString("en-CA");
  const file = path.join(root, "js/data.js");
  let src = fs.readFileSync(file, "utf8");

  {
    // סדר התוצאות לפי הופעתן בלוח (יציב), ושכתוב הבלוק בין הסמנים
    const order = new Map(DATA.schedule.map((x, i) => [x.h + "|" + x.a, i]));
    DATA.results.sort((a, b) => (order.get(a.home + "|" + a.away) ?? 99) - (order.get(b.home + "|" + b.away) ?? 99));
    const lines = DATA.results.map(r => {
      // שדות חובה + נתוני-על אופציונליים (מחצית/מבקיע ראשון) כשקיימים —
      // כך נשמר גם מידע שמולא ידנית להמלצות מחצית/מבקיעה-ראשונה.
      let s = `    { g: "${r.g}", home: "${r.home}", away: "${r.away}", hg: ${r.hg}, ag: ${r.ag}`;
      if (r.htHg != null && r.htAg != null) s += `, htHg: ${r.htHg}, htAg: ${r.htAg}`;
      if (r.firstScorer) s += `, firstScorer: "${r.firstScorer}"`;
      return s + " }";
    }).join(",\n");
    src = src.replace(
      /\/\* RESULTS:START[\s\S]*?RESULTS:END \*\//,
      `/* RESULTS:START — נערך אוטומטית; אל תוסיפו טקסט בתוך הבלוק הזה */\n${lines}\n    /* RESULTS:END */`);
  }

  // בלוק הנוק-אאוט — נכתב תמיד (אידמפוטנטי; משתנה רק כשהסוגריים השתנו)
  src = src.replace(
    /\/\* KO:START[\s\S]*?KO:END \*\//,
    `/* KO:START — נערך אוטומטית; אל תוסיפו טקסט בתוך הבלוק הזה */\n${KOA.serializeKnockout(ko)}\n    /* KO:END */`);

  src = src.replace(/updated:\s*"[^"]*"/, `updated: "${today}"`);
  fs.writeFileSync(file, src);
  console.log(`עודכנו ${added} תוצאות חדשות, ${enriched} הושלמו בנתוני-על${koChanged ? ", + נוק-אאוט" : ""}. סה"כ ${DATA.results.length}. תאריך: ${today}`);
})();
