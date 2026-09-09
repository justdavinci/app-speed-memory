# Auditoria de Mensuração Cognitiva v2

**Projeto:** PiscaMemory / Try Hard  
**Branch de implementação:** `audit/cognitive-measurement-v2`  
**Base auditada:** `215d098db7964109fc326472f2c7186509ad7876`  
**Objetivo:** aumentar a validade interna das métricas de captura, disponibilidade visual e transferência, sem transformar índices internos do app em alegações neurocientíficas.

---

## 1. Resumo executivo

A arquitetura atual é forte: temporização sincronizada com frames, dificuldade multidimensional, módulos independentes, persistência, benchmarks e uma tentativa explícita de medir transferência e disponibilidade. O principal risco encontrado não era de engenharia de interface, mas de **validade de mensuração**.

Os problemas mais importantes encontrados foram:

1. modelos marcados como `holdout` podiam aparecer durante treino normal;
2. o Transfer Gap podia confundir material novo mais difícil com falha de transferência;
3. o T80 agrupava pelo atraso solicitado em vez do atraso realmente entregue pela tela;
4. a curva do T80 não tinha infraestrutura para piso de acerto ao acaso;
5. benchmark e treino ainda compartilham comportamento de feedback trial-a-trial;
6. disponibilidade ainda pode misturar condições cognitivas diferentes dentro da mesma categoria;
7. Mask Resistance e Visual Availability ainda não possuem métricas semanticamente separadas;
8. o detector de fadiga ainda pode confundir aumento de dificuldade com queda fisiológica/cognitiva;
9. o currículo global recomenda pesos, mas ainda não possui modo automático controlado;
10. Page Capture e Temporal Processing, discutidos posteriormente, ainda não existem como módulos próprios.

Esta branch implementa imediatamente as correções de **integridade de dados** que podem ser feitas sem redesenhar toda a experiência. O restante está especificado abaixo em ordem de prioridade.

---

# 2. Princípios obrigatórios daqui para frente

## 2.1 Medir o que realmente aconteceu

Nunca usar apenas um tempo solicitado quando o app mediu o tempo real entregue pela tela. Para qualquer métrica temporal:

- `requested*` = intenção do protocolo;
- `actual*` = fenômeno físico realmente entregue;
- análise usa `actual*` quando existe;
- `requested*` fica como metadado e fallback.

## 2.2 Não promover precisão falsa

Se não houver amostra suficiente, o sistema deve dizer:

- `calibrando`;
- `dados insuficientes`;
- `confiança baixa`.

Nunca gerar um número apenas porque a UI espera um número.

## 2.3 Treino e validação são pools diferentes

Um estímulo de validação deixa de ser holdout no instante em que foi mostrado com feedback durante treino.

Portanto:

- `TRAIN`: pode reaparecer;
- `NOVEL-TRAIN`: é novo na primeira exposição, depois passa a treinado;
- `HOLDOUT`: só benchmark/validation;
- holdout nunca entra no conjunto adaptativo.

## 2.4 Transferência exige comparação de dificuldade

Não comparar 90% treinado em 300 ms com 60% novo em 100 ms e chamar a diferença de “Transfer Gap”.

A lacuna só existe quando os dois lados são suficientemente comparáveis.

## 2.5 Índices internos continuam sendo índices internos

`Iconic Throughput`, `Real World Index`, `T80`, `Generalization` e futuros índices não devem ser apresentados como medidas diretas de:

- velocidade neural;
- inteligência geral;
- QI;
- atividade cerebral;
- “tempo subjetivo”.

São medidas funcionais dentro dos protocolos do app.

---

# 3. Fase P0 — integridade de mensuração

## 3.1 Holdouts verdadeiros

### Problema anterior

`pickTemplate()` podia sortear holdout em treino normal. Mesmo que a chave não fosse adicionada ao conjunto `trainedKeys`, o usuário já tinha visto o layout e recebido oportunidade de aprender a estrutura.

Isso contaminava:

- `holdoutAccuracy`;
- `Transfer Benchmark`;
- interpretação de material “nunca visto”.

### Alteração implementada

Nos módulos reais:

- `training` usa somente templates abertos;
- `chaos` usa somente templates abertos;
- `validation` usa somente holdouts;
- ausência de holdout em validação vira erro explícito em vez de fallback silencioso.

Há um modo `legacy` apenas para compatibilidade de chamadas antigas diretas do helper. O aplicativo não usa esse caminho; os módulos passam o modo explicitamente.

### Migração

`TRANSFER_CONFIG.templateVersion` foi elevado para `2`.

Consequência intencional: o log de transferência anterior é invalidado pela migração já existente em `store.js`, pois o histórico antigo não pode garantir independência do holdout.

### Critério de aceitação

- 500 sorteios em `training`: 0 holdouts;
- 300 sorteios em `chaos`: 0 holdouts;
- validação: 100% holdouts.

**Status: IMPLEMENTADO.**

---

## 3.2 Transfer Gap difficulty-matched

### Problema anterior

O cálculo era essencialmente:

`accuracy_treinado - accuracy_novo`

sem exigir dificuldade equivalente.

### Alteração implementada

A adaptação agora usa somente:

- tentativas de treino;
- não-holdout;
- não-benchmark;
- material aberto inédito no lado novo.

As tentativas são agrupadas por uma assinatura de dificuldade baseada nos campos atualmente persistidos:

- tier;
- exposição em baldes de 25 ms;
- query complexity;
- quando disponíveis, information density;
- retention delay;
- interference level.

A família **não entra na assinatura**, porque mudar de formato/família é parte do fenômeno de transferência que queremos observar.

Cada grupo precisa ter dados dos dois lados. O peso do grupo é o menor tamanho entre treinado e novo, evitando que um lado enorme domine o outro.

Se o total de pares comparáveis for insuficiente, `transferGap()` retorna `null`.

### Semântica pública preservada

Para compatibilidade de UI:

- `novel` continua significando todo material novo, inclusive holdout;
- `trainingNovel` é o subconjunto seguro usado pela adaptação;
- `holdout` permanece separado.

### Limitação ainda existente

O armazenamento v1 de transferência não persiste todas as dimensões de dificuldade. Portanto o pareamento v2 é melhor que o anterior, mas ainda não é o pareamento final.

### Próximo passo obrigatório

Persistir em cada transfer trial:

- `informationDensity`;
- `retentionDelayMs`;
- `interferenceLevel`;
- `contextualVariation`;
- `responseVariation`;
- assinatura de protocolo/versão.

Depois elevar novamente `TRANSFER_CONFIG.version` se a interpretação histórica mudar.

**Status: IMPLEMENTADO PARCIALMENTE — lógica pronta; persistência completa ainda P1.**

---

## 3.3 T80 usando atraso real

### Problema anterior

A curva psicométrica agrupava por `delayMs`, o tempo solicitado, apesar de o app já registrar `actualDelayMs`.

Em telas discretizadas por frames, dois atrasos pedidos podem resultar no mesmo atraso físico.

### Alteração implementada

`binByDelay()` agora usa:

`actualDelayMs ?? delayMs`

O eixo X da curva representa prioritariamente o que a tela realmente entregou.

### Critério de aceitação

Se o protocolo pedir 100 ms mas a tela entregar 116,7 ms, a amostra entra no bin ~117 ms, não no bin 100 ms.

**Status: IMPLEMENTADO.**

---

## 3.4 Curva psicométrica com piso de acaso

### Problema anterior

A curva assumia:

`p(d) = A / (1 + exp(...))`

ou seja, desempenho tende a zero quando não há informação disponível.

Isso é inadequado para tarefas de escolha forçada, em que existe chance de acerto sem recuperação real.

### Alteração implementada

A função agora suporta:

`p(d) = gamma + (A - gamma) / (1 + exp(...))`

onde `gamma` é o piso de acaso.

Com `gamma=0`, o comportamento continua compatível com a versão anterior.

No modo relativo, T80 significa 80% do intervalo útil entre `gamma` e o teto `A`.

### Próximo passo obrigatório

Calcular e persistir `chanceFloor` automaticamente por tipo de resposta:

- choice: `1 / número_de_opções`;
- cell: `1 / número_de_células`;
- reconstrução livre: aproximadamente 0;
- multi-select: calcular chance combinatória quando aplicável.

**Status: INFRAESTRUTURA IMPLEMENTADA; INFERÊNCIA AUTOMÁTICA PENDENTE.**

---

# 4. Fase P1 — correções necessárias antes de tratar métricas como estáveis

## 4.1 Benchmark sem feedback trial-a-trial

### Problema

Os módulos de benchmark declaram que “medem sem ensinar”, mas o runner genérico ainda chama feedback depois de cada tentativa.

Mesmo sem adaptação, feedback repetido reduz independência longitudinal do benchmark.

### Implementação recomendada

Adicionar política de feedback por módulo:

```js
feedbackPolicy: 'normal' | 'block-only' | 'none'
```

Para:

- `transfer-benchmark` -> `block-only`;
- `availability-benchmark` -> `block-only`;
- `real-world-availability` -> `block-only`.

Durante o bloco, nenhuma indicação de certo/errado. Resultado somente no resumo final.

### Critérios

- nenhuma chamada visual de certo/errado durante benchmark;
- benchmark incompleto não grava resultado final;
- adaptação não muda por causa do benchmark.

**Status: PENDENTE. PRIORIDADE ALTA.**

---

## 4.2 Persistir assinatura completa de dificuldade de transferência

### Passos

1. ampliar `compactTransferTrial`;
2. manter compatibilidade de leitura com logs antigos;
3. escrever os novos campos a partir de `realWorld.onTrialRecorded`;
4. usar todos no `transferConditionSignature`;
5. adicionar teste em que exposição é igual, mas densidade difere;
6. exigir `transferGap === null` quando não houver condição casada.

**Status: PENDENTE.**

---

## 4.3 T80 por condição, não só por categoria

### Problema

Uma categoria como `numbers` pode conter cargas diferentes:

- 4 itens / 200 ms;
- 9 itens / 70 ms;
- matrizes ou módulos distintos.

Juntar tudo pode criar um T80 sem condição experimental clara.

### Nova chave proposta

`AvailabilityConditionKey`:

```text
category
+ moduleId
+ exposureBucket
+ stimulusCount/matrixSize
+ cleanRetrieval
+ interferenceKind
+ protocolVersion
```

### Passos

1. gerar condition key na criação da tentativa;
2. persistir junto do trial;
3. manter staircase por `category + condition` ou reiniciar quando a condição muda significativamente;
4. painel mostra T80 da condição atual;
5. benchmark padronizado continua sendo a principal métrica longitudinal.

**Status: PENDENTE. PRIORIDADE ALTA.**

---

## 4.4 Separar Availability normal de pós-interferência

### Problema

Em Mask Resistance há máscara/interferência antes da pergunta. O atraso depois da máscara não tem a mesma interpretação do intervalo estímulo→pergunta sem interferência.

### Não fazer

Não misturar ambos sob o mesmo T80.

### Criar

- `Visual Availability T80`: sem máscara/interferência;
- `Post-Interference Availability`: métrica própria;
- opcional: `Interference Cost = postInterference - clean` sob condição equivalente.

### Passos

1. marcar `availabilityKind` por tentativa;
2. separar armazenamento e painel;
3. impedir mistura em `categoryReport`;
4. criar benchmark específico antes de usar a métrica para adaptação.

**Status: PENDENTE.**

---

# 5. Fase P1 — fadiga e segurança de treino

## 5.1 Fadiga ajustada por dificuldade

### Problema

Comparar accuracy bruta dos primeiros 20 trials com os últimos 20 pode confundir progressão de dificuldade com fadiga.

### Proposta

Calcular desempenho esperado por condição/dificuldade e trabalhar com residual:

`residual = observedAccuracy - expectedAccuracy(difficulty)`

O alerta de fadiga deve depender da queda dos residuais, não apenas da accuracy bruta.

### Alternativa inicial simples

Agrupar por `difficultySignature` e só comparar blocos equivalentes.

**Status: PENDENTE.**

---

## 5.2 Protocolo de descanso visual

Adicionar opção de segurança, sem alegar tratamento médico:

- microblocos de 4–8 min;
- pausa visual sugerida de 30–90 s;
- após blocos mais longos, autopercepção opcional:
  - esforço ocular 0–10;
  - nitidez/conforto 0–10;
  - foco mental 0–10.

Se esforço ocular subir progressivamente ou performance residual cair, sugerir pausa maior ou encerrar.

Não bloquear o usuário por padrão; permitir configuração.

**Status: PENDENTE.**

---

# 6. Fase P1/P2 — currículo adaptativo global

O app já calcula três eixos:

- Capture;
- Availability;
- Transfer.

E já produz recomendações/pesos sugeridos.

## Implementar três modos

### OFF

Rotina nunca muda.

### RECOMMEND

Estado atual: app recomenda mudanças e explica o motivo.

### AUTOMATIC

O app reequilibra a composição dentro do mesmo tempo total, com limites:

- nenhum eixo abaixo de 20% do tempo relevante;
- mudança máxima de peso por sessão;
- benchmark não entra no orçamento adaptativo;
- usuário pode desfazer e travar módulos.

Exemplo para 40 min:

```text
Capture forte, Availability fraca, Transfer média
→ Capture 11 min
→ Availability 16 min
→ Transfer 11 min
→ Benchmarks 2 min
```

A rotina não deve crescer de 40 para 60 minutos por causa do reequilíbrio.

**Status: RECOMMEND JÁ EXISTE; AUTOMATIC PENDENTE.**

---

# 7. Fase P2 — Page Capture

Módulo discutido posteriormente para treinar apreensão de páginas inteiras, não apenas símbolos.

## Progressão proposta

1. topologia simples da página;
2. posição de blocos e títulos;
3. âncoras visuais;
4. compressão semântica;
5. mapa espacial;
6. unknown query — não saber antes o que será perguntado;
7. 1/4 de página;
8. 1/2 página;
9. página inteira;
10. redução gradual da exposição;
11. transferência para layouts inéditos.

## Métricas

- structural recall;
- anchor recall;
- semantic gist;
- spatial relations;
- query accuracy;
- exposure actual;
- transfer em layout holdout.

Não medir apenas “quantas palavras foram lembradas”.

**Status: NÃO IMPLEMENTADO.**

---

# 8. Fase P2 — Temporal Processing

O objetivo não é fazer o mundo literalmente parecer em câmera lenta, mas treinar resolução temporal funcional e previsão rápida.

## Submódulos sugeridos

1. Temporal Order Judgment;
2. Rapid Change Detection;
3. Motion Prediction;
4. Occlusion Prediction;
5. Multiple Event Tracking;
6. Rapid Decision under time pressure;
7. temporal sequence reconstruction.

## Métricas

- SOA threshold;
- temporal-order accuracy;
- prediction error;
- tracking capacity;
- decision accuracy × latency;
- transferência para estímulos visuais diferentes.

**Status: NÃO IMPLEMENTADO.**

---

# 9. Arquitetura cognitiva futura

Os módulos podem ser organizados em sete capacidades funcionais:

1. **Capture** — quanto entra por exposição;
2. **Compress** — quanto da estrutura pode ser representado eficientemente;
3. **Hold** — manutenção de curto prazo;
4. **Update** — atualização sob mudança/interferência;
5. **Process** — operações sobre o conteúdo capturado;
6. **Retrieve** — rapidez/precisão de acesso;
7. **Transfer** — sobrevivência em material novo.

Não fundir tudo em um único score. O dashboard pode ter um índice geral apenas como resumo secundário, sempre acompanhado dos eixos.

---

# 10. Ordem de execução recomendada

## Sprint 1 — integridade

1. holdout isolation; **feito**
2. invalidar histórico contaminado; **feito via templateVersion=2**
3. Transfer Gap difficulty-matched; **feito parcialmente**
4. T80 por actual delay; **feito**
5. infraestrutura de chance floor; **feito**
6. regressões automatizadas; **feito**

## Sprint 2 — benchmark e persistência

1. benchmark block-only feedback;
2. persistir assinatura completa de dificuldade;
3. condition key de Availability;
4. reiniciar/recalibrar staircase quando condição muda;
5. inferir chance floor automaticamente;
6. migration tests.

## Sprint 3 — semântica de Availability

1. separar clean availability de post-interference;
2. benchmark de interferência;
3. painel separado;
4. impedir agregação entre protocolos incompatíveis.

## Sprint 4 — fadiga e currículo

1. fatigue residual/difficulty-matched;
2. pausas visuais;
3. modo Adaptive Curriculum `OFF/RECOMMEND/AUTOMATIC`;
4. limites de reequilíbrio;
5. rollback de rotina.

## Sprint 5 — expansão cognitiva

1. Page Capture;
2. Temporal Processing;
3. dashboard dos sete componentes;
4. novos holdouts por família/protocolo.

---

# 11. Testes adicionados nesta branch

Arquivo: `tests/audit-v2.js`

Cobertura:

- training explícito nunca sorteia holdout;
- Chaos nunca sorteia holdout;
- validation usa somente holdout;
- benchmark holdout não entra no lado adaptativo do Transfer Gap;
- dificuldade não casada devolve `null` em vez de gap falso;
- dificuldade casada produz gap esperado;
- T80 usa `actualDelayMs`;
- curva relativa funciona com `chanceFloor > 0`.

`npm test` passa a executar:

```bash
node tests/run.js && node tests/audit-v2.js
```

Também existe:

```bash
npm run test:audit
```

---

# 12. Validação que ainda deve ser feita em navegador real

Testes unitários não substituem validação de apresentação temporal.

Executar pelo menos em:

- 60 Hz;
- 120 Hz;
- 144/165 Hz se disponível;
- desktop Chromium;
- Android Chrome;
- iOS Safari/PWA se o produto for suportado ali.

Verificar:

1. medição de refresh;
2. actual exposure;
3. actual availability delay;
4. aba em background invalida trial;
5. mudança de orientação invalida trial;
6. service worker não entrega bundle antigo;
7. benchmark não sofre dropped frames sistemáticos.

---

# 13. Definição de pronto para “Measurement v2”

A versão só deve ser considerada completa quando:

- [x] holdouts não aparecem nos modos reais de treino;
- [x] histórico contaminado de transferência é invalidado;
- [x] Transfer Gap não mistura benchmark/holdout com treino adaptativo;
- [x] Transfer Gap exige dificuldade comparável;
- [x] T80 usa atraso real quando disponível;
- [x] curva suporta piso de acaso;
- [ ] benchmark não dá feedback trial-a-trial;
- [ ] condição de Availability é persistida e usada no T80;
- [ ] chance floor é inferido automaticamente por resposta;
- [ ] Mask/Interference possui métrica separada;
- [ ] assinatura completa de dificuldade é persistida;
- [ ] fadiga é ajustada por dificuldade;
- [ ] protocolo de pausas visuais está disponível;
- [ ] testes em navegadores/refresh rates reais foram registrados.

Até lá, T80, Transfer Gap e Generalization devem continuar sendo descritos como **métricas internas experimentais**.

---

# 14. Conclusão

A prioridade não deve ser adicionar mais dificuldade ou mais módulos antes de estabilizar a régua. O app já possui quantidade suficiente de tarefas para produzir adaptação específica ao treino. O ganho de qualidade agora vem de garantir que cada número responda a uma pergunta bem definida:

- **Capture:** quanto foi adquirido sob uma exposição conhecida?
- **Availability:** quão cedo o conteúdo fica utilizável sob uma condição conhecida?
- **Transfer:** quanto desse desempenho permanece quando o material muda, mantendo a dificuldade comparável?

Depois que essas três réguas estiverem estáveis, Page Capture, Temporal Processing e um currículo automático terão uma base muito mais confiável para decidir o que aumentar.
