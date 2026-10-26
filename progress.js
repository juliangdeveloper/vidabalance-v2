(function (root) {
  const SLUG = 'vidabalance-v2';
  const APP_VERSION = '1.0.10';
  const SAVE_KEY = 'vidabalance.save';
  const META_KEY = 'meta.v1.' + SLUG;

  const TIPO_STAT = root.TIPO_STAT || require('./meta.js').TIPO_STAT;

  const STATS = Object.freeze({
    games_finished: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'partidas terminadas' },
    tutorials_finished: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'tutoriales terminados' },
    best_score: { tipo: TIPO_STAT.MEJOR_MARCA, unidad: 'puntos en una partida' },
    best_happiness: { tipo: TIPO_STAT.MEJOR_MARCA, unidad: 'puntos de felicidad en una partida' },
    best_skills: { tipo: TIPO_STAT.MEJOR_MARCA, unidad: 'puntos de habilidades en una partida' },
    best_money: { tipo: TIPO_STAT.MEJOR_MARCA, unidad: 'dinero en una partida' },
    best_activities: { tipo: TIPO_STAT.MEJOR_MARCA, unidad: 'actividades distintas en una partida' },
    balanced_games: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'partidas con vida equilibrada' },
    skill_master_games: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'partidas como maestro de habilidades' },
    long_games: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'partidas largas' },
    full_table_games: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'partidas con la mesa llena' },
    human_wins: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'partidas ganadas por un humano' },
    months_played: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'meses jugados' },
    short_games: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'partidas cortas' },
    normal_games: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'partidas normales' },
    ai_games: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'partidas con IA' }
  });
  const STAT_KEYS = Object.keys(STATS);

  const LOGROS = [
    { id: 'first_game', met: function (s) { return s.games_finished >= 1; } },
    { id: 'tutorial_done', met: function (s) { return s.tutorials_finished >= 1; } },
    { id: 'score_20', met: function (s) { return s.best_score >= 20; } },
    { id: 'score_40', met: function (s) { return s.best_score >= 40; } },
    { id: 'score_70', met: function (s) { return s.best_score >= 70; } },
    { id: 'balanced_life', met: function (s) { return s.balanced_games >= 1; } },
    { id: 'skill_master', met: function (s) { return s.skill_master_games >= 1; } },
    { id: 'long_year', met: function (s) { return s.long_games >= 1; } },
    { id: 'full_table', met: function (s) { return s.full_table_games >= 1; } },
    { id: 'human_win', met: function (s) { return s.human_wins >= 1; } },
    { id: 'ten_games', met: function (s) { return s.games_finished >= 10; } },
    { id: 'all_activities', met: function (s) { return s.best_activities >= 8; } }
  ];

  let memory = null;
  let tutorialPending = false;

  function isDemo() {
    try {
      const search = root.location && typeof root.location.search === 'string' ? root.location.search : '';
      return /(?:\?|&)(?:demo|preview)=1(?:&|$)/.test(search);
    } catch (e) {
      return false;
    }
  }

  function num(v) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 0;
    return v;
  }

  function emptyStats() {
    const s = {};
    for (let i = 0; i < STAT_KEYS.length; i++) s[STAT_KEYS[i]] = 0;
    return s;
  }

  function copyStats(src) {
    const s = emptyStats();
    if (!src || typeof src !== 'object') return s;
    for (let i = 0; i < STAT_KEYS.length; i++) {
      const key = STAT_KEYS[i];
      if (typeof src[key] === 'number' && Number.isFinite(src[key]) && src[key] >= 0) s[key] = src[key];
    }
    return s;
  }

  function readSave() {
    try {
      const raw = root.localStorage.getItem(SAVE_KEY);
      if (!raw) return emptyStats();
      const parsed = JSON.parse(raw);
      return copyStats(parsed);
    } catch (e) {
      return emptyStats();
    }
  }

  function readMetaStats() {
    try {
      const raw = root.localStorage.getItem(META_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.v !== 1 || parsed.slug !== SLUG) return null;
      return copyStats(parsed.stats);
    } catch (e) {
      return null;
    }
  }

  function baseStats() {
    if (memory) return copyStats(memory);
    const fromMeta = readMetaStats();
    if (fromMeta) return fromMeta;
    return readSave();
  }

  function logrosFromStats(stats) {
    const ids = [];
    for (let i = 0; i < LOGROS.length; i++) {
      try {
        if (LOGROS[i].met(stats)) ids.push(LOGROS[i].id);
      } catch (e) {}
    }
    return ids;
  }

  function callMetaUpdate(version, stats) {
    let fn = root.metaUpdate;
    if (typeof fn !== 'function') {
      fn = require('./meta.js').metaUpdate;
      root.metaUpdate = fn;
    }
    memory = copyStats(stats);
    return fn(SLUG, version || APP_VERSION, {
      stats: memory,
      logros: logrosFromStats(memory),
      declared: STATS
    });
  }

  function recordValid(raw) {
    try {
      const parsed = JSON.parse(raw);
      return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.v === 1 && parsed.slug === SLUG;
    } catch (e) {
      return false;
    }
  }

  function backfillMeta(version) {
    try {
      if (isDemo()) return;
      const raw = root.localStorage.getItem(META_KEY);
      if (raw !== null && recordValid(raw)) {
        memory = readMetaStats();
        return;
      }
      callMetaUpdate(version || APP_VERSION, readSave());
    } catch (e) {}
  }

  function noteTutorialComplete() {
    if (isDemo()) return;
    tutorialPending = true;
  }

  function recordFinishedMatch(version, match) {
    try {
      if (isDemo()) return;
      if (match && match.tutorial) return;
      const stats = baseStats();
      const months = num(match && match.months);
      const playerCount = num(match && match.playerCount);
      const results = match && Array.isArray(match.results) ? match.results : [];
      stats.games_finished += 1;
      stats.months_played += months;
      if (months === 8) stats.short_games += 1;
      if (months === 12) stats.normal_games += 1;
      if (months === 16) stats.long_games += 1;
      if (playerCount >= 4) stats.full_table_games += 1;
      if (match && match.ai) stats.ai_games += 1;
      if (tutorialPending) {
        stats.tutorials_finished += 1;
        tutorialPending = false;
      }

      let top = null;
      let topCount = 0;
      let humanTop = false;
      let balanced = false;
      let skillMaster = false;
      for (let i = 0; i < results.length; i++) {
        const r = results[i] || {};
        const score = num(r.score);
        const happiness = num(r.happiness);
        const skills = num(r.skills);
        const money = num(r.money);
        const activities = num(r.activities);
        if (score > stats.best_score) stats.best_score = score;
        if (happiness > stats.best_happiness) stats.best_happiness = happiness;
        if (skills > stats.best_skills) stats.best_skills = skills;
        if (money > stats.best_money) stats.best_money = money;
        if (activities > stats.best_activities) stats.best_activities = activities;
        if (activities >= 5) balanced = true;
        if (skills >= 6) skillMaster = true;
        if (top === null || score > top) {
          top = score;
          topCount = 1;
          humanTop = r.type === 'human';
        } else if (score === top) topCount += 1;
      }
      if (balanced) stats.balanced_games += 1;
      if (skillMaster) stats.skill_master_games += 1;
      if (top !== null && topCount === 1 && humanTop) stats.human_wins += 1;
      callMetaUpdate(version || APP_VERSION, stats);
    } catch (e) {}
  }

  function resetProgressState() {
    memory = null;
    tutorialPending = false;
  }

  root.APP_VERSION = APP_VERSION;
  root.backfillMeta = backfillMeta;
  root.noteTutorialComplete = noteTutorialComplete;
  root.recordFinishedMatch = recordFinishedMatch;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      SLUG: SLUG,
      APP_VERSION: APP_VERSION,
      SAVE_KEY: SAVE_KEY,
      META_KEY: META_KEY,
      STATS: STATS,
      LOGROS: LOGROS,
      readSave: readSave,
      backfillMeta: backfillMeta,
      noteTutorialComplete: noteTutorialComplete,
      recordFinishedMatch: recordFinishedMatch,
      logrosFromStats: logrosFromStats,
      resetProgressState: resetProgressState
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
