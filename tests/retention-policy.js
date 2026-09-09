import assert from 'node:assert/strict';
import { retentionActiveFor } from '../assets/js/tryhard/retention.js';

const settings = { enabled: true, share: 1 };

assert.equal(retentionActiveFor('partial-report', settings), true);
assert.equal(retentionActiveFor('iconic-readout', settings), true);
assert.equal(retentionActiveFor('peripheral-matrix', settings), true);
assert.equal(
  retentionActiveFor('mask-resistance', settings),
  false,
  'Retenção pura não deve ser misturada ao protocolo de interferência visual',
);

console.log('\n4 testes de política de retenção passaram.');
