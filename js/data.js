/* ============================================================
   FifaWinner — מאגר נתונים אליפות העולם 2026
   ------------------------------------------------------------
   מבנה:
   DATA.teams[id]  — נבחרת: דירוגים, היסטוריית 10 שנים, סגל, סגנון
   DATA.groups     — 12 הבתים (סדר עמדות לפי ההגרלה)
   DATA.results    — תוצאות אמת שכבר נרשמו (הסימולציה מקבעת אותן!)
                     ↳ לעדכון במהלך הטורניר: הוסיפו שורה לכל משחק שהסתיים.
                     שדות שורה: { g, home, away, hg, ag }  (חובה — תוצאת 90 דקות)
                     שדות-על אופציונליים (מלאו רק כשרלוונטי לשיפוט ההמלצה):
                       htHg, htAg  — תוצאת מחצית ראשונה (לשיפוט שווקי מחצית/HTFT/GBH)
                                     נמשך אוטומטית מ-football-data.org אם זמין
                       firstScorer — מי הבקיע ראשון: "H"=בית · "A"=חוץ · "none"=0-0
                                     (ידני בלבד — חסר ב-API החינמי; לשיפוט "מבקיעה ראשונה")
   שדות נבחרת:
     elo        — דירוג כוח (הערכת מודל בהשראת eloratings.net, יוני 2026)
     fifa       — דירוג עולמי 11.6.2026 (מאומת לצמרת; השאר הערכה)
     host       — מארחת (מקבלת בונוס ביתיות במודל)
     attMod/defMod — כוונון סגנון עדין (1.0=ניטרלי; att>1 התקפית, def<1 הגנה חזקה)
     tier       — מדרגת שווי סגל (1=עלית עולמית ... 5=מינימלי)
   ============================================================ */

const DATA = {
  meta: {
    updated: "2026-07-08",
    tournament: "אליפות העולם 2026 — ארה\"ב, מקסיקו, קנדה",
    eloNote: "דירוגי הכוח הם הערכות מודל נכון ליוני 2026",
    hostBonus: 50,
    // עוגני התייחסות עולמיים (יוני 2026): הסתברות גלומה לזכייה
    marketChampion: { ESP: 0.175, FRA: 0.165, ENG: 0.12, BRA: 0.105, POR: 0.095, ARG: 0.095, GER: 0.06, NED: 0.045 }
  },

  groups: {
    A: ["MEX", "RSA", "KOR", "CZE"],
    B: ["CAN", "SUI", "QAT", "BIH"],
    C: ["BRA", "MAR", "HAI", "SCO"],
    D: ["USA", "PAR", "AUS", "TUR"],
    E: ["GER", "CUR", "CIV", "ECU"],
    F: ["NED", "JPN", "SWE", "TUN"],
    G: ["BEL", "EGY", "IRN", "NZL"],
    H: ["ESP", "CPV", "KSA", "URU"],
    I: ["FRA", "IRQ", "NOR", "SEN"],
    J: ["ARG", "ALG", "AUT", "JOR"],
    K: ["POR", "COL", "COD", "UZB"],
    L: ["ENG", "CRO", "GHA", "PAN"]
  },

  // לוח שלב הבתים המלא (תאריכים מקומיים ארה"ב/ET; est=הערכה ±יום)
  // מקורות: CBS / NBC / Yahoo, יוני 2026
  schedule: [
    { d: "2026-06-11", g: "A", h: "MEX", a: "RSA" }, { d: "2026-06-11", g: "A", h: "KOR", a: "CZE" },
    { d: "2026-06-12", g: "B", h: "CAN", a: "BIH" }, { d: "2026-06-12", g: "D", h: "USA", a: "PAR" },
    { d: "2026-06-13", g: "B", h: "QAT", a: "SUI" }, { d: "2026-06-13", g: "C", h: "BRA", a: "MAR" }, { d: "2026-06-13", g: "C", h: "HAI", a: "SCO" },
    { d: "2026-06-14", g: "D", h: "AUS", a: "TUR" }, { d: "2026-06-14", g: "E", h: "GER", a: "CUR" }, { d: "2026-06-14", g: "E", h: "CIV", a: "ECU" }, { d: "2026-06-14", g: "F", h: "NED", a: "JPN" }, { d: "2026-06-14", g: "F", h: "SWE", a: "TUN" },
    { d: "2026-06-15", g: "H", h: "ESP", a: "CPV" }, { d: "2026-06-15", g: "G", h: "BEL", a: "EGY" }, { d: "2026-06-15", g: "H", h: "KSA", a: "URU" }, { d: "2026-06-15", g: "G", h: "IRN", a: "NZL" },
    { d: "2026-06-16", g: "I", h: "FRA", a: "SEN" }, { d: "2026-06-16", g: "I", h: "IRQ", a: "NOR" }, { d: "2026-06-16", g: "J", h: "ARG", a: "ALG" },
    { d: "2026-06-17", g: "K", h: "POR", a: "COD" }, { d: "2026-06-17", g: "L", h: "ENG", a: "CRO" }, { d: "2026-06-17", g: "L", h: "GHA", a: "PAN" }, { d: "2026-06-17", g: "J", h: "AUT", a: "JOR", est: 1 }, { d: "2026-06-17", g: "K", h: "COL", a: "UZB", est: 1 },
    { d: "2026-06-18", g: "A", h: "CZE", a: "RSA" }, { d: "2026-06-18", g: "B", h: "SUI", a: "BIH" }, { d: "2026-06-18", g: "B", h: "CAN", a: "QAT" }, { d: "2026-06-18", g: "A", h: "MEX", a: "KOR" },
    { d: "2026-06-19", g: "D", h: "USA", a: "AUS" }, { d: "2026-06-19", g: "C", h: "SCO", a: "MAR" }, { d: "2026-06-19", g: "C", h: "BRA", a: "HAI" },
    { d: "2026-06-20", g: "D", h: "TUR", a: "PAR" }, { d: "2026-06-20", g: "F", h: "NED", a: "SWE" }, { d: "2026-06-20", g: "E", h: "GER", a: "CIV" }, { d: "2026-06-20", g: "E", h: "ECU", a: "CUR" }, { d: "2026-06-20", g: "F", h: "JPN", a: "TUN", est: 1 },
    { d: "2026-06-21", g: "H", h: "ESP", a: "KSA" }, { d: "2026-06-21", g: "H", h: "URU", a: "CPV" }, { d: "2026-06-21", g: "G", h: "NZL", a: "EGY" }, { d: "2026-06-21", g: "G", h: "BEL", a: "IRN", est: 1 },
    { d: "2026-06-22", g: "J", h: "ARG", a: "AUT" }, { d: "2026-06-22", g: "I", h: "FRA", a: "IRQ" }, { d: "2026-06-22", g: "I", h: "NOR", a: "SEN" }, { d: "2026-06-22", g: "J", h: "ALG", a: "JOR", est: 1 },
    { d: "2026-06-23", g: "K", h: "POR", a: "UZB" }, { d: "2026-06-23", g: "L", h: "ENG", a: "GHA" }, { d: "2026-06-23", g: "K", h: "COL", a: "COD" }, { d: "2026-06-23", g: "L", h: "CRO", a: "PAN", est: 1 },
    { d: "2026-06-24", g: "A", h: "CZE", a: "MEX" }, { d: "2026-06-24", g: "A", h: "RSA", a: "KOR" }, { d: "2026-06-24", g: "B", h: "CAN", a: "SUI" }, { d: "2026-06-24", g: "B", h: "QAT", a: "BIH" }, { d: "2026-06-24", g: "C", h: "BRA", a: "SCO", est: 1 }, { d: "2026-06-24", g: "C", h: "MAR", a: "HAI", est: 1 },
    { d: "2026-06-25", g: "D", h: "USA", a: "TUR", est: 1 }, { d: "2026-06-25", g: "D", h: "PAR", a: "AUS", est: 1 }, { d: "2026-06-25", g: "E", h: "GER", a: "ECU", est: 1 }, { d: "2026-06-25", g: "E", h: "CUR", a: "CIV", est: 1 }, { d: "2026-06-25", g: "F", h: "NED", a: "TUN", est: 1 }, { d: "2026-06-25", g: "F", h: "JPN", a: "SWE", est: 1 },
    { d: "2026-06-26", g: "G", h: "EGY", a: "IRN" }, { d: "2026-06-26", g: "G", h: "NZL", a: "BEL" }, { d: "2026-06-26", g: "H", h: "CPV", a: "KSA" }, { d: "2026-06-26", g: "H", h: "URU", a: "ESP" }, { d: "2026-06-26", g: "I", h: "NOR", a: "FRA" }, { d: "2026-06-26", g: "I", h: "SEN", a: "IRQ" },
    { d: "2026-06-27", g: "J", h: "ALG", a: "AUT" }, { d: "2026-06-27", g: "J", h: "JOR", a: "ARG" }, { d: "2026-06-27", g: "K", h: "COL", a: "POR" }, { d: "2026-06-27", g: "K", h: "COD", a: "UZB" }, { d: "2026-06-27", g: "L", h: "PAN", a: "ENG" }, { d: "2026-06-27", g: "L", h: "CRO", a: "GHA" }
  ],

  // תוצאות אמת — מתעדכן אוטומטית ע"י .github/workflows/update-results.yml (פעמיים ביום)
  // וניתן גם ידנית. שורת בתים: g=אות הבית, כיוון home/away תואם ל-schedule.
  // שורת נוק-אאוט: g=סיבוב (R32/R16/QF/SF/3P/FIN — הגמר "FIN" כדי לא
  // להתנגש באות בית F), d=תאריך, hg/ag=תוצאת 90 דקות,
  // koWin="H"/"A" כשהוכרע בהארכה (פנדלים נשארים תיקו ללמידת ה-Elo).
  // המודל לומד (Elo, התקפה/הגנה, מחציות) מכל השורות — בתים ונוק-אאוט כאחד.
  results: [
    /* RESULTS:START — נערך אוטומטית; אל תוסיפו טקסט בתוך הבלוק הזה */
    { g: "A", home: "MEX", away: "RSA", hg: 2, ag: 0, htHg: 1, htAg: 0, firstScorer: "H" },
    { g: "A", home: "KOR", away: "CZE", hg: 2, ag: 1, htHg: 0, htAg: 0 },
    { g: "B", home: "CAN", away: "BIH", hg: 1, ag: 1, htHg: 0, htAg: 1 },
    { g: "D", home: "USA", away: "PAR", hg: 4, ag: 1, htHg: 3, htAg: 0 },
    { g: "B", home: "QAT", away: "SUI", hg: 1, ag: 1, htHg: 0, htAg: 1, firstScorer: "A" },
    { g: "C", home: "BRA", away: "MAR", hg: 1, ag: 1, htHg: 1, htAg: 1, firstScorer: "A" },
    { g: "C", home: "HAI", away: "SCO", hg: 0, ag: 1, htHg: 0, htAg: 1, firstScorer: "A" },
    { g: "D", home: "AUS", away: "TUR", hg: 1, ag: 0, htHg: 1, htAg: 0 },
    { g: "E", home: "GER", away: "CUR", hg: 7, ag: 1, htHg: 3, htAg: 1 },
    { g: "E", home: "CIV", away: "ECU", hg: 1, ag: 0, htHg: 0, htAg: 0 },
    { g: "F", home: "NED", away: "JPN", hg: 2, ag: 2, htHg: 0, htAg: 0, firstScorer: "H" },
    { g: "F", home: "SWE", away: "TUN", hg: 5, ag: 1, htHg: 2, htAg: 1 },
    { g: "H", home: "ESP", away: "CPV", hg: 0, ag: 0, htHg: 0, htAg: 0 },
    { g: "G", home: "BEL", away: "EGY", hg: 1, ag: 1, htHg: 0, htAg: 1, firstScorer: "A" },
    { g: "H", home: "KSA", away: "URU", hg: 1, ag: 1, htHg: 1, htAg: 0, firstScorer: "H" },
    { g: "G", home: "IRN", away: "NZL", hg: 2, ag: 2, htHg: 1, htAg: 1, firstScorer: "A" },
    { g: "I", home: "FRA", away: "SEN", hg: 3, ag: 1, htHg: 0, htAg: 0, firstScorer: "H" },
    { g: "I", home: "IRQ", away: "NOR", hg: 1, ag: 4, htHg: 1, htAg: 2, firstScorer: "A" },
    { g: "J", home: "ARG", away: "ALG", hg: 3, ag: 0, htHg: 1, htAg: 0, firstScorer: "H" },
    { g: "K", home: "POR", away: "COD", hg: 1, ag: 1, htHg: 1, htAg: 1 },
    { g: "L", home: "ENG", away: "CRO", hg: 4, ag: 2, htHg: 2, htAg: 2, firstScorer: "H" },
    { g: "L", home: "GHA", away: "PAN", hg: 1, ag: 0, htHg: 0, htAg: 0 },
    { g: "J", home: "AUT", away: "JOR", hg: 3, ag: 1, htHg: 1, htAg: 0, firstScorer: "H" },
    { g: "K", home: "COL", away: "UZB", hg: 3, ag: 1, htHg: 1, htAg: 0, firstScorer: "H" },
    { g: "A", home: "CZE", away: "RSA", hg: 1, ag: 1, htHg: 1, htAg: 0 },
    { g: "B", home: "SUI", away: "BIH", hg: 4, ag: 1, htHg: 0, htAg: 0 },
    { g: "B", home: "CAN", away: "QAT", hg: 6, ag: 0, htHg: 3, htAg: 0, firstScorer: "H" },
    { g: "A", home: "MEX", away: "KOR", hg: 1, ag: 0, htHg: 0, htAg: 0, firstScorer: "H" },
    { g: "D", home: "USA", away: "AUS", hg: 2, ag: 0, htHg: 2, htAg: 0 },
    { g: "C", home: "SCO", away: "MAR", hg: 0, ag: 1, htHg: 0, htAg: 1, firstScorer: "A" },
    { g: "C", home: "BRA", away: "HAI", hg: 3, ag: 0, htHg: 3, htAg: 0 },
    { g: "D", home: "TUR", away: "PAR", hg: 0, ag: 1, htHg: 0, htAg: 1 },
    { g: "F", home: "NED", away: "SWE", hg: 5, ag: 1, htHg: 2, htAg: 0, firstScorer: "H" },
    { g: "E", home: "GER", away: "CIV", hg: 2, ag: 1, htHg: 0, htAg: 1 },
    { g: "E", home: "ECU", away: "CUR", hg: 0, ag: 0, htHg: 0, htAg: 0, firstScorer: "none" },
    { g: "F", home: "JPN", away: "TUN", hg: 4, ag: 0, htHg: 2, htAg: 0, firstScorer: "H" },
    { g: "H", home: "ESP", away: "KSA", hg: 5, ag: 0, htHg: 3, htAg: 0 },
    { g: "H", home: "URU", away: "CPV", hg: 2, ag: 2, htHg: 2, htAg: 1, firstScorer: "A" },
    { g: "G", home: "NZL", away: "EGY", hg: 1, ag: 3, htHg: 1, htAg: 0, firstScorer: "H" },
    { g: "G", home: "BEL", away: "IRN", hg: 0, ag: 0, htHg: 0, htAg: 0, firstScorer: "none" },
    { g: "J", home: "ARG", away: "AUT", hg: 2, ag: 0, htHg: 1, htAg: 0, firstScorer: "H" },
    { g: "I", home: "FRA", away: "IRQ", hg: 3, ag: 0, htHg: 1, htAg: 0 },
    { g: "I", home: "NOR", away: "SEN", hg: 3, ag: 2, htHg: 1, htAg: 0 },
    { g: "J", home: "ALG", away: "JOR", hg: 2, ag: 1, htHg: 0, htAg: 1, firstScorer: "A" },
    { g: "K", home: "POR", away: "UZB", hg: 5, ag: 0, htHg: 3, htAg: 0 },
    { g: "L", home: "ENG", away: "GHA", hg: 0, ag: 0, htHg: 0, htAg: 0 },
    { g: "K", home: "COL", away: "COD", hg: 1, ag: 0, htHg: 0, htAg: 0, firstScorer: "none" },
    { g: "L", home: "CRO", away: "PAN", hg: 1, ag: 0, htHg: 0, htAg: 0, firstScorer: "H" },
    { g: "A", home: "CZE", away: "MEX", hg: 0, ag: 3, htHg: 0, htAg: 0 },
    { g: "A", home: "RSA", away: "KOR", hg: 1, ag: 0, htHg: 0, htAg: 0, firstScorer: "H" },
    { g: "B", home: "CAN", away: "SUI", hg: 1, ag: 2, htHg: 0, htAg: 0 },
    { g: "B", home: "QAT", away: "BIH", hg: 1, ag: 3, htHg: 1, htAg: 2 },
    { g: "C", home: "BRA", away: "SCO", hg: 3, ag: 0, htHg: 2, htAg: 0, firstScorer: "H" },
    { g: "C", home: "MAR", away: "HAI", hg: 4, ag: 2, htHg: 2, htAg: 2 },
    { g: "D", home: "USA", away: "TUR", hg: 2, ag: 3, htHg: 1, htAg: 2 },
    { g: "D", home: "PAR", away: "AUS", hg: 0, ag: 0, htHg: 0, htAg: 0, firstScorer: "none" },
    { g: "E", home: "GER", away: "ECU", hg: 1, ag: 2, htHg: 1, htAg: 1, firstScorer: "H" },
    { g: "E", home: "CUR", away: "CIV", hg: 0, ag: 2, htHg: 0, htAg: 1 },
    { g: "F", home: "NED", away: "TUN", hg: 3, ag: 1, htHg: 2, htAg: 0, firstScorer: "H" },
    { g: "F", home: "JPN", away: "SWE", hg: 1, ag: 1, htHg: 0, htAg: 0, firstScorer: "H" },
    { g: "G", home: "EGY", away: "IRN", hg: 1, ag: 1, htHg: 1, htAg: 1 },
    { g: "G", home: "NZL", away: "BEL", hg: 1, ag: 5, htHg: 0, htAg: 1, firstScorer: "A" },
    { g: "H", home: "CPV", away: "KSA", hg: 0, ag: 0, htHg: 0, htAg: 0 },
    { g: "H", home: "URU", away: "ESP", hg: 0, ag: 1, htHg: 0, htAg: 1, firstScorer: "A" },
    { g: "I", home: "NOR", away: "FRA", hg: 1, ag: 4, htHg: 1, htAg: 3, firstScorer: "A" },
    { g: "I", home: "SEN", away: "IRQ", hg: 5, ag: 0, htHg: 1, htAg: 0, firstScorer: "H" },
    { g: "J", home: "ALG", away: "AUT", hg: 3, ag: 3, htHg: 1, htAg: 1, firstScorer: "A" },
    { g: "J", home: "JOR", away: "ARG", hg: 1, ag: 3, htHg: 0, htAg: 2 },
    { g: "K", home: "COL", away: "POR", hg: 0, ag: 0, htHg: 0, htAg: 0, firstScorer: "none" },
    { g: "K", home: "COD", away: "UZB", hg: 3, ag: 1, htHg: 0, htAg: 1 },
    { g: "L", home: "PAN", away: "ENG", hg: 0, ag: 2, htHg: 0, htAg: 0 },
    { g: "L", home: "CRO", away: "GHA", hg: 2, ag: 1, htHg: 1, htAg: 0, firstScorer: "H" },
    { g: "R32", home: "RSA", away: "CAN", hg: 0, ag: 1, d: "2026-06-28", htHg: 0, htAg: 0, firstScorer: "none" },
    { g: "R32", home: "BRA", away: "JPN", hg: 2, ag: 1, d: "2026-06-29", htHg: 0, htAg: 1, firstScorer: "A" },
    { g: "R32", home: "GER", away: "PAR", hg: 1, ag: 1, d: "2026-06-29", htHg: 0, htAg: 1, firstScorer: "A" },
    { g: "R32", home: "CIV", away: "NOR", hg: 1, ag: 2, d: "2026-06-30", htHg: 0, htAg: 1 },
    { g: "R32", home: "FRA", away: "SWE", hg: 3, ag: 0, d: "2026-06-30", htHg: 1, htAg: 0 },
    { g: "R32", home: "NED", away: "MAR", hg: 1, ag: 1, d: "2026-06-30", htHg: 0, htAg: 0, firstScorer: "H" },
    { g: "R32", home: "BEL", away: "SEN", hg: 2, ag: 2, d: "2026-07-01", htHg: 0, htAg: 1, koWin: "H" },
    { g: "R32", home: "ENG", away: "COD", hg: 2, ag: 1, d: "2026-07-01", htHg: 0, htAg: 1 },
    { g: "R32", home: "MEX", away: "ECU", hg: 2, ag: 0, d: "2026-07-01", htHg: 2, htAg: 0, firstScorer: "H" },
    { g: "R32", home: "ESP", away: "AUT", hg: 3, ag: 0, d: "2026-07-02", htHg: 1, htAg: 0, firstScorer: "H" },
    { g: "R32", home: "POR", away: "CRO", hg: 2, ag: 1, d: "2026-07-02", htHg: 0, htAg: 0, firstScorer: "A" },
    { g: "R32", home: "USA", away: "BIH", hg: 2, ag: 0, d: "2026-07-02", htHg: 1, htAg: 0 },
    { g: "R32", home: "ARG", away: "CPV", hg: 1, ag: 1, d: "2026-07-03", htHg: 1, htAg: 0, koWin: "H" },
    { g: "R32", home: "AUS", away: "EGY", hg: 1, ag: 1, d: "2026-07-03", htHg: 0, htAg: 1 },
    { g: "R32", home: "SUI", away: "ALG", hg: 2, ag: 0, d: "2026-07-03", htHg: 1, htAg: 0, firstScorer: "H" },
    { g: "R32", home: "COL", away: "GHA", hg: 2, ag: 0, d: "2026-07-04", htHg: 1, htAg: 0, firstScorer: "H" },
    { g: "R16", home: "CAN", away: "MAR", hg: 0, ag: 3, d: "2026-07-04", htHg: 0, htAg: 0, firstScorer: "none" },
    { g: "R16", home: "PAR", away: "FRA", hg: 0, ag: 1, d: "2026-07-04", htHg: 0, htAg: 0, firstScorer: "A" },
    { g: "R16", home: "BRA", away: "NOR", hg: 1, ag: 2, d: "2026-07-05", htHg: 0, htAg: 0 },
    { g: "R16", home: "MEX", away: "ENG", hg: 2, ag: 3, d: "2026-07-06", htHg: 1, htAg: 2, firstScorer: "A" },
    { g: "R16", home: "POR", away: "ESP", hg: 0, ag: 1, d: "2026-07-06", htHg: 0, htAg: 0, firstScorer: "none" },
    { g: "R16", home: "ARG", away: "EGY", hg: 3, ag: 2, d: "2026-07-07", htHg: 0, htAg: 1, firstScorer: "A" },
    { g: "R16", home: "SUI", away: "COL", hg: 0, ag: 0, d: "2026-07-07", htHg: 0, htAg: 0 },
    { g: "R16", home: "USA", away: "BEL", hg: 1, ag: 4, d: "2026-07-07", htHg: 1, htAg: 2 }
    /* RESULTS:END */
  ],

  // סוגריי הנוק-אאוט — נערך אוטומטית ע"י scripts/update-results.js מתוצאות ה-API.
  //   r32     — 16 זוגות [idA, idB] לפי סדר הסוגריים (מנצחות 1–2 → שמינית 1 וכו').
  //             ריק (מערך ריק) כל עוד שלב הנוק-אאוט לא החל.
  //   winners — { "R32-1": "ESP", "R16-2": ... } מנצחת בפועל לכל משחק שהוכרע.
  //   stage   — הסיבוב הרחוק ביותר שנצפה (R32/R16/QF/SF/F) או null.
  //   matches — רשימה שטוחה של משחקי הנוק-אאוט הידועים (ששוחקו/מתוכננים):
  //             { id, round, a, b, d, hg?, ag?, et?, penH?, penA?, winner? }
  //             hg/ag = תוצאה סופית (כולל הארכה); penH/penA = פנדלים.
  //             משמשת ל"תוצאות אחרונות" ו"משחקי היום" בעמוד הראשי.
  // בדפדפן, סוגריים אלה משמשים כברירת מחדל (seed) לטאב הנוק-אאוט — כך שכל
  // מבקר רואה את הסוגריים הרשמיים; עריכה ידנית מקומית (localStorage) גוברת.
  knockout: {
    /* KO:START — נערך אוטומטית; אל תוסיפו טקסט בתוך הבלוק הזה */
    r32: [
      ["GER", "PAR"],
      ["FRA", "SWE"],
      ["RSA", "CAN"],
      ["NED", "MAR"],
      ["POR", "CRO"],
      ["ESP", "AUT"],
      ["USA", "BIH"],
      ["BEL", "SEN"],
      ["BRA", "JPN"],
      ["CIV", "NOR"],
      ["MEX", "ECU"],
      ["ENG", "COD"],
      ["ARG", "CPV"],
      ["AUS", "EGY"],
      ["SUI", "ALG"],
      ["COL", "GHA"]
    ],
    winners: {
      "R32-1": "PAR",
      "R32-2": "FRA",
      "R32-3": "CAN",
      "R32-4": "MAR",
      "R32-5": "POR",
      "R32-6": "ESP",
      "R32-7": "USA",
      "R32-8": "BEL",
      "R32-9": "BRA",
      "R32-10": "NOR",
      "R32-11": "MEX",
      "R32-12": "ENG",
      "R32-13": "ARG",
      "R32-14": "EGY",
      "R32-15": "SUI",
      "R32-16": "COL",
      "R16-1": "FRA",
      "R16-2": "MAR",
      "R16-3": "ESP",
      "R16-4": "BEL",
      "R16-5": "NOR",
      "R16-6": "ENG",
      "R16-7": "ARG"
    },
    stage: "QF",
    matches: [
      { id: "R32-1", round: "R32", a: "GER", b: "PAR", d: "2026-06-29", hg: 4, ag: 5, et: true, penH: 3, penA: 4, winner: "PAR" },
      { id: "R32-2", round: "R32", a: "FRA", b: "SWE", d: "2026-06-30", hg: 3, ag: 0, winner: "FRA" },
      { id: "R32-3", round: "R32", a: "RSA", b: "CAN", d: "2026-06-28", hg: 0, ag: 1, winner: "CAN" },
      { id: "R32-4", round: "R32", a: "NED", b: "MAR", d: "2026-06-30", hg: 3, ag: 4, et: true, penH: 2, penA: 3, winner: "MAR" },
      { id: "R32-5", round: "R32", a: "POR", b: "CRO", d: "2026-07-02", hg: 2, ag: 1, winner: "POR" },
      { id: "R32-6", round: "R32", a: "ESP", b: "AUT", d: "2026-07-02", hg: 3, ag: 0, winner: "ESP" },
      { id: "R32-7", round: "R32", a: "USA", b: "BIH", d: "2026-07-02", hg: 2, ag: 0, winner: "USA" },
      { id: "R32-8", round: "R32", a: "BEL", b: "SEN", d: "2026-07-01", hg: 3, ag: 2, et: true, winner: "BEL" },
      { id: "R32-9", round: "R32", a: "BRA", b: "JPN", d: "2026-06-29", hg: 2, ag: 1, winner: "BRA" },
      { id: "R32-10", round: "R32", a: "CIV", b: "NOR", d: "2026-06-30", hg: 1, ag: 2, winner: "NOR" },
      { id: "R32-11", round: "R32", a: "MEX", b: "ECU", d: "2026-07-01", hg: 2, ag: 0, winner: "MEX" },
      { id: "R32-12", round: "R32", a: "ENG", b: "COD", d: "2026-07-01", hg: 2, ag: 1, winner: "ENG" },
      { id: "R32-13", round: "R32", a: "ARG", b: "CPV", d: "2026-07-03", hg: 3, ag: 2, et: true, winner: "ARG" },
      { id: "R32-14", round: "R32", a: "AUS", b: "EGY", d: "2026-07-03", hg: 3, ag: 5, et: true, penH: 2, penA: 4, winner: "EGY" },
      { id: "R32-15", round: "R32", a: "SUI", b: "ALG", d: "2026-07-03", hg: 2, ag: 0, winner: "SUI" },
      { id: "R32-16", round: "R32", a: "COL", b: "GHA", d: "2026-07-04", hg: 1, ag: 0, winner: "COL" },
      { id: "R16-1", round: "R16", a: "PAR", b: "FRA", d: "2026-07-04", hg: 0, ag: 1, winner: "FRA" },
      { id: "R16-2", round: "R16", a: "CAN", b: "MAR", d: "2026-07-04", hg: 0, ag: 3, winner: "MAR" },
      { id: "R16-3", round: "R16", a: "POR", b: "ESP", d: "2026-07-06", hg: 0, ag: 1, winner: "ESP" },
      { id: "R16-4", round: "R16", a: "USA", b: "BEL", d: "2026-07-07", hg: 1, ag: 4, winner: "BEL" },
      { id: "R16-5", round: "R16", a: "BRA", b: "NOR", d: "2026-07-05", hg: 1, ag: 2, winner: "NOR" },
      { id: "R16-6", round: "R16", a: "MEX", b: "ENG", d: "2026-07-06", hg: 2, ag: 3, winner: "ENG" },
      { id: "R16-7", round: "R16", a: "ARG", b: "EGY", d: "2026-07-07", hg: 3, ag: 2, winner: "ARG" },
      { id: "R16-8", round: "R16", a: "SUI", b: "COL", d: "2026-07-07", hg: 4, ag: 3, et: true, penH: 3, penA: 3 },
      { id: "QF-1", round: "QF", a: "FRA", b: "MAR", d: "2026-07-09" },
      { id: "QF-2", round: "QF", a: "ESP", b: "BEL", d: "2026-07-10" },
      { id: "QF-3", round: "QF", a: "NOR", b: "ENG", d: "2026-07-11" }
    ]
    /* KO:END */
  },

  teams: {
    /* ===== בית A ===== */
    MEX: {
      nameHe: "מקסיקו", nameEn: "Mexico", flag: "🇲🇽", iso: "mx", confed: "CONCACAF",
      elo: 1850, fifa: 14, host: true, tier: 3, attMod: 1.0, defMod: 1.0,
      coach: "חאבייר אגירה",
      stars: ["סנטיאגו חימנס", "אדסון אלברס", "לואיס מאליגון"],
      wc18: "שמינית גמר (הפסד 0-2 לברזיל) — 'משחק חמישי' חמק שוב",
      wc22: "שלב הבתים — פעם ראשונה מאז 1978 ללא שמינית",
      continental: "גביע הזהב: זכיות 2019, 2023, 2025. ליגת האומות CONCACAF: גמרות מול ארה\"ב",
      qual26: "מארחת — ללא מוקדמות. פתחה את הטורניר ב-2-0 על דרא\"פ באצטקה",
      tenYear: "סגלים עמוקים אך תקרת זכוכית בשמינית. ביתיות מלאה (אצטקה, 2,240מ' גובה) — הגורם המשמעותי ביותר ב-2026",
      note: "ביתיות + גובה + קהל = פייבוריטית ברורה לזכייה בבית A"
    },
    RSA: {
      nameHe: "דרום אפריקה", nameEn: "South Africa", flag: "🇿🇦", iso: "za", confed: "CAF",
      elo: 1625, fifa: 55, host: false, tier: 4, attMod: 0.95, defMod: 0.95,
      coach: "הוגו ברוס",
      stars: ["רונוון וויליאמס (שוער)", "תמבה זוואנה", "לייל פוסטר"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "אליפות אפריקה: מקום 3 ב-2023 (ההישג הגדול בעשור), רבע גמר 2025",
      qual26: "זכתה בבית המוקדמות האפריקאי שלה (מעל ניגריה!) — חזרה ראשונה לטורניר מאז 2010",
      tenYear: "עשור של בינוניות ואז קפיצה תחת ברוס: הגנה מאורגנת, שוער-קפטן ברמה עולמית",
      note: "פתחה בהפסד 0-2 למקסיקו. תתקשה מול קוריאה וצ'כיה על מקום 3"
    },
    KOR: {
      nameHe: "דרום קוריאה", nameEn: "South Korea", flag: "🇰🇷", iso: "kr", confed: "AFC",
      elo: 1785, fifa: 22, host: false, tier: 3, attMod: 1.0, defMod: 1.0,
      coach: "הונג מיונג-בו",
      stars: ["סון הונג-מין", "לי קאנג-אין", "קים מין-ג'ה"],
      wc18: "שלב הבתים — אך ניצחון אדיר 2-0 על גרמניה שהדיח אותה",
      wc22: "שמינית גמר (הפסד לברזיל) — העפילה בדרמה מול פורטוגל",
      continental: "אליפות אסיה 2023: חצי גמר (הפסד לירדן). דור זהב שמתבגר",
      qual26: "העפילה בקלות יחסית ממוקדמות אסיה",
      tenYear: "יציבות: 3 טורנירים רצופים עם רגעי שיא. סון בן 33 — טורניר גדול אחרון",
      note: "פתחה ב-2-1 דרמטי על צ'כיה — דריסת רגל חזקה למקום 2 בבית"
    },
    CZE: {
      nameHe: "צ'כיה", nameEn: "Czechia", flag: "🇨🇿", iso: "cz", confed: "UEFA",
      elo: 1715, fifa: 35, host: false, tier: 3, attMod: 1.0, defMod: 0.97,
      coach: "איוון האשק",
      stars: ["פטריק שיק", "אדם הלוז'ק", "לוקאש פרובוד"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "יורו 2020: רבע גמר (שיק מלך שערים משותף). יורו 2024: שלב הבתים",
      qual26: "מקום 2 במוקדמות אחרי נורווגיה, העפילה דרך הפלייאוף האירופי — השתתפות ראשונה מאז 2006",
      tenYear: "נבחרת גלים: מסוגלת להפיל גדולות (הולנד ביורו 2020) ולהפסיד לקטנות",
      note: "פתחה בהפסד 1-2 לקוריאה — חייבת נקודות מול דרא\"פ"
    },

    /* ===== בית B ===== */
    CAN: {
      nameHe: "קנדה", nameEn: "Canada", flag: "🇨🇦", iso: "ca", confed: "CONCACAF",
      elo: 1770, fifa: 30, host: true, tier: 3, attMod: 1.03, defMod: 1.0,
      coach: "ג'סי מארש",
      stars: ["אלפונסו דייוויס", "ג'ונתן דייוויד", "סטיבן אוסטאקיו"],
      wc18: "לא העפילה", wc22: "שלב הבתים, 0 נקודות — אך הציגה כדורגל אמיץ",
      continental: "קופה אמריקה 2024 (אורחת): חצי גמר! הפסד צמוד לארגנטינה",
      qual26: "מארחת. תחת מארש הפכה לקבוצת פרסינג אינטנסיבית",
      tenYear: "מאומה ל-Top 30: דור הזהב הראשון בתולדותיה. דייוויס חזר מקרע רצועות (2024)",
      note: "ביתיות בטורונטו/ונקובר. מועמדת אמיתית לזכייה בבית מול שווייץ"
    },
    SUI: {
      nameHe: "שווייץ", nameEn: "Switzerland", flag: "🇨🇭", iso: "ch", confed: "UEFA",
      elo: 1835, fifa: 16, host: false, tier: 3, attMod: 0.98, defMod: 0.95,
      coach: "מוראט יאקין",
      stars: ["גרניט ג'אקה", "מנואל אקנג'י", "דן נדוי", "ברל אמבולו"],
      wc18: "שמינית גמר", wc22: "שמינית גמר (התרסקות 1-6 מול פורטוגל)",
      continental: "יורו 2024: רבע גמר — הדיחה את איטליה, נפלה בפנדלים מול אנגליה. יורו 2020: רבע גמר (הדיחה את צרפת!)",
      qual26: "מוקדמות כמעט מושלמות: בית עם שוודיה, סלובניה, קוסובו — בלי הפסד",
      tenYear: "המכונה היציבה של אירופה: 5 טורנירים רצופים בשלב הנוק-אאוט. תקרה: רבע גמר",
      note: "הנבחרת המדורגת בבית B, אבל קנדה המארחת — קרב צמוד על המקום הראשון"
    },
    QAT: {
      nameHe: "קטאר", nameEn: "Qatar", flag: "🇶🇦", iso: "qa", confed: "AFC",
      elo: 1615, fifa: 52, host: false, tier: 4, attMod: 0.97, defMod: 1.0,
      coach: "ז'ולן לופטגי",
      stars: ["אכרם עפיף", "אלמועז עלי"],
      wc18: "לא העפילה", wc22: "מארחת — 0 נקודות, המארחת החלשה בהיסטוריה",
      continental: "אליפות אסיה: זכייה 2019 (סנסציה) וזכייה 2023 (בבית) — עפיף MVP",
      qual26: "העפילה מסיבוב 4 האסייתי — טורניר ראשון שאליו העפילה במגרש",
      tenYear: "פרויקט אספייר: שיא באסיה, כישלון מול רמה עולמית. כל הסגל מהליגה המקומית",
      note: "מועמדת טבעית למקום האחרון בבית, אך מסוכנת מקטאר 2022"
    },
    BIH: {
      nameHe: "בוסניה והרצגובינה", nameEn: "Bosnia & Herzegovina", flag: "🇧🇦", iso: "ba", confed: "UEFA",
      elo: 1660, fifa: 44, host: false, tier: 4, attMod: 1.0, defMod: 1.02,
      coach: "סרגיי ברברז",
      stars: ["אדין ג'קו (40!)", "אניס חאיירוביץ'", "ניקולא קטיץ'"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "לא העפילה ליורו בעשור האחרון (הפסדי פלייאוף כואבים)",
      qual26: "מקום 2 במוקדמות (אחרי אוסטריה), עברה את הפלייאוף — השתתפות ראשונה מאז 2014",
      tenYear: "עשור של החמצות פלייאוף ואז פריצה תחת ברברז. תלות בג'קו המזדקן",
      note: "פותחת מול קנדה בטורונטו היום (12.6). אנדרדוג עם לב גדול"
    },

    /* ===== בית C ===== */
    BRA: {
      nameHe: "ברזיל", nameEn: "Brazil", flag: "🇧🇷", iso: "br", confed: "CONMEBOL",
      elo: 2020, fifa: 6, host: false, tier: 1, attMod: 1.05, defMod: 1.0,
      coach: "קרלו אנצ'לוטי (מ-2025)",
      stars: ["ויניסיוס ז'וניור", "רפיניה", "רודריגו", "אליסון"],
      wc18: "רבע גמר (הפסד לבלגיה)", wc22: "רבע גמר (פנדלים מול קרואטיה)",
      continental: "קופה אמריקה: זכייה 2019, גמר 2021, רבע גמר 2024 (אכזבה)",
      qual26: "המוקדמות הגרועות בתולדותיה (מקום 5, הפסד היסטורי 1-4 לארגנטינה) — עד שאנצ'לוטי ייצב",
      tenYear: "כישרון אינסופי, 5 טורנירים בלי חצי גמר מאז 2002. אנצ'לוטי הביא סדר: הגנה מצוינת ב-2026",
      note: "מדורגת 6 בעולם — כוח התקפי עצום, אך לא תמיד ממירה אותו לתארים"
    },
    MAR: {
      nameHe: "מרוקו", nameEn: "Morocco", flag: "🇲🇦", iso: "ma", confed: "CAF",
      elo: 1900, fifa: 11, host: false, tier: 2, attMod: 0.97, defMod: 0.90,
      coach: "וליד רגרגי",
      stars: ["אשרף חכימי", "בראהים דיאז", "אזדין אונאחי", "יאסין בונו"],
      wc18: "שלב הבתים (יחידת מזל רע)", wc22: "חצי גמר! (מקום 4) — ההישג האפריקאי/ערבי הגדול בהיסטוריה. הדיחה ספרד ופורטוגל",
      continental: "אליפות אפריקה 2025 (בבית): הוכרזה כאלופה אחרי שסנגל זכתה 1-0 במגרש אך נפסלה בגלל עזיבת המגרש (CAF, מרץ 2026)",
      qual26: "מוקדמות מושלמות — מהראשונות בעולם שהבטיחו כרטיס",
      tenYear: "ההגנה הטובה ביבשת + חכימי-בונו ברמה עולמית. ביתיות-למחצה: קהילה מרוקאית ענקית בצפון אמריקה",
      note: "המתחרה האמיתית של ברזיל בבית C — מועמדת מעניינת לצמרת הבית"
    },
    HAI: {
      nameHe: "האיטי", nameEn: "Haiti", flag: "🇭🇹", iso: "ht", confed: "CONCACAF",
      elo: 1490, fifa: 85, host: false, tier: 5, attMod: 1.0, defMod: 1.05,
      coach: "סבסטיאן מיניה",
      stars: ["דאקנס נזון", "פרנצדי פיירו", "דני בלמי"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "גביע הזהב: הופעות צנועות. רבע גמר 2023",
      qual26: "סנסציית המוקדמות של CONCACAF — השתתפות ראשונה מאז 1974, על רקע משבר הומניטרי בבית ('משחקי בית' בניכר)",
      tenYear: "סיפור הלב של הטורניר. סגל מליגות צרפת/MLS, אפס ציפיות",
      note: "האנדרדוג הגדול בטורניר יחד עם קוראסאו. מול ברזיל — פער של ~530 נק' Elo"
    },
    SCO: {
      nameHe: "סקוטלנד", nameEn: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", iso: "gb-sct", confed: "UEFA",
      elo: 1730, fifa: 38, host: false, tier: 3, attMod: 0.98, defMod: 1.0,
      coach: "סטיב קלארק",
      stars: ["סקוט מקטומיניי", "אנדי רוברטסון", "ג'ון מקגין", "בילי גילמור"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "יורו 2020 + יורו 2024: שלב הבתים (נקודה אחת בכל אחד)",
      qual26: "הדרמה של נובמבר 2025: ניצחון 4-2 על דנמרק עם שערי עקב ומחצית-מגרש — השתתפות ראשונה מאז 1998",
      tenYear: "קולקטיב חזק מסכום חלקיו, מקטומיניי בכושר חייו (MVP בסרייה A 2025)",
      note: "תתחרה עם מרוקו... בעצם עם עצמה — יעד ריאלי: מקום 3 והעפלה כשלישייה טובה"
    },

    /* ===== בית D ===== */
    USA: {
      nameHe: "ארה\"ב", nameEn: "United States", flag: "🇺🇸", iso: "us", confed: "CONCACAF",
      elo: 1790, fifa: 17, host: true, tier: 2, attMod: 1.0, defMod: 1.0,
      coach: "מאוריסיו פוצ'טינו (מ-2024)",
      stars: ["כריסטיאן פוליסיץ'", "וסטון מקני", "אנטוני רובינסון", "מאט טרנר"],
      wc18: "לא העפילה (הטראומה של טרינידד)", wc22: "שמינית גמר (הפסד להולנד)",
      continental: "קופה אמריקה 2024 (מארחת): הודחה בבתים — פוטר ברהאלטר. גביע הזהב 2025: גמר (הפסד למקסיקו)",
      qual26: "מארחת. תחת פוצ'טינו — שיפור הדרגתי אך לא דומיננטיות",
      tenYear: "דור המוכשר בתולדותיה (כולם באירופה) שעדיין לא הרכיב טורניר גדול. לחץ ביתי עצום",
      note: "ביתיות אמיתית אך בית D הוא אולי הצמוד בטורניר — טורקיה מסוכנת מאוד"
    },
    PAR: {
      nameHe: "פרגוואי", nameEn: "Paraguay", flag: "🇵🇾", iso: "py", confed: "CONMEBOL",
      elo: 1780, fifa: 25, host: false, tier: 3, attMod: 0.95, defMod: 0.93,
      coach: "גוסטבו אלפארו",
      stars: ["מיגל אלמירון", "חוליו אנסיסו", "אנטוניו סנאברה"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "קופה אמריקה: רבע גמר 2019, הופעות אפורות. שיפור חד מ-2024",
      qual26: "מקום 6 במוקדמות הדרום-אמריקאיות הרצחניות — השתתפות ראשונה מאז 2010. בבית לא הפסידה כמעט לאף אחת",
      tenYear: "מסורת: הגנה, אגרסיביות, כדורים נייחים. אלפארו בנה קיר",
      note: "טיפוסית ל-0-0 ו-1-0. שוק 'מתחת 2.5' במשחקיה — כיוון קבוע"
    },
    AUS: {
      nameHe: "אוסטרליה", nameEn: "Australia", flag: "🇦🇺", iso: "au", confed: "AFC",
      elo: 1725, fifa: 26, host: false, tier: 4, attMod: 0.96, defMod: 0.97,
      coach: "טוני פופוביץ'",
      stars: ["ג'קסון אירווין", "ריילי מקגרי", "מתיו ראיין"],
      wc18: "שלב הבתים", wc22: "שמינית גמר! הפסד 1-2 לארגנטינה האלופה — הקמפיין הטוב בתולדותיה",
      continental: "אליפות אסיה 2023: רבע גמר",
      qual26: "העפילה ישירות ממוקדמות אסיה תחת פופוביץ'",
      tenYear: "קולקטיב ממושמע ללא כוכבי-על. תמיד קשה להבקעה",
      note: "בבית D היא האנדרדוג — אך גם היריבה הנוחה ביותר לנקודות עבור כולן"
    },
    TUR: {
      nameHe: "טורקיה", nameEn: "Türkiye", flag: "🇹🇷", iso: "tr", confed: "UEFA",
      elo: 1845, fifa: 23, host: false, tier: 2, attMod: 1.06, defMod: 1.06,
      coach: "וינצ'נצו מונטלה",
      stars: ["ארדה גולר", "קנן יילדיז", "האקאן צ'להאנולו", "פרדי קדיאולו"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "יורו 2024: רבע גמר מרשים (הדיחה את אוסטריה, נפלה בקושי מול הולנד)",
      qual26: "מקום 2 אחרי ספרד (כולל 0-6 ביתי מולה), עברה את הפלייאוף — השתתפות ראשונה מאז 2002",
      tenYear: "דור הזהב: גולר ויילדיז הם צמד ההתקפה הצעיר המסעיר באירופה. הגנה פרוצה — משחקים שלה = שערים",
      note: "הדארק-הורס המסקרן של הטורניר. מול ארה\"ב — אולי משחק הבתים המעניין בטורניר. Over 2.5 קבוע"
    },

    /* ===== בית E ===== */
    GER: {
      nameHe: "גרמניה", nameEn: "Germany", flag: "🇩🇪", iso: "de", confed: "UEFA",
      elo: 1955, fifa: 9, host: false, tier: 1, attMod: 1.04, defMod: 1.02,
      coach: "יוליאן נאגלסמן",
      stars: ["ג'מאל מוסיאלה", "פלוריאן וירץ", "יושוע קימיך", "קאי האברץ"],
      wc18: "שלב הבתים (!) — מקום אחרון בבית", wc22: "שלב הבתים (!) שוב",
      continental: "יורו 2024 (בבית): רבע גמר — הפסד דרמטי לספרד. ליגת האומות 2025: חצי גמר",
      qual26: "ניצחה את הבית שלה אחרי מעידה בפתיחה (הפסד בסלובקיה!)",
      tenYear: "שתי מפלות היסטוריות בטורניר, אך נאגלסמן + מוסיאלה/וירץ = מכונה מחודשת. שווי סגל Top-4 עולמי",
      note: "בית E נוח מאוד — הדרך לזכייה בבית סלולה. השאלה היא הנוק-אאוט"
    },
    CUR: {
      nameHe: "קוראסאו", nameEn: "Curaçao", flag: "🇨🇼", iso: "cw", confed: "CONCACAF",
      elo: 1500, fifa: 82, host: false, tier: 5, attMod: 0.95, defMod: 1.05,
      coach: "דיק אדבוקאט (78!)",
      stars: ["לאנדרו בקונה", "ג'ורדן פאיו", "טאהית' צ'ונג"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "גביע הזהב: הופעות בודדות",
      qual26: "ההיסטוריה הגדולה: המדינה הקטנה ביותר אי-פעם בטורניר (~155 אלף תושבים). סגל הולנדי-קריבי שלם",
      tenYear: "פרויקט של התאחדות חכמה: גיוס שחקנים הולנדים ממוצא קוראסאואי. אדבוקאט = ארגון הגנתי קפדני",
      note: "מול גרמניה והולנד-לשעבר שלה — סיפור אגדה. ריאלית: מקום אחרון, אך תמכור את עורה ביוקר"
    },
    CIV: {
      nameHe: "חוף השנהב", nameEn: "Côte d'Ivoire", flag: "🇨🇮", iso: "ci", confed: "CAF",
      elo: 1750, fifa: 41, host: false, tier: 3, attMod: 1.0, defMod: 0.98,
      coach: "אמרס פאה",
      stars: ["סבסטיאן האלר", "פרנק קסיה", "אמאד דיאלו", "סימון אדינגרה"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "אליפות אפריקה 2023 (בבית): זכייה אגדית אחרי כמעט-הדחה בבתים. רבע גמר 2025",
      qual26: "זכתה בבית המוקדמות שלה בביטחון — השתתפות ראשונה מאז 2014",
      tenYear: "מהדור של דרוגבה לדור חדש: אמאד בכושר חיים. נבחרת של מומנטום — מסוכנת כשחמה",
      note: "המועמדת הטבעית למקום 2 בבית E מול אקוודור — מאבק חזק"
    },
    ECU: {
      nameHe: "אקוודור", nameEn: "Ecuador", flag: "🇪🇨", iso: "ec", confed: "CONMEBOL",
      elo: 1875, fifa: 12, host: false, tier: 2, attMod: 0.96, defMod: 0.90,
      coach: "סבסטיאן בקאסה",
      stars: ["מויסס קאיסדו", "פיירו הינקפיה", "קנדי פאז'ו", "ויליאן פאצ'ו"],
      wc18: "לא העפילה", wc22: "שלב הבתים — 4 נקודות, הודחה בהפרש שערים",
      continental: "קופה אמריקה 2024: רבע גמר (פנדלים מול ארגנטינה)",
      qual26: "מקום 2 במוקדמות CONMEBOL (אחרי ארגנטינה!) למרות שהתחילה עם 3- נקודות עונש. ההגנה הטובה במוקדמות: 5 שערי חובה ב-18 משחקים",
      tenYear: "המהפכה השקטה של דרום אמריקה: דור צעיר (קאיסדו, פאצ'ו, הינקפיה) + הגנת ברזל",
      note: "מדורגת 12 בעולם — מעל גרמניה כמעט. מועמדת מעניינת לצמרת בית E ולמשחקים סגורים (מתחת 2.5)"
    },

    /* ===== בית F ===== */
    NED: {
      nameHe: "הולנד", nameEn: "Netherlands", flag: "🇳🇱", iso: "nl", confed: "UEFA",
      elo: 1985, fifa: 7, host: false, tier: 1, attMod: 1.02, defMod: 0.98,
      coach: "רונלד קומאן",
      stars: ["וירג'יל ון דייק", "פרנקי דה יונג", "קודי חאקפו", "מיקי ון דה ון"],
      wc18: "לא העפילה", wc22: "רבע גמר (פנדלים מול ארגנטינה אחרי קאמבק 2-2)",
      continental: "יורו 2024: חצי גמר (הפסד לאנגליה ב-90+1). ליגת האומות: גמר 2019",
      qual26: "ניצחה בקלות בית עם פולין ופינלנד",
      tenYear: "תמיד בין 8 הטובות, אף פעם לא מספיק. ון דייק בן 34 — חלון אחרון לדור הזה",
      note: "פייבוריטית ענקית בבית F. הסכנה היחידה: יפן במשחק ישיר"
    },
    JPN: {
      nameHe: "יפן", nameEn: "Japan", flag: "🇯🇵", iso: "jp", confed: "AFC",
      elo: 1880, fifa: 18, host: false, tier: 2, attMod: 1.02, defMod: 0.96,
      coach: "האג'ימה מוריאסו",
      stars: ["קאורו מיטומה", "טאקפוסה קובו", "וואטארו אנדו", "טאקהירו טומיאסו"],
      wc18: "שמינית גמר (קריסה 2-3 מול בלגיה מ-2-0)", wc22: "שמינית גמר — ניצחה את גרמניה ואת ספרד בבתים!",
      continental: "אליפות אסיה 2023: רבע גמר (אכזבה יחסית)",
      qual26: "הנבחרת הראשונה בעולם שהעפילה (מרץ 2025), בית אסייתי בפער דו-ספרתי",
      tenYear: "הקפיצה הגדולה באסיה: 20+ שחקנים בליגות הבכירות באירופה. הורגת ענקיות בשיטת בלוק נמוך + מעברים",
      note: "הדארק-הורס המוצהר של 2026. מול הולנד — משחק צמרת אמיתי, לא לפי השם"
    },
    SWE: {
      nameHe: "שוודיה", nameEn: "Sweden", flag: "🇸🇪", iso: "se", confed: "UEFA",
      elo: 1700, fifa: 37, host: false, tier: 3, attMod: 1.08, defMod: 1.05,
      coach: "גרהאם פוטר (מאוקטובר 2025)",
      stars: ["ויקטור יוקרש", "אלכסנדר איסאק", "דייאן קולושבסקי", "אנתוני אלאנגה"],
      wc18: "רבע גמר (הדיחה את איטליה בפלייאוף!)", wc22: "לא העפילה",
      continental: "יורו 2020: שמינית. יורו 2024: לא העפילה",
      qual26: "פרדוקס מטורף: מקום אחרון כמעט בבית המוקדמות (נקודה ב-4 הראשונים) — אך נכנסה לפלייאוף דרך ליגת האומות ועברה אותו תחת פוטר",
      tenYear: "חוד התקפי מהטובים בעולם (איסאק+יוקרש ~250 מיליון יורו) שלא תורגם לתוצאות. תעלומה",
      note: "הנבחרת הכי לא-יציבה בטורניר: יכולה להפסיד לתוניסיה ולנצח את הולנד. Over במשחקיה"
    },
    TUN: {
      nameHe: "תוניסיה", nameEn: "Tunisia", flag: "🇹🇳", iso: "tn", confed: "CAF",
      elo: 1695, fifa: 43, host: false, tier: 4, attMod: 0.93, defMod: 0.92,
      coach: "סמי טראבלסי",
      stars: ["חניבעל מג'ברי", "איסם ג'באלי", "עאיסה לאידוני"],
      wc18: "שלב הבתים", wc22: "שלב הבתים — אך ניצחון 1-0 על צרפת!",
      continental: "אליפות אפריקה: רבע גמר 2019 (חצי), בינוני מאז",
      qual26: "מוקדמות כמעט מושלמות: הבטיחה מקום מוקדם, הגנה מהטובות באפריקה (שער חובה אחד!)",
      tenYear: "תבנית קבועה: הגנה אדוקה, קשה לכולם, חסרת חוד. אף פעם לא עברה שלב בתים",
      note: "המשחק מול שוודיה הוא 'גמר מקום 3' — וקו השערים שלו נמוך"
    },

    /* ===== בית G ===== */
    BEL: {
      nameHe: "בלגיה", nameEn: "Belgium", flag: "🇧🇪", iso: "be", confed: "UEFA",
      elo: 1865, fifa: 8, host: false, tier: 2, attMod: 1.03, defMod: 1.04,
      coach: "רודי גארסיה",
      stars: ["קווין דה בריינה (35)", "ז'רמי דוקו", "לואיס אופנדה", "אמדו אונאנה"],
      wc18: "מקום 3 — שיא דור הזהב", wc22: "שלב הבתים (!) — התפרקות בשידור חי",
      continental: "יורו 2024: שמינית גמר חיוורת. ליגת האומות: בינוני",
      qual26: "ניצחה בית בינוני בלי להרשים",
      tenYear: "מעבר דורות כואב: מ'דור הזהב' (אזאר, לוקאקו דועך) לדור דוקו — עדיין לא שלם. הגנה איטית ופגיעה",
      note: "פייבוריטית בבית G אך הכי-פחות-יציבה מבין המדורגות. מצרים ואיראן ינסו לחנוק אותה"
    },
    EGY: {
      nameHe: "מצרים", nameEn: "Egypt", flag: "🇪🇬", iso: "eg", confed: "CAF",
      elo: 1745, fifa: 32, host: false, tier: 3, attMod: 0.96, defMod: 0.94,
      coach: "חוסאם חסן",
      stars: ["מוחמד סלאח (34)", "עומר מרמוש", "מוחמד עבד אל-מונעם"],
      wc18: "שלב הבתים (0 נק')", wc22: "לא העפילה",
      continental: "אליפות אפריקה: גמר 2017, גמר 2021 (פנדלים מול סנגל), רבע גמר 2025",
      qual26: "מוקדמות שקטות וחלקות — העפילה מוקדם ובלי דרמה",
      tenYear: "סלאח-תלות מוחלטת ב-8 השנים האחרונות; מרמוש סוף-סוף נותן כתף שנייה. הגנה מצוינת, התקפה איטית",
      note: "מול בלגיה הפגיעה — סלאח ומרמוש במעברים זה תרחיש אמיתי. X2 שווה בדיקה"
    },
    IRN: {
      nameHe: "איראן", nameEn: "Iran", flag: "🇮🇷", iso: "ir", confed: "AFC",
      elo: 1755, fifa: 21, host: false, tier: 4, attMod: 0.95, defMod: 0.95,
      coach: "אמיר קלענואי",
      stars: ["מהדי טארמי", "סרדאר אזמון", "אליראזה ג'הנבחש"],
      wc18: "שלב הבתים — 4 נק', כמעט עברה (0-1 מול ספרד, 1-1 פורטוגל)", wc22: "שלב הבתים — ניצחון על ויילס, הפסד דרמטי לארה\"ב",
      continental: "אליפות אסיה 2023: חצי גמר",
      qual26: "העפילה בקלות — מהיציבות באסיה (6 טורנירים מ-7)",
      tenYear: "תבנית עקבית: בלוק הגנתי מצוין, טארמי קליני, אף פעם לא עוברת שלב בתים (אך תמיד קרובה)",
      note: "הבית הנוח ביותר שהיה לה אי-פעם — הסיכוי הטוב בהיסטוריה לשמינית ראשונה"
    },
    NZL: {
      nameHe: "ניו זילנד", nameEn: "New Zealand", flag: "🇳🇿", iso: "nz", confed: "OFC",
      elo: 1560, fifa: 80, host: false, tier: 5, attMod: 0.95, defMod: 1.0,
      coach: "דארן בייזלי",
      stars: ["כריס ווד", "ליברטו קקאצ'ה", "מרקו סטמניץ'"],
      wc18: "לא העפילה", wc22: "לא העפילה (הפסד פלייאוף לקוסטה ריקה)",
      continental: "אלופת אוקיאניה הקבועה",
      qual26: "המקום הישיר הראשון של אוקיאניה בפורמט החדש — העפילה בקלות. השתתפות ראשונה מאז 2010",
      tenYear: "ווד (Top-10 כובשי הפרמייר ליג 2024/25) הוא ההבדל בין נבחרת חובבת לקבוצה מסוכנת בכדורים גבוהים",
      note: "ב-2010 סיימה את הטורניר בלי הפסד (3 תיקו). אל תצחקו על X מולה"
    },

    /* ===== בית H ===== */
    ESP: {
      nameHe: "ספרד", nameEn: "Spain", flag: "🇪🇸", iso: "es", confed: "UEFA",
      elo: 2165, fifa: 2, host: false, tier: 1, attMod: 1.05, defMod: 0.95,
      coach: "לואיס דה לה פואנטה",
      stars: ["לאמין יאמאל", "פדרי", "ניקו וויליאמס", "רודרי", "אונאי סימון"],
      wc18: "שמינית (פנדלים מול רוסיה)", wc22: "שמינית (פנדלים מול מרוקו)",
      continental: "יורו 2024: זכייה (7 מ-7!). ליגת האומות: זכייה 2023, גמר 2025. Elo #1 עולמי",
      qual26: "מוקדמות מושלמות בלי לספוג כמעט (כולל 6-0 על טורקיה בחוץ)",
      tenYear: "מטראומת-פנדלים לדור המושלם: יאמאל בן 18 וכבר השחקן המסוכן בעולם. מהפייבוריטיות הבולטות לתואר",
      note: "הפייבוריטית המוצדקת של הטורניר. בית H הוא מסדרון: אורוגוואי = המבחן היחיד"
    },
    CPV: {
      nameHe: "קייפ ורדה", nameEn: "Cape Verde", flag: "🇨🇻", iso: "cv", confed: "CAF",
      elo: 1575, fifa: 70, host: false, tier: 5, attMod: 0.95, defMod: 1.0,
      coach: "בובישטה",
      stars: ["ריאן מנדס", "דיילון ליבראמנטו", "לוגאן קוסטה"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "אליפות אפריקה: רבע גמר 2023 — הפתעת הטורניר",
      qual26: "ההיסטוריה: זכתה בבית מוקדמות מעל קמרון — השתתפות ראשונה אי-פעם בטורניר למדינת איים של ~520 אלף תושבים",
      tenYear: "הפלא האפריקאי הקטן: ארגון, רוח, וסולידריות של פזורה. בלי כוכב-על",
      note: "תפגוש את רונאלדו... רגע, לא — את ספרד. המטרה: לא 0-7. כל נקודה = נס"
    },
    KSA: {
      nameHe: "ערב הסעודית", nameEn: "Saudi Arabia", flag: "🇸🇦", iso: "sa", confed: "AFC",
      elo: 1635, fifa: 58, host: false, tier: 4, attMod: 0.97, defMod: 1.02,
      coach: "הרווה רנאר (חזר ב-2024)",
      stars: ["סאלם אל-דוסארי", "פיראס אל-בריקאן", "מוחמד קאנו"],
      wc18: "שלב הבתים", wc22: "שלב הבתים — אבל הניצחון 2-1 על ארגנטינה הוא מהאפסטים הגדולים בהיסטוריה",
      continental: "אליפות אסיה 2023: שמינית (אכזבה)",
      qual26: "העפילה דרך פלייאוף אסייתי בדרך חתחתים",
      tenYear: "השקעות הענק בליגה המקומית לא תורגמו לנבחרת. רנאר = מומחה אפסטים ומשמעת טקטית",
      note: "הוכיחה ב-2022 שהיא מסוגלת לכל דבר ליום אחד. מול אורוגוואי — פחות סביר"
    },
    URU: {
      nameHe: "אורוגוואי", nameEn: "Uruguay", flag: "🇺🇾", iso: "uy", confed: "CONMEBOL",
      elo: 1900, fifa: 15, host: false, tier: 2, attMod: 1.0, defMod: 0.93,
      coach: "מרסלו ביילסה",
      stars: ["פדריקו ולוורדה", "דארווין נונייס", "רונאלד אראוחו", "מנואל אוגרטה"],
      wc18: "רבע גמר (הפסד לצרפת)", wc22: "שלב הבתים (הודחה בשערי זכות — זעם על השיפוט)",
      continental: "קופה אמריקה 2024: מקום 3 (הדיחה את ברזיל בדרך)",
      qual26: "מקום 3-4 במוקדמות, כולל ניצחונות על ארגנטינה וברזיל בחוץ — חתימת ביילסה",
      tenYear: "מעבר דורות מוצלח (סוארס/קוואני → ולוורדה/נונייס). ביילסה = אינטנסיביות שלא נותנת לאף אחד לנשום",
      note: "הקורבן הגדול של ההגרלה: נבחרת Top-10 שתקועה בבית של ספרד. 'מי תעפיל' שלה כמעט בטוח, 'זוכת בית' שלה = ערך רק ביחס גבוה"
    },

    /* ===== בית I ===== */
    FRA: {
      nameHe: "צרפת", nameEn: "France", flag: "🇫🇷", iso: "fr", confed: "UEFA",
      elo: 2080, fifa: 3, host: false, tier: 1, attMod: 1.04, defMod: 0.96,
      coach: "דידייה דשאן (הטורניר האחרון שלו)",
      stars: ["קיליאן אמבפה", "אוסמן דמבלה (כדור הזהב 2025)", "מייקל אוליסה", "אורליאן צ'ואמני"],
      wc18: "זכייה 🏆", wc22: "גמר (פנדלים מול ארגנטינה אחרי שלושער של אמבפה)",
      continental: "יורו 2024: חצי גמר. ליגת האומות: זכייה 2021",
      qual26: "העפילה בנוחות. עומק הסגל ההתקפי חסר תקדים: אמבפה+דמבלה+אוליסה+ברקולה",
      tenYear: "3 גמרים גדולים בעשור. מכונת טורנירים — גם כשמשחקת רע מגיעה רחוק. דשאן נפרד — מוטיבציית סיום",
      note: "מהפייבוריטיות הבולטות לתואר יחד עם ספרד. בית I נוח; הסכנה היחידה: נורווגיה של הולאנד במחזור 3"
    },
    IRQ: {
      nameHe: "עיראק", nameEn: "Iraq", flag: "🇮🇶", iso: "iq", confed: "AFC",
      elo: 1590, fifa: 60, host: false, tier: 5, attMod: 0.95, defMod: 1.0,
      coach: "גרהאם ארנולד (האוסטרלי)",
      stars: ["איימן חוסיין", "עלי אל-חמאדי", "זידאן אקבל"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "אליפות אסיה 2023: זכתה בבית מעל יפן! הודחה בשמינית בדרמה",
      qual26: "עברה את הפלייאוף הבין-יבשתי (מרץ 2026) — השתתפות ראשונה מאז 1986",
      tenYear: "כדורגל של רגש ולאומיות בוערת. ביתיות בבצרה הפכה למבצר במוקדמות",
      note: "40 שנה של ציפייה. מול צרפת ונורווגיה — רק שלא יכאב. מול סנגל אולי תילחם על כבוד"
    },
    NOR: {
      nameHe: "נורווגיה", nameEn: "Norway", flag: "🇳🇴", iso: "no", confed: "UEFA",
      elo: 1860, fifa: 19, host: false, tier: 2, attMod: 1.12, defMod: 1.04,
      coach: "סטולה סולבאקן",
      stars: ["ארלינג הולאנד", "מרטין אודגור", "אלכסנדר סורלות'", "אנטוניו נוסה"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "לא העפילה ליורו בעשור — הכישלון שהפך לדלק",
      qual26: "מוקדמות מושלמות: 8 מ-8, כולל 3-0 ו-4-1 על איטליה (!) ששלחו אותה לפלייאוף. הולאנד: 16 שערי מוקדמות",
      tenYear: "השתתפות ראשונה מאז 1998. ההתקפה הכי רצחנית שהביאה נבחרת 'חדשה' אי-פעם: הולאנד+אודגור+סורלות'. הגנה — סימן השאלה",
      note: "אף אחד לא רוצה לפגוש אותה. מול צרפת במחזור 3 — קרב על ראשות הבית. Over 2.5 בכל משחקיה"
    },
    SEN: {
      nameHe: "סנגל", nameEn: "Senegal", flag: "🇸🇳", iso: "sn", confed: "CAF",
      elo: 1840, fifa: 13, host: false, tier: 2, attMod: 1.0, defMod: 0.94,
      coach: "פאפ תיאו",
      stars: ["סאדיו מאנה (34)", "ניקולא ג'קסון", "פאפ מטר סאר", "אדואר מנדי"],
      wc18: "שלב בתים — הודחה בכלל Fair-Play (!)", wc22: "שמינית גמר (הפסד לאנגליה)",
      continental: "אליפות אפריקה: זכייה 2021 🏆, גמר 2019. 2025: ניצחה 1-0 בגמר במגרש — אך נפסלה ואיבדה את התואר לאחר עזיבת המגרש (סערת CAF)",
      qual26: "מוקדמות חזקות. הנבחרת העמוקה ביותר באפריקה",
      tenYear: "החזקה שבאפריקאיות לאורך העשור: שוער עלית, קו אחורי חזק, מאנה בערוב ימיו. פצע ה-AFCON הוא דלק-טילים",
      note: "הנבחרת השנייה בבית I — צרפת היא היריבה ההיסטורית (2002!). מועמדת קלאסית לשמינית ומעבר"
    },

    /* ===== בית J ===== */
    ARG: {
      nameHe: "ארגנטינה", nameEn: "Argentina", flag: "🇦🇷", iso: "ar", confed: "CONMEBOL",
      elo: 2120, fifa: 1, host: false, tier: 1, attMod: 1.0, defMod: 0.92,
      coach: "ליונל סקאלוני",
      stars: ["ליאו מסי (39 — הטורניר האחרון)", "חוליאן אלברס", "לאוטרו מרטינס", "אנסו פרננדס", "אמיליאנו מרטינס"],
      wc18: "שמינית (הפסד לצרפת)", wc22: "זכייה 🏆 — הגמר הגדול בהיסטוריה",
      continental: "קופה אמריקה: זכייה 2021 + זכייה 2024. פינליסימה 2022: זכייה",
      qual26: "מקום 1 במוקדמות CONMEBOL בפער, כולל 4-1 על ברזיל",
      tenYear: "מ-3 גמרים אבודים לשושלת: 3 תארים גדולים רצופים. ההגנה הטובה בעולם (מאזן ספיגות מדהים), מסי במשורה — אלברס נושא",
      note: "מדורגת #1 בעולם. מחזיקת התואר. ה-Elo הגבוה שלה הופך אותה למועמדת בולטת לתואר — בית J נוח"
    },
    ALG: {
      nameHe: "אלג'יריה", nameEn: "Algeria", flag: "🇩🇿", iso: "dz", confed: "CAF",
      elo: 1755, fifa: 34, host: false, tier: 3, attMod: 1.0, defMod: 0.98,
      coach: "ולדימיר פטקוביץ'",
      stars: ["ריאד מחרז (35)", "אמין גווירי", "מוחמד עמורה", "איסמעיל בנאסר"],
      wc18: "לא העפילה", wc22: "לא העפילה (טראומת קמרון בדקה 124)",
      continental: "אליפות אפריקה: זכייה 2019 🏆, שתי הדחות-בתים משפילות 2021/2023, רבע גמר 2025",
      qual26: "מוקדמות חלקות — העפילה בנוחות. עמורה התפוצץ (מחזור שערים מטורף בבונדסליגה)",
      tenYear: "תנודתיות קיצונית: מאלופת אפריקה מושלמת (2019, בלי הפסד) לשפל. מחרז דועך, עמורה עולה",
      note: "השתתפות ראשונה מאז 2014. מול אוסטריה — קרב אמיתי על מקום 2 בבית J"
    },
    AUT: {
      nameHe: "אוסטריה", nameEn: "Austria", flag: "🇦🇹", iso: "at", confed: "UEFA",
      elo: 1810, fifa: 24, host: false, tier: 3, attMod: 1.03, defMod: 1.0,
      coach: "ראלף רנגניק",
      stars: ["דויד אלאבה (33)", "מרסל זאביצר", "כריסטוף באומגרטנר", "קונרד ליימר"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "יורו 2024: זכתה בבית מעל צרפת והולנד (!) — הודחה בשמינית מטורקיה. הפתעת הטורניר",
      qual26: "מקום 1 בבית המוקדמות — השתתפות ראשונה מאז 1998",
      tenYear: "פרויקט רנגניק: פרסינג-על שיטתי, קולקטיב מעל כוכבים. בלי חוד עולמי — הפגם היחיד",
      note: "28 שנה בלי טורניר ופתאום נבחרת שכולם מפחדים ממנה. X מול ארגנטינה? לא דמיוני"
    },
    JOR: {
      nameHe: "ירדן", nameEn: "Jordan", flag: "🇯🇴", iso: "jo", confed: "AFC",
      elo: 1605, fifa: 64, host: false, tier: 5, attMod: 0.95, defMod: 1.0,
      coach: "ג'מאל סלאמי",
      stars: ["מוסא אל-תעמרי", "יזן אל-נעימאת", "יזיד אבו ליילה"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "אליפות אסיה 2023: גמר (!!) — הדיחה את קוריאה בדרך. ההישג הגדול בתולדותיה",
      qual26: "העפילה ישירות — השתתפות ראשונה אי-פעם בטורניר",
      tenYear: "מאלמוניות לגמר אסיה תוך שנתיים. אל-תעמרי (מונפלייה) הוא הכוכב האמיתי היחיד — אבל איזה כוכב",
      note: "מול מסי בטורניר האחרון שלו — סיפור בפני עצמו. כל נקודה היסטורית"
    },

    /* ===== בית K ===== */
    POR: {
      nameHe: "פורטוגל", nameEn: "Portugal", flag: "🇵🇹", iso: "pt", confed: "UEFA",
      elo: 2075, fifa: 5, host: false, tier: 1, attMod: 1.04, defMod: 0.97,
      coach: "רוברטו מרטינס",
      stars: ["כריסטיאנו רונאלדו (41 — האחרון)", "ברונו פרננדס", "רפאל לאון", "ז'ואאו נבס", "ויטיניה", "נונו מנדס"],
      wc18: "שמינית (הפסד לאורוגוואי)", wc22: "רבע גמר (ההדחה ההיסטורית מול מרוקו)",
      continental: "יורו 2016: זכייה 🏆. ליגת האומות: זכייה 2019 + זכייה 2025 🏆. יורו 2024: רבע גמר",
      qual26: "העפילה בנוחות. עומק קישור אולי הטוב בעולם (ויטיניה, נבס, ברונו, פליקס...)",
      tenYear: "Elo Top-4. השאלה הנצחית: רונאלדו בן 41 בהרכב — נכס מנטלי או עוגן טקטי? מרטינס בחר בו",
      note: "פייבוריטית כבדה בבית K אך קולומביה היא יריבה אמיתית. מועמדת ריאלית לחצי הגמר"
    },
    COL: {
      nameHe: "קולומביה", nameEn: "Colombia", flag: "🇨🇴", iso: "co", confed: "CONMEBOL",
      elo: 1925, fifa: 10, host: false, tier: 2, attMod: 1.02, defMod: 0.95,
      coach: "נסטור לורנסו",
      stars: ["לואיס דיאס", "חאמס רודריגס (34)", "ג'פרסון לרמה", "דניאל מוניוס"],
      wc18: "שמינית (פנדלים מול אנגליה)", wc22: "לא העפילה",
      continental: "קופה אמריקה 2024: גמר! (הפסד בהארכה לארגנטינה) — רצף 28 משחקים בלי הפסד עד הגמר",
      qual26: "העפילה בביטחון אחרי פתיחה עצבנית. דיאס בשיא (באיירן)",
      tenYear: "מהדחת 2022 המשפילה לגמר קופה: לורנסו בנה את הקבוצה הדרום-אמריקאית השנייה בעוצמתה. חאמס נולד מחדש בטורנירים",
      note: "Top-10 עולמי אמיתי שנקלע לבית של פורטוגל. 'מי תעפיל' בטוח כמעט; מפגש פסגה במחזור 3"
    },
    COD: {
      nameHe: "קונגו הדמוקרטית", nameEn: "DR Congo", flag: "🇨🇩", iso: "cd", confed: "CAF",
      elo: 1610, fifa: 56, host: false, tier: 4, attMod: 0.97, defMod: 1.0,
      coach: "סבסטיאן דסאברה",
      stars: ["יואן ויסה", "סדריק באקאמבו", "שאנסל מבמבה"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "אליפות אפריקה 2023: חצי גמר (מקום 4)",
      qual26: "עברה את הפלייאוף האפריקאי ואז את הבין-יבשתי (מרץ 2026) — השתתפות ראשונה בטורניר מאז 1974 (אז זאיר)",
      tenYear: "52 שנות געגוע. קבוצה פיזית עם פזורה אירופית רחבה, מסע פלייאוף מטורף דרך 5 משחקי חיים-ומוות",
      note: "מומנטום רגשי אדיר, פער איכות מול פורטוגל וקולומביה. היעד: המשחק מול אוזבקיסטן"
    },
    UZB: {
      nameHe: "אוזבקיסטן", nameEn: "Uzbekistan", flag: "🇺🇿", iso: "uz", confed: "AFC",
      elo: 1640, fifa: 50, host: false, tier: 4, attMod: 0.96, defMod: 0.98,
      coach: "פאביו קנאווארו (מ-2025)",
      stars: ["אבדוקודיר חוסאנוב (מנצ'סטר סיטי)", "אלדור שומורודוב", "אבוסחיד שוקורוב"],
      wc18: "לא העפילה", wc22: "לא העפילה",
      continental: "אליפות אסיה 2023: רבע גמר. אליפות אסיה עד 23: זכייה 2018",
      qual26: "העפילה ישירות — השתתפות ראשונה אי-פעם בטורניר, פרי פרויקט נוער של עשור",
      tenYear: "המעצמה הבאה של מרכז אסיה: דור שלם שגדל יחד (אלופת אסיה צעירה), חוסאנוב פרץ לעלית העולמית",
      note: "קנאווארו על הקווים, הגנה מצוינת — מול קונגו זה 'גמר' אמיתי על מקום 3 ואולי יותר"
    },

    /* ===== בית L ===== */
    ENG: {
      nameHe: "אנגליה", nameEn: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", iso: "gb-eng", confed: "UEFA",
      elo: 2060, fifa: 4, host: false, tier: 1, attMod: 1.02, defMod: 0.92,
      coach: "תומאס טוכל (מ-2025)",
      stars: ["הארי קיין", "ג'וד בלינגהאם", "בוקאיו סאקה", "דקלן רייס", "קול פאלמר"],
      wc18: "מקום 4", wc22: "רבע גמר (הפסד 1-2 לצרפת)",
      continental: "יורו 2020: גמר (פנדלים). יורו 2024: גמר (הפסד לספרד) — שני גמרים רצופים",
      qual26: "מוקדמות מושלמות תחת טוכל: 8 מ-8 בלי לספוג שער (!) — ההגנה הטובה במוקדמות אירופה",
      tenYear: "מ'שנות הכאב' לקבועה בצמרת: 4 טורנירים אחרונים = חצי גמר לפחות בשלושה. טוכל הוסיף ציניות גרמנית",
      note: "מהפייבוריטיות הבולטות לתואר. בית L חזק יחסית (קרואטיה!) אבל אנגליה של טוכל לא מאבדת נקודות לקטנות"
    },
    CRO: {
      nameHe: "קרואטיה", nameEn: "Croatia", flag: "🇭🇷", iso: "hr", confed: "UEFA",
      elo: 1870, fifa: 20, host: false, tier: 2, attMod: 1.0, defMod: 0.96,
      coach: "זלאטקו דאליץ'",
      stars: ["לוקה מודריץ' (40!)", "יושקו גבארדיול", "מטאו קובאצ'יץ'", "מרצלו ברוזוביץ'"],
      wc18: "גמר! (הפסד לצרפת)", wc22: "מקום 3",
      continental: "ליגת האומות: גמר 2023 (פנדלים מול ספרד). יורו 2024: שלב הבתים (דקה 90+5 מול איטליה)",
      qual26: "העפילה בביטחון — מודריץ' עדיין מנגן את הקצב בן 40",
      tenYear: "נס מתמשך: 4 מיליון תושבים, גמר + מקום 3 בשני טורנירים רצופים. מלכת ההארכות והפנדלים. הדור מזדקן בו-זמנית",
      note: "הניסיון הטורנירי הגדול בעולם. מול אנגליה במחזור הפותח (כנראה) — המשחק הכבד של שלב הבתים"
    },
    GHA: {
      nameHe: "גאנה", nameEn: "Ghana", flag: "🇬🇭", iso: "gh", confed: "CAF",
      elo: 1650, fifa: 48, host: false, tier: 4, attMod: 1.0, defMod: 1.03,
      coach: "אוטו אדו",
      stars: ["מוחמד קודוס", "תומאס פארטיי", "אנטואן סמניו", "אינאקי וויליאמס"],
      wc18: "לא העפילה", wc22: "שלב הבתים (נקמת אורוגוואי וסוארס)",
      continental: "אליפות אפריקה: גמר 2015, הדחות-בתים מביכות 2021/2023, לא העפילה 2025 (!)",
      qual26: "דווקא במוקדמות לטורניר — חלקה והעפילה בביטחון",
      tenYear: "הפרדוקס הגאנאי: כישרון פרטני עצום (קודוס!), כאוס מערכתי. הנבחרת הכי לא-צפויה באפריקה",
      note: "יכולה להפתיע את קרואטיה ויכולה להפסיד לפנמה — באותו שבוע. תמחור עצמי קשה"
    },
    PAN: {
      nameHe: "פנמה", nameEn: "Panama", flag: "🇵🇦", iso: "pa", confed: "CONCACAF",
      elo: 1670, fifa: 33, host: false, tier: 4, attMod: 0.96, defMod: 0.97,
      coach: "תומאס כריסטיאנסן",
      stars: ["אדלברטו קראסקייה", "חוסה פאחארדו", "סזר בלקבורן"],
      wc18: "שלב הבתים — הטורניר הראשון בתולדותיה", wc22: "לא העפילה",
      continental: "גביע הזהב: גמר 2023! חצי גמר קבוע. ליגת האומות CONCACAF: מקום 3 2024",
      qual26: "זכתה בבית המוקדמות שלה מעל קוסטה ריקה — העפלה שנייה בתולדותיה",
      tenYear: "הכוח העולה השקט של CONCACAF: קולקטיב מצוין, בלי כוכבים, מנצחת את מי שצריך. ב-2018 הייתה תיירת — ב-2026 היא קבוצה",
      note: "אל תזלזלו: ניצחה את ארה\"ב פעמיים בשנתיים האחרונות. מול גאנה — משחק פתוח לחלוטין"
    }
  }
};

// ייצוא ל-Node (לבדיקות) — בדפדפן DATA גלובלי
if (typeof module !== "undefined") module.exports = DATA;
