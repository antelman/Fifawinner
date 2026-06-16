/* בדיקת עשן לרינדור הממשק ללא דפדפן — node tests/smoke-ui.js */
global.DATA = require("../js/data.js");
global.MODEL = require("../js/model.js");

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
        .replace(/let BRACKET =/, "BRACKET =").replace(/let selKoMatch = null;/, "selKoMatch = null;")
        .replace(/let ODDS =/, "ODDS ="));

SIM = MODEL.simulateGroups(5000);
KO = MODEL.simulateChampion(2000);

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log((cond ? "✅" : "❌") + " " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
};

const recs = generateRecs();
check("נוצרו המלצות", recs.length >= 15, recs.length + " המלצות");
check("לכל המלצה יחס הוגן תקין", recs.every(r => r.fair > 1 && r.minOdds > r.fair));
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
check("טאב משחקים + פירוט משחק", htmlMatches.includes("מעל 2.5") && htmlMatches.includes("תוצאות סבירות"));
check("שווקים מורחבים בפירוט משחק", htmlMatches.includes("שווקים מורחבים") && htmlMatches.includes("יתרון 0:1")
  && htmlMatches.includes("מחצית/סיום") && htmlMatches.includes("מבקיעה ראשונה") && htmlMatches.includes("תוצאה מדויקת"));
check("המלצות-צמרת במסך משחק", htmlMatches.includes("3 ההמלצות החזקות") && htmlMatches.includes("🥇")
  && htmlMatches.includes("ניתוח:"));
const picks = matchTopPicks("ESP", "URU", false);
check("3 המלצות ממשפחות שונות", picks.length === 3 && new Set(picks.map(p => p.family)).size === 3,
  picks.map(p => p.family).join(","));
check("המלצות בטווח שימושי", picks.every(p => p.p >= 0.33 && p.p <= 0.88));

// הדבקה מהירה של יחסים
const r1 = applyPastedOdds("ESP", "URU", "ספרד - אורוגוואי  18:00  1.45  4.10  6.50");
check("הדבקת 1X2 מטקסט חופשי", r1.ok && ODDS["ESP-URU:1"] === 1.45 && ODDS["ESP-URU:X"] === 4.1 && ODDS["ESP-URU:2"] === 6.5);
const r2 = applyPastedOdds("NED", "JPN", "מעל 2.5: 1,90 מתחת 2.5: 1,85");
check("הדבקת מעל/מתחת עם פסיק עשרוני", r2.ok && ODDS["NED-JPN:O25"] === 1.9 && ODDS["NED-JPN:U25"] === 1.85);
const r3 = applyPastedOdds("ESP", "URU", "אין כאן כלום 100 200");
check("טקסט בלי יחסים נדחה", !r3.ok);
const htmlFut = viewFutures();
check("טאב עתידיים מרונדר", htmlFut.includes("זוכת המונדיאל"));

// טאב נוק-אאוט: ריק → הנחיות; מלא → טבלת מסלול מדויק
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

console.log("\nדוגמת 5 המלצות מובילות:");
for (const r of recs.slice(0, 5))
  console.log(`   [${r.market}] ${r.pick.replace(/[\u{1F1E6}-\u{1F1FF}\u{1F3F4}\u{E0060}-\u{E007F}]/gu, "").trim()} | ${r.match.replace(/[\u{1F1E6}-\u{1F1FF}\u{1F3F4}\u{E0060}-\u{E007F}]/gu, "").trim()} | P=${(r.p * 100).toFixed(1)}% | הוגן=${r.fair.toFixed(2)} | כדאי מ-${r.minOdds.toFixed(2)}`);

console.log(failures === 0 ? "\n🎉 בדיקת העשן עברה" : `\n💥 ${failures} נכשלו`);
process.exit(failures === 0 ? 0 : 1);
