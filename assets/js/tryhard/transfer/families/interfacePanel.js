// Tier 2 — interfaces.
//
// A informação passa a vir arrumada como um aplicativo: itens de menu com
// contador, listas com estado, abas, chaves ligadas e desligadas. O olho
// precisa lidar com hierarquia visual — título, badge, ícone — e não só com
// pares rótulo/valor.

import { createScene, element } from '../scene.js';
import {
  APP_ITEMS, COLOR_NAMES, DEPARTMENTS, PEOPLE, PRIORITIES, SHORT_STATES, STATUSES,
  timeLabel,
} from '../vocab.js';
import { densityFor, esc, pickVariant, rInt, rPick, rSample, wrap } from './util.js';

const TEMPLATES = [
  { id: 'painel', label: 'Painel com contadores' },
  { id: 'lista', label: 'Lista de tarefas' },
  { id: 'abas', label: 'Abas' },
  { id: 'ajustes', label: 'Ajustes', holdout: true },
  { id: 'notificacoes', label: 'Notificações', holdout: true },
];

function buildItems(templateId, count, rng) {
  switch (templateId) {
    case 'lista': {
      const names = rSample(rng, APP_ITEMS, count);
      return names.map((label) => ({
        label,
        value: timeLabel(rInt(rng, 7, 21), rPick(rng, [0, 15, 30, 45])),
        attribute: rPick(rng, PRIORITIES),
        category: 'tarefa',
      }));
    }
    case 'abas': {
      const names = rSample(rng, DEPARTMENTS, count);
      return names.map((label) => {
        const n = rInt(rng, 0, 24);
        return { label, value: String(n), numeric: n, attribute: rPick(rng, ['ativa', 'inativa']), category: 'aba' };
      });
    }
    case 'ajustes': {
      const names = rSample(rng, [
        'Notificações', 'Som', 'Modo escuro', 'Sincronizar', 'Localização',
        'Backup', 'Vibrar', 'Dados móveis', 'Leitura offline',
      ], count);
      return names.map((label) => {
        const on = rng() < 0.5;
        return { label, value: on ? 'ligado' : 'desligado', attribute: on ? 'ligado' : 'desligado', category: 'ajuste' };
      });
    }
    case 'notificacoes': {
      const names = rSample(rng, PEOPLE, count);
      return names.map((label) => {
        const n = rInt(rng, 1, 9);
        return {
          label,
          value: `${n} nova${n > 1 ? 's' : ''}`,
          numeric: n,
          attribute: rPick(rng, ['lida', 'não lida']),
          category: 'aviso',
        };
      });
    }
    default: {
      const names = rSample(rng, APP_ITEMS, count);
      return names.map((label) => {
        const n = rInt(rng, 0, 99);
        return {
          label,
          value: String(n),
          numeric: n,
          attribute: rPick(rng, STATUSES),
          category: rPick(rng, COLOR_NAMES),
        };
      });
    }
  }
}

function itemMarkup(items, templateId) {
  if (templateId === 'abas') {
    return `<div class="th-sc__tabs">${items.map((it) => (
      `<span class="th-sc__tab${it.attribute === 'ativa' ? ' is-active' : ''}">`
      + `${esc(it.label)}<i class="th-sc__badge">${esc(it.value)}</i></span>`
    )).join('')}</div>`;
  }
  if (templateId === 'ajustes') {
    return `<div class="th-sc__list">${items.map((it) => (
      `<div class="th-sc__item"><span class="th-sc__label">${esc(it.label)}</span>`
      + `<span class="th-sc__switch" data-on="${it.attribute === 'ligado' ? '1' : '0'}"></span></div>`
    )).join('')}</div>`;
  }
  return `<div class="th-sc__list">${items.map((it) => (
    `<div class="th-sc__item"><span class="th-sc__dot" data-tone="${esc(it.attribute || '')}"></span>`
    + `<span class="th-sc__label">${esc(it.label)}</span>`
    + (it.attribute ? `<span class="th-sc__tag">${esc(it.attribute)}</span>` : '')
    + `<i class="th-sc__badge">${esc(it.value)}</i></div>`
  )).join('')}</div>`;
}

export default {
  id: 'interface-panel',
  name: 'Interfaces',
  tier: 2,
  blurb: 'Painéis, listas e estados como os de um aplicativo.',
  templates: TEMPLATES,

  generate({ difficulty, rng, templateId = 'painel', variantAmount = 0.5 }) {
    const template = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];
    const count = densityFor(difficulty, { min: 3, max: 8, base: 5 });
    const items = buildItems(template.id, count, rng);
    const variant = pickVariant(rng, variantAmount);
    if (variant.reversed) items.reverse();

    const elements = items.map((it, i) => element({
      id: `i${i}`,
      label: it.label,
      value: it.value,
      numeric: it.numeric ?? null,
      category: it.category,
      attribute: it.attribute,
      row: i,
      col: 0,
      kind: 'item',
    }));

    const used = new Set(items.map((it) => it.label));
    const pool = [...APP_ITEMS, ...DEPARTMENTS, ...PEOPLE].filter((v) => !used.has(v));
    const header = rPick(rng, ['Resumo', 'Hoje', 'Painel', 'Visão geral', 'Caixa de entrada']);

    return createScene({
      familyId: 'interface-panel',
      templateId: template.id,
      templateLabel: template.label,
      tier: 2,
      title: header,
      elements,
      distractors: rSample(rng, pool, 6),
      variant,
      layout: { kind: 'rows', rows: items.length, cols: 1 },
      attributeNoun: template.id === 'ajustes' ? 'o estado' : 'a situação',
      queryKinds: ['value', 'label', 'attribute', 'count', 'extreme', 'compare', 'presence', 'absent'],
      html: wrap(
        `<div class="th-sc__chrome"><span class="th-sc__bullet"></span>`
        + `<span class="th-sc__chrome-title">${esc(header)}</span></div>`
        + itemMarkup(items, template.id),
        { variant, kind: 'panel' },
      ),
    });
  },
};
