// meta.v1 progress record. Same helper in every app.
(function (root) {
  function metaUpdate(slug, version, payload) {
    try {
      const incoming = payload || {};
      const key = 'meta.v1.' + slug;
      let prev = null;
      try {
        const raw = root.localStorage.getItem(key);
        if (raw) prev = JSON.parse(raw);
      } catch (e) {
        prev = null;
      }
      if (!prev || typeof prev !== 'object' || Array.isArray(prev)) prev = {};

      const stats = {};
      const src = incoming.stats && typeof incoming.stats === 'object' ? incoming.stats : {};
      const statKeys = Object.keys(src);
      for (let i = 0; i < statKeys.length; i++) {
        const k = statKeys[i];
        const n = src[k];
        if (typeof n === 'number' && Number.isFinite(n)) stats[k] = n;
      }

      const hitos = {};
      if (prev.hitos && typeof prev.hitos === 'object' && !Array.isArray(prev.hitos)) {
        const prevIds = Object.keys(prev.hitos);
        for (let i = 0; i < prevIds.length; i++) {
          const id = prevIds[i];
          if (typeof prev.hitos[id] === 'string' && prev.hitos[id]) hitos[id] = prev.hitos[id];
        }
      }

      const ids = new Set();
      if (Array.isArray(prev.logros)) {
        for (let i = 0; i < prev.logros.length; i++) {
          const id = prev.logros[i];
          if (typeof id === 'string' && id) ids.add(id);
        }
      }
      const kept = Object.keys(hitos);
      for (let i = 0; i < kept.length; i++) ids.add(kept[i]);

      const now = new Date().toISOString();
      const logrosIn = Array.isArray(incoming.logros) ? incoming.logros : [];
      for (let i = 0; i < logrosIn.length; i++) {
        const id = logrosIn[i];
        if (typeof id !== 'string' || !id) continue;
        if (!ids.has(id)) {
          ids.add(id);
          if (typeof hitos[id] !== 'string') hitos[id] = now;
        }
      }
      ids.forEach(function (id) {
        if (typeof hitos[id] !== 'string') hitos[id] = now;
      });

      const logros = Array.from(ids).sort();
      const hitosOut = {};
      for (let i = 0; i < logros.length; i++) hitosOut[logros[i]] = hitos[logros[i]];

      const record = {
        v: 1,
        slug: slug,
        version: version,
        updatedAt: now,
        stats: stats,
        logros: logros,
        hitos: hitosOut
      };
      root.localStorage.setItem(key, JSON.stringify(record));
      try {
        const w = root.window;
        if (w && w.parent !== w) {
          w.parent.postMessage({ type: 'meta', key: key, data: record }, root.location.origin);
        }
      } catch (e) {}
      return record;
    } catch (e) {
      return null;
    }
  }

  root.metaUpdate = metaUpdate;
  if (typeof module !== 'undefined' && module.exports) module.exports = { metaUpdate: metaUpdate };
})(typeof globalThis !== 'undefined' ? globalThis : this);
