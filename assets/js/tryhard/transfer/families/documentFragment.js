// Tier 3 — documentos.
//
// Recibos, tabelas, crachás e formulários. Aqui aparece a primeira estrutura
// bidimensional de verdade: uma tabela tem linha e coluna, e a mesma pergunta
// ("o que estava logo à direita") passa a fazer sentido de novo — só que sobre
// conteúdo com significado, não sobre dígitos soltos.

import { createScene, element } from '../scene.js';
import {
  CITIES, DEPARTMENTS, PEOPLE, PRODUCTS, SECTIONS, UNITS,
  code, dateLabel, money, timeLabel,
} from '../vocab.js';
import { densityFor, esc, pickVariant, rInt, rPick, rSample, wrap } from './util.js';

const TEMPLATES = [
  { id: 'recibo', label: 'Recibo' },
  { id: 'tabela', label: 'Tabela' },
  { id: 'cracha', label: 'Crachá' },
  { id: 'bilhete', label: 'Bilhete', holdout: true },
  { id: 'formulario', label: 'Formulário', holdout: true },
];

/* -------------------------------- recibo -------------------------------- */

function receipt(count, rng, variant) {
  const names = rSample(rng, PRODUCTS, count);
  const rows = names.map((label) => {
    const qty = rInt(rng, 1, 6);
    const price = rInt(rng, 180, 3900) / 100;
    return { label, qty, price, value: money(price), numeric: price };
  });
  const total = rows.reduce((a, r) => a + r.qty * r.price, 0);
  const html = `<div class="th-sc__doc">
      <div class="th-sc__doc-head">${esc(rPick(rng, ['Mercado Sul', 'Loja Central', 'Empório Vila', 'Casa & Cia']))}</div>
      <div class="th-sc__doc-sub">${esc(dateLabel(rInt(rng, 1, 28), rInt(rng, 1, 12)))} · cupom ${esc(code(rng, 4))}</div>
      <div class="th-sc__table" style="--cols:3">
        ${rows.map((r) => `<span class="th-sc__td">${esc(r.label)}</span>`
          + `<span class="th-sc__td th-sc__td--num">${r.qty}</span>`
          + `<span class="th-sc__td th-sc__td--num">${esc(r.value)}</span>`).join('')}
      </div>
      <div class="th-sc__doc-total"><span>Total</span><span>${esc(money(total))}</span></div>
    </div>`;
  const elements = rows.map((r, i) => element({
    id: `d${i}`,
    label: r.label,
    value: r.value,
    numeric: r.numeric,
    category: 'item',
    attribute: r.qty > 3 ? 'muitas unidades' : 'poucas unidades',
    row: i,
    col: 0,
    kind: 'row',
  }));
  return { html, elements, rows: rows.length, cols: 1, title: 'Recibo', variantUsed: variant };
}

/* -------------------------------- tabela -------------------------------- */

function table(count, rng) {
  const cols = Math.min(4, Math.max(2, Math.round(Math.sqrt(count))));
  const rows = Math.max(2, Math.ceil(count / cols));
  const headers = rSample(rng, ['Cód.', 'Qtd.', 'Setor', 'Turno', 'Sala', 'Valor'], cols);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const header = headers[c];
      let value;
      let numeric = null;
      if (header === 'Cód.') value = code(rng, 3);
      else if (header === 'Valor') { numeric = rInt(rng, 12, 480); value = money(numeric); }
      else if (header === 'Qtd.' || header === 'Sala') { numeric = rInt(rng, 1, 99); value = String(numeric); }
      else if (header === 'Setor') value = rPick(rng, SECTIONS);
      else value = rPick(rng, ['manhã', 'tarde', 'noite']);
      cells.push({ row: r, col: c, header, value, numeric });
    }
  }
  const html = `<div class="th-sc__doc">
      <div class="th-sc__table th-sc__table--head" style="--cols:${cols}">
        ${headers.map((h) => `<span class="th-sc__th">${esc(h)}</span>`).join('')}
        ${cells.map((c) => `<span class="th-sc__td">${esc(c.value)}</span>`).join('')}
      </div>
    </div>`;
  const elements = cells.map((c, i) => element({
    id: `t${i}`,
    label: `${c.header} da linha ${c.row + 1}`,
    value: c.value,
    numeric: c.numeric,
    category: c.header,
    row: c.row,
    col: c.col,
    kind: 'cell',
  }));
  return { html, elements, rows, cols, title: 'Tabela' };
}

/* -------------------------------- crachá -------------------------------- */

function badge(count, rng) {
  const person = rPick(rng, PEOPLE);
  const fields = [
    ['Nome', person, null],
    ['Setor', rPick(rng, DEPARTMENTS), null],
    ['Matrícula', code(rng, 5), null],
    ['Cidade', rPick(rng, CITIES), null],
    ['Andar', String(rInt(rng, 1, 18)), rInt(rng, 1, 18)],
    ['Validade', dateLabel(rInt(rng, 1, 28), rInt(rng, 1, 12)), null],
    ['Acesso', rPick(rng, ['total', 'restrito', 'visitante']), null],
  ].slice(0, Math.max(3, Math.min(7, count)));

  const html = `<div class="th-sc__card">
      <div class="th-sc__card-photo">${esc(person.slice(0, 2).toUpperCase())}</div>
      <div class="th-sc__card-fields">
        ${fields.map(([k, v]) => `<span class="th-sc__field"><b>${esc(k)}</b>${esc(v)}</span>`).join('')}
      </div>
    </div>`;
  const elements = fields.map(([k, v, n], i) => element({
    id: `b${i}`, label: k, value: v, numeric: n, category: 'campo', row: i, col: 0, kind: 'field',
  }));
  return { html, elements, rows: fields.length, cols: 1, title: 'Crachá' };
}

/* ------------------------------- bilhete -------------------------------- */

function ticket(count, rng) {
  const fields = [
    ['Origem', rPick(rng, CITIES), null],
    ['Destino', rPick(rng, CITIES), null],
    ['Portão', code(rng, 2), null],
    ['Assento', `${rInt(rng, 1, 40)}${rPick(rng, ['A', 'B', 'C', 'D'])}`, null],
    ['Embarque', timeLabel(rInt(rng, 5, 23), rPick(rng, [5, 20, 35, 50])), null],
    ['Poltronas', String(rInt(rng, 20, 60)), rInt(rng, 20, 60)],
  ].slice(0, Math.max(3, Math.min(6, count)));

  const html = `<div class="th-sc__ticket">
      ${fields.map(([k, v]) => `<span class="th-sc__ticket-cell"><b>${esc(k)}</b>${esc(v)}</span>`).join('')}
      <span class="th-sc__ticket-stub">${esc(code(rng, 6))}</span>
    </div>`;
  const elements = fields.map(([k, v, n], i) => element({
    id: `k${i}`, label: k, value: v, numeric: n, category: 'campo', row: Math.floor(i / 2), col: i % 2, kind: 'field',
  }));
  return { html, elements, rows: Math.ceil(fields.length / 2), cols: 2, title: 'Bilhete' };
}

/* ------------------------------ formulário ------------------------------ */

function form(count, rng) {
  const options = [
    ['Nome', () => rPick(rng, PEOPLE)],
    ['Produto', () => rPick(rng, PRODUCTS)],
    ['Quantidade', () => String(rInt(rng, 1, 40))],
    ['Unidade', () => rPick(rng, UNITS)],
    ['Setor', () => rPick(rng, SECTIONS)],
    ['Entrega', () => dateLabel(rInt(rng, 1, 28), rInt(rng, 1, 12))],
    ['Observação', () => rPick(rng, ['urgente', 'sem pressa', 'frágil', 'retirar'])],
  ];
  const fields = rSample(rng, options, Math.max(3, Math.min(7, count)));
  const filled = fields.map(([k, make]) => {
    const v = make();
    return { label: k, value: v, numeric: /^\d+$/.test(v) ? Number(v) : null };
  });
  const html = `<div class="th-sc__form">
      ${filled.map((f) => `<label class="th-sc__form-field"><span>${esc(f.label)}</span>`
        + `<span class="th-sc__input">${esc(f.value)}</span></label>`).join('')}
    </div>`;
  const elements = filled.map((f, i) => element({
    id: `f${i}`, label: f.label, value: f.value, numeric: f.numeric, category: 'campo', row: i, col: 0, kind: 'field',
  }));
  return { html, elements, rows: filled.length, cols: 1, title: 'Formulário' };
}

const BUILDERS = {
  recibo: receipt, tabela: table, cracha: badge, bilhete: ticket, formulario: form,
};

export default {
  id: 'document-fragment',
  name: 'Documentos',
  tier: 3,
  blurb: 'Recibos, tabelas, crachás e formulários.',
  templates: TEMPLATES,

  generate({ difficulty, rng, templateId = 'recibo', variantAmount = 0.5 }) {
    const template = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];
    const count = densityFor(difficulty, { min: 3, max: 9, base: 5 });
    const variant = pickVariant(rng, variantAmount);
    const built = (BUILDERS[template.id] || receipt)(count, rng, variant);

    const used = new Set(built.elements.map((e) => e.label));
    const pool = [...PRODUCTS, ...PEOPLE, ...CITIES, 'Cód.', 'Turno', 'Placa']
      .filter((v) => !used.has(v));

    return createScene({
      familyId: 'document-fragment',
      templateId: template.id,
      templateLabel: template.label,
      tier: 3,
      title: built.title,
      elements: built.elements,
      distractors: rSample(rng, pool, 6),
      variant,
      layout: { kind: built.cols > 1 ? 'grid' : 'rows', rows: built.rows, cols: built.cols },
      attributeNoun: 'a quantidade',
      queryKinds: built.cols > 1
        ? ['value', 'label', 'position', 'neighbor', 'count', 'extreme', 'compare', 'presence', 'absent']
        : ['value', 'label', 'attribute', 'count', 'extreme', 'compare', 'presence', 'absent'],
      html: wrap(built.html, { variant, kind: 'doc' }),
    });
  },
};
