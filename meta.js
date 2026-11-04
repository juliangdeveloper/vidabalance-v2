(function (root) {
  const gate = { last: 0, pending: null, timer: null, bound: false };

  var FASE = Object.freeze({ IDEA: 1, DEFINICION: 2, DISENO: 3, CONSTRUCCION: 4, VALIDACION: 5, LANZAMIENTO_Y_MANTENIMIENTO: 6, DESCARTADA: 7 });
  var ESTADO_FASE = Object.freeze({ PENDIENTE: 0, EN_CURSO: 1, BLOQUEADA: 2, EN_REVISION: 3, COMPLETADA: 4 });
  var TIPO_STAT = Object.freeze({ TOTAL_ACUMULADO: 'total_acumulado', MEJOR_MARCA: 'mejor_marca', VALOR_ACTUAL: 'valor_actual' });
  var TIPO_PROYECTO = Object.freeze({ PROYECTO: 'proyecto', AREA: 'area', RECURSO: 'recurso', ARCHIVO: 'archivo' });

  const PROYECTO = {
    objetivo: 'En algún momento pensé que era una buena idea, pero tal vez te sirva de inspiración.',
    fase: FASE.DESCARTADA,
    fase_estado: ESTADO_FASE.COMPLETADA,
    fases_completadas: 2,
    tipo: TIPO_PROYECTO.AREA,
    aportes: [
      { stat: 'Programación', exp: 5, fuente: 'creacion' },
      { stat: 'Diseño', exp: 7, fuente: 'creacion' },
      { stat: 'Planificación', exp: 20, fuente: 'uso' }
    ]
  };

  let proyectoSource = PROYECTO;

  function proyectoInt(n, lo, hi) {
    return typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
  }

  function enumValido(enumeracion, valor) {
    return Object.values(enumeracion).indexOf(valor) !== -1;
  }

  function statConservaMaximo(tipo) {
    return tipo === TIPO_STAT.TOTAL_ACUMULADO || tipo === TIPO_STAT.MEJOR_MARCA;
  }

  function statsDeclarados(stats) {
    if (Array.isArray(stats)) return stats;
    if (!stats || typeof stats !== 'object') return [];
    return Object.keys(stats).map(function (key) { return { key: key, tipo: stats[key] && stats[key].tipo }; });
  }

  const APORTE_STAT_MAX = 32;
  const APORTE_EXP_MAX = 99;

  function aportesValidos(lista) {
    if (!Array.isArray(lista)) return null;
    const out = [];
    const seen = {};
    for (let i = 0; i < lista.length; i++) {
      const it = lista[i];
      if (!it || typeof it !== 'object' || Array.isArray(it)) return null;
      const stat = it.stat;
      const exp = it.exp;
      const fuente = it.fuente;
      if (typeof stat !== 'string' || !stat.trim() || stat !== stat.trim() || Array.from(stat).length > APORTE_STAT_MAX) return null;
      if (fuente !== 'creacion' && fuente !== 'uso') return null;
      if (!(proyectoInt(exp, 1, APORTE_EXP_MAX))) return null;
      const key = stat + '\n' + fuente;
      if (seen[key]) return null;
      if (Object.keys(it).length !== 3) return null;
      seen[key] = true;
      out.push({ stat: stat, exp: exp, fuente: fuente });
    }
    return out;
  }

  function metaProyecto(p) {
    try {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
      const o = p.objetivo;
      if (typeof o !== 'string' || !o.trim() || Array.from(o).length > 140) return null;
      if (!enumValido(FASE, p.fase) || !enumValido(ESTADO_FASE, p.fase_estado) || !proyectoInt(p.fases_completadas, 0, FASE.LANZAMIENTO_Y_MANTENIMIENTO)) return null;
      if (p.tipo !== undefined && !enumValido(TIPO_PROYECTO, p.tipo)) return null;
      const bloque = { objetivo: o, fase: p.fase, fase_estado: p.fase_estado, fases_completadas: p.fases_completadas };
      if (p.tipo !== undefined) bloque.tipo = p.tipo;
      if (p.bloqueada === true) bloque.bloqueada = true;
      if (p.aportes !== undefined) {
        const aportes = aportesValidos(p.aportes);
        if (!aportes) return null;
        bloque.aportes = aportes;
      }
      return bloque;
    } catch (e) {
      return null;
    }
  }

  function metaSetProyecto(p) {
    proyectoSource = p === null ? PROYECTO : p;
  }

  function metaDeclararProyecto(slug, version) {
    try {
      const store = globalThis.localStorage;
      if (!store || !slug) return null;
      const clave = 'meta.v1.' + slug;
      const raw = store.getItem(clave);
      let base = null;
      if (raw != null && raw !== '') {
        try {
          const previo = JSON.parse(raw);
          if (previo && typeof previo === 'object' && !Array.isArray(previo) && previo.v === 1 && previo.slug === slug) base = previo;
        } catch (e) {
          base = null;
        }
        if (!base) store.setItem(clave + '.corrupt', String(raw));
      }
      if (!base) base = { v: 1, slug: slug, version: String(version == null ? '' : version).replace(/^[vV]/, ''), updatedAt: new Date().toISOString(), stats: {}, logros: [], hitos: {} };
      const p = metaProyecto(proyectoSource);
      if (p) base.proyecto = p;
      const texto = JSON.stringify(base);
      if (texto !== raw) {
        store.setItem(clave, texto);
        if (typeof window !== 'undefined' && window.parent && window.parent !== window) window.parent.postMessage({ type: 'meta', key: clave, data: base }, location.origin);
      }
      return base;
    } catch (e) {
      return null;
    }
  }

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
    if (payload.declared && typeof payload.declared === 'object') return statsDeclarados(payload.declared);
    return Object.keys(src).map(function (key) { return { key: key, tipo: TIPO_STAT.VALOR_ACTUAL }; });
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
      const conservaMaximo = !!(item && typeof item === 'object' && statConservaMaximo(item.tipo));
      const incoming = src[key];
      const hasNew = typeof incoming === 'number' && Number.isFinite(incoming);
      const old = prevStats[key];
      const hasOld = typeof old === 'number' && Number.isFinite(old);
      if (!hasNew && !hasOld) continue;
      if (!hasNew) stats[key] = old;
      else if (conservaMaximo && hasOld) stats[key] = incoming > old ? incoming : old;
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
    if (!gate.pending) return null;
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
      gate.pending = { slug: slug, version: plainVersion(version), payload: payload || {} };
      return commit();
    } catch (e) {
      return null;
    }
  }

  root.metaUpdate = metaUpdate;
  root.metaReset = metaReset;
  root.FASE = FASE;
  root.ESTADO_FASE = ESTADO_FASE;
  root.TIPO_STAT = TIPO_STAT;
  root.TIPO_PROYECTO = TIPO_PROYECTO;
  root.enumValido = enumValido;
  root.statConservaMaximo = statConservaMaximo;
  root.statsDeclarados = statsDeclarados;
  root.metaDeclararProyecto = metaDeclararProyecto;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      metaUpdate: metaUpdate,
      metaReset: metaReset,
      metaProyecto: metaProyecto,
      metaSetProyecto: metaSetProyecto,
      metaDeclararProyecto: metaDeclararProyecto,
      PROYECTO: PROYECTO,
      FASE: FASE,
      ESTADO_FASE: ESTADO_FASE,
      TIPO_STAT: TIPO_STAT,
      TIPO_PROYECTO: TIPO_PROYECTO,
      enumValido: enumValido,
      statConservaMaximo: statConservaMaximo,
      statsDeclarados: statsDeclarados
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
