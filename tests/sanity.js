/* בדיקת שפיות למודל — הרצה: node tests/sanity.js */
global.DATA = require("../js/data.js");
const MODEL = require("../js/model.js");

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log((cond ? "✅" : "❌") + " " + name + (detail ? "  — " + detail : ""));
  if (!cond) failures++;
};

// 1. שלמות נתונים
const groupIds = Object.keys(DATA.groups);
check("12 בתים", groupIds.length === 12);
const teamIds = groupIds.flatMap(g => DATA.groups[g]);
check("48 נבחרות", teamIds.length === 48);
check("כל נבחרת בבית קיימת ב-teams", teamIds.every(id => DATA.teams[id]));
check("אין כפילויות", new Set(teamIds).size === 48);
for (const id of teamIds) {
  const t = DATA.teams[id];
  if (!(t.elo >= 1400 && t.elo <= 2300)) { check("Elo בטווח: " + id, false, String(t.elo)); }
}
console.log("טווח Elo תקין לכל הנבחרות");

// 2. שווקים מסתכמים ל-1
const m = MODEL.markets(DATA.teams.ESP, DATA.teams.URU);
check("1X2 מסתכם ל-1", Math.abs(m.p1 + m.px + m.p2 - 1) < 1e-9);
check("Over/Under 2.5 מסתכם ל-1", Math.abs(m.over25 + m.under25 - 1) < 1e-9);
console.log(`   ספרד-אורוגוואי: 1=${(m.p1 * 100).toFixed(1)}% X=${(m.px * 100).toFixed(1)}% 2=${(m.p2 * 100).toFixed(1)}%`);

// 2ב. שווקים מורחבים
const ex = MODEL.extendedMarkets(DATA.teams.ESP, DATA.teams.URU);
check("יתרון 0:1 מסתכם ל-1", Math.abs(ex.hcapA_minus1.p1 + ex.hcapA_minus1.px + ex.hcapA_minus1.p2 - 1) < 1e-9);
check("טווחי שערים מסתכמים ל-1", Math.abs(ex.range01 + ex.range23 + ex.range4plus - 1) < 1e-9);
check("זוגי/אי-זוגי מסתכם ל-1", Math.abs(ex.odd + ex.even - 1) < 1e-9);
check("מבקיעה ראשונה מסתכם ל-1", Math.abs(ex.firstGoalA + ex.firstGoalB + ex.firstGoalNone - 1) < 1e-9);
const htftSum = Object.values(ex.htft).reduce((s, p) => s + p, 0);
check("מחצית/סיום (9 צירופים) ~1", Math.abs(htftSum - 1) < 0.01, htftSum.toFixed(4));
check("מחצית ראשונה 1X2 ~1", Math.abs(ex.ht1 + ex.htx + ex.ht2 - 1) < 0.01);
check("יתרון 0:1 מקטין את סיכויי הפייבוריט", ex.hcapA_minus1.p1 < m.p1);
check("תיקו במחצית שכיח מתיקו במשחק", ex.htx > m.px);

// 3. כיול: פער 300 Elo → פייבוריט ~70-78%
const big = MODEL.markets(DATA.teams.BRA, DATA.teams.SCO); // ~290 פער
check("פייבוריט בפער ~300 בטווח 65-80%", big.p1 > 0.65 && big.p1 < 0.80, (big.p1 * 100).toFixed(1) + "%");

// 4. סימטריה: קבוצות שוות → p1≈p2
const even = MODEL.markets(DATA.teams.SWE, DATA.teams.TUN);
check("קבוצות שוות מאוזנות", Math.abs(even.p1 - even.p2) < 0.05, `1=${(even.p1 * 100).toFixed(1)}% 2=${(even.p2 * 100).toFixed(1)}%`);

// 5. סימולציית בתים
console.log("\nמריץ מונטה-קרלו (20,000)...");
const sim = MODEL.simulateGroups(20000);
for (const g of groupIds) {
  const sumWin = DATA.groups[g].reduce((s, id) => s + sim[id].pWinGroup, 0);
  if (Math.abs(sumWin - 1) > 0.01) check("סכום P(זוכת בית) בבית " + g, false, sumWin.toFixed(3));
}
console.log("✅ סכום P(זוכת בית)=1 בכל בית");
const totalAdv = teamIds.reduce((s, id) => s + sim[id].pAdvance, 0);
check("סה\"כ מעפילות = 32", Math.abs(totalAdv - 32) < 0.1, totalAdv.toFixed(2));
check("ספרד מעפילה כמעט תמיד", sim.ESP.pAdvance > 0.95, (sim.ESP.pAdvance * 100).toFixed(1) + "%");
check("תוצאות אמת מקובעות: מקסיקו הרוויחה מה-2:0", sim.MEX.pWinGroup > 0.5, (sim.MEX.pWinGroup * 100).toFixed(1) + "%");

// 6. סימולציית אלוף + השוואה לשוק
console.log("\nמריץ סימולציית אלוף (8,000)...");
const ko = MODEL.simulateChampion(8000);
const top = teamIds.map(id => [id, ko[id].pChampion]).sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log("צמרת המודל מול השוק העולמי:");
for (const [id, p] of top) {
  const mkt = DATA.meta.marketChampion[id];
  console.log(`   ${DATA.teams[id].nameHe.padEnd(12)} מודל=${(p * 100).toFixed(1)}%  שוק=${mkt ? (mkt * 100).toFixed(1) + "%" : "—"}`);
}
check("הפייבוריטית מהשוק (ספרד) ב-Top3 של המודל", top.slice(0, 3).some(([id]) => id === "ESP"));
const sumCh = teamIds.reduce((s, id) => s + ko[id].pChampion, 0);
check("סכום P(אלופה)=1", Math.abs(sumCh - 1) < 1e-9, sumCh.toFixed(4));

// 7. חישוב מסלול נוק-אאוט מדויק (koPropagate)
console.log("\nבודק koPropagate עם סוגריים לדוגמה (32 המובילות לפי Elo)...");
const top32 = teamIds.map(id => [id, DATA.teams[id].elo]).sort((a, b) => b[1] - a[1])
  .slice(0, 32).map(([id]) => id);
// זריעה 1-32, 2-31... כדי שחזקות לא ייפגשו מוקדם
const pairs = [];
for (let i = 0; i < 16; i++) pairs.push([top32[i], top32[31 - i]]);
const prop = MODEL.koPropagate(pairs);
const sumChamp = Object.values(prop.perTeam).reduce((s, t) => s + t.pChampion, 0);
check("סכום P(אלופה) במסלול = 1", Math.abs(sumChamp - 1) < 1e-9, sumChamp.toFixed(6));
const sumR16 = Object.values(prop.perTeam).reduce((s, t) => s + t.pR16, 0);
check("16 עולות לשמינית", Math.abs(sumR16 - 16) < 1e-9, sumR16.toFixed(4));
for (const id in prop.perTeam) {
  const t = prop.perTeam[id];
  if (!(t.pR16 >= t.pQF && t.pQF >= t.pSF && t.pSF >= t.pF && t.pF >= t.pChampion)) {
    check("מונוטוניות מסלול: " + id, false); break;
  }
}
console.log("✅ מונוטוניות: P(שמינית) ≥ P(רבע) ≥ ... ≥ P(אלופה)");
const champTop = Object.entries(prop.perTeam).sort((a, b) => b[1].pChampion - a[1].pChampion)[0];
check("המובילה במסלול הגיונית (ספרד)", champTop[0] === "ESP",
  `${DATA.teams[champTop[0]].nameHe} ${(champTop[1].pChampion * 100).toFixed(1)}%`);

// 8. קיבוע מנצחת בפועל
const prop2 = MODEL.koPropagate(pairs, { "R32-1": pairs[0][1] });
check("קיבוע מנצחת: האנדרדוג שסומן עובר ב-100%",
  Math.abs(prop2.perTeam[pairs[0][1]].pR16 - 1) < 1e-9 && prop2.perTeam[pairs[0][0]].pR16 === 0);

console.log(failures === 0 ? "\n🎉 כל הבדיקות עברו" : `\n💥 ${failures} בדיקות נכשלו`);
process.exit(failures === 0 ? 0 : 1);
