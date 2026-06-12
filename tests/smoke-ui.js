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
        .replace(/let BRACKET =/, "BRACKET =").replace(/let selKoMatch = null;/, "selKoMatch = null;"));

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
const htmlGroups = viewGroups();
check("טאב בתים מרונדר (12 בתים)", (htmlGroups.match(/בית [A-L]</g) || []).length === 12);
selFixture = ["ESP", "URU"];
selGroup = "H";
const htmlMatches = viewMatches();
check("טאב משחקים + פירוט משחק", htmlMatches.includes("מעל 2.5") && htmlMatches.includes("תוצאות סבירות"));
check("שווקים מורחבים בפירוט משחק", htmlMatches.includes("שווקים מורחבים") && htmlMatches.includes("יתרון 0:1")
  && htmlMatches.includes("מחצית/סיום") && htmlMatches.includes("מבקיעה ראשונה") && htmlMatches.includes("תוצאה מדויקת"));
const htmlFut = viewFutures();
check("טאב עתידיים מרונדר", htmlFut.includes("זוכת המונדיאל"));
const htmlGuide = viewGuide();
check("טאב מדריך מרונדר", htmlGuide.includes("חישוב זכייה"));

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
