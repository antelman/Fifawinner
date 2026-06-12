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

console.log(failures === 0 ? "\n🎉 כל הבדיקות עברו" : `\n💥 ${failures} בדיקות נכשלו`);
process.exit(failures === 0 ? 0 : 1);
