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

  // משחקי בית: כל זוגות (6 משחקים)
  function groupFixtures(groupId) {
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

  /* ---------- דירוג ביטחון להמלצה (1–5) ---------- */
  function confidence(p, eloGap) {
    let c = 1;
    if (p >= 0.55) c++;
    if (p >= 0.65) c++;
    if (p >= 0.75) c++;
    if (Math.abs(eloGap) >= 250) c++;
    return Math.min(c, 5);
  }

  return {
    lambdas, scoreMatrix, markets, fairOdds, minWorthOdds, edge,
    simulateGroups, simulateChampion, groupFixtures, confidence, effElo,
    EDGE_MARGIN
  };
})();

if (typeof module !== "undefined") module.exports = MODEL;
