/* ============================================================
   FifaWinner — מודל סטטיסטי
   Elo → תוחלת שערים → פואסון (תיקון Dixon-Coles) → שווקים
   + מונטה-קרלו לשלב הבתים (כולל חוק 8 השלישיות) ולנוק-אאוט
   ראו docs/methodology.md לפירוט מלא.
   ============================================================ */

const MODEL = (() => {
  const BASE_GOALS = 1.32;   // ממוצע שערים לקבוצה במשחק מונדיאל
  const ELO_GOAL_SCALE = 1100; // מכויל: פער 300 Elo → ~73% לפייבוריט ב-1X2
  const DC_RHO = 0.10;       // ניפוח תיקו נמוך בסגנון Dixon-Coles
  const MAX_GOALS = 8;
  const EDGE_MARGIN = 1.07;  // מרווח ביטחון ליחס מינימלי כדאי

  function poissonPmf(lambda, max) {
    const p = [Math.exp(-lambda)];
    for (let k = 1; k <= max; k++) p[k] = p[k - 1] * lambda / k;
    return p;
  }

  /* ---------- למידה מתוצאות הטורניר: עדכון Elo קדימה ----------
     אחרי כל משחק שהסתיים מעדכנים את דירוג שתי הנבחרות לפי
     התוצאה מול הציפייה (בשיטת eloratings.net). הדירוג המעודכן
     מזין מכאן והלאה את כל התחזיות — בתים, נוק-אאוט, ביטחון ותצוגה.
     שמרני בכוונה (K נמוך) כי מדגם המשחקים עדיין קטן.            */
  const LEARN_K = 20;          // פקטור עדכון שמרני (סטנדרט מונדיאל ~40)
  const LEARN_HOME_ADJ = 60;   // יתרון מארחת/ביתיות לצורך הציפייה בלבד
  // דעיכת זמן (החצי השני של Dixon-Coles): משחקים עדכניים שוקלים יותר.
  // half-life = 6 משחקים → תוצאה לפני ~6 משחקים שוקלת חצי ממשחק נוכחי.
  const DECAY_HALFLIFE = 6;

  // מכפיל הפרש שערים (eloratings.net): ניצחון גדול מזיז יותר
  function gdMultiplier(gd) {
    const a = Math.abs(gd);
    if (a <= 1) return 1;
    if (a === 2) return 1.5;
    return (11 + a) / 8;       // 3→1.75, 4→1.875, ...
  }

  // תאריך משחק מהלוח הרשמי (לצורך מיון כרונולוגי + דעיכת זמן)
  function resultDate(m) {
    if (!DATA.schedule) return null;
    const fx = DATA.schedule.find(x =>
      (x.h === m.home && x.a === m.away) || (x.h === m.away && x.a === m.home));
    return fx ? fx.d : null;
  }

  // מחשב דירוגים נלמדים מתוך תוצאות הטורניר.
  // beforeDate (אופציונלי): מחשב רק ממשחקים שהתרחשו *לפני* התאריך הזה —
  // נחוץ לשיפוט הוגן (out-of-sample): משחק לא "לומד מהתוצאה של עצמו".
  function computeLearned(beforeDate) {
    const r = {};
    // הטבעת מזהה על כל נבחרת (אם עוד לא קיים) — נחוץ ל-effElo
    for (const id in DATA.teams) { DATA.teams[id].id = id; r[id] = DATA.teams[id].elo; }

    // מיון כרונולוגי: תאריך לוח אם קיים, אחרת סדר ההופעה במערך
    let played = (DATA.results || []).map((m, i) => ({ m, i, d: resultDate(m) }));
    played.sort((x, y) => (x.d && y.d ? x.d.localeCompare(y.d) : x.i - y.i));
    // סינון out-of-sample: משחקים מאותו תאריך ואילך לא נכללים בלמידה
    if (beforeDate) played = played.filter(p => !p.d || p.d < beforeDate);
    const n = played.length;

    for (let idx = 0; idx < n; idx++) {
      const m = played[idx].m;
      const h = DATA.teams[m.home], a = DATA.teams[m.away];
      if (!h || !a || r[m.home] == null || r[m.away] == null) continue;
      // יתרון בית לצורך הציפייה: מארחת מקבלת בונוס, אחרת בונוס מארח כללי
      const homeAdj = h.host ? DATA.meta.hostBonus : LEARN_HOME_ADJ;
      const dr = (r[m.home] + homeAdj) - r[m.away];
      const expH = 1 / (1 + Math.pow(10, -dr / 400));
      const actH = m.hg > m.ag ? 1 : (m.hg < m.ag ? 0 : 0.5);
      // משקל דעיכת זמן: 1.0 למשחק האחרון, יורד אקספוננציאלית לאחור
      const age = (n - 1) - idx;
      const decay = Math.pow(0.5, age / DECAY_HALFLIFE);
      const k = LEARN_K * gdMultiplier(m.hg - m.ag) * decay;
      const delta = k * (actH - expH);
      r[m.home] += delta;
      r[m.away] -= delta;
    }
    return r;
  }

  // דירוגים נלמדים מלאים (כל התוצאות) — מטמון; מזין את התחזיות קדימה
  let _learnedElo = null;
  function learnedElo() {
    if (!_learnedElo) _learnedElo = computeLearned(null);
    return _learnedElo;
  }
  // מטמון לדירוגים "נכון לתאריך" (out-of-sample) לפי תאריך גבול
  const _asOfCache = {};
  function learnedEloAsOf(beforeDate) {
    if (!beforeDate) return learnedElo();
    if (!_asOfCache[beforeDate]) _asOfCache[beforeDate] = computeLearned(beforeDate);
    return _asOfCache[beforeDate];
  }

  /* ---------- למידת נטיית-מחציות לכל נבחרת ----------
     ברירת המחדל התיאורטית היא ש-45% מהשערים נופלים במחצית הראשונה.
     אבל לנבחרות שונות יש קצב שונה (פותחות חזק / מסיימות חזק). מתוך
     המשחקים שהסתיימו *עם תוצאת מחצית* (htHg/htAg), לומדים לכל נבחרת
     את חלק המחצית-הראשונה מסך השערים שלה (בעד+נגד) — עם החלקה
     בייסיאנית סביב 0.45 כדי שמדגם קטן לא יקפיץ.                      */
  const H1_PRIOR = 0.45;        // נטיית מחצית-ראשונה ברירת מחדל (פריור)
  const H1_PRIOR_WEIGHT = 8;    // עוצמת הפריור (כשערים וירטואליים)

  // חלק המחצית-הראשונה הנלמד לנבחרת, ממשחקים *לפני* asOf (out-of-sample).
  // מחזיר { share } — היחס בין שערי-מחצית-1 (בעד+נגד) לסך השערים במשחק.
  function computeH1Shares(beforeDate) {
    const acc = {};  // id → { h1Goals, totGoals }
    for (const m of (DATA.results || [])) {
      if (m.htHg == null || m.htAg == null) continue;        // אין תוצאת מחצית — לא לומדים
      const d = resultDate(m);
      if (beforeDate && d && d >= beforeDate) continue;      // out-of-sample
      const tot = m.hg + m.ag, h1 = m.htHg + m.htAg;
      if (tot === 0) continue;                                // 0-0 לא מלמד על תזמון
      for (const id of [m.home, m.away]) {
        const a = acc[id] || (acc[id] = { h1: 0, tot: 0 });
        a.h1 += h1; a.tot += tot;
      }
    }
    const out = {};
    for (const id in acc) {
      const { h1, tot } = acc[id];
      // החלקה בייסיאנית: מושך לכיוון הפריור כשהמדגם קטן
      out[id] = (h1 + H1_PRIOR * H1_PRIOR_WEIGHT) / (tot + H1_PRIOR_WEIGHT);
    }
    return out;
  }
  let _h1Full = null;
  const _h1AsOfCache = {};
  function h1SharesAsOf(beforeDate) {
    if (!beforeDate) return (_h1Full = _h1Full || computeH1Shares(null));
    if (!_h1AsOfCache[beforeDate]) _h1AsOfCache[beforeDate] = computeH1Shares(beforeDate);
    return _h1AsOfCache[beforeDate];
  }
  // נטיית מחצית-ראשונה אפקטיבית לנבחרת (נלמדת אם יש מספיק נתון, אחרת הפריור)
  function h1Share(team, asOf) {
    const s = h1SharesAsOf(asOf)[team.id];
    return s == null ? H1_PRIOR : s;
  }

  // איפוס מטמון (אם תוצאות מתעדכנות דינמית)
  function resetLearned() {
    _learnedElo = null;
    for (const k in _asOfCache) delete _asOfCache[k];
    _h1Full = null;
    for (const k in _h1AsOfCache) delete _h1AsOfCache[k];
  }

  // Elo אפקטיבי למשחק (דירוג נלמד מתוצאות + בונוס ביתיות למארחות).
  // asOf (אופציונלי): דירוג כפי שהיה לפני תאריך נתון — לשיפוט הוגן.
  function effElo(team, asOf) {
    const base = learnedEloAsOf(asOf)[team.id] ?? team.elo;
    return Math.round(base) + (team.host ? DATA.meta.hostBonus : 0);
  }

  // asOf (אופציונלי): מחשב לפי דירוג כפי שהיה לפני התאריך — לשיפוט הוגן
  function lambdas(teamA, teamB, asOf) {
    const dr = effElo(teamA, asOf) - effElo(teamB, asOf);
    let lA = BASE_GOALS * Math.pow(10, dr / ELO_GOAL_SCALE);
    let lB = BASE_GOALS * Math.pow(10, -dr / ELO_GOAL_SCALE);
    // כוונון סגנון עדין: התקפה של A מול הגנה של B
    lA *= (teamA.attMod || 1) * (teamB.defMod || 1);
    lB *= (teamB.attMod || 1) * (teamA.defMod || 1);
    return [clamp(lA, 0.15, 4.2), clamp(lB, 0.15, 4.2)];
  }

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  // מטריצת הסתברויות לכל תוצאה מדויקת
  function scoreMatrix(teamA, teamB, asOf) {
    const [lA, lB] = lambdas(teamA, teamB, asOf);
    const pA = poissonPmf(lA, MAX_GOALS), pB = poissonPmf(lB, MAX_GOALS);
    const m = [];
    let total = 0;
    for (let i = 0; i <= MAX_GOALS; i++) {
      m[i] = [];
      for (let j = 0; j <= MAX_GOALS; j++) {
        let p = pA[i] * pB[j];
        if ((i === 0 && j === 0) || (i === 1 && j === 1)) p *= 1 + DC_RHO;
        m[i][j] = p;
        total += p;
      }
    }
    for (let i = 0; i <= MAX_GOALS; i++)
      for (let j = 0; j <= MAX_GOALS; j++) m[i][j] /= total;
    return m;
  }

  // כל השווקים ממטריצה אחת
  function markets(teamA, teamB, asOf) {
    const m = scoreMatrix(teamA, teamB, asOf);
    let p1 = 0, px = 0, p2 = 0, over15 = 0, over25 = 0, over35 = 0, btts = 0;
    const scores = [];
    for (let i = 0; i <= MAX_GOALS; i++) {
      for (let j = 0; j <= MAX_GOALS; j++) {
        const p = m[i][j];
        if (i > j) p1 += p; else if (i === j) px += p; else p2 += p;
        if (i + j > 1.5) over15 += p;
        if (i + j > 2.5) over25 += p;
        if (i + j > 3.5) over35 += p;
        if (i > 0 && j > 0) btts += p;
        scores.push({ h: i, a: j, p });
      }
    }
    scores.sort((a, b) => b.p - a.p);
    return {
      p1, px, p2,
      dc1x: p1 + px, dc12: p1 + p2, dcx2: px + p2,
      over15, under15: 1 - over15,
      over25, under25: 1 - over25,
      over35, under35: 1 - over35,
      btts, noBtts: 1 - btts,
      topScores: scores.slice(0, 5),
      matrix: m
    };
  }

  const fairOdds = (p) => p > 0 ? 1 / p : Infinity;
  const minWorthOdds = (p) => p > 0 ? EDGE_MARGIN / p : Infinity;
  // Edge מול יחס ווינר אמיתי: חיובי = הימור ערך
  const edge = (p, odds) => p * odds - 1;

  /* ============================================================
     שווקים מורחבים (ווינר): יתרון, טווחי שערים, מחציות, מבקיעה ראשונה
     ============================================================ */

  // מטריצת פואסון גנרית (ללא תיקון DC — משמשת למחציות)
  function rawMatrix(lA, lB, max) {
    const pA = poissonPmf(lA, max), pB = poissonPmf(lB, max);
    const m = [];
    for (let i = 0; i <= max; i++) { m[i] = []; for (let j = 0; j <= max; j++) m[i][j] = pA[i] * pB[j]; }
    return m;
  }

  function extendedMarkets(teamA, teamB, asOf) {
    const m = scoreMatrix(teamA, teamB, asOf);
    const [lA, lB] = lambdas(teamA, teamB, asOf);

    // יתרון תלת-דרכי: התוצאה אחרי הוספת hcp לשערי הקבוצה הראשונה
    function handicap(hcp) {
      let p1 = 0, px = 0, p2 = 0;
      for (let i = 0; i <= MAX_GOALS; i++)
        for (let j = 0; j <= MAX_GOALS; j++) {
          const d = i + hcp - j;
          if (d > 0) p1 += m[i][j]; else if (d === 0) px += m[i][j]; else p2 += m[i][j];
        }
      return { p1, px, p2 };
    }

    // טווחי שערים, זוגי/אי-זוגי, מרווחי ניצחון
    let r01 = 0, r23 = 0, r4p = 0, odd = 0, winBy2A = 0, winBy2B = 0;
    for (let i = 0; i <= MAX_GOALS; i++)
      for (let j = 0; j <= MAX_GOALS; j++) {
        const p = m[i][j], tot = i + j;
        if (tot <= 1) r01 += p; else if (tot <= 3) r23 += p; else r4p += p;
        if (tot % 2 === 1) odd += p;
        if (i - j >= 2) winBy2A += p;
        if (j - i >= 2) winBy2B += p;
      }

    // מבקיעה ראשונה: מרוץ שני תהליכי פואסון
    const lT = lA + lB, pNoGoal = Math.exp(-lT);
    const firstA = (lA / lT) * (1 - pNoGoal), firstB = (lB / lT) * (1 - pNoGoal);

    // מחציות: שתי מטריצות בלתי-תלויות. נטיית המחצית-הראשונה נלמדת לכל
    // נבחרת בנפרד (h1Share) — מי שפותחת חזק תקבל λ גבוה יותר במחצית 1.
    const shA = h1Share(teamA, asOf), shB = h1Share(teamB, asOf);
    const HMAX = 6;
    const m1 = rawMatrix(lA * shA, lB * shB, HMAX);
    const m2 = rawMatrix(lA * (1 - shA), lB * (1 - shB), HMAX);
    let ht1 = 0, htx = 0, ht2 = 0;
    const htft = { "1/1": 0, "1/X": 0, "1/2": 0, "X/1": 0, "X/X": 0, "X/2": 0, "2/1": 0, "2/X": 0, "2/2": 0 };
    for (let i1 = 0; i1 <= HMAX; i1++) for (let j1 = 0; j1 <= HMAX; j1++) {
      const p1h = m1[i1][j1];
      const htRes = i1 > j1 ? "1" : i1 < j1 ? "2" : "X";
      if (htRes === "1") ht1 += p1h; else if (htRes === "2") ht2 += p1h; else htx += p1h;
      for (let i2 = 0; i2 <= HMAX; i2++) for (let j2 = 0; j2 <= HMAX; j2++) {
        const ftI = i1 + i2, ftJ = j1 + j2;
        const ftRes = ftI > ftJ ? "1" : ftI < ftJ ? "2" : "X";
        htft[htRes + "/" + ftRes] += p1h * m2[i2][j2];
      }
    }
    // שער בשתי המחציות: תוחלת השערים בכל מחצית לפי הנטיות הנלמדות של שתי הנבחרות
    const lH1 = lA * shA + lB * shB, lH2 = lA * (1 - shA) + lB * (1 - shB);
    const goalBothHalves = (1 - Math.exp(-lH1)) * (1 - Math.exp(-lH2));

    return {
      hcapA_minus1: handicap(-1),  // הקבוצה הראשונה פותחת ב-0:1
      hcapA_plus1: handicap(1),    // הקבוצה הראשונה פותחת ב-1:0
      hcapA_minus2: handicap(-2),  // הקבוצה הראשונה פותחת ב-0:2 (קו ה-+2 של ווינר)
      hcapA_plus2: handicap(2),    // הקבוצה הראשונה פותחת ב-2:0
      range01: r01, range23: r23, range4plus: r4p,
      odd, even: 1 - odd,
      winBy2A, winBy2B,
      firstGoalA: firstA, firstGoalB: firstB, firstGoalNone: pNoGoal,
      ht1, htx, ht2, htft, goalBothHalves
    };
  }

  /* ---------- דגימת תוצאה בודדת ממטריצה (למונטה-קרלו) ---------- */
  function sampleScore(matrix, rnd) {
    let r = rnd(), acc = 0;
    for (let i = 0; i <= MAX_GOALS; i++)
      for (let j = 0; j <= MAX_GOALS; j++) {
        acc += matrix[i][j];
        if (r < acc) return [i, j];
      }
    return [0, 0];
  }

  // משחקי בית: מהלוח הרשמי (שומר כיוון אחיד למפתחות יחסים), נפילה לצירופים
  function groupFixtures(groupId) {
    if (DATA.schedule) {
      const fx = DATA.schedule.filter(x => x.g === groupId).map(x => [x.h, x.a]);
      if (fx.length === 6) return fx;
    }
    const ids = DATA.groups[groupId];
    const fx = [];
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) fx.push([ids[i], ids[j]]);
    return fx;
  }

  // תוצאות אמת שכבר נרשמו — ממופות לקיבוע בסימולציה
  function playedMap() {
    const map = {};
    for (const r of DATA.results) {
      map[r.home + "|" + r.away] = [r.hg, r.ag];
      map[r.away + "|" + r.home] = [r.ag, r.hg];
    }
    return map;
  }

  /* ---------- מונטה-קרלו: כל 12 הבתים יחד + חוק 8 השלישיות ---------- */
  function simulateGroups(nSims = 20000, rnd = Math.random) {
    const groupIds = Object.keys(DATA.groups);
    const played = playedMap();

    // הכנה: מטריצות לכל משחק
    const prep = {};
    for (const g of groupIds) {
      prep[g] = groupFixtures(g).map(([a, b]) => ({
        a, b,
        fixed: played[a + "|" + b] || null,
        matrix: played[a + "|" + b] ? null : scoreMatrix(DATA.teams[a], DATA.teams[b])
      }));
    }

    // מונים לכל נבחרת
    const stats = {};
    for (const g of groupIds)
      for (const id of DATA.groups[g])
        stats[id] = { win: 0, top2: 0, third: 0, advance: 0, out: 0, pts: 0 };

    for (let s = 0; s < nSims; s++) {
      const thirds = [];
      for (const g of groupIds) {
        const table = {};
        for (const id of DATA.groups[g]) table[id] = { id, pts: 0, gd: 0, gf: 0 };
        for (const fx of prep[g]) {
          const [hg, ag] = fx.fixed || sampleScore(fx.matrix, rnd);
          const A = table[fx.a], B = table[fx.b];
          A.gf += hg; A.gd += hg - ag; B.gf += ag; B.gd += ag - hg;
          if (hg > ag) A.pts += 3; else if (hg < ag) B.pts += 3; else { A.pts++; B.pts++; }
        }
        const order = Object.values(table).sort((x, y) =>
          y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || rnd() - 0.5);
        stats[order[0].id].win++;
        stats[order[0].id].top2++;
        stats[order[1].id].top2++;
        thirds.push(order[2]);
        stats[order[3].id].out++;
        for (const row of order) stats[row.id].pts += row.pts;
      }
      // 8 השלישיות הטובות מעפילות
      thirds.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || rnd() - 0.5);
      for (let i = 0; i < thirds.length; i++) {
        if (i < 8) stats[thirds[i].id].third++;
        else stats[thirds[i].id].out++;
      }
    }

    const out = {};
    for (const id in stats) {
      const s = stats[id];
      out[id] = {
        pWinGroup: s.win / nSims,
        pTop2: s.top2 / nSims,
        pThirdAdv: s.third / nSims,
        pAdvance: (s.top2 + s.third) / nSims,
        expPts: s.pts / nSims
      };
    }
    return out;
  }

  /* ---------- נוק-אאוט מקורב → P(זוכת המונדיאל) ----------
     הגרלה אקראית תחת אילוץ אי-מפגש בני אותו בית בסיבוב ה-32.
     תיקו ב-90 ד' מוכרע בהסתברות מוטת-Elo (הארכה/פנדלים).      */
  function koWinProb(idA, idB) {
    const dr = effElo(DATA.teams[idA]) - effElo(DATA.teams[idB]);
    // סקאלה 550 (רכה מ-400 הסטנדרטי): משחק בודד בנוק-אאוט = שונות גבוהה
    // (הארכות, פנדלים, אדום) — מקרב את פיזור האלופות לתמחור שוק ריאלי
    return 1 / (1 + Math.pow(10, -dr / 550));
  }

  function simulateChampion(nSims = 5000, rnd = Math.random) {
    const groupIds = Object.keys(DATA.groups);
    const played = playedMap();
    const prep = {};
    for (const g of groupIds) {
      prep[g] = groupFixtures(g).map(([a, b]) => ({
        a, b,
        fixed: played[a + "|" + b] || null,
        matrix: played[a + "|" + b] ? null : scoreMatrix(DATA.teams[a], DATA.teams[b])
      }));
    }
    const champs = {}, finals = {}, semis = {};

    for (let s = 0; s < nSims; s++) {
      const qualified = [], groupOf = {};
      const thirds = [];
      for (const g of groupIds) {
        const table = {};
        for (const id of DATA.groups[g]) table[id] = { id, pts: 0, gd: 0, gf: 0 };
        for (const fx of prep[g]) {
          const [hg, ag] = fx.fixed || sampleScore(fx.matrix, rnd);
          const A = table[fx.a], B = table[fx.b];
          A.gf += hg; A.gd += hg - ag; B.gf += ag; B.gd += ag - hg;
          if (hg > ag) A.pts += 3; else if (hg < ag) B.pts += 3; else { A.pts++; B.pts++; }
        }
        const order = Object.values(table).sort((x, y) =>
          y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || rnd() - 0.5);
        qualified.push(order[0].id, order[1].id);
        groupOf[order[0].id] = g; groupOf[order[1].id] = g;
        thirds.push(order[2]);
      }
      thirds.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || rnd() - 0.5);
      for (let i = 0; i < 8; i++) { qualified.push(thirds[i].id); groupOf[thirds[i].id] = "T" + i; }

      // ערבוב + תיקון מפגשי אותו-בית בסיבוב הראשון
      let pool = qualified.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      for (let i = 0; i < 32; i += 2) {
        if (groupOf[pool[i]] === groupOf[pool[i + 1]]) {
          const k = (i + 3) % 32;
          [pool[i + 1], pool[k]] = [pool[k], pool[i + 1]];
        }
      }
      // סיבובי נוק-אאוט עד אלוף
      let round = pool;
      while (round.length > 1) {
        const next = [];
        for (let i = 0; i < round.length; i += 2) {
          const w = rnd() < koWinProb(round[i], round[i + 1]) ? round[i] : round[i + 1];
          next.push(w);
        }
        if (round.length === 4) for (const id of round) semis[id] = (semis[id] || 0) + 1;
        if (round.length === 2) for (const id of round) finals[id] = (finals[id] || 0) + 1;
        round = next;
      }
      champs[round[0]] = (champs[round[0]] || 0) + 1;
    }

    const out = {};
    for (const g of groupIds)
      for (const id of DATA.groups[g])
        out[id] = {
          pChampion: (champs[id] || 0) / nSims,
          pFinal: (finals[id] || 0) / nSims,
          pSemi: (semis[id] || 0) / nSims
        };
    return out;
  }

  /* ---------- שיפוט שוק מול תוצאת 90 דקות (hg=קבוצה ראשונה, ag=שנייה) ----------
     מחזיר true=פגע, false=החטיא, null=לא ניתן לשיפוט מהתוצאה הסופית (מחציות וכו') */
  /* שיפוט שוק מול תוצאה. extra = נתוני-על אופציונליים על המשחק שהסתיים:
       { htHg, htAg } — תוצאת מחצית ראשונה (שערי קבוצה ראשונה/שנייה)
       { firstScorer } — מי הבקיע ראשון: "H" (ראשונה) | "A" (שנייה) | "none"
     שווקי מחצית/מבקיעה-ראשונה ניתנים לשיפוט רק כשהנתון הרלוונטי קיים ב-extra;
     אחרת מוחזר null (לא נשפט) — כדי שאחוז ההצלחה לעולם לא יספור ניחוש. */
  function gradeMarket(suffix, hg, ag, extra) {
    extra = extra || {};
    const tot = hg + ag;
    const hasHT = extra.htHg != null && extra.htAg != null;
    const htH = +extra.htHg, htA = +extra.htAg;
    const htRes = hasHT ? (htH > htA ? "1" : htH < htA ? "2" : "X") : null;
    const ftRes = hg > ag ? "1" : hg < ag ? "2" : "X";

    // הנדיקאפ (H±N: שערי הקבוצה הראשונה אחרי הוספת ההנדיקאפ)
    const hc = suffix.match(/^H([+-]\d+):(1|X|2)$/);
    if (hc) {
      const adj = hg + parseInt(hc[1], 10), out = hc[2];
      if (out === "1") return adj > ag;
      if (out === "X") return adj === ag;
      return adj < ag;
    }
    // תוצאה מדויקת CSxy
    if (suffix.startsWith("CS")) {
      const x = +suffix[2], y = +suffix[3];
      return hg === x && ag === y;
    }
    // מחצית/סיום HTFT<ht>/<ft> — דורש תוצאת מחצית
    if (suffix.startsWith("HTFT")) {
      if (!hasHT) return null;
      return suffix.slice(4) === htRes + "/" + ftRes;
    }
    switch (suffix) {
      case "1": return hg > ag;
      case "X": return hg === ag;
      case "2": return hg < ag;
      case "1X": return hg >= ag;
      case "X2": return hg <= ag;
      case "12": return hg !== ag;
      case "O15": return tot > 1.5;  case "U15": return tot < 1.5;
      case "O25": return tot > 2.5;  case "U25": return tot < 2.5;
      case "O35": return tot > 3.5;  case "U35": return tot < 3.5;
      case "BTTS": return hg > 0 && ag > 0;
      case "NBTTS": return !(hg > 0 && ag > 0);
      case "ODD": return tot % 2 === 1;  case "EVEN": return tot % 2 === 0;
      case "R01": return tot <= 1;  case "R23": return tot === 2 || tot === 3;  case "R4P": return tot >= 4;
      case "WB2A": return hg - ag >= 2;  case "WB2B": return ag - hg >= 2;
      // ---- שווקי מחצית ראשונה (דורשים htHg/htAg) ----
      case "HT1": return hasHT ? htRes === "1" : null;
      case "HTX": return hasHT ? htRes === "X" : null;
      case "HT2": return hasHT ? htRes === "2" : null;
      // שער בשתי המחציות: שער במחצית הראשונה (htTot>0) וגם במחצית השנייה (ft>ht)
      case "GBH": return hasHT ? (htH + htA > 0 && (hg - htH) + (ag - htA) > 0) : null;
      // ---- מבקיעה ראשונה (דורש firstScorer) ----
      case "FG1": return extra.firstScorer ? extra.firstScorer === "H" : null;
      case "FG2": return extra.firstScorer ? extra.firstScorer === "A" : null;
      case "FG0": return extra.firstScorer ? extra.firstScorer === "none" : null;
      // שווקי העפלה (נוק-אאוט, הארכה/פנדלים) — לא נגזרים מתוצאת 90 דקות
      default: return null;
    }
  }

  /* ---------- דירוג ביטחון להמלצה (1–5) ---------- */
  function confidence(p, eloGap) {
    let c = 1;
    if (p >= 0.55) c++;
    if (p >= 0.65) c++;
    if (p >= 0.75) c++;
    if (Math.abs(eloGap) >= 250) c++;
    return Math.min(c, 5);
  }

  /* ============================================================
     נוק-אאוט אמיתי — מופעל כשממלאים את הסוגריים בסוף שלב הבתים
     ============================================================ */

  // P(הקבוצה הראשונה מעפילה) במשחק נוק-אאוט בודד:
  // ניצחון ב-90' + תיקו שמוכרע בהארכה/פנדלים בהסתברות מוטת-Elo
  function koAdvanceProb(idA, idB) {
    const m = markets(DATA.teams[idA], DATA.teams[idB]);
    return m.p1 + m.px * koWinProb(idA, idB);
  }

  /* חישוב מדויק (לא סימולציה) של הסתברויות התקדמות לאורך סוגריים נתונים.
     r32Pairs: מערך של 16 זוגות [idA, idB] לפי סדר הסוגריים —
       מנצחות משחקים 0,1 נפגשות בשמינית הגמר הראשונה וכן הלאה.
     winners: { "R32-3": "ESP", "R16-1": ... } — תוצאות אמת שמקבעות מנצחת.
     מחזיר: { perTeam: {id: {pR16,pQF,pSF,pF,pChampion}}, rounds } */
  function koPropagate(r32Pairs, winners = {}) {
    const ROUND_IDS = ["R32", "R16", "QF", "SF", "F"];
    const perTeam = {};
    const touch = (id) => perTeam[id] || (perTeam[id] = { pR16: 0, pQF: 0, pSF: 0, pF: 0, pChampion: 0 });
    const REACH_KEY = { R32: "pR16", R16: "pQF", QF: "pSF", SF: "pF", F: "pChampion" };

    // התפלגות "מי נמצאת במשחק" → התפלגות "מי מנצחת את המשחק"
    function winnerDist(matchId, distA, distB) {
      if (winners[matchId]) return { [winners[matchId]]: 1 };
      const out = {};
      for (const a in distA) {
        let pWin = 0;
        for (const b in distB) pWin += distB[b] * koAdvanceProb(a, b);
        out[a] = (out[a] || 0) + distA[a] * pWin;
      }
      for (const b in distB) {
        let pWin = 0;
        for (const a in distA) pWin += distA[a] * koAdvanceProb(b, a);
        out[b] = (out[b] || 0) + distB[b] * pWin;
      }
      return out;
    }

    // סיבוב ראשון: כל קבוצה נוכחת בהסתברות 1
    let dists = r32Pairs.map(([a, b], i) =>
      winnerDist("R32-" + (i + 1), { [a]: 1 }, { [b]: 1 }));
    for (const [a, b] of r32Pairs) { touch(a); touch(b); }
    for (const d of dists) for (const id in d) touch(id).pR16 += d[id];

    for (let r = 1; r < ROUND_IDS.length; r++) {
      const next = [];
      for (let i = 0; i < dists.length; i += 2) {
        const d = winnerDist(ROUND_IDS[r] + "-" + (i / 2 + 1), dists[i], dists[i + 1]);
        next.push(d);
        for (const id in d) touch(id)[REACH_KEY[ROUND_IDS[r]]] += d[id];
      }
      dists = next;
    }
    return { perTeam, championDist: dists[0] };
  }

  return {
    lambdas, scoreMatrix, markets, extendedMarkets, fairOdds, minWorthOdds, edge,
    simulateGroups, simulateChampion, groupFixtures, confidence, effElo,
    koAdvanceProb, koPropagate, koWinProb, gradeMarket,
    learnedElo, learnedEloAsOf, resetLearned, resultDate,
    EDGE_MARGIN
  };
})();

if (typeof module !== "undefined") module.exports = MODEL;
