# Speed Memory

Aplicativo **mobile-first** de treino de memória rápida: você vê uma sequência
por alguns segundos, ela some, e você digita o que memorizou. Funciona com
**dígitos**, **palavras aleatórias** ou **frases com sentido**, guarda o
histórico e mostra a sua evolução.

Feito em HTML, CSS e JavaScript puros — **sem dependências, sem build, sem
servidor**. Todos os dados ficam no próprio aparelho.

## O que dá para fazer

**Três modos de treino**

| Modo | O que aparece | O que você digita |
| --- | --- | --- |
| Dígitos | Números aleatórios, opcionalmente em blocos de 2, 3 ou 4 | Teclado numérico próprio, na zona do polegar |
| Palavras | Palavras concretas sorteadas, sem repetir na mesma série | Separadas por espaço ou vírgula |
| Frases | Uma frase gramatical, com o número exato de palavras que você pediu | A frase inteira |

**Tudo configurável**

- Quantos itens por série (3 a 60 dígitos, 2 a 30 palavras, 3 a 30 palavras na frase).
- Quantos segundos de exposição (1 a 120).
- Ritmo: a série inteira de uma vez, ou um item por vez (o tempo passa a valer por item).
- Quantas séries por sessão — o padrão são **sessões de 10 séries**.
- Agrupamento dos dígitos, tema, som, vibração, contagem regressiva e rigor com acentos.

**Correção e evolução**

- Correção **posicional**, como nas competições de memória: cada item vale pela
  posição em que foi digitado. Um item esquecido no meio desalinha o resto.
- Ao fim de cada série você vê o gabarito com o que errou e o que faltou.
- Cada sessão registra precisão, itens certos, séries perfeitas, melhor
  sequência de séries perfeitas e duração.
- O histórico traz gráficos de precisão e de itens memorizados, recorde de
  tamanho de série e a tendência das 5 sessões mais recentes contra as 5
  anteriores.
- Dá para exportar e importar o histórico em JSON.

## Como rodar

```bash
npm start            # servidor estático em http://localhost:8080
```

Qualquer servidor estático serve (`python3 -m http.server`, por exemplo).
Abrir o `index.html` direto pelo `file://` não funciona: o app usa módulos ES,
que exigem HTTP.

No celular, use "Adicionar à tela de início": o app é um PWA e funciona
offline depois da primeira visita.

## Testes

```bash
npm test
```

33 testes sem dependências cobrindo as partes puras: geradores, concordância
das frases, correção das respostas, motor da sessão e estatísticas do
histórico. Entre eles, a garantia de que a frase gerada tem **exatamente** o
número de palavras pedido (verificado de 3 a 30 palavras) e de que artigos e
adjetivos concordam em gênero.

## Como as frases são geradas

Frase aleatória com número exato de palavras é um problema de encaixe. O
gerador resolve assim:

1. **Planeja as orações.** Até 12 palavras cabem em uma oração; acima disso o
   total é dividido em orações ligadas por conectivos (`e`, `mas`, `porque`…),
   e cada conectivo consome uma palavra do orçamento.
2. **Monta o núcleo.** Sujeito + verbo (3 palavras) ou sujeito + verbo +
   objeto (5 palavras).
3. **Preenche o resto com encaixes.** Adjetivo no sujeito (+1), advérbio (+1),
   locução adverbial (+2, +3 ou +4)… Uma busca com retrocesso escolhe a
   combinação que fecha o orçamento exatamente.
4. **Mantém o sentido.** Cada verbo declara que categorias de objeto aceita e
   se exige sujeito humano — por isso sai "o cozinheiro comeu o bolo" e nunca
   "a formiga consertou a laranja". Artigos e adjetivos concordam com o gênero
   do substantivo.

## Estrutura

```
index.html                     telas (treinar, histórico, resultado, ajustes)
assets/css/styles.css          estilo único, tema claro e escuro
assets/js/
  app.js                       interface: navegação, condução do treino, gráficos na tela
  engine.js                    máquina de estados da sessão
  scoring.js                   correção posicional das respostas
  storage.js                   preferências e histórico (localStorage)
  charts.js                    gráficos em SVG puro
  util.js                      utilidades (sorteio, normalização de texto, formatação)
  generators/
    digits.js                  sequências numéricas
    words.js                   palavras sorteadas do banco
    sentences.js               gerador de frases com número exato de palavras
    lexicon.js                 léxico pt-BR com gênero e categorias semânticas
sw.js                          service worker (offline)
manifest.webmanifest           instalação como PWA
scripts/serve.js               servidor estático de desenvolvimento
scripts/gen-icons.js           gera os ícones PNG sem dependências
tests/run.js                   suíte de testes
```

Os módulos `engine`, `scoring`, `storage`, `util` e `generators/` não tocam no
DOM — é por isso que dá para testá-los direto no Node.

## Privacidade

Nada sai do aparelho: preferências e histórico ficam no `localStorage` do
navegador. Não há contas, servidores nem telemetria. Apagar os dados do site
apaga o histórico (exporte antes, se quiser guardar).

## Licença

MIT.
