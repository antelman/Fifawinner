/* ============================================================
   FifaWinner — כרטיס נבחרת + השוואת משחק (שכבת "ניתוח אנושי")
   ------------------------------------------------------------
   נגזר כולו מ-DATA + MODEL (Elo נלמד, λ, נטיית-מחצית) — ללא DB וללא API.
   כל פונקציה מקבלת asOf (תאריך המשחק) ומשתמשת בדירוגים "נכון לתאריך",
   כך שהכרטיס מתעדכן עם למידת המודל אך לעולם אינו משתנה רטרואקטיבית
   (out-of-sample, כמו שאר ההמלצות). ראו docs/methodology.md.

   ממיר Elo גולמי לשפה אנושית: דירוג-כוח בטורניר, ציוני התקפה/הגנה
   0–10, נטיית-תזמון, טופס נוכחי, וסיפור head-to-head + עובדות פיקנטיות.
   ============================================================ */

const PROFILE = (() => {
  const TOURN_AVG_GOALS = 1.32;   // λ ניטרלי — קו אמצע לציון התקפה/הגנה
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const round1 = (x) => Math.round(x * 10) / 10;

  // λ "ניטרלי" של נבחרת מול יריב ממוצע (Elo ממוצע של כל המשתתפות),
  // כך שאפשר למקם התקפה/הגנה על סולם אחיד בלי תלות ביריב הספציפי.
  let _avgEloCache = {};
  function avgElo(asOf) {
    const key = asOf || "_full";
    if (_avgEloCache[key] != null) return _avgEloCache[key];
    const ids = Object.keys(DATA.teams);
    let sum = 0;
    for (const id of ids) sum += MODEL.effElo(DATA.teams[id], asOf) - (DATA.teams[id].host ? DATA.meta.hostBonus : 0);
    return (_avgEloCache[key] = sum / ids.length);
  }

  // דירוג-כוח: המקום של הנבחרת מתוך כל המשתתפות לפי Elo נלמד (1=החזקה).
  function powerRank(id, asOf) {
    const ids = Object.keys(DATA.teams);
    const myElo = MODEL.effElo(DATA.teams[id], asOf);
    let rank = 1;
    for (const other of ids) {
      if (other === id) continue;
      if (MODEL.effElo(DATA.teams[other], asOf) > myElo) rank++;
    }
    return { rank, total: ids.length };
  }

  // ציון 0–10 להתקפה ולהגנה: λ צפוי מול יריב ממוצע, ממופה לסולם נוח.
  // התקפה — כמה הנבחרת מבקיעה; הגנה — כמה מעט היא סופגת (הפוך).
  function attackDefense(id, asOf) {
    const t = DATA.teams[id];
    const dr = MODEL.effElo(t, asOf) - avgElo(asOf);
    // λ מול יריב ממוצע (אותה נוסחה כמו MODEL.lambdas, ללא היריב הספציפי)
    const lFor = TOURN_AVG_GOALS * Math.pow(10, dr / 1100) * (t.attMod || 1);
    const lAgainst = TOURN_AVG_GOALS * Math.pow(10, -dr / 1100) * (t.defMod || 1);
    // מיפוי λ→0–10: 0.6 שער≈2, 1.32≈5, 2.4≈8.5 (סולם תפיסתי, לא לינארי)
    const score = (lam) => clamp(round1(2 + (lam - 0.6) * 3.6), 0, 10);
    return {
      attack: score(lFor),
      defense: clamp(round1(10 - (score(lAgainst) - 0)), 0, 10), // הגנה: הפוך מספיגה
      lFor: round1(lFor), lAgainst: round1(lAgainst)
    };
  }

  // טופס בטורניר עד כה (out-of-sample: רק משחקים *לפני* asOf).
  // מחזיר מערך תוצאות עדכני-אחרון-קודם: { res:"W"|"D"|"L", score, opp }.
  function form(id, asOf) {
    const out = [];
    for (const r of (DATA.results || [])) {
      if (r.home !== id && r.away !== id) continue;
      const d = MODEL.resultDate(r);
      if (asOf && d && d >= asOf) continue;   // out-of-sample
      const isHome = r.home === id;
      const gf = isHome ? r.hg : r.ag, ga = isHome ? r.ag : r.hg;
      const opp = isHome ? r.away : r.home;
      out.push({
        res: gf > ga ? "W" : gf < ga ? "L" : "D",
        score: gf + "–" + ga, opp, d
      });
    }
    out.sort((x, y) => (x.d && y.d ? y.d.localeCompare(x.d) : 0));
    return out;
  }

  // נטיית-תזמון: האם הנבחרת פותחת חזק (רוב השערים במחצית 1) או מסיימת חזק.
  function timing(id, asOf) {
    // קורא את נטיית-המחצית הנלמדת ישירות מהמודל (אותו מקור אמת כמו השווקים).
    const share = (MODEL.h1ShareOf ? MODEL.h1ShareOf(id, asOf) : 0.45);
    const label = share >= 0.52 ? "פותחת חזק (רוב השערים במחצית 1)"
      : share <= 0.40 ? "מסיימת חזק (דוחפת במחצית 2)"
      : "מאוזנת לאורך המשחק";
    return { share, label, opensStrong: share >= 0.52, finishesStrong: share <= 0.40 };
  }

  // כוכב מוביל + מאמן — לכותרת אנושית
  function headline(id) {
    const t = DATA.teams[id];
    return { star: (t.stars && t.stars[0]) || "", coach: t.coach || "", tier: t.tier };
  }

  // כרטיס נבחרת מלא — כל מה שצריך כדי לרנדר צד אחד של ההשוואה.
  function teamCard(id, asOf) {
    const t = DATA.teams[id];
    const ad = attackDefense(id, asOf);
    return {
      id, nameHe: t.nameHe, flag: t.flag, iso: t.iso, host: !!t.host,
      power: powerRank(id, asOf),
      attack: ad.attack, defense: ad.defense, lFor: ad.lFor, lAgainst: ad.lAgainst,
      form: form(id, asOf),
      timing: timing(id, asOf),
      head: headline(id),
      pedigree: { wc18: t.wc18, wc22: t.wc22, continental: t.continental },
      elo: MODEL.effElo(t, asOf)   // נשמר אך מוצג רק ב"למתקדמים"
    };
  }

  /* ---------- תרגום פער Elo לשפה אנושית ---------- */
  // הסתברות הזכייה של הפייבוריט ב-90 דקות (כולל תיקו מחולק) → "שולטת ב-X%".
  function dominanceSentence(a, b, asOf) {
    const m = MODEL.markets(DATA.teams[a], DATA.teams[b], asOf);
    const favIsA = m.p1 >= m.p2;
    const fav = favIsA ? a : b, favWin = favIsA ? m.p1 : m.p2;
    // "מתוך 10 משחקים" — ניצחונות + מחצית מהתיקואים, מעוגל
    const winsOf10 = Math.round((favWin + m.px / 2) * 10);
    return {
      fav, favWin, draw: m.px,
      text: `${DATA.teams[fav].nameHe} שולטת בכ-${Math.round(favWin * 100)}% מהתרחישים — בערך ${winsOf10} ניצחונות מתוך 10 משחקים דמיוניים.`
    };
  }

  // עוצמת הפתעה אם האנדרדוג ינצח — לתחושת "אפסט".
  function upsetSentence(a, b, asOf) {
    const m = MODEL.markets(DATA.teams[a], DATA.teams[b], asOf);
    const dogIsA = m.p1 < m.p2;
    const dog = dogIsA ? a : b, dogWin = dogIsA ? m.p1 : m.p2;
    if (dogWin >= 0.38) return null;   // לא ממש אנדרדוג
    const lvl = dogWin < 0.12 ? "סנסציה של ממש" : dogWin < 0.22 ? "הפתעה גדולה" : "הפתעה לא קטנה";
    return { dog, dogWin, text: `אם ${DATA.teams[dog].nameHe} תנצח — זו תהיה ${lvl} (כ-${Math.round(dogWin * 100)}% בלבד).` };
  }

  /* ---------- עובדות פיקנטיות אוטומטיות ---------- */
  function spicyFacts(a, b, asOf) {
    const facts = [];
    const ca = teamCard(a, asOf), cb = teamCard(b, asOf);
    const gap = Math.abs(ca.elo - cb.elo);

    // 1) פותחת/מסיימת חזק
    for (const c of [ca, cb]) {
      if (c.timing.opensStrong) facts.push(`⚡ ${c.nameHe} פותחת חזק — שווה לבדוק את שוק "מחצית ראשונה".`);
      else if (c.timing.finishesStrong) facts.push(`🔚 ${c.nameHe} מסיימת חזק — שערים מאוחרים הם החתימה שלה.`);
    }
    // 2) פער-כוח קיצוני / משחק שקול
    if (gap >= 350) facts.push(`📊 פער ענק של ${gap} נק' כוח בין הקבוצות — מהגדולים במשחק זה.`);
    else if (gap <= 60) facts.push(`⚖️ משחק שקול כמעט לחלוטין — ${gap} נק' כוח בלבד מפרידות.`);
    // 3) קרב התקפה מול הגנה
    const strongAtt = ca.attack >= cb.attack ? ca : cb;
    const strongDef = ca.defense >= cb.defense ? ca : cb;
    if (strongAtt.id !== strongDef.id)
      facts.push(`🔥🛡️ קרב סגנונות: ההתקפה של ${strongAtt.nameHe} (${strongAtt.attack}/10) מול ההגנה של ${strongDef.nameHe} (${strongDef.defense}/10).`);
    // 4) וו היסטורי — אם לאחת יש הישג מונדיאל בולט
    for (const c of [ca, cb]) {
      const p = c.pedigree;
      if (p.wc22 && /גמר|מקום [34]|חצי/.test(p.wc22)) { facts.push(`🏅 ${c.nameHe} ב-2022: ${p.wc22.split("—")[0].split("(")[0].trim()}.`); break; }
    }
    // 5) ביתיות
    if (ca.host || cb.host) {
      const h = ca.host ? ca : cb;
      facts.push(`🏟️ ${h.nameHe} משחקת בבית — יתרון הביתיות כבר מגולם בכוח שלה.`);
    }
    return facts.slice(0, 4);
  }

  // השוואה מלאה — הכל מוכן לרינדור צד-מול-צד.
  function compare(a, b, asOf) {
    return {
      a: teamCard(a, asOf),
      b: teamCard(b, asOf),
      dominance: dominanceSentence(a, b, asOf),
      upset: upsetSentence(a, b, asOf),
      facts: spicyFacts(a, b, asOf)
    };
  }

  function resetCache() { _avgEloCache = {}; }

  return { teamCard, compare, dominanceSentence, upsetSentence, spicyFacts, powerRank, attackDefense, form, timing, resetCache };
})();

if (typeof module !== "undefined") module.exports = PROFILE;
