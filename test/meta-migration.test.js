const assert = require('node:assert/strict');
const test = require('node:test');
const { metaUpdate } = require('../meta.js');
const progress = require('../progress.js');

const SAVE_KEY = progress.SAVE_KEY;
const META_KEY = progress.META_KEY;

function storage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); },
    clear() { map.clear(); }
  };
}

function iso(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

test('old save without the meta key produces a record', () => {
  globalThis.localStorage = storage();
  const oldSave = {
    games_finished: 10,
    tutorials_finished: 1,
    best_score: 40,
    best_happiness: 22,
    best_skills: 6,
    best_money: 11,
    best_activities: 8,
    balanced_games: 2,
    skill_master_games: 1,
    long_games: 1,
    full_table_games: 1,
    human_wins: 2,
    months_played: 48,
    short_games: 1,
    normal_games: 3,
    ai_games: 4,
    legacy_note: 'keep'
  };
  const rawSave = JSON.stringify(oldSave);
  globalThis.localStorage.setItem(SAVE_KEY, rawSave);
  globalThis.localStorage.setItem('unrelated', 'keep');

  assert.equal(globalThis.localStorage.getItem(META_KEY), null);
  progress.backfillMeta('1.0.1');

  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), rawSave);
  assert.equal(globalThis.localStorage.getItem('unrelated'), 'keep');

  const rec = JSON.parse(globalThis.localStorage.getItem(META_KEY));
  assert.equal(rec.v, 1);
  assert.equal(rec.slug, 'vidabalance-v2');
  assert.equal(rec.version, '1.0.1');
  assert.equal(iso(rec.updatedAt), true);
  assert.deepEqual(rec.stats, {
    games_finished: 10,
    tutorials_finished: 1,
    best_score: 40,
    best_happiness: 22,
    best_skills: 6,
    best_money: 11,
    best_activities: 8,
    balanced_games: 2,
    skill_master_games: 1,
    long_games: 1,
    full_table_games: 1,
    human_wins: 2,
    months_played: 48,
    short_games: 1,
    normal_games: 3,
    ai_games: 4
  });
  assert.equal('legacy_note' in rec.stats, false);
  assert.deepEqual(rec.logros, [
    'all_activities',
    'balanced_life',
    'first_game',
    'full_table',
    'human_win',
    'long_year',
    'score_20',
    'score_40',
    'skill_master',
    'ten_games',
    'tutorial_done'
  ]);
  assert.equal(rec.logros.includes('score_70'), false);
  assert.deepEqual(Object.keys(rec.hitos).sort(), rec.logros);
  for (const id of rec.logros) {
    assert.equal(rec.hitos[id], rec.updatedAt);
  }
});

test('backfill does not overwrite an existing record', () => {
  globalThis.localStorage = storage();
  const existing = {
    v: 1,
    slug: 'vidabalance-v2',
    version: '1.0.0',
    updatedAt: '2020-01-01T00:00:00.000Z',
    stats: { games_finished: 1, best_score: 5 },
    logros: ['first_game'],
    hitos: { first_game: '2020-01-01T00:00:00.000Z' },
    extra: 'stay'
  };
  const raw = JSON.stringify(existing);
  globalThis.localStorage.setItem(META_KEY, raw);
  globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify({
    games_finished: 99,
    best_score: 100,
    tutorials_finished: 4
  }));
  globalThis.localStorage.setItem('unrelated', 'keep');

  progress.backfillMeta('1.0.1');

  assert.equal(globalThis.localStorage.getItem(META_KEY), raw);
  assert.equal(globalThis.localStorage.getItem('unrelated'), 'keep');
  assert.equal(JSON.parse(globalThis.localStorage.getItem(SAVE_KEY)).games_finished, 99);
});

test('corrupt JSON does not crash', () => {
  globalThis.localStorage = storage();
  globalThis.localStorage.setItem(SAVE_KEY, '{');
  globalThis.localStorage.setItem('unrelated', 'keep');
  assert.doesNotThrow(() => progress.backfillMeta('1.0.1'));
  const fresh = JSON.parse(globalThis.localStorage.getItem(META_KEY));
  assert.equal(fresh.v, 1);
  assert.equal(fresh.slug, 'vidabalance-v2');
  assert.equal(fresh.stats.games_finished, 0);
  assert.equal(fresh.stats.best_score, 0);
  assert.deepEqual(fresh.logros, []);
  assert.deepEqual(fresh.hitos, {});
  assert.equal(globalThis.localStorage.getItem('unrelated'), 'keep');
  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), '{');

  globalThis.localStorage.clear();
  globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify({ games_finished: 4, tutorials_finished: 1 }));
  globalThis.localStorage.setItem(META_KEY, '{not-json');
  assert.doesNotThrow(() => progress.backfillMeta('1.0.1'));
  assert.equal(globalThis.localStorage.getItem(META_KEY), '{not-json');

  assert.doesNotThrow(() => metaUpdate('vidabalance-v2', '1.0.1', {
    stats: { games_finished: 4, best_score: NaN, best_happiness: Infinity, label: 'no' },
    logros: ['first_game', 'first_game']
  }));
  const repaired = JSON.parse(globalThis.localStorage.getItem(META_KEY));
  assert.equal(repaired.v, 1);
  assert.equal(repaired.stats.games_finished, 4);
  assert.equal('best_score' in repaired.stats, false);
  assert.equal('best_happiness' in repaired.stats, false);
  assert.equal('label' in repaired.stats, false);
  assert.deepEqual(repaired.logros, ['first_game']);
  assert.equal(iso(repaired.hitos.first_game), true);
  assert.equal(repaired.hitos.first_game, repaired.updatedAt);
});

test('a finished match updates the save and the meta record', async () => {
  globalThis.localStorage = storage();
  globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify({ legacy_note: 'keep' }));
  await new Promise((resolve) => setTimeout(resolve, 1100));
  progress.recordTutorialComplete('1.0.1');
  progress.recordFinishedMatch('1.0.1', {
    tutorial: false,
    months: 16,
    playerCount: 4,
    ai: true,
    results: [
      { type: 'human', score: 70, happiness: 40, skills: 6, money: 15, activities: 8 },
      { type: 'hard', score: 20, happiness: 12, skills: 1, money: 4, activities: 4 }
    ]
  });
  const save = JSON.parse(globalThis.localStorage.getItem(SAVE_KEY));
  assert.equal(save.legacy_note, 'keep');
  assert.equal(save.games_finished, 1);
  assert.equal(save.tutorials_finished, 1);
  assert.equal(save.best_score, 70);
  assert.equal(save.best_happiness, 40);
  assert.equal(save.best_skills, 6);
  assert.equal(save.best_money, 15);
  assert.equal(save.best_activities, 8);
  assert.equal(save.balanced_games, 1);
  assert.equal(save.skill_master_games, 1);
  assert.equal(save.long_games, 1);
  assert.equal(save.full_table_games, 1);
  assert.equal(save.human_wins, 1);
  assert.equal(save.months_played, 16);
  assert.equal(save.short_games, 0);
  assert.equal(save.normal_games, 0);
  assert.equal(save.ai_games, 1);

  await new Promise((resolve) => setTimeout(resolve, 1100));
  const rec = JSON.parse(globalThis.localStorage.getItem(META_KEY));
  assert.equal(rec.stats.games_finished, 1);
  assert.equal(rec.stats.human_wins, 1);
  assert.equal(rec.stats.long_games, 1);
  assert.deepEqual(rec.logros, [
    'all_activities',
    'balanced_life',
    'first_game',
    'full_table',
    'human_win',
    'long_year',
    'score_20',
    'score_40',
    'score_70',
    'skill_master',
    'tutorial_done'
  ]);
  const tutorialStamp = rec.hitos.tutorial_done;
  const firstStamp = rec.hitos.first_game;
  assert.equal(iso(tutorialStamp), true);
  assert.equal(iso(firstStamp), true);
  progress.recordFinishedMatch('1.0.1', {
    tutorial: true,
    months: 3,
    playerCount: 2,
    ai: true,
    results: [{ type: 'human', score: 5, happiness: 5, skills: 0, money: 1, activities: 2 }]
  });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const later = JSON.parse(globalThis.localStorage.getItem(META_KEY));
  const laterSave = JSON.parse(globalThis.localStorage.getItem(SAVE_KEY));
  assert.equal(laterSave.games_finished, 1);
  assert.equal(laterSave.months_played, 19);
  assert.equal(later.hitos.tutorial_done, tutorialStamp);
  assert.equal(later.hitos.first_game, firstStamp);
  assert.equal(later.stats.best_score, 70);
});

test('metaUpdate keeps hitos and posts only to a parent frame', () => {
  globalThis.localStorage = storage();
  const first = metaUpdate('vidabalance-v2', '1.0.0', {
    stats: { games_finished: 1 },
    logros: ['first_game']
  });
  const again = metaUpdate('vidabalance-v2', '1.0.1', {
    stats: { games_finished: 2 },
    logros: ['first_game', 'ten_games']
  });
  assert.equal(again.hitos.first_game, first.hitos.first_game);
  assert.notEqual(again.hitos.ten_games, undefined);
  assert.equal(again.hitos.ten_games, again.updatedAt);
  assert.deepEqual(again.logros, ['first_game', 'ten_games']);
  assert.equal(again.version, '1.0.1');
  assert.equal(again.stats.games_finished, 2);

  const messages = [];
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  globalThis.location = { origin: 'https://juliangdeveloper.github.io' };
  const top = {};
  top.parent = top;
  globalThis.window = top;
  metaUpdate('vidabalance-v2', '1.0.1', { stats: { games_finished: 3 }, logros: ['first_game'] });
  assert.equal(messages.length, 0);

  const child = {
    parent: {
      postMessage(data, origin) { messages.push({ data: data, origin: origin }); }
    }
  };
  globalThis.window = child;
  const posted = metaUpdate('vidabalance-v2', '1.0.1', {
    stats: { games_finished: 3 },
    logros: ['first_game']
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].origin, 'https://juliangdeveloper.github.io');
  assert.equal(messages[0].data.type, 'meta');
  assert.equal(messages[0].data.key, 'meta.v1.vidabalance-v2');
  assert.equal(messages[0].data.data, posted);
  assert.equal(messages[0].data.data.hitos.first_game, first.hitos.first_game);

  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  if (previousLocation === undefined) delete globalThis.location;
  else globalThis.location = previousLocation;
});
