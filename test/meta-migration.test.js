const assert = require('node:assert/strict');
const test = require('node:test');
const { metaUpdate, metaReset } = require('../meta.js');
const progress = require('../progress.js');

const SAVE_KEY = progress.SAVE_KEY;
const META_KEY = progress.META_KEY;
const CORRUPT_KEY = META_KEY + '.corrupt';
const VERSION = '1.0.6';

const handlers = {};
globalThis.addEventListener = (type, fn) => { handlers[type] = fn; };
globalThis.document = {
  visibilityState: 'visible',
  addEventListener(type, fn) { handlers[type] = fn; }
};

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

function topWindow() {
  const top = {};
  top.parent = top;
  return top;
}

test.beforeEach(() => {
  metaReset();
  progress.resetProgressState();
  globalThis.localStorage = storage();
  globalThis.location = { search: '', origin: 'http://127.0.0.1:8765' };
  globalThis.window = topWindow();
  if (globalThis.document) globalThis.document.visibilityState = 'visible';
});

test('old save without the meta key produces a record', () => {
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
  progress.backfillMeta(VERSION);

  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), rawSave);
  assert.equal(globalThis.localStorage.getItem('unrelated'), 'keep');

  const rec = JSON.parse(globalThis.localStorage.getItem(META_KEY));
  assert.equal(rec.v, 1);
  assert.equal(rec.slug, 'vidabalance-v2');
  assert.equal(rec.version, VERSION);
  assert.equal(iso(rec.updatedAt), true);
  assert.deepEqual(Object.keys(rec.stats), progress.STATS.map((item) => item.key));
  assert.equal(rec.stats.games_finished, 10);
  assert.equal(rec.stats.best_score, 40);
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
  for (const id of rec.logros) assert.equal(rec.hitos[id], rec.updatedAt);
});

test('backfill does not overwrite an existing record', () => {
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
  const rawSave = JSON.stringify({ games_finished: 99, best_score: 100, tutorials_finished: 4 });
  globalThis.localStorage.setItem(META_KEY, raw);
  globalThis.localStorage.setItem(SAVE_KEY, rawSave);
  globalThis.localStorage.setItem('unrelated', 'keep');

  progress.backfillMeta(VERSION);

  assert.equal(globalThis.localStorage.getItem(META_KEY), raw);
  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), rawSave);
  assert.equal(globalThis.localStorage.getItem('unrelated'), 'keep');
  assert.equal(globalThis.localStorage.getItem(CORRUPT_KEY), null);
});

test('corrupt JSON does not crash', () => {
  globalThis.localStorage.setItem(SAVE_KEY, '{');
  globalThis.localStorage.setItem('unrelated', 'keep');
  assert.doesNotThrow(() => progress.backfillMeta(VERSION));
  const fresh = JSON.parse(globalThis.localStorage.getItem(META_KEY));
  assert.equal(fresh.v, 1);
  assert.equal(fresh.slug, 'vidabalance-v2');
  assert.equal(fresh.stats.games_finished, 0);
  assert.deepEqual(fresh.logros, []);
  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), '{');
  assert.equal(globalThis.localStorage.getItem('unrelated'), 'keep');
});

test('corrupt meta record is copied and rebuilt', () => {
  const cases = [
    '{not-json',
    JSON.stringify([]),
    JSON.stringify({ v: 2, slug: 'vidabalance-v2', stats: { games_finished: 9 } }),
    JSON.stringify({ v: 1, slug: 'other-game', stats: { games_finished: 9 } })
  ];
  for (const raw of cases) {
    metaReset();
    progress.resetProgressState();
    globalThis.localStorage = storage();
    const rawSave = JSON.stringify({ games_finished: 4, tutorials_finished: 1, photo: 'data:image/png;base64,AAAA' });
    globalThis.localStorage.setItem(SAVE_KEY, rawSave);
    globalThis.localStorage.setItem(META_KEY, raw);
    assert.doesNotThrow(() => progress.backfillMeta(VERSION));
    assert.equal(globalThis.localStorage.getItem(CORRUPT_KEY), raw);
    assert.equal(globalThis.localStorage.getItem(SAVE_KEY), rawSave);
    const rec = JSON.parse(globalThis.localStorage.getItem(META_KEY));
    assert.equal(rec.v, 1);
    assert.equal(rec.slug, 'vidabalance-v2');
    assert.equal(rec.version, VERSION);
    assert.equal(rec.stats.games_finished, 4);
    assert.equal(rec.stats.tutorials_finished, 1);
    assert.equal('photo' in rec.stats, false);
    assert.deepEqual(rec.logros, ['first_game', 'tutorial_done']);
    assert.equal(rec.hitos.first_game, rec.updatedAt);
  }
});

test('helper keeps at most 20 declared stats in declared order', () => {
  const declared = [];
  const stats = { nope: 7, games_finished: 3 };
  for (let i = 0; i < 25; i++) {
    const key = 'stat_' + String(i).padStart(2, '0');
    declared.push({ key: key, monotonic: false });
    stats[key] = i + 1;
  }
  stats.stat_03 = Infinity;
  const rec = metaUpdate('vidabalance-v2', 'v' + VERSION, { stats: stats, logros: [], declared: declared });
  assert.equal(rec.version, VERSION);
  const keys = Object.keys(rec.stats);
  assert.equal(keys.length, 19);
  assert.deepEqual(keys, declared.map((item) => item.key).filter((key) => key !== 'stat_03').slice(0, 19));
  assert.equal(rec.stats.stat_00, 1);
  assert.equal(rec.stats.stat_20, undefined);
  assert.equal('stat_21' in rec.stats, false);
  assert.equal('nope' in rec.stats, false);
  assert.equal('games_finished' in rec.stats, false);
  assert.equal('stat_03' in rec.stats, false);
});

test('monotonic stats keep the greater value and omitted keys stay', () => {
  const declared = [
    { key: 'games_finished', monotonic: true },
    { key: 'best_score', monotonic: true },
    { key: 'last_level', monotonic: false }
  ];
  metaUpdate('vidabalance-v2', VERSION, {
    stats: { games_finished: 5, best_score: 10, last_level: 3, extra: 9 },
    logros: ['first_game'],
    declared: declared
  });
  metaReset();
  const rec = metaUpdate('vidabalance-v2', VERSION, {
    stats: { games_finished: 4, best_score: NaN, last_level: 1 },
    logros: ['first_game'],
    declared: declared
  });
  assert.equal(rec.stats.games_finished, 5);
  assert.equal(rec.stats.best_score, 10);
  assert.equal(rec.stats.last_level, 1);
  assert.equal('extra' in rec.stats, false);
  assert.equal(rec.hitos.first_game !== undefined, true);
});

test('normal writes stay at one per second and a hide flushes a pending change', () => {
  let now = 10000;
  const prevNow = Date.now;
  const prevSet = global.setTimeout;
  const prevClear = global.clearTimeout;
  const queue = [];
  Date.now = () => now;
  global.setTimeout = (fn, ms) => {
    const item = { fn: fn, at: now + ms, id: queue.length + 1 };
    queue.push(item);
    return item.id;
  };
  global.clearTimeout = (id) => {
    const item = queue.find((entry) => entry && entry.id === id);
    if (item) item.fn = null;
  };
  function advance(ms) {
    now += ms;
    for (const item of queue) {
      if (item && item.fn && item.at <= now) {
        const fn = item.fn;
        item.fn = null;
        fn();
      }
    }
  }
  const writes = [];
  const posts = [];
  const store = storage();
  const orig = store.setItem.bind(store);
  store.setItem = (key, value) => {
    writes.push(String(key));
    orig(key, value);
  };
  globalThis.localStorage = store;
  globalThis.window = {
    parent: { postMessage(data, origin) { posts.push({ data: data, origin: origin }); } },
    addEventListener(type, fn) { handlers[type] = fn; }
  };

  try {
    progress.backfillMeta(VERSION);
    assert.deepEqual(writes, [META_KEY]);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].data.key, META_KEY);
    assert.equal(posts[0].origin, 'http://127.0.0.1:8765');

    progress.recordFinishedMatch(VERSION, {
      months: 8,
      playerCount: 2,
      ai: true,
      results: [{ type: 'human', score: 12, happiness: 10, skills: 1, money: 3, activities: 3 }]
    });
    assert.deepEqual(writes, [META_KEY]);
    assert.equal(posts.length, 1);

    globalThis.document.visibilityState = 'visible';
    handlers.visibilitychange();
    assert.deepEqual(writes, [META_KEY]);
    assert.equal(posts.length, 1);

    handlers.pagehide();
    assert.deepEqual(writes, [META_KEY, META_KEY]);
    assert.equal(posts.length, 2);
    let rec = JSON.parse(globalThis.localStorage.getItem(META_KEY));
    assert.equal(rec.stats.games_finished, 1);
    assert.equal(rec.stats.short_games, 1);

    progress.recordFinishedMatch(VERSION, {
      months: 12,
      playerCount: 2,
      ai: false,
      results: [{ type: 'human', score: 20, happiness: 16, skills: 1, money: 4, activities: 4 }]
    });
    assert.deepEqual(writes, [META_KEY, META_KEY]);
    assert.equal(posts.length, 2);

    globalThis.document.visibilityState = 'hidden';
    handlers.visibilitychange();
    assert.deepEqual(writes, [META_KEY, META_KEY, META_KEY]);
    assert.equal(posts.length, 3);
    rec = JSON.parse(globalThis.localStorage.getItem(META_KEY));
    assert.equal(rec.stats.games_finished, 2);
    assert.equal(rec.stats.normal_games, 1);

    handlers.pagehide();
    handlers.beforeunload();
    handlers.visibilitychange();
    advance(1000);
    assert.deepEqual(writes, [META_KEY, META_KEY, META_KEY]);
    assert.equal(posts.length, 3);
  } finally {
    metaReset();
    Date.now = prevNow;
    global.setTimeout = prevSet;
    global.clearTimeout = prevClear;
  }
});

test('demo and preview modes do not write or post', () => {
  const posts = [];
  globalThis.window = {
    parent: { postMessage(data, origin) { posts.push({ data: data, origin: origin }); } }
  };
  globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify({ games_finished: 6 }));
  const rawSave = globalThis.localStorage.getItem(SAVE_KEY);

  for (const search of ['?demo=1', '?preview=1', '?x=2&demo=1']) {
    metaReset();
    progress.resetProgressState();
    globalThis.location.search = search;
    posts.length = 0;
    progress.backfillMeta(VERSION);
    progress.noteTutorialComplete();
    progress.recordFinishedMatch(VERSION, {
      months: 12,
      playerCount: 4,
      ai: false,
      results: [{ type: 'human', score: 80, happiness: 40, skills: 6, money: 20, activities: 8 }]
    });
    metaUpdate('vidabalance-v2', VERSION, { stats: { games_finished: 9 }, logros: ['first_game'], declared: progress.STATS });
    globalThis.document.visibilityState = 'hidden';
    handlers.pagehide();
    handlers.visibilitychange();
    assert.equal(globalThis.localStorage.getItem(META_KEY), null);
    assert.equal(globalThis.localStorage.getItem(SAVE_KEY), rawSave);
    assert.equal(posts.length, 0);
  }
});

test('existing save stays byte-identical after load and play', () => {
  const rawSave = JSON.stringify({
    legacy_note: 'keep',
    games_finished: 2,
    photo: 'data:image/png;base64,' + 'A'.repeat(300)
  });
  globalThis.localStorage.setItem(SAVE_KEY, rawSave);
  globalThis.localStorage.setItem('unrelated', 'keep');
  progress.backfillMeta(VERSION);
  progress.noteTutorialComplete();
  progress.recordFinishedMatch(VERSION, {
    tutorial: true,
    months: 3,
    playerCount: 2,
    ai: true,
    results: [{ type: 'human', score: 99, happiness: 50, skills: 8, money: 40, activities: 8 }]
  });
  metaReset();
  progress.recordFinishedMatch(VERSION, {
    tutorial: false,
    months: 16,
    playerCount: 4,
    ai: true,
    results: [
      { type: 'human', score: 70, happiness: 40, skills: 6, money: 15, activities: 8 },
      { type: 'hard', score: 20, happiness: 12, skills: 1, money: 4, activities: 4 }
    ]
  });

  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), rawSave);
  assert.equal(globalThis.localStorage.getItem('unrelated'), 'keep');
  const rec = JSON.parse(globalThis.localStorage.getItem(META_KEY));
  assert.equal(rec.stats.games_finished, 3);
  assert.equal(rec.stats.tutorials_finished, 1);
  assert.equal(rec.stats.best_score, 70);
  assert.equal(rec.stats.long_games, 1);
  assert.equal(rec.stats.full_table_games, 1);
  assert.equal(rec.stats.human_wins, 1);
  assert.equal(rec.stats.best_activities, 8);
  assert.equal('photo' in rec.stats, false);
  assert.equal('legacy_note' in rec.stats, false);
  assert.equal(rec.logros.includes('tutorial_done'), true);
  assert.equal(rec.logros.includes('score_70'), true);
});

test('metaUpdate keeps hitos and posts only to a parent frame', () => {
  const first = metaUpdate('vidabalance-v2', VERSION, {
    stats: { games_finished: 1 },
    logros: ['first_game'],
    declared: [{ key: 'games_finished', monotonic: true }]
  });
  metaReset();
  const again = metaUpdate('vidabalance-v2', VERSION, {
    stats: { games_finished: 2 },
    logros: ['first_game', 'ten_games'],
    declared: [{ key: 'games_finished', monotonic: true }]
  });
  assert.equal(again.hitos.first_game, first.hitos.first_game);
  assert.equal(again.hitos.ten_games, again.updatedAt);
  assert.deepEqual(again.logros, ['first_game', 'ten_games']);
  assert.equal(again.stats.games_finished, 2);

  const messages = [];
  metaReset();
  metaUpdate('vidabalance-v2', VERSION, {
    stats: { games_finished: 3 },
    logros: ['first_game'],
    declared: [{ key: 'games_finished', monotonic: true }]
  });
  assert.equal(messages.length, 0);

  globalThis.window = {
    parent: { postMessage(data, origin) { messages.push({ data: data, origin: origin }); } }
  };
  metaReset();
  const posted = metaUpdate('vidabalance-v2', VERSION, {
    stats: { games_finished: 4 },
    logros: ['first_game'],
    declared: [{ key: 'games_finished', monotonic: true }]
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].origin, 'http://127.0.0.1:8765');
  assert.equal(messages[0].data.type, 'meta');
  assert.equal(messages[0].data.key, META_KEY);
  assert.equal(messages[0].data.data, posted);
  assert.equal(messages[0].data.data.hitos.first_game, first.hitos.first_game);
});

test('app version is plain semver', () => {
  assert.equal(progress.APP_VERSION, '1.0.6');
  assert.equal(progress.STATS.length <= 20, true);
  assert.equal(progress.STATS.every((item) => item.monotonic === true), true);
});
