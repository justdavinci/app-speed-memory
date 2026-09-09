// Executa a suíte legada de forma estritamente sequencial.
//
// O tests/run.js original registra testes async com uma função `test` síncrona,
// então várias sessões podem correr ao mesmo tempo e compartilhar o backend em
// memória. Em CI isso produz interferência entre testes. Este launcher mantém a
// suíte intacta, gera uma cópia temporária no mesmo diretório (para preservar
// imports relativos) e troca apenas o harness por uma fila Promise sequencial.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(here, 'run.js');
const generatedPath = path.join(here, '.run-sequential.generated.js');

let source = await fs.readFile(sourcePath, 'utf8');

const oldHarness = `let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(\`  ok  \${name}\`);
  } catch (err) {
    failed++;
    console.error(\`FALHA  \${name}\\n       \${err.message}\`);
  }
}`;

const newHarness = `let passed = 0;
let failed = 0;
let testChain = Promise.resolve();

function test(name, fn) {
  testChain = testChain.then(async () => {
    try {
      await fn();
      passed++;
      console.log(\`  ok  \${name}\`);
    } catch (err) {
      failed++;
      console.error(\`FALHA  \${name}\\n       \${err.message}\`);
    }
  });
}`;

if (!source.includes(oldHarness)) {
  throw new Error('Harness de tests/run.js mudou; atualize tests/run-sequential.js.');
}
source = source.replace(oldHarness, newHarness);

const footer = `console.log(\`\\n\${passed} testes passaram, \${failed} falharam.\`);
process.exit(failed ? 1 : 0);`;
const sequentialFooter = `await testChain;
console.log(\`\\n\${passed} testes passaram, \${failed} falharam.\`);
process.exit(failed ? 1 : 0);`;

if (!source.includes(footer)) {
  throw new Error('Rodapé de tests/run.js mudou; atualize tests/run-sequential.js.');
}
source = source.replace(footer, sequentialFooter);

try {
  await fs.writeFile(generatedPath, source, 'utf8');
  await import(`${pathToFileURL(generatedPath).href}?v=${Date.now()}`);
} finally {
  await fs.rm(generatedPath, { force: true });
}
