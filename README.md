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
- Tempo de exposição de **5 ms a 2 minutos**, numa escala com passos finos embaixo
  (5, 8, 10, 13, 16, 20 ms…) e largos em cima.
- Ritmo: a série inteira de uma vez, ou um item por vez (o tempo passa a valer por item).
- **Intervalo antes de cada série**: fixo (de 0 a 15 s — em 0 a série aparece
  assim que você toca em "Próxima série") ou **sorteado dentro de uma faixa**
  (ex.: entre 2 s e 10 s), para a exposição não ser previsível.
- **Contagem visível ou escondida**: escondida, só um ponto pulsa e a série
  aparece de surpresa.
- Quantas séries por sessão — o padrão são **sessões de 10 séries**.
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

## Classificação por tempo de exposição

As estatísticas mostram o seu **nível**: a menor exposição em que você já
acertou uma série inteira. Acertar tudo prova que aquele tempo bastou; uma
sessão só com acertos parciais, não.

| Exposição | O que pode acontecer |
| --- | --- |
| 5–10 ms | Pode haver processamento visual, mas identificação consciente confiável é difícil |
| 10–20 ms | Um dígito ou estímulo simples pode às vezes ser identificado |
| 20–50 ms | Já pode ser suficiente para reconhecer vários caracteres em condições ideais |
| 50–100 ms | Faixa da duração clássica dos experimentos de memória icônica (~50 ms): cerca de 4 a 5 caracteres relatados em média |
| 100–200 ms | Uma sequência curta já pode ser codificada com bastante eficiência |
| 200–500 ms | A limitação começa a ser muito mais de memória e atenção do que de percepção |
| acima de 500 ms | Fora da faixa da tabela: o desafio passa a ser inteiramente de memória |

São referências da literatura de percepção visual e memória icônica, para
situar o treino — valores típicos em condições ideais, não um diagnóstico. A
última linha é uma extensão para os tempos acima da tabela original.

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

50 testes sem dependências cobrindo as partes puras: geradores, concordância
das frases, correção das respostas, motor da sessão, escala de exposição,
faixas perceptuais, sorteio do intervalo, migração de ajustes antigos e
estatísticas do histórico. Entre eles, a garantia de que a frase gerada tem
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
