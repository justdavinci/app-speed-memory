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
| Palavras | Palavras concretas sorteadas, sem repetir na mesma série | Separadas por espaço ou vírgula, **na ordem ou em ordem livre** |
| Frases | Uma frase gramatical, com o número exato de palavras que você pediu | A frase inteira |

**Tudo configurável**

- Quantos itens por série (3 a 60 dígitos, 2 a 30 palavras, 3 a 30 palavras na frase).
- Tempo de exposição de **5 ms a 2 minutos**, numa escala com passos finos embaixo
  (5, 8, 10, 13, 16, 20 ms…) e largos em cima.
- Ritmo: a série inteira de uma vez, ou um item por vez (o tempo passa a valer por item).
- **Intervalo antes de cada série**: fixo (de 0 a 15 s — em 0 a série aparece
  assim que você toca em "Próxima série") ou **sorteado dentro de uma faixa**
  (ex.: entre 2 s e 10 s), para a exposição não ser previsível.
- **Contagem visível ou escondida**: escondida, só um ponto pulsa e a série
  aparece de surpresa.
- Quantas séries por sessão — o padrão são **sessões de 10 séries**.
- **Ordem das palavras**: exigir a posição certa de cada uma, ou aceitar as
  palavras em qualquer ordem (só no modo Palavras — dígitos e frases são
  posicionais por natureza).
- Agrupamento dos dígitos, tema, som, vibração e rigor com acentos.

**Correção e evolução**

- Correção **posicional**, como nas competições de memória: cada item vale pela
  posição em que foi digitado. Um item esquecido no meio desalinha o resto.
- Ao fim de cada série você vê o gabarito com o que errou e o que faltou.
- Cada sessão registra precisão, itens certos, séries perfeitas, melhor
  sequência de séries perfeitas e duração.
- O histórico traz gráficos de precisão e de itens memorizados, recorde de
  tamanho de série e a tendência das 5 sessões mais recentes contra as 5
  anteriores.
- Uma **classificação por tempo de exposição** situa o seu nível atual (veja
  abaixo).
- Dá para exportar e importar o histórico em JSON.

## Exposições curtas e o limite do aparelho

O tempo de exposição desce até 5 ms, mas **nenhuma tela mostra algo por menos
de um quadro**. Num aparelho de 60 Hz o quadro dura ~17 ms; num de 120 Hz,
~8 ms. Pedir 5 ms ali significa, na prática, 17 ms.

O app não finge o contrário:

- Ele mede a duração real do quadro do aparelho quando abre e avisa, na tela de
  configuração, quando o tempo pedido é menor que isso.
- Cada exposição é cronometrada quadro a quadro e a **duração real medida**
  aparece como métrica no resultado da sessão.
- Abaixo de 1 s a barra de tempo some (viraria um piscar inútil) e a exibição
  passa a usar o caminho de precisão, sincronizado com os quadros da tela.

O valor medido é a melhor aproximação possível de dentro do navegador: ele
conta os quadros entre a pintura e a remoção do estímulo, sem acesso ao
hardware da tela.

## Classificação: duas réguas, uma para cada tipo de estímulo

Dígitos e palavras não se comparam na mesma régua. Ver um dígito é
reconhecimento de caractere; ler uma palavra exige acesso ao léxico e custa
bem mais tempo. Por isso há **duas escalas de 7 níveis**, cada uma medindo o
que faz sentido para o seu estímulo — e uma **média** entre elas.

O seu nível num tipo é a **menor exposição em que você já acertou uma série
inteira** daquele tipo. Acertar tudo prova que o tempo bastou; acerto parcial
não prova.

### Dígitos — pelo tempo total da série

| Exposição total | Nível | O que pode acontecer |
| --- | --- | --- |
| 5–10 ms | 7 | Pode haver processamento visual, mas identificação consciente confiável é difícil |
| 10–20 ms | 6 | Um dígito ou estímulo simples pode às vezes ser identificado |
| 20–50 ms | 5 | Já pode ser suficiente para reconhecer vários caracteres em condições ideais |
| 50–100 ms | 4 | Faixa da duração clássica dos experimentos de memória icônica (~50 ms): cerca de 4 a 5 caracteres relatados em média |
| 100–200 ms | 3 | Uma sequência curta já pode ser codificada com bastante eficiência |
| 200–500 ms | 2 | A limitação começa a ser muito mais de memória e atenção do que de percepção |
| acima de 500 ms | 1 | O desafio passa a ser inteiramente de memória |

### Palavras — pelo tempo por palavra

| Tempo por palavra | Nível | O que pode acontecer |
| --- | --- | --- |
| até 35 ms | 7 | Mesmo uma palavra isolada só é identificada em condições ideais; captar várias é improvável |
| 35–70 ms | 6 | Uma ou outra palavra pode ser reconhecida, mas a maior parte escapa antes de virar memória |
| 70–120 ms | 5 | Mais rápido do que a compreensão costuma acompanhar em apresentação serial |
| 120–200 ms | 4 | Perto do limite de leitores rápidos e treinados (~300 a 500 palavras por minuto) |
| 200–300 ms | 3 | Faixa da fixação média na leitura silenciosa (~200 a 300 palavras por minuto) |
| 300–500 ms | 2 | Tempo de sobra para ler cada palavra e começar a organizar a memorização |
| acima de 500 ms | 1 | A leitura deixou de ser o gargalo: o desafio é memória e estratégia |

**De onde vêm.** A tabela dos dígitos é a da literatura de percepção visual e
memória icônica (a última linha é uma extensão para tempos acima dela). A das
palavras é derivada da pesquisa em leitura: fixação média de 200 a 250 ms por
palavra na leitura silenciosa, leitura veloz treinada por volta de 120 a 200 ms
por palavra, compreensão desabando abaixo de ~100 ms por palavra em
apresentação serial, e reconhecimento de palavra isolada com máscara possível
por volta de 30 a 50 ms. São referências aproximadas em condições ideais, não
um diagnóstico.

**Por que normalizar por palavra.** Assim uma série de 3 palavras e outra de 10
ficam comparáveis: o que conta é quanto tempo cada palavra teve. Frases usam a
mesma régua verbal, por serem o mesmo tipo de processamento.

**A média** combina o nível de dígitos com o de palavras — os dois tipos de
teste. Ela só aparece quando existem os dois, e frases ficam de fora por serem
outra tarefa (o contexto da frase ajuda a memorizar, então o número não seria
comparável).

## Teste de velocidade de processamento

Uma aba própria, com um teste adaptativo que estima o menor tempo de exibição
em que você ainda capta uma sequência curta. É repetível: cada resultado fica
guardado para comparação.

**Como funciona.** É uma escada psicofísica **2 para baixo, 1 para cima**: duas
séries seguidas totalmente certas encurtam o tempo de exibição; uma série
errada alonga. Essa regra converge para o tempo em que você acerta a série
inteira em cerca de **71%** das vezes — é esse ponto que o teste chama de
limiar.

- No máximo **30 séries** (3 a 5 minutos), ou menos se a escada estabilizar
  antes (8 viradas de direção).
- **Carga fixa**: 4 dígitos ou 3 palavras. Se a quantidade mudasse junto com o
  tempo, não daria para saber qual das duas coisas o resultado mediu.
- **Parâmetros por tipo**: o teste de palavras começa mais devagar (900 ms
  contra 500 ms) e tem teto mais alto (3 s contra 2 s), porque ler custa mais
  que ver.
- **Sem contagem** e com espera sorteada entre 1,5 s e 4 s, para você não pegar
  o ritmo e antecipar o estímulo.
- Passos largos no começo e estreitos depois das duas primeiras viradas, para
  chegar perto do limiar rápido e refinar em seguida.
- O limiar é a **média geométrica das últimas 6 viradas** — geométrica porque a
  escala de tempos é multiplicativa.
- A escada nunca desce abaixo de **um quadro da sua tela**: ali os degraus
  seriam indistinguíveis e o teste mediria ruído.

**O resultado** coloca você em um dos 7 níveis **da régua daquele estímulo** —
o teste de dígitos usa o tempo total, o de palavras usa o tempo por palavra —,
mostra o limiar estimado e a **precisão média por tempo de exibição** — a queda de acerto conforme o tempo encurta. Ele também sinaliza
quando o número não é confiável: `piso` (você acertou até o degrau mais rápido
do aparelho), `teto` (não acertou nem no tempo mais longo) ou `parcial` (as
séries acabaram antes de estabilizar).

**Limites honestos.** O teste estima o tempo que *você* precisa para captar uma
sequência curta, neste aparelho e nestas condições. Brilho, distância da tela,
cansaço e atenção mudam o resultado, e repetições variam cerca de um nível para
mais ou para menos — é a precisão que 30 séries permitem. Não é medida clínica
nem teste de QI.

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

78 testes sem dependências cobrindo as partes puras: geradores, concordância
das frases, correção das respostas (com e sem ordem obrigatória), motor da
sessão, escala de exposição, faixas perceptuais, sorteio do intervalo, migração
de ajustes antigos, estatísticas do histórico e a escada do teste adaptativo —
esta última verificada com uma pessoa simulada, conferindo que o teto de 30
séries é respeitado, que a escada não desce abaixo do piso do aparelho e que
limiares diferentes produzem estimativas separadas. As duas réguas também são
testadas: cobertura das faixas, normalização por palavra e a média que só
existe quando há nível nos dois tipos. Entre eles, a garantia de que a frase gerada tem
**exatamente** o número de palavras pedido (verificado de 3 a 30 palavras) e de
que artigos e adjetivos concordam em gênero.

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
  perception.js                escala de exposição e classificação perceptual
  adaptive.js                  escada psicofísica do teste de velocidade
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
