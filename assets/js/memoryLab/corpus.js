// MEMORY LAB — packs privados importados pelo usuário.
//
// O repositório não precisa redistribuir PDFs/edições. Um corpus preparado pode
// ser importado localmente como JSON e passa a coexistir com o seed público.
// Esta v1 usa localStorage; packs grandes devem ser migrados para IndexedDB em
// uma etapa futura.

import { LITERATURE_SEED } from './dataset.js';

const KEY = 'speedmemory.memory-lab.private-corpus.v1';
const memory = new Map();
let testingBackend = null;

function backend() {
  if (testingBackend) return testingBackend;
  return {
    getItem(k) {
      try {
        const v = localStorage.getItem(k);
        if (v !== null) return v;
      } catch (_) { /* ignore */ }
      return memory.get(k) ?? null;
    },
    setItem(k, v) {
      memory.set(k, v);
      try { localStorage.setItem(k, v); } catch (err) { throw new Error('O navegador não conseguiu armazenar este corpus localmente.'); }
    },
    removeItem(k) {
      memory.delete(k);
      try { localStorage.removeItem(k); } catch (_) { /* ignore */ }
    },
  };
}

export function getImportedPack() {
  const raw = backend().getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.stimuli)) return null;
    return parsed;
  } catch (_) { return null; }
}

export function getImportedStimuli() {
  return getImportedPack()?.stimuli || [];
}

export function allCorpusStimuli() {
  const merged = [...LITERATURE_SEED, ...getImportedStimuli()];
  const seen = new Set();
  return merged.filter((s) => {
    if (!s?.id || seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

function normalizeStimulus(s, packId, index) {
  const blocks = (s.blocks || []).map((x) => String(x).trim()).filter(Boolean);
  const anchors = Array.isArray(s.anchors) ? s.anchors : [];
  return {
    family: s.family || 'imported-real-text',
    packId,
    id: String(s.id || `${packId}-${index + 1}`),
    split: ['train', 'novel', 'holdout'].includes(s.split) ? s.split : 'train',
    source: String(s.source || 'Corpus importado'),
    chapter: String(s.chapter || ''),
    title: String(s.title || `Unidade ${index + 1}`),
    blocks,
    summary: s.summary ? String(s.summary) : null,
    semanticDistractors: Array.isArray(s.semanticDistractors) ? s.semanticDistractors.map(String) : [],
    anchors: anchors.map((a) => ({ text: String(a.text), block: Number(a.block) })).filter((a) => a.text && Number.isInteger(a.block)),
    facts: Array.isArray(s.facts) ? s.facts.map((f) => ({
      prompt: String(f.prompt || ''), answer: String(f.answer || ''),
      distractors: Array.isArray(f.distractors) ? f.distractors.map(String) : [],
    })).filter((f) => f.prompt && f.answer) : [],
    imported: true,
  };
}

export function importCorpusPack(input) {
  const pack = typeof input === 'string' ? JSON.parse(input) : input;
  if (!pack || !Array.isArray(pack.stimuli) || !pack.stimuli.length) throw new Error('JSON sem array stimuli.');
  const packId = String(pack.id || `private-${Date.now().toString(36)}`).replace(/[^a-zA-Z0-9._-]/g, '-');
  const stimuli = pack.stimuli.map((s, i) => normalizeStimulus(s, packId, i));

  // Um pack de páginas pode não ter gabarito semântico/fatos, mas precisa ter
  // topologia suficiente para One Shot/Page Capture. Modos Binding/Separation
  // filtram automaticamente unidades sem fatos relacionais.
  const errors = [];
  const ids = new Set(LITERATURE_SEED.map((s) => s.id));
  for (const s of stimuli) {
    if (ids.has(s.id)) errors.push(`id duplicado ou já usado: ${s.id}`);
    ids.add(s.id);
    if (s.blocks.length < 2) errors.push(`${s.id}: precisa de pelo menos 2 blocos`);
    if (s.anchors.length < 2) errors.push(`${s.id}: precisa de pelo menos 2 âncoras`);
    if (s.anchors.some((a) => a.block < 0 || a.block >= s.blocks.length)) errors.push(`${s.id}: âncora fora dos blocos`);
    for (const f of s.facts) {
      if ((f.distractors || []).length < 2) errors.push(`${s.id}: fato “${f.prompt}” precisa de 2+ distratores`);
    }
  }
  if (errors.length) throw new Error(errors.slice(0, 8).join('; '));

  const normalized = {
    version: 1,
    id: packId,
    label: String(pack.label || 'Corpus privado'),
    importedAt: new Date().toISOString(),
    stimuli,
  };
  backend().setItem(KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearImportedCorpus() {
  backend().removeItem(KEY);
}

export function setCorpusBackendForTesting(custom = null) {
  testingBackend = custom || {
    data: new Map(),
    getItem(k) { return this.data.has(k) ? this.data.get(k) : null; },
    setItem(k, v) { this.data.set(k, v); },
    removeItem(k) { this.data.delete(k); },
  };
}
