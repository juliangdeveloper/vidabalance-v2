// meta.v1 progress record. Same helper in every app.
(function (root) {
  const gate = { last: 0, pending: null, timer: null, bound: false };

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
    const record = buildRecord(job.slug, job.version, job.payload, prev);
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

  function onHide() {
    try {
      if (isDemo() || !gate.pending) return;
      if (waitLeft() > 0) return;
      commit();
    } catch (e) {}
  }

  function bind() {
    if (gate.bound) return;
    let target = null;
    const w = root.window;
    if (w && typeof w.addEventListener === 'function') target = w;
    else if (typeof root.addEventListener === 'function') target = root;
    if (!target) return;
    target.addEventListener('pagehide', onHide);
    target.addEventListener('beforeunload', onHide);
    gate.bound = true;
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
    module.exports = { metaUpdate: metaUpdate, metaReset: metaReset };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
