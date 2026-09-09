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

82 testes sem dependências cobrindo as partes puras: geradores, concordância das
frases, correção com e sem ordem, motor da sessão, escala de exposição, as duas
escalas de nível, sorteio do intervalo, migração de ajustes antigos,
estatísticas e a escada adaptativa — esta última verificada com pessoas
simuladas, conferindo que o teto de 30 séries é respeitado, que tempo e
quantidade se alternam, que a escada não desce abaixo do piso do aparelho e que
memórias e velocidades diferentes produzem resultados diferentes.

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
index.html                     telas (treinar, teste, histórico, resultado, ajustes)
assets/css/styles.css          estilo único, tema claro e escuro
assets/js/
  app.js                       interface: navegação, condução do treino e do teste
  engine.js                    máquina de estados da sessão
  scoring.js                   correção das respostas, com ou sem ordem
  storage.js                   preferências, histórico e testes (localStorage)
  charts.js                    gráficos em SVG puro
  perception.js                escala de exposição e as duas escalas de nível
  adaptive.js                  escada do teste de velocidade
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
