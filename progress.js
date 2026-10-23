// Match progress for vidabalance-v2. meta.v1 is filled from this save.
(function (root) {
  const SLUG = 'vidabalance-v2';
  const APP_VERSION = '1.0.1';
  const SAVE_KEY = 'vidabalance.save';
  const META_KEY = 'meta.v1.' + SLUG;

  // Flat numeric stats written into meta.v1. Max 20.
  const STAT_KEYS = [
    'games_finished', // finished matches, tutorial excluded
    'tutorials_finished', // tutorial step sequences completed
    'best_score', // highest final score shown on the end screen
    'best_happiness', // highest base happiness
    'best_skills', // highest skill tokens
    'best_money', // highest money
    'best_activities', // most distinct activities in one match
    'balanced_games', // matches where a player used 5 or more activities
    'skill_master_games', // matches where a player reached 6 skills
    'long_games', // finished 16-month matches
    'full_table_games', // finished 4-player matches
    'human_wins', // matches whose sole top score belongs to a human
    'months_played', // months across finished matches, tutorial included
    'short_games', // finished 8-month matches
    'normal_games', // finished 12-month matches
    'ai_games' // finished matches that included an AI player
  ];

  // Stable achievement ids. Conditions read the save above.
  const LOGROS = [
    { id: 'first_game', met: function (s) { return s.games_finished >= 1; } }, // finish a match outside the tutorial
    { id: 'tutorial_done', met: function (s) { return s.tutorials_finished >= 1; } }, // finish the tutorial steps
    { id: 'score_20', met: function (s) { return s.best_score >= 20; } }, // final score of 20
    { id: 'score_40', met: function (s) { return s.best_score >= 40; } }, // final score of 40
    { id: 'score_70', met: function (s) { return s.best_score >= 70; } }, // final score of 70
    { id: 'balanced_life', met: function (s) { return s.balanced_games >= 1; } }, // use 5 or more activities in one match
    { id: 'skill_master', met: function (s) { return s.skill_master_games >= 1; } }, // end a match with 6 skills
    { id: 'long_year', met: function (s) { return s.long_games >= 1; } }, // finish 16 months
    { id: 'full_table', met: function (s) { return s.full_table_games >= 1; } }, // finish with 4 players
    { id: 'human_win', met: function (s) { return s.human_wins >= 1; } }, // a human has the sole highest score
    { id: 'ten_games', met: function (s) { return s.games_finished >= 10; } }, // finish 10 matches
    { id: 'all_activities', met: function (s) { return s.best_activities >= 8; } } // use all 8 activities in one match
  ];

  let metaTimer = null;
  let metaLast = 0;
  let pendingVersion = APP_VERSION;

  function num(v) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 0;
    return v;
  }

  function emptySave() {
    const s = {};
    for (let i = 0; i < STAT_KEYS.length; i++) s[STAT_KEYS[i]] = 0;
    return s;
  }

  function readSave() {
    try {
      const raw = root.localStorage.getItem(SAVE_KEY);
      if (!raw) return emptySave();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptySave();
      const s = emptySave();
      for (let i = 0; i < STAT_KEYS.length; i++) {
        const k = STAT_KEYS[i];
        if (typeof parsed[k] === 'number' && Number.isFinite(parsed[k]) && parsed[k] >= 0) s[k] = parsed[k];
      }
      return s;
    } catch (e) {
      return emptySave();
    }
  }

  function writeSave(save) {
    try {
      let base = {};
      const raw = root.localStorage.getItem(SAVE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) base = parsed;
        } catch (e) {
          base = {};
        }
      }
      const next = {};
      const baseKeys = Object.keys(base);
      for (let i = 0; i < baseKeys.length; i++) next[baseKeys[i]] = base[baseKeys[i]];
      for (let i = 0; i < STAT_KEYS.length; i++) next[STAT_KEYS[i]] = save[STAT_KEYS[i]];
      root.localStorage.setItem(SAVE_KEY, JSON.stringify(next));
    } catch (e) {}
  }

  function statsFromSave(save) {
    const stats = {};
    for (let i = 0; i < STAT_KEYS.length; i++) {
      const k = STAT_KEYS[i];
      const n = save[k];
      if (typeof n === 'number' && Number.isFinite(n)) stats[k] = n;
    }
    return stats;
  }

  function logrosFromSave(save) {
    const ids = [];
    for (let i = 0; i < LOGROS.length; i++) {
      try {
        if (LOGROS[i].met(save)) ids.push(LOGROS[i].id);
      } catch (e) {}
    }
    return ids;
  }

  function callMetaUpdate(version, save) {
    let fn = root.metaUpdate;
    if (typeof fn !== 'function') {
      fn = require('./meta.js').metaUpdate;
      root.metaUpdate = fn;
    }
    return fn(SLUG, version, { stats: statsFromSave(save), logros: logrosFromSave(save) });
  }

  function flushMeta() {
    try {
      metaTimer = null;
      metaLast = Date.now();
      callMetaUpdate(pendingVersion, readSave());
    } catch (e) {}
  }

  // At most one meta write per second. A later call in that window still lands.
  function scheduleMetaUpdate(version) {
    try {
      if (typeof version === 'string' && version) pendingVersion = version;
      if (metaTimer) return;
      const wait = metaLast ? Math.max(0, 1000 - (Date.now() - metaLast)) : 0;
      if (wait === 0) flushMeta();
      else metaTimer = setTimeout(flushMeta, wait);
    } catch (e) {}
  }

  function backfillMeta(version) {
    try {
      const existing = root.localStorage.getItem(META_KEY);
      if (existing !== null) return;
      const ver = typeof version === 'string' && version ? version : APP_VERSION;
      callMetaUpdate(ver, readSave());
      metaLast = Date.now();
    } catch (e) {}
  }

  function recordTutorialComplete(version) {
    try {
      const save = readSave();
      save.tutorials_finished += 1;
      writeSave(save);
      scheduleMetaUpdate(version);
    } catch (e) {}
  }

  function recordFinishedMatch(version, match) {
    try {
      const save = readSave();
      const tutorial = !!(match && match.tutorial);
      const months = num(match && match.months);
      const playerCount = num(match && match.playerCount);
      const results = match && Array.isArray(match.results) ? match.results : [];
      if (!tutorial) save.games_finished += 1;
      save.months_played += months;
      if (!tutorial && months === 8) save.short_games += 1;
      if (!tutorial && months === 12) save.normal_games += 1;
      if (!tutorial && months === 16) save.long_games += 1;
      if (!tutorial && playerCount >= 4) save.full_table_games += 1;
      if (!tutorial && match && match.ai) save.ai_games += 1;

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
        if (score > save.best_score) save.best_score = score;
        if (happiness > save.best_happiness) save.best_happiness = happiness;
        if (skills > save.best_skills) save.best_skills = skills;
        if (money > save.best_money) save.best_money = money;
        if (activities > save.best_activities) save.best_activities = activities;
        if (activities >= 5) balanced = true;
        if (skills >= 6) skillMaster = true;
        if (top === null || score > top) {
          top = score;
          topCount = 1;
          humanTop = r.type === 'human';
        } else if (score === top) topCount += 1;
      }
      if (balanced) save.balanced_games += 1;
      if (skillMaster) save.skill_master_games += 1;
      if (!tutorial && top !== null && topCount === 1 && humanTop) save.human_wins += 1;
      writeSave(save);
      scheduleMetaUpdate(version);
    } catch (e) {}
  }

  root.APP_VERSION = APP_VERSION;
  root.backfillMeta = backfillMeta;
  root.recordTutorialComplete = recordTutorialComplete;
  root.recordFinishedMatch = recordFinishedMatch;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      SLUG: SLUG,
      APP_VERSION: APP_VERSION,
      SAVE_KEY: SAVE_KEY,
      META_KEY: META_KEY,
      STAT_KEYS: STAT_KEYS,
      LOGROS: LOGROS,
      readSave: readSave,
      backfillMeta: backfillMeta,
      recordTutorialComplete: recordTutorialComplete,
      recordFinishedMatch: recordFinishedMatch,
      statsFromSave: statsFromSave,
      logrosFromSave: logrosFromSave
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
