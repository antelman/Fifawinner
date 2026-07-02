/* בדיקת עשן לרינדור הממשק ללא דפדפן — node tests/smoke-ui.js */
global.DATA = require("../js/data.js");
global.MODEL = require("../js/model.js");
global.PROFILE = require("../js/profile.js");

// סטאבים מינימליים של דפדפן
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.window = { addEventListener: () => {} };
global.document = {
  addEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => []
};

const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
eval(src.replace(/let SIM = null;/, "SIM = null;").replace(/let KO = null;/, "KO = null;")
        .replace(/let selGroup = "A";/, 'selGroup = "A";').replace(/let selFixture = null;/, "selFixture = null;")
        .replace(/let BRACKET =/, "BRACKET =").replace(/let selKoMatch = null;/, "selKoMatch = null;"));

SIM = MODEL.simulateGroups(5000);
KO = MODEL.simulateChampion(2000);

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log((cond ? "✅" : "❌") + " " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
};

const recs = generateRecs();
// כמה משחקי-בתים עדיין לא שוחקו — קובע כמה המלצות-משחק אפשריות בכלל.
// בזמן שלב הבתים מצפים לשפע (≥15); משהסתיים — נשארות רק המלצות עתיד
// (אלופה/העפלה), ומיעוט המלצות הוא מצב תקין ולא כשל שיחסום את העדכון האוטומטי.
const _openGroupFixtures = Object.keys(DATA.groups).reduce((n, g) =>
  n + MODEL.groupFixtures(g).filter(([a, b]) => !resultOf(a, b)).length, 0);
check("נוצרו המלצות", _openGroupFixtures > 0 ? recs.length >= 15 : recs.length >= 1,
  `${recs.length} המלצות, ${_openGroupFixtures} משחקי בתים פתוחים`);
check("לכל המלצה הסתברות תקינה", recs.every(r => r.p > 0 && r.p <= 1));
check("אין המלצה על משחק שהסתיים", !recs.some(r => r.match.includes("מקסיקו") && r.match.includes("דרום אפריקה")));

const htmlRecs = viewRecs();
check("טאב המלצות מרונדר", htmlRecs.includes("rec") && htmlRecs.length > 2000);
check("מקטע משחקי היום/מחר", htmlRecs.includes("משחקי היום") || htmlRecs.includes("משחקי מחר") || htmlRecs.includes("אין משחקים"));
// ב-12.6 (תאריך הסביבה) יש משחקים בלוח — חייבים כרטיסי משחק עם המלצות
// יש משחקים היום/מחר בלוח? רק אז דורשים כרטיסי משחק יומיים
const _today = new Date().toLocaleDateString("en-CA");
const _tom = new Date(Date.now() + 864e5).toLocaleDateString("en-CA");
const _hasDayMatches = DATA.schedule.some(m => (m.d === _today || m.d === _tom) && !resultOf(m.h, m.a));
if (_hasDayMatches) {
  check("כרטיסי משחק יומיים עם 3 המלצות", htmlRecs.includes("🥇") && htmlRecs.includes("ניתוח מלא"));
}
// מאזן + לוח תוצאות (יש 8 תוצאות במאגר)
check("לוח תוצאות אחרונות מוצג", htmlRecs.includes("תוצאות אחרונות"));
check("מאזן ההמלצות מוצג", htmlRecs.includes("אחוז הצלחת ההמלצות") && htmlRecs.includes("פגעו"));
const tr = trackRecord();
check("מאזן: סך פגיעות+החטאות > 0", tr.total > 0, `${tr.hit}/${tr.total}`);
check("gradeKey עובד על תוצאה אמיתית", gradeKey("USA-PAR:1") === true && gradeKey("USA-PAR:U25") === false);
// משחק עתידי נבחר דינמית (משחק ראשון בלוח שעדיין אין לו תוצאה) —
// עמיד לעדכון התוצאות האוטומטי שממלא משחקים עם הזמן
const _futureFx = DATA.schedule.find(m => !resultOf(m.h, m.a));
if (_futureFx) check("gradeKey מחזיר null למשחק עתידי", gradeKey(`${_futureFx.h}-${_futureFx.a}:1`) === null);
check("באנר אחוז הצלחה עם %", htmlRecs.includes("אחוז הצלחת ההמלצות") && /\d+%/.test(htmlRecs));
// דף משחק שהסתיים מציג פסיקה
const finishedDetail = matchDetail("USA", "PAR", false);
check("דף משחק שהסתיים: תקציר פגיעות", finishedDetail.includes("ההמלצות שנשפטו במשחק זה"));
check("דף משחק שהסתיים: ✓/✗ בכרטיסים/טבלה", finishedDetail.includes("פגעה") || finishedDetail.includes("vmark"));
// דף משחק עתידי לא מציג פסיקה (אותו משחק עתידי דינמי)
if (_futureFx) {
  const futureDetail = matchDetail(_futureFx.h, _futureFx.a, false);
  check("דף משחק עתידי: ללא פסיקה", !futureDetail.includes("ההמלצות שנשפטו"));
}
const htmlGroups = viewGroups();
check("טאב בתים מרונדר (12 בתים)", (htmlGroups.match(/<h3>בית [A-L]/g) || []).length === 12);
selFixture = ["ESP", "URU"];
selGroup = "H";
const htmlMatches = viewMatches();
check("טאב משחקים + פירוט משחק", htmlMatches.includes("מעל 2.5") && htmlMatches.includes("התוצאות הסבירות ביותר"));
check("דף משחק: כרטיסי תוצאות סבירות עם בר", htmlMatches.includes("likely-scores") && htmlMatches.includes("ls-card"));
check("שווקים מורחבים בפירוט משחק", htmlMatches.includes("שווקים מורחבים") && htmlMatches.includes("יתרון 0:1")
  && htmlMatches.includes("מחצית/סיום") && htmlMatches.includes("מבקיעה ראשונה") && htmlMatches.includes("תוצאה מדויקת"));
check("המלצות-צמרת במסך משחק", htmlMatches.includes("3 ההמלצות החזקות") && htmlMatches.includes("🥇")
  && htmlMatches.includes("ניתוח:"));
const picks = matchTopPicks("ESP", "URU", false);
check("3 המלצות ממשפחות שונות", picks.length === 3 && new Set(picks.map(p => p.family)).size === 3,
  picks.map(p => p.family).join(","));
check("המלצות בטווח שימושי", picks.every(p => p.p >= 0.33 && p.p <= 0.88));

// ===== ניתוח מורחב: השוואת נבחרות צד-מול-צד =====
check("דף משחק: כרטיסי נבחרת צד-מול-צד", htmlMatches.includes("team-card") && htmlMatches.includes("h2h-cards"));
check("דף משחק: ברים מתפצלים + עובדות", htmlMatches.includes("dv-track") && htmlMatches.includes("התקפה"));
check("דף משחק: תרגום אנושי (אחוז שליטה)", htmlMatches.includes("מהתרחישים"));
// Elo גולמי הוסתר מאחורי 'למתקדמים' (לא בתצוגה הראשית של הניתוח)
const _h2hBlock = htmlMatches.slice(htmlMatches.indexOf('class="h2h"'), htmlMatches.indexOf("3 ההמלצות החזקות"));
check("Elo גולמי לא בתצוגה הראשית", !_h2hBlock.includes("Elo:"));
// דטרמיניזם out-of-sample: כרטיס נבחרת קבוע לאותו asOf (לא משתנה רטרו)
const _c1 = JSON.stringify(PROFILE.teamCard("ESP", "2026-06-26"));
const _c2 = JSON.stringify(PROFILE.teamCard("ESP", "2026-06-26"));
check("כרטיס נבחרת דטרמיניסטי לאותו asOf", _c1 === _c2);
const _cardESP = PROFILE.teamCard("ESP", null);
check("כרטיס נבחרת: דירוג-כוח, התקפה, הגנה", _cardESP.power.rank >= 1
  && _cardESP.attack >= 0 && _cardESP.attack <= 10 && _cardESP.defense >= 0 && _cardESP.defense <= 10,
  `ESP מקום ${_cardESP.power.rank}, התקפה ${_cardESP.attack}, הגנה ${_cardESP.defense}`);

const htmlFut = viewFutures();
check("טאב עתידיים מרונדר", htmlFut.includes("זוכת הטורניר"));

// טאב נוק-אאוט: ריק → הנחיות; מלא → טבלת מסלול מדויק
// מאפסים במפורש לסוגריים ריקים — מאז קליטת הנוק-אאוט האוטומטית ייתכן ש-
// DATA.knockout מאוכלס ו-seedBracket ממלא את BRACKET, אז בדיקת מצב-הריק
// חייבת לשלוט בסוגריים בעצמה (לא להסתמך על ברירת-המחדל).
BRACKET = { r32: Array.from({ length: 16 }, () => [null, null]), winners: {} };
const htmlKoEmpty = viewKO();
check("נוק-אאוט ריק: הנחיות מילוי", htmlKoEmpty.includes("0/16"));
const top32 = Object.keys(DATA.teams).map(id => [id, DATA.teams[id].elo])
  .sort((a, b) => b[1] - a[1]).slice(0, 32).map(([id]) => id);
for (let i = 0; i < 16; i++) BRACKET.r32[i] = [top32[i], top32[31 - i]];
BRACKET.winners["R32-1"] = top32[0];
const htmlKoFull = viewKO();
check("נוק-אאוט מלא: טבלת מסלול מדויק", htmlKoFull.includes("חישוב מסלול מדויק") && htmlKoFull.includes("16/16"));
const recsKo = generateRecs();
check("המלצות 'מי יעפיל' נוצרות", recsKo.some(r => r.market === "מי יעפיל"));

// ===== קליטת נוק-אאוט אוטומטית: לוח תוצאות אחרונות + משחקי היום =====
const _savedKoMatches = DATA.knockout.matches;
DATA.knockout.matches = [
  { id: "R32-1", round: "R32", a: "ESP", b: "URU", d: "2026-06-28", hg: 2, ag: 1, winner: "ESP" },
  { id: "R16-1", round: "R16", a: "ESP", b: "GER", d: localISO(0) } // "היום" — טרם שוחק
];
const htmlRecsKo = viewRecs();
check("לוח תוצאות כולל תוצאת נוק-אאוט", htmlRecsKo.includes("🥊 שלב ה-32") && htmlRecsKo.includes("2 – 1"));
check("משחק נוק-אאוט של היום מוצג", htmlRecsKo.includes("🥊 שמינית גמר")
  && !htmlRecsKo.includes("אין משחקים היום או מחר"));
DATA.knockout.matches = _savedKoMatches;

// ===== שורת תוצאת נוק-אאוט לא מזהמת את טבלת הבית =====
// רימאץ' של זוג מאותו בית (אפשרי מ-R16 והלאה) חייב להישאר מחוץ לטבלה.
const _tblBefore = JSON.stringify(groupStandings("A"));
DATA.results.push({ g: "R16", home: "MEX", away: "KOR", hg: 0, ag: 5, d: "2026-07-20" });
check("טבלת בית מתעלמת משורת נוק-אאוט", JSON.stringify(groupStandings("A")) === _tblBefore);
DATA.results.pop();
// זוג שאינו בלוח הבתים (זיווג נוק-אאוט) — matchAsOf קורא את התאריך מהשורה
DATA.results.push({ g: "R32", home: "GER", away: "PAR", hg: 0, ag: 1, d: "2026-06-29" });
check("matchAsOf: משחק נוק-אאוט מקבל את תאריך שורת התוצאה",
  matchAsOf("GER", "PAR") === "2026-06-29");
DATA.results.pop();
MODEL.resetLearned();

console.log("\nדוגמת 5 המלצות מובילות:");
for (const r of recs.slice(0, 5))
  console.log(`   [${r.market}] ${r.pick.replace(/[\u{1F1E6}-\u{1F1FF}\u{1F3F4}\u{E0060}-\u{E007F}]/gu, "").trim()} | ${r.match.replace(/[\u{1F1E6}-\u{1F1FF}\u{1F3F4}\u{E0060}-\u{E007F}]/gu, "").trim()} | P=${(r.p * 100).toFixed(1)}%`);

console.log(failures === 0 ? "\n🎉 בדיקת העשן עברה" : `\n💥 ${failures} נכשלו`);
process.exit(failures === 0 ? 0 : 1);
