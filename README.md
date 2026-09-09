# PiscaMemory

Treino de memória rápida, feito para o celular. Uma sequência pisca na tela,
some, e você digita o que conseguiu guardar. Funciona com **dígitos**,
**palavras** ou **frases com sentido**, guarda o seu histórico e mostra a sua
evolução.

HTML, CSS e JavaScript puros: sem dependências, sem build, sem servidor. Tudo
fica no seu aparelho.

## O que dá para fazer

**Três modos de treino**

| Modo | O que aparece | O que você digita |
| --- | --- | --- |
| Dígitos | Números aleatórios, em blocos de 2, 3 ou 4 se você quiser | Teclado numérico próprio, na zona do polegar |
| Palavras | Palavras concretas sorteadas, sem repetir na mesma série | Na ordem ou em ordem livre, como preferir |
| Frases | Uma frase que faz sentido, com o número exato de palavras que você pediu | A frase inteira |

**Tudo ajustável**

- Quantos itens por série: 3 a 60 dígitos, 2 a 30 palavras, 3 a 30 palavras na frase.
- Tempo de exibição de **5 ms a 2 minutos**, numa escala com passos finos embaixo
  (5, 8, 10, 13, 16, 20 ms…) e largos em cima.
- Ritmo: a série inteira de uma vez, ou um item por vez.
- **Intervalo antes de cada série**: fixo de 0 a 15 s — em 0 a série aparece assim
  que você toca em "Próxima série" — ou sorteado dentro de uma faixa, para não
  dar para prever.
- **Contagem visível ou escondida**: escondida, só um ponto pulsa e a série pega
  você de surpresa.
- **Posição aleatória**: a sequência aparece em um ponto sorteado da tela, em vez
  de sempre no centro.
- Sessões de quantas séries você quiser — o padrão são 10.
- Tema, som, vibração e rigor com acentos.

**Correção e evolução**

- Correção posicional por padrão: cada item vale pela posição em que foi digitado.
  No modo Palavras dá para aceitar qualquer ordem.
- Ao fim de cada série você vê o gabarito, com o que errou e o que faltou.
- Cada sessão registra precisão, itens certos, séries perfeitas, melhor sequência
  e duração.
- O histórico traz gráficos de precisão e de itens memorizados, recordes, a
  tendência das últimas sessões e os seus níveis por tipo de estímulo.
- Dá para exportar e importar tudo em JSON.

## Teste de velocidade

Uma aba própria com um teste adaptativo que encontra o seu limite e te coloca
em um nível. Dá para repetir quando quiser e comparar com os anteriores.

**Como ele se adapta.** Duas séries seguidas inteiramente certas sobem a
dificuldade; uma série errada desce. A cada passo ele alterna entre as duas
dimensões: um passo encurta o tempo, o seguinte acrescenta mais um item. Quando
uma delas chega ao limite — o tempo no piso da tela, a quantidade no teto — ele
segue pela outra.

- **Até 30 séries**, entre 3 e 5 minutos.
- **Sem contagem**, com espera sorteada entre 1,5 s e 4 s.
- No teste, a barra de tempo e o botão "Já memorizei" não aparecem: o tempo medido
  é o tempo que o app controlou.
- O resultado mostra o seu nível, a maior quantidade que você acertou por inteiro
  e como você foi em cada dificuldade.

## Try Hard — treino avançado

Uma área separada, para quem quer treinar percepção visual a sério. O treino
comum continua igual: Try Hard é adicional, com motor próprio de dificuldade,
temporização e estatísticas.

**Nove exercícios e dois benchmarks**

| Módulo | O que treina |
| --- | --- |
| Partial Report | Capturar a cena inteira antes de saber o que será pedido. A região só é revelada depois que a matriz some. |
| Mask Resistance | Recuperar a informação apesar de uma máscara visual logo após o estímulo. |
| Peripheral Matrix | Apreender uma matriz inteira em uma exposição curta demais para leitura serial. |
| Iconic Readout | Consultar uma cena que já desapareceu, respondendo perguntas de categorias variadas. |
| Peripheral Fixation | Perceber itens ao redor sem largar o ponto de fixação central. |
| Abstract Flash | Memória visual com símbolos sem nome fácil, reduzindo o apoio verbal. |
| Visual Threshold | Discriminar orientação com contraste e tamanho reduzidos. |
| Real World Transfer | Levar a habilidade para fora do formato de treino: listas, interfaces, documentos, mapas e cenas. |
| Modo Caos | Tudo muda a cada exposição — formato, quantidade, pergunta e formato de resposta. |
| Daily Benchmark | Protocolo fixo de 20 tentativas para comparar dias diferentes. |
| Transfer Benchmark | Protocolo fixo de 18 tentativas em material reservado, que nunca aparece no treino. |

**Rotina diária editável.** A padrão soma 40 minutos em 7 exercícios. Dá para
adicionar, remover, reordenar, mudar duração, dificuldade inicial e tipo de
estímulo, e restaurar a original. A sessão encadeia os exercícios sem voltar ao
menu, com resumo entre um e outro.

**Dificuldade adaptativa multidimensional.** Cada módulo tem estado próprio de
habilidade. A adaptação persegue a faixa de 70% a 85% de acerto analisando uma
janela de 8 tentativas — nunca uma tentativa isolada — e mexe em **uma dimensão
por vez** (exposição, quantidade de itens, tamanho da matriz, atraso do aviso,
intervalo até a máscara, distância periférica, contraste), para que sempre se
saiba o que ficou mais difícil. Há também modo manual, presets (Aquecimento,
Try Hard, Insano) e recalibração por módulo.

**Temporização honesta.** Toda exposição passa por um motor central sincronizado
com os quadros da tela, que registra a duração pedida e a **duração real**. Nada
promete precisão abaixo do que o aparelho entrega: um tempo menor que um quadro
é apresentado por um quadro e registrado como tal. Se a aba perde o foco ou a
tela gira durante a apresentação, a tentativa é **descartada**, não contada como
erro.

**Iconic Throughput.** Índice próprio de 0 a 1000 que combina itens recuperados,
exposição (em escala logarítmica limitada nas duas pontas) e complexidade do
estímulo. A fórmula fica em uma única função documentada, em
`assets/js/tryhard/metrics.js`. É uma métrica interna do app para acompanhar
evolução, não uma medida científica validada.

**Progresso.** Painel com throughput, melhor exposição, precisão, tempo de
treino e tentativas; gráficos por módulo com filtros de 7, 30, 90 dias e tudo;
comparação com ontem e com as médias recentes; calendário de consistência; e
recordes com critério — exposição só vira recorde com pelo menos 80% de
precisão.

## Real World Transfer

O risco de qualquer treino perceptivo é a pessoa ficar boa **no treino** em vez
de ficar boa em perceber. Esta parte do Try Hard existe para evitar isso: quanto
melhor você fica no material artificial, menos artificial o material fica.

**Uma escada de sete faixas.** O treino começa em símbolos soltos e vai
avançando conforme você acompanha:

| Faixa | Material |
| --- | --- |
| 0 | Símbolos: dígitos, letras e formas sem contexto |
| 1 | Informação estruturada: preços, placares, fichas |
| 2 | Interfaces: painéis, listas, abas, chaves e contadores |
| 3 | Documentos: recibos, tabelas, crachás, bilhetes, formulários |
| 4 | Mapas e diagramas: nós, ligações e legenda |
| 5 | Cenas: objetos posicionados, com cor e estado |
| 6 | Misturado: formatos diferentes na mesma exposição |

**A pergunta vem depois.** A cena aparece, some, e só então você descobre o que
será cobrado. As perguntas nascem do conteúdo da cena — valor, rótulo, estado,
posição, vizinhança, contagem, extremo, comparação, presença e ausência —, então
não há "o que costuma cair". A única estratégia que funciona é captar a cena.

**Material reservado.** Alguns modelos de cada família **nunca aparecem em
treino**: eles só entram como medida. É contra eles que dá para dizer se a
habilidade transferiu, em vez de medir prática no mesmo material.

**Lacuna de transferência.** As tentativas ficam separadas em dois lados —
material já treinado e material novo. A diferença de acerto entre os dois é a
lacuna. Ela governa a adaptação:

- lacuna pequena → **aperta o tempo**: menos exposição, mais informação na cena,
  mais atraso até a pergunta, mais interferência;
- lacuna grande → **varia o material**: mais contexto diferente, faixa mais alta,
  formatos de resposta variados, perguntas mais profundas.

Ou seja: acelerar só é permitido enquanto a habilidade estiver acompanhando o
material novo. A faixa também só sobe com bom desempenho em material inédito.

**Anti-repetição.** O sorteio nunca repete o modelo anterior, nenhum modelo passa
de ~35% da janela recente, e a aparência da mesma cena muda a cada exposição
(paleta, alinhamento, densidade, ordem, escala) — mais ainda quando o modelo
insiste em aparecer.

**Painel "Mundo real".** Mostra o Índice de Mundo Real (0 a 1000, combinando
acerto em material novo, variedade de formatos, faixa alcançada, velocidade e
profundidade das perguntas), a lacuna, o índice de generalização, o desempenho
por formato, o que o motor está fazendo agora e por quê. Quando o desempenho
fica preso ao material treinado, o painel diz isso e o currículo passa a variar
mais em vez de encurtar o tempo. Como o Iconic Throughput, são índices internos
do app — não medidas científicas validadas.

**Pressão ajustável.** Quatro presets — Velocidade pura, Equilibrado, Máxima
transferência e Manual — deslocam faixa, fração de material inédito e
profundidade das perguntas. Dá para travar a faixa, se você quiser ficar em um
tipo de material.

## Níveis

São duas escalas de 7 níveis, uma para cada tipo de estímulo, porque ler custa
mais que ver. Os tempos são convertidos para uma carga de referência antes de
virar nível, então quantidade e tempo entram na mesma conta: **8 dígitos em
100 ms valem o mesmo que 4 dígitos em 50 ms**.

### Dígitos (tempo para 4 dígitos)

| Nível | Tempo | Nome |
| --- | --- | --- |
| 7 | até 10 ms | Relâmpago |
| 6 | 10–20 ms | Faísca |
| 5 | 20–50 ms | Flash |
| 4 | 50–100 ms | Piscada |
| 3 | 100–200 ms | Olhada |
| 2 | 200–500 ms | Vista calma |
| 1 | acima de 500 ms | Sem pressa |

### Palavras (tempo por palavra)

| Nível | Tempo | Nome |
| --- | --- | --- |
| 7 | até 35 ms | Relâmpago |
| 6 | 35–70 ms | Faísca |
| 5 | 70–120 ms | Flash |
| 4 | 120–200 ms | Piscada |
| 3 | 200–300 ms | Olhada |
| 2 | 300–500 ms | Vista calma |
| 1 | acima de 500 ms | Sem pressa |

No treino, o seu nível vem da série mais difícil que você acertou inteira. A
**média** junta os níveis de dígitos e de palavras, e aparece quando existem os
dois. Frases usam a escala verbal e aparecem à parte.

## Exposições curtas

O tempo desce até 5 ms, mas nenhuma tela mostra algo por menos de um quadro:
~17 ms a 60 Hz, ~8 ms a 120 Hz. O app mede a duração do quadro do seu aparelho
ao abrir, avisa quando o tempo pedido é menor que isso, cronometra cada exibição
quadro a quadro e mostra no resultado quanto tempo apareceu de verdade. O teste
de velocidade não desce abaixo desse piso — de lá em diante ele aumenta a
quantidade de itens.

## Como rodar

```bash
npm start            # http://localhost:8080
```

Qualquer servidor estático serve. Abrir o `index.html` direto pelo `file://` não
funciona: o app usa módulos ES, que exigem HTTP.

Para publicar, é só servir a pasta como site estático — GitHub Pages, Netlify,
Vercel ou qualquer hospedagem de arquivos. No celular, "Adicionar à tela de
início" instala o app, que passa a funcionar offline.

## Testes

```bash
npm test
```

183 testes sem dependências cobrindo as partes puras: geradores, concordância das
frases, correção com e sem ordem, motor da sessão, escala de exposição, as duas
escalas de nível, sorteio do intervalo, migração de ajustes antigos,
estatísticas e a escada adaptativa — esta última verificada com pessoas
simuladas, conferindo que o teto de 30 séries é respeitado, que tempo e
quantidade se alternam, que a escada não desce abaixo do piso do aparelho e que
memórias e velocidades diferentes produzem resultados diferentes.

Do Try Hard, os testes cobrem o motor de dificuldade (sobe, desce, não oscila,
respeita limites e o intervalo mínimo entre mudanças), o cálculo de precisão,
throughput e consistência, os geradores (máscara que não vaza a resposta,
benchmark sem sequências compressíveis, posições periféricas dentro da área),
os módulos, a persistência e a sessão inteira — iniciada, pausada,
encerrada e salva — rodando com uma interface falsa, sem navegador.

Do Real World Transfer, os testes conferem que toda família gera cena desenhável
com elementos identificáveis e sem colisão de células, que todo modelo produz
pergunta respondível e corrigível, que o enunciado nunca aparece durante a
exposição, que o material reservado nunca entra no conjunto treinado, que o
sorteio não repete nem deixa um modelo dominar a janela, que a lacuna só é
calculada com tentativas dos dois lados, que o sobreajuste é detectado, que a
faixa só sobe com desempenho em material novo e que o eixo da adaptação muda
conforme a lacuna.

## Como as frases são geradas

Frase aleatória com número exato de palavras é um problema de encaixe:

1. **Planeja as orações.** Até 12 palavras cabem em uma; acima disso o total é
   dividido em orações ligadas por conectivos (`e`, `mas`, `porque`…), e cada
   conectivo consome uma palavra do orçamento.
2. **Monta o núcleo.** Sujeito + verbo, ou sujeito + verbo + objeto.
3. **Preenche o resto com encaixes.** Adjetivo (+1), advérbio (+1), locução
   adverbial (+2, +3 ou +4), escolhidos por busca com retrocesso até fechar o
   total exato.
4. **Mantém o sentido.** Cada verbo declara que categorias de objeto aceita e se
   exige sujeito humano — por isso sai "o cozinheiro comeu o bolo" e nunca "a
   formiga consertou a laranja". Artigos e adjetivos concordam em gênero.

## Estrutura

```
index.html                     telas (treinar, teste, Try Hard, histórico, resultado, ajustes)
assets/css/styles.css          estilo único, tema claro e escuro
assets/js/
  app.js                       interface: navegação, condução do treino e do teste
  engine.js                    máquina de estados da sessão
  scoring.js                   correção das respostas, com ou sem ordem
  storage.js                   preferências, histórico e testes (localStorage)
  charts.js                    gráficos em SVG puro
  perception.js                escala de exposição e as duas escalas de nível
  adaptive.js                  escada do teste de velocidade
  tryhard/
    config.js                  protocolos, alvos e dimensões de dificuldade
    timing.js                  exposição sincronizada com os quadros da tela
    difficulty.js              adaptação multidimensional
    metrics.js                 precisão, throughput, consistência e recordes
    stimuli.js                 geradores de matriz, máscara, aviso e posições
    symbols.js                 símbolos abstratos em SVG
    store.js                   rotinas, sessões, tentativas e agregados
    runner.js                  ciclo de tentativa e encadeamento da sessão
    view.js                    desenho do estímulo e widgets de resposta
    ui.js                      telas de treino, módulos, mundo real, progresso e config
    modules/                   os exercícios e os dois benchmarks
    transfer/
      config.js                faixas, presets e limiares de transferência
      scene.js                 esquema comum de cena (elementos com rótulo, valor, estado, posição)
      queries.js               geração e correção das perguntas feitas depois da exposição
      novelty.js               sorteio anti-repetição e material reservado
      metrics.js               lacuna, generalização, Índice de Mundo Real, sobreajuste
      adapt.js                 decide entre apertar o tempo e variar o material
      vocab.js                 vocabulário das cenas
      families/                as sete famílias de estímulo, do símbolo à cena
  util.js                      utilidades (sorteio, normalização de texto, formatação)
  generators/
    digits.js                  sequências numéricas
    words.js                   palavras sorteadas do banco
    sentences.js               frases com número exato de palavras
    lexicon.js                 léxico pt-BR com gênero e categorias semânticas
sw.js                          service worker (offline)
manifest.webmanifest           instalação como PWA
scripts/serve.js               servidor estático de desenvolvimento
scripts/gen-icons.js           gera os ícones PNG sem dependências
tests/run.js                   suíte de testes
```

Os módulos `engine`, `scoring`, `storage`, `util`, `perception`, `adaptive` e
`generators/` não tocam no DOM — é por isso que dá para testá-los direto no Node.

## Privacidade

Nada sai do aparelho: preferências, histórico e testes ficam no `localStorage`
do navegador. Não há contas, servidores nem telemetria. Apagar os dados do site
apaga o histórico (exporte antes, se quiser guardar).

## Licença

MIT.
