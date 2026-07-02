/* בדיקות שלב הנוק-אאוט — הרכבת סוגריים + קליטה מ-API (מדומה).
   node tests/knockout.js */
global.DATA = require("../js/data.js");
global.MODEL = require("../js/model.js");
const KOA = require("../scripts/ko-assemble.js");

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log((cond ? "✅" : "❌") + " " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- classifyRound ---------- */
check("classifyRound: LAST_32 → R32", KOA.classifyRound("LAST_32") === "R32");
check("classifyRound: ROUND_OF_32 → R32", KOA.classifyRound("ROUND_OF_32") === "R32");
check("classifyRound: LAST_16 → R16", KOA.classifyRound("LAST_16") === "R16");
check("classifyRound: QUARTER_FINALS → QF", KOA.classifyRound("QUARTER_FINALS") === "QF");
check("classifyRound: SEMI_FINALS → SF", KOA.classifyRound("SEMI_FINALS") === "SF");
check("classifyRound: FINAL → F", KOA.classifyRound("FINAL") === "F");
check("classifyRound: THIRD_PLACE → null", KOA.classifyRound("THIRD_PLACE") === null);
check("classifyRound: GROUP_STAGE → null", KOA.classifyRound("GROUP_STAGE") === null);

/* ---------- koRoundOf (תיוג שורת-למידה, כולל מקום שלישי) ---------- */
check("koRoundOf: LAST_16 → R16", KOA.koRoundOf("LAST_16") === "R16");
check("koRoundOf: THIRD_PLACE → 3P", KOA.koRoundOf("THIRD_PLACE") === "3P");
check("koRoundOf: FINAL → FIN (לא מתנגש באות בית F)", KOA.koRoundOf("FINAL") === "FIN");
check("koRoundOf: GROUP_STAGE → null", KOA.koRoundOf("GROUP_STAGE") === null);

/* ---------- koResultScore (תוצאת 90 דקות + הכרעת הארכה) ---------- */
const eq2 = eq;
check("koResultScore: משחק רגיל", eq2(
  KOA.koResultScore({ duration: "REGULAR", fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } }),
  { hg: 2, ag: 1, htHg: 1, htAg: 0 }));
check("koResultScore: הארכה → תוצאת 90 דקות + koWin", eq2(
  KOA.koResultScore({ duration: "EXTRA_TIME", winner: "AWAY_TEAM",
    fullTime: { home: 1, away: 2 }, regularTime: { home: 1, away: 1 }, halfTime: { home: 0, away: 1 } }),
  { hg: 1, ag: 1, htHg: 0, htAg: 1, koWin: "A" }));
check("koResultScore: פנדלים → תיקו ללא koWin", eq2(
  KOA.koResultScore({ duration: "PENALTY_SHOOTOUT", winner: "HOME_TEAM",
    fullTime: { home: 0, away: 0 }, regularTime: { home: 0, away: 0 } }),
  { hg: 0, ag: 0 }));
check("koResultScore: אין תוצאה → null", KOA.koResultScore({ fullTime: {} }) === null);

/* ---------- koAdvancer (כולל פנדלים) ---------- */
check("advancer: HOME_TEAM", KOA.koAdvancer({ winner: "HOME_TEAM" }, "ESP", "GER") === "ESP");
check("advancer: AWAY_TEAM", KOA.koAdvancer({ winner: "AWAY_TEAM" }, "ESP", "GER") === "GER");
check("advancer: תיקו→פנדלים לבית",
  KOA.koAdvancer({ winner: "DRAW", penalties: { home: 4, away: 3 } }, "ESP", "GER") === "ESP");
check("advancer: תיקו→פנדלים לחוץ",
  KOA.koAdvancer({ winner: "DRAW", penalties: { home: 2, away: 4 } }, "ESP", "GER") === "GER");
check("advancer: טרם הוכרע → null", KOA.koAdvancer({ winner: null }, "ESP", "GER") === null);

/* ---------- normalizeKnockout ---------- */
// resolveId מדומה: tla תלת-אותיות = הקוד; מסנן TBD (ריק)
const rid = (t) => (t && t.tla) ? t.tla : null;
const rawR32 = [
  { stage: "LAST_32", utcDate: "2026-06-28T19:00Z", homeTeam: { tla: "ESP" }, awayTeam: { tla: "URU" }, score: { winner: "HOME_TEAM" } },
  { stage: "LAST_32", utcDate: "2026-06-28T22:00Z", homeTeam: { tla: "ARG" }, awayTeam: { tla: "AUT" }, score: { winner: "HOME_TEAM" } },
  { stage: "GROUP_STAGE", utcDate: "2026-06-20T00:00Z", homeTeam: { tla: "BRA" }, awayTeam: { tla: "MAR" }, score: { winner: "DRAW" } },
  { stage: "LAST_32", utcDate: "2026-06-29T19:00Z", homeTeam: { tla: "FRA" }, awayTeam: { tla: null }, score: {} } // TBD → מסונן
];
const norm = KOA.normalizeKnockout(rawR32, rid);
check("normalize: מסנן שלב-בתים + TBD", norm.length === 2, `${norm.length} משחקי נוק-אאוט`);
check("normalize: מבנה תקין", eq(norm[0], { round: "R32", a: "ESP", b: "URU", winner: "ESP", date: "2026-06-28" }));

/* ---------- normalize: תוצאות, הארכה ומשחקים עתידיים ---------- */
const rawScored = [
  { stage: "LAST_16", utcDate: "2026-07-01T19:00Z", homeTeam: { tla: "ENG" }, awayTeam: { tla: "CIV" },
    score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 2, away: 1 } } },
  { stage: "LAST_16", utcDate: "2026-07-01T22:00Z", homeTeam: { tla: "ESP" }, awayTeam: { tla: "GER" },
    score: { winner: "DRAW", duration: "PENALTY_SHOOTOUT", fullTime: { home: 1, away: 1 }, penalties: { home: 4, away: 3 } } },
  { stage: "QUARTER_FINALS", utcDate: "2026-07-04T19:00Z", homeTeam: { tla: "ENG" }, awayTeam: { tla: "FRA" }, score: {} }
];
const ns = KOA.normalizeKnockout(rawScored, rid);
check("normalize: תוצאה נשמרת (90/סיום)", ns[0].hg === 2 && ns[0].ag === 1 && !ns[0].et);
check("normalize: פנדלים + הארכה מסומנים", ns[1].et === true && ns[1].penH === 4 && ns[1].penA === 3 && ns[1].winner === "ESP");
check("normalize: משחק עתידי ידוע ללא תוצאה", ns[2].hg == null && ns[2].winner === null && ns[2].date === "2026-07-04");

/* ---------- assembleKnockout: R32 חלקי (כמו 2.7 — לפני שהושלמו כל 16) ---------- */
const partial = KOA.assembleKnockout(norm);
check("R32 חלקי: 16 סלוטים", partial.r32.length === 16);
check("R32 חלקי: 2 זוגות מלאים", partial.r32.filter(p => p[0] && p[1]).length === 2);
check("R32 חלקי: מנצחות מקובעות", eq(partial.winners, { "R32-1": "ARG", "R32-2": "ESP" }) || eq(partial.winners, { "R32-1": "ESP", "R32-2": "ARG" }));
check("R32 חלקי: stage=R32", partial.stage === "R32");
check("R32 חלקי: matches שטוח עם מזהים", partial.matches.length === 2
  && partial.matches.every((m, i) => m.id === "R32-" + (i + 1) && m.a && m.b));

/* ---------- assembleKnockout: R32 מלא + R16 → בדיקת שחזור צמידות ---------- */
// 32 קבוצות דמה T01..T32; R32: (T1,T2),(T3,T4)... כל אי-זוגית מנצחת.
const teams = Array.from({ length: 32 }, (_, i) => "T" + String(i + 1).padStart(2, "0"));
const koFull = [];
for (let i = 0; i < 16; i++) {
  const a = teams[i * 2], b = teams[i * 2 + 1];
  koFull.push({ round: "R32", a, b, winner: a, date: "2026-06-2" + (8 + (i % 2)) });
}
// R16: מנצחות R32 (כל האי-זוגיות: T1,T3,T5,...) — נזווג T1-T3, T5-T7, ...
// כאן במכוון סדר ה-R16 שונה מסדר ה-R32 כדי לוודא שחזור צמידות אמיתי.
const r32winners = koFull.map(m => m.winner); // [T1,T3,T5,...,T31]
const r16 = [];
for (let i = 0; i < 8; i++) {
  const a = r32winners[i * 2], b = r32winners[i * 2 + 1];
  r16.push({ round: "R16", a, b, winner: a, date: "2026-07-0" + (1 + (i % 3)) });
}
const full = KOA.assembleKnockout([...koFull, ...r16]);
check("R32 מלא: 16 זוגות מלאים", full.r32.filter(p => p[0] && p[1]).length === 16);
check("R16 קיים: stage=R16", full.stage === "R16");
// צמידות: מנצחות r32[0] ו-r32[1] חייבות להיות זוג ה-R16 הראשון (a,b של r16[0])
const w0 = full.winners["R32-1"], w1 = full.winners["R32-2"];
check("שחזור צמידות: זוג R32-1/R32-2 מזין את R16-1",
  new Set([w0, w1]).size === 2 && new Set([w0, w1]).has(r16[0].a) && new Set([w0, w1]).has(r16[0].b),
  `${w0}+${w1} vs R16-1=${r16[0].a}+${r16[0].b}`);
check("R16 מנצחות מקובעות (8)", Object.keys(full.winners).filter(k => k.startsWith("R16")).length === 8);

/* ---------- רגרסיה: סיבוב עתידי חלקי (רק ענף אחד ידוע) לא מפיל את ההרכבה ---------- */
// QF אחד ידוע (ENG-ESP) בעוד רוב ה-R16/R32 טרם שוחקו — orderByFeeders חייב
// לשרוד אבות ריקים (placeholder) בשרשרת ולא לקרוס.
const sparse = KOA.assembleKnockout([
  { round: "R32", a: "ENG", b: "COD", winner: "ENG", date: "2026-06-28", hg: 3, ag: 0 },
  { round: "R16", a: "ENG", b: "CIV", winner: "ENG", date: "2026-07-01", hg: 2, ag: 1 },
  { round: "QF", a: "ENG", b: "ESP", winner: null, date: "2026-07-04" }
]);
check("ענף חלקי: לא קורס ומחזיר stage=QF", sparse.stage === "QF");
check("ענף חלקי: כל המשחקים ברשימה", sparse.matches.length === 3
  && sparse.matches.some(m => m.round === "QF" && m.hg == null)
  && sparse.matches.some(m => m.round === "R16" && m.hg === 2 && m.ag === 1));

/* ---------- koPropagate עובד על סוגריים מורכבים מנבחרות אמת ---------- */
// 32 החזקות לפי Elo, מזווגות ל-16 משחקי R32, ומורכבות דרך assembleKnockout
const top32 = Object.keys(DATA.teams).map(id => [id, DATA.teams[id].elo])
  .sort((a, b) => b[1] - a[1]).slice(0, 32).map(([id]) => id);
const realR32 = [];
for (let i = 0; i < 16; i++)
  realR32.push({ round: "R32", a: top32[i * 2], b: top32[i * 2 + 1],
    winner: top32[i * 2], date: "2026-06-28" });
const full16 = KOA.assembleKnockout(realR32); // 16 זוגות מלאים
check("koPropagate: 16 זוגות אמת", full16.r32.filter(p => p[0] && p[1]).length === 16);
const prop = MODEL.koPropagate(full16.r32, full16.winners);
const champSum = Object.values(prop.perTeam).reduce((s, t) => s + t.pChampion, 0);
check("koPropagate: סכום P(אלופה)=1", Math.abs(champSum - 1) < 1e-6, champSum.toFixed(6));

/* ---------- serializeKnockout → קוד תקין שמתפרסר ל-JS ---------- */
const ser = KOA.serializeKnockout(partial);
const parsed = eval("({" + ser.replace(/\n/g, " ") + "})");
check("serialize: r32 מתפרסר ל-16", Array.isArray(parsed.r32) && parsed.r32.length === 16);
check("serialize: winners נשמר", eq(parsed.winners, partial.winners));
check("serialize: ריק → []/{}/null", KOA.serializeKnockout({ r32: [], winners: {}, stage: null })
  .includes("r32: []") );
// משחק עם תוצאה/הארכה/פנדלים עובר סריאליזציה ופרסור נאמנים
const serM = KOA.serializeKnockout({ r32: [], winners: {}, stage: "R16", matches: [
  { id: "R16-1", round: "R16", a: "ENG", b: "CIV", d: "2026-07-01", hg: 2, ag: 1, et: true, penH: 4, penA: 3, winner: "ENG" },
  { id: "QF-1", round: "QF", a: "ENG", b: "FRA", d: "2026-07-04" }
] });
const pm = eval("({" + serM.replace(/\n/g, " ") + "})");
check("serialize: משחק עם הארכה/פנדלים נאמן", pm.matches[0].et === true
  && pm.matches[0].penH === 4 && pm.matches[0].hg === 2 && pm.matches[0].winner === "ENG");
check("serialize: משחק עתידי ללא תוצאה", pm.matches[1].hg === undefined && pm.matches[1].d === "2026-07-04");

/* ---------- data.js: מבנה knockout קיים ותקין ---------- */
check("DATA.knockout קיים", DATA.knockout && Array.isArray(DATA.knockout.r32));

console.log(failures === 0 ? "\n🎉 כל בדיקות הנוק-אאוט עברו" : `\n💥 ${failures} נכשלו`);
process.exit(failures === 0 ? 0 : 1);
