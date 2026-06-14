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

  // Elo אפקטיבי למשחק (כולל בונוס ביתיות למארחות)
  function effElo(team) {
    return team.elo + (team.host ? DATA.meta.hostBonus : 0);
  }

  function lambdas(teamA, teamB) {
    const dr = effElo(teamA) - effElo(teamB);
    let lA = BASE_GOALS * Math.pow(10, dr / ELO_GOAL_SCALE);
    let lB = BASE_GOALS * Math.pow(10, -dr / ELO_GOAL_SCALE);
    // כוונון סגנון עדין: התקפה של A מול הגנה של B
    lA *= (teamA.attMod || 1) * (teamB.defMod || 1);
    lB *= (teamB.attMod || 1) * (teamA.defMod || 1);
    return [clamp(lA, 0.15, 4.2), clamp(lB, 0.15, 4.2)];
  }

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  // מטריצת הסתברויות לכל תוצאה מדויקת
  function scoreMatrix(teamA, teamB) {
    const [lA, lB] = lambdas(teamA, teamB);
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
  function markets(teamA, teamB) {
    const m = scoreMatrix(teamA, teamB);
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

  // חלוקת שערים בין מחציות: ~45% במחצית הראשונה (ממוצע היסטורי)
  const H1_SHARE = 0.45;

  function extendedMarkets(teamA, teamB) {
    const m = scoreMatrix(teamA, teamB);
    const [lA, lB] = lambdas(teamA, teamB);

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

    // מחציות: שתי מטריצות בלתי-תלויות (45%/55% מהתוחלת)
    const HMAX = 6;
    const m1 = rawMatrix(lA * H1_SHARE, lB * H1_SHARE, HMAX);
    const m2 = rawMatrix(lA * (1 - H1_SHARE), lB * (1 - H1_SHARE), HMAX);
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
    // שער בשתי המחציות
    const goalBothHalves = (1 - Math.exp(-lT * H1_SHARE)) * (1 - Math.exp(-lT * (1 - H1_SHARE)));

    return {
      hcapA_minus1: handicap(-1),  // הקבוצה הראשונה פותחת ב-0:1
      hcapA_plus1: handicap(1),    // הקבוצה הראשונה פותחת ב-1:0
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
  function gradeMarket(suffix, hg, ag) {
    const tot = hg + ag;
    // הנדיקאפ
    if (suffix.startsWith("H-1:") || suffix.startsWith("H+1:")) {
      const adj = suffix[1] === "-" ? hg - 1 : hg + 1, out = suffix.slice(4);
      if (out === "1") return adj > ag;
      if (out === "X") return adj === ag;
      if (out === "2") return adj < ag;
      return null;
    }
    // תוצאה מדויקת CSxy
    if (suffix.startsWith("CS")) {
      const x = +suffix[2], y = +suffix[3];
      return hg === x && ag === y;
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
      // שווקי מחצית/מבקיעה-ראשונה/העפלה — לא נגזרים מהתוצאה הסופית
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
    EDGE_MARGIN
  };
})();

if (typeof module !== "undefined") module.exports = MODEL;
