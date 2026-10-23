// meta.v1 progress record. Same helper in every app.
(function (root) {
  const gate = { last: 0, pending: null, timer: null, bound: false };

  // Project status, set by hand and bumped with the version. Never computed from play.
  // fase 1-6: Idea, Definición, Diseño, Construcción, Validación, Lanzamiento y mantenimiento.
  // fase_estado 0-4: pendiente, en curso, bloqueada, en revisión, completada.
  const PROYECTO = {
    objetivo: 'Juego de mesa digital para 2 a 4 jugadores, humanos o IA, sobre repartir tiempo y energía para ganar felicidad.',
    fase: 6,
    fase_estado: 1,
    fases_completadas: 5
  };

  let proyectoSource = PROYECTO;

  function proyectoInt(n, lo, hi) {
    return typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
  }

  // Clean copy of a proyecto block, or null when any field is missing or out of range.
  function metaProyecto(p) {
    try {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
      const o = p.objetivo;
      if (typeof o !== 'string' || !o.trim() || Array.from(o).length > 140) return null;
      if (!proyectoInt(p.fase, 1, 6) || !proyectoInt(p.fase_estado, 0, 4) || !proyectoInt(p.fases_completadas, 0, 6)) return null;
      return { objetivo: o, fase: p.fase, fase_estado: p.fase_estado, fases_completadas: p.fases_completadas };
    } catch (e) {
      return null;
    }
  }

  // Tests only: swap the block the writer uses (null restores PROYECTO).
  function metaSetProyecto(p) {
    proyectoSource = p === null ? PROYECTO : p;
  }

  // Adds the current proyecto block to a record being written, when it is valid.
  function withProyecto(record) {
    const p = metaProyecto(proyectoSource);
    if (p) record.proyecto = p;
    return record;
  }

  function metaReset() {
    if (gate.timer) {
      try { clearTimeout(gate.timer); } catch (e) {}
      gate.timer = null;
    }
    gate.last = 0;
    gate.pending = null;
  }

  function isDemo() {
    try {
      const search = root.location && typeof root.location.search === 'string' ? root.location.search : '';
      return /(?:\?|&)(?:demo|preview)=1(?:&|$)/.test(search);
    } catch (e) {
      return false;
    }
  }

  function plainVersion(version) {
    if (typeof version === 'string' && version.charAt(0) === 'v' && version.charAt(1) >= '0' && version.charAt(1) <= '9') {
      return version.slice(1);
    }
    return version;
  }

  function recordValid(parsed, slug) {
    return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.v === 1 && parsed.slug === slug;
  }

  function declaredList(payload) {
    const src = payload.stats && typeof payload.stats === 'object' && !Array.isArray(payload.stats) ? payload.stats : {};
    if (Array.isArray(payload.declared)) return payload.declared;
    return Object.keys(src).map(function (key) { return { key: key, monotonic: false }; });
  }

  function buildRecord(slug, version, payload, prev) {
    const src = payload.stats && typeof payload.stats === 'object' && !Array.isArray(payload.stats) ? payload.stats : {};
    const prevStats = prev && prev.stats && typeof prev.stats === 'object' && !Array.isArray(prev.stats) ? prev.stats : {};
    const declared = declaredList(payload);
    const stats = {};
    const seen = new Set();
    let kept = 0;
    for (let i = 0; i < declared.length && kept < 20; i++) {
      const item = declared[i];
      const key = item && typeof item.key === 'string' ? item.key : (typeof item === 'string' ? item : '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      kept++;
      const monotonic = !!(item && typeof item === 'object' && item.monotonic);
      const incoming = src[key];
      const hasNew = typeof incoming === 'number' && Number.isFinite(incoming);
      const old = prevStats[key];
      const hasOld = typeof old === 'number' && Number.isFinite(old);
      if (!hasNew && !hasOld) continue;
      if (!hasNew) stats[key] = old;
      else if (monotonic && hasOld) stats[key] = incoming > old ? incoming : old;
      else stats[key] = incoming;
    }

    const hitos = {};
    if (prev && prev.hitos && typeof prev.hitos === 'object' && !Array.isArray(prev.hitos)) {
      const prevIds = Object.keys(prev.hitos);
      for (let i = 0; i < prevIds.length; i++) {
        const id = prevIds[i];
        if (typeof prev.hitos[id] === 'string' && prev.hitos[id]) hitos[id] = prev.hitos[id];
      }
    }
    const ids = new Set();
    if (prev && Array.isArray(prev.logros)) {
      for (let i = 0; i < prev.logros.length; i++) {
        const id = prev.logros[i];
        if (typeof id === 'string' && id) ids.add(id);
      }
    }
    const keptIds = Object.keys(hitos);
    for (let i = 0; i < keptIds.length; i++) ids.add(keptIds[i]);

    const now = new Date().toISOString();
    const logrosIn = Array.isArray(payload.logros) ? payload.logros : [];
    for (let i = 0; i < logrosIn.length; i++) {
      const id = logrosIn[i];
      if (typeof id !== 'string' || !id || ids.has(id)) continue;
      ids.add(id);
      if (typeof hitos[id] !== 'string') hitos[id] = now;
    }
    ids.forEach(function (id) {
      if (typeof hitos[id] !== 'string') hitos[id] = now;
    });
    const logros = Array.from(ids).sort();
    const hitosOut = {};
    for (let i = 0; i < logros.length; i++) hitosOut[logros[i]] = hitos[logros[i]];

    return {
      v: 1,
      slug: slug,
      version: version,
      updatedAt: now,
      stats: stats,
      logros: logros,
      hitos: hitosOut
    };
  }

  function writeNow(job) {
    const key = 'meta.v1.' + job.slug;
    let raw = null;
    let prev = null;
    try { raw = root.localStorage.getItem(key); } catch (e) { raw = null; }
    if (raw !== null) {
      let parsed = null;
      let ok = false;
      try {
        parsed = JSON.parse(raw);
        ok = recordValid(parsed, job.slug);
      } catch (e) {
        ok = false;
      }
      if (!ok) {
        try { root.localStorage.setItem(key + '.corrupt', raw); } catch (e) {}
      } else {
        prev = parsed;
      }
    }
    const record = withProyecto(buildRecord(job.slug, job.version, job.payload, prev));
    root.localStorage.setItem(key, JSON.stringify(record));
    try {
      const w = root.window;
      if (w && w.parent !== w) {
        w.parent.postMessage({ type: 'meta', key: key, data: record }, root.location.origin);
      }
    } catch (e) {}
    return record;
  }

  function waitLeft() {
    if (!gate.last) return 0;
    const left = 1000 - (Date.now() - gate.last);
    return left > 0 ? left : 0;
  }

  function arm(wait) {
    if (gate.timer) return;
    gate.timer = setTimeout(function () {
      gate.timer = null;
      commit();
    }, wait);
  }

  function commit() {
    if (isDemo()) { gate.pending = null; return null; }
    if (!gate.pending) return null;
    const wait = waitLeft();
    if (wait > 0) { arm(wait); return null; }
    const job = gate.pending;
    gate.pending = null;
    if (gate.timer) {
      try { clearTimeout(gate.timer); } catch (e) {}
      gate.timer = null;
    }
    const record = writeNow(job);
    gate.last = Date.now();
    return record;
  }

  function flushPending() {
    if (isDemo() || !gate.pending) return null;
    const job = gate.pending;
    gate.pending = null;
    if (gate.timer) {
      try { clearTimeout(gate.timer); } catch (e) {}
      gate.timer = null;
    }
    const record = writeNow(job);
    gate.last = Date.now();
    return record;
  }

  function onHide() {
    try { flushPending(); } catch (e) {}
  }

  function onVisibility() {
    try {
      const doc = root.document;
      if (!doc || doc.visibilityState !== 'hidden') return;
      flushPending();
    } catch (e) {}
  }

  function bind() {
    if (!gate.bound) {
      let target = null;
      const w = root.window;
      if (w && typeof w.addEventListener === 'function') target = w;
      else if (typeof root.addEventListener === 'function') target = root;
      if (target) {
        target.addEventListener('pagehide', onHide);
        target.addEventListener('beforeunload', onHide);
        gate.bound = true;
      }
    }
    if (!gate.visBound) {
      const doc = root.document;
      if (doc && typeof doc.addEventListener === 'function') {
        doc.addEventListener('visibilitychange', onVisibility);
        gate.visBound = true;
      }
    }
  }

  function metaUpdate(slug, version, payload) {
    try {
      bind();
      if (isDemo()) return null;
      gate.pending = { slug: slug, version: plainVersion(version), payload: payload || {} };
      return commit();
    } catch (e) {
      return null;
    }
  }

  root.metaUpdate = metaUpdate;
  root.metaReset = metaReset;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      metaUpdate: metaUpdate,
      metaReset: metaReset,
      metaProyecto: metaProyecto,
      metaSetProyecto: metaSetProyecto,
      PROYECTO: PROYECTO
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
