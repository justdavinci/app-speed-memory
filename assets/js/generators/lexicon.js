// Léxico em português do Brasil usado pelos modos "palavras" e "frases".
//
// Substantivos carregam gênero (concordância) e categorias semânticas; os
// verbos declaram que categorias de objeto aceitam e se exigem sujeito humano.
// É isso que mantém as frases plausíveis ("comeu o bolo", nunca "comeu a
// escada").

/** Sujeitos: `h` = humano, `a` = animal. */
export const SUBJECTS = [
  { w: 'gato', g: 'm', k: 'a' },
  { w: 'cachorro', g: 'm', k: 'a' },
  { w: 'urso', g: 'm', k: 'a' },
  { w: 'macaco', g: 'm', k: 'a' },
  { w: 'elefante', g: 'm', k: 'a' },
  { w: 'cavalo', g: 'm', k: 'a' },
  { w: 'papagaio', g: 'm', k: 'a' },
  { w: 'coelho', g: 'm', k: 'a' },
  { w: 'girafa', g: 'f', k: 'a' },
  { w: 'coruja', g: 'f', k: 'a' },
  { w: 'formiga', g: 'f', k: 'a' },
  { w: 'tartaruga', g: 'f', k: 'a' },
  { w: 'raposa', g: 'f', k: 'a' },
  { w: 'baleia', g: 'f', k: 'a' },
  { w: 'abelha', g: 'f', k: 'a' },
  { w: 'zebra', g: 'f', k: 'a' },
  { w: 'menino', g: 'm', k: 'h' },
  { w: 'professor', g: 'm', k: 'h' },
  { w: 'pintor', g: 'm', k: 'h' },
  { w: 'pescador', g: 'm', k: 'h' },
  { w: 'marinheiro', g: 'm', k: 'h' },
  { w: 'palhaço', g: 'm', k: 'h' },
  { w: 'jardineiro', g: 'm', k: 'h' },
  { w: 'cozinheiro', g: 'm', k: 'h' },
  { w: 'vizinho', g: 'm', k: 'h' },
  { w: 'padeiro', g: 'm', k: 'h' },
  { w: 'mágico', g: 'm', k: 'h' },
  { w: 'piloto', g: 'm', k: 'h' },
  { w: 'relojoeiro', g: 'm', k: 'h' },
  { w: 'menina', g: 'f', k: 'h' },
  { w: 'professora', g: 'f', k: 'h' },
  { w: 'cozinheira', g: 'f', k: 'h' },
  { w: 'vizinha', g: 'f', k: 'h' },
  { w: 'bailarina', g: 'f', k: 'h' },
  { w: 'enfermeira', g: 'f', k: 'h' },
  { w: 'rainha', g: 'f', k: 'h' },
  { w: 'pintora', g: 'f', k: 'h' },
  { w: 'cientista', g: 'f', k: 'h' },
  { w: 'costureira', g: 'f', k: 'h' },
  { w: 'cantora', g: 'f', k: 'h' },
];

/**
 * Objetos inanimados com categorias:
 * comida, roupa, aparelho, instrumento, papel, recipiente, ferramenta,
 * veiculo, construcao, miudeza.
 */
export const OBJECTS = [
  { w: 'bolo', g: 'm', t: ['comida'] },
  { w: 'queijo', g: 'm', t: ['comida'] },
  { w: 'sorvete', g: 'm', t: ['comida'] },
  { w: 'pastel', g: 'm', t: ['comida'] },
  { w: 'laranja', g: 'f', t: ['comida'] },
  { w: 'melancia', g: 'f', t: ['comida'] },
  { w: 'chapéu', g: 'm', t: ['roupa'] },
  { w: 'sapato', g: 'm', t: ['roupa'] },
  { w: 'casaco', g: 'm', t: ['roupa'] },
  { w: 'cinto', g: 'm', t: ['roupa'] },
  { w: 'camisa', g: 'f', t: ['roupa'] },
  { w: 'luva', g: 'f', t: ['roupa'] },
  { w: 'relógio', g: 'm', t: ['aparelho'] },
  { w: 'telefone', g: 'm', t: ['aparelho'] },
  { w: 'ventilador', g: 'm', t: ['aparelho'] },
  { w: 'rádio', g: 'm', t: ['aparelho'] },
  { w: 'lanterna', g: 'f', t: ['aparelho'] },
  { w: 'geladeira', g: 'f', t: ['aparelho'] },
  { w: 'violão', g: 'm', t: ['instrumento'] },
  { w: 'tambor', g: 'm', t: ['instrumento'] },
  { w: 'flauta', g: 'f', t: ['instrumento'] },
  { w: 'harpa', g: 'f', t: ['instrumento'] },
  { w: 'livro', g: 'm', t: ['papel'] },
  { w: 'bilhete', g: 'm', t: ['papel'] },
  { w: 'caderno', g: 'm', t: ['papel'] },
  { w: 'mapa', g: 'm', t: ['papel'] },
  { w: 'jornal', g: 'm', t: ['papel'] },
  { w: 'carta', g: 'f', t: ['papel'] },
  { w: 'balde', g: 'm', t: ['recipiente'] },
  { w: 'cofre', g: 'm', t: ['recipiente'] },
  { w: 'pote', g: 'm', t: ['recipiente'] },
  { w: 'garrafa', g: 'f', t: ['recipiente'] },
  { w: 'panela', g: 'f', t: ['recipiente'] },
  { w: 'xícara', g: 'f', t: ['recipiente'] },
  { w: 'mochila', g: 'f', t: ['recipiente'] },
  { w: 'cesta', g: 'f', t: ['recipiente'] },
  { w: 'martelo', g: 'm', t: ['ferramenta'] },
  { w: 'pincel', g: 'm', t: ['ferramenta'] },
  { w: 'tesoura', g: 'f', t: ['ferramenta'] },
  { w: 'escada', g: 'f', t: ['ferramenta'] },
  { w: 'corda', g: 'f', t: ['ferramenta'] },
  { w: 'vassoura', g: 'f', t: ['ferramenta'] },
  { w: 'chave', g: 'f', t: ['ferramenta', 'miudeza'] },
  { w: 'barco', g: 'm', t: ['veiculo'] },
  { w: 'trator', g: 'm', t: ['veiculo'] },
  { w: 'bicicleta', g: 'f', t: ['veiculo'] },
  { w: 'canoa', g: 'f', t: ['veiculo'] },
  { w: 'castelo', g: 'm', t: ['construcao'] },
  { w: 'telhado', g: 'm', t: ['construcao'] },
  { w: 'muro', g: 'm', t: ['construcao'] },
  { w: 'janela', g: 'f', t: ['construcao'] },
  { w: 'porta', g: 'f', t: ['construcao'] },
  { w: 'ponte', g: 'f', t: ['construcao'] },
  { w: 'anel', g: 'm', t: ['miudeza'] },
  { w: 'espelho', g: 'm', t: ['miudeza'] },
  { w: 'novelo', g: 'm', t: ['miudeza'] },
  { w: 'selo', g: 'm', t: ['miudeza'] },
  { w: 'moeda', g: 'f', t: ['miudeza'] },
  { w: 'medalha', g: 'f', t: ['miudeza'] },
  { w: 'pipa', g: 'f', t: ['miudeza'] },
  { w: 'sombrinha', g: 'f', t: ['miudeza'] },
];

const PORTATEIS = ['comida', 'roupa', 'aparelho', 'instrumento', 'papel', 'recipiente', 'ferramenta', 'miudeza'];
const TODOS = [...PORTATEIS, 'veiculo', 'construcao'];

/**
 * Verbos transitivos: `t` lista as categorias de objeto aceitas e `h` marca
 * os que pedem sujeito humano.
 */
export const VERBS_TRANS = [
  { w: 'comeu', t: ['comida'] },
  { w: 'escondeu', t: PORTATEIS },
  { w: 'encontrou', t: PORTATEIS },
  { w: 'carregou', t: PORTATEIS },
  { w: 'perdeu', t: PORTATEIS },
  { w: 'derrubou', t: ['recipiente', 'instrumento', 'aparelho', 'ferramenta', 'miudeza', 'comida'] },
  { w: 'empurrou', t: ['veiculo', 'recipiente', 'ferramenta', 'construcao'] },
  { w: 'quebrou', t: ['aparelho', 'instrumento', 'recipiente', 'ferramenta', 'veiculo', 'construcao', 'miudeza'] },
  { w: 'comprou', t: TODOS, h: true },
  { w: 'vendeu', t: TODOS, h: true },
  { w: 'guardou', t: PORTATEIS, h: true },
  { w: 'entregou', t: PORTATEIS, h: true },
  { w: 'embrulhou', t: ['comida', 'roupa', 'papel', 'instrumento', 'miudeza', 'aparelho'], h: true },
  { w: 'examinou', t: TODOS, h: true },
  { w: 'consertou', t: ['aparelho', 'instrumento', 'veiculo', 'ferramenta', 'construcao'], h: true },
  { w: 'pintou', t: ['construcao', 'veiculo', 'recipiente', 'ferramenta', 'miudeza'], h: true },
  { w: 'desenhou', t: ['construcao', 'veiculo', 'instrumento', 'comida', 'miudeza'], h: true },
  { w: 'lavou', t: ['roupa', 'recipiente', 'veiculo', 'ferramenta', 'comida'], h: true },
];

/** Verbos intransitivos; `h` marca os que pedem sujeito humano. */
export const VERBS_INTRANS = [
  { w: 'dormiu' }, { w: 'correu' }, { w: 'caiu' }, { w: 'sumiu' },
  { w: 'acordou' }, { w: 'tropeçou' }, { w: 'mergulhou' }, { w: 'voltou' },
  { w: 'espirrou' }, { w: 'bocejou' }, { w: 'gritou' }, { w: 'chorou' },
  { w: 'sorriu', h: true }, { w: 'dançou', h: true }, { w: 'cantou', h: true },
  { w: 'viajou', h: true }, { w: 'assobiou', h: true }, { w: 'reclamou', h: true },
];

/** Adjetivos para seres vivos (sujeito). */
export const ADJ_PERSON = [
  { m: 'curioso', f: 'curiosa' },
  { m: 'feliz', f: 'feliz' },
  { m: 'teimoso', f: 'teimosa' },
  { m: 'calmo', f: 'calma' },
  { m: 'rápido', f: 'rápida' },
  { m: 'elegante', f: 'elegante' },
  { m: 'barulhento', f: 'barulhenta' },
  { m: 'distraído', f: 'distraída' },
  { m: 'velho', f: 'velha' },
  { m: 'pequeno', f: 'pequena' },
  { m: 'enorme', f: 'enorme' },
  { m: 'sonolento', f: 'sonolenta' },
];

/** Adjetivos para objetos. */
export const ADJ_THING = [
  { m: 'velho', f: 'velha' },
  { m: 'novo', f: 'nova' },
  { m: 'azul', f: 'azul' },
  { m: 'verde', f: 'verde' },
  { m: 'amarelo', f: 'amarela' },
  { m: 'enorme', f: 'enorme' },
  { m: 'pequeno', f: 'pequena' },
  { m: 'molhado', f: 'molhada' },
  { m: 'brilhante', f: 'brilhante' },
  { m: 'dourado', f: 'dourada' },
  { m: 'antigo', f: 'antiga' },
  { m: 'estranho', f: 'estranha' },
];

/** Advérbios de uma palavra. */
export const ADVERBS = [
  'ontem', 'hoje', 'cedo', 'tarde', 'sempre', 'novamente', 'depressa',
  'devagar', 'silenciosamente', 'alegremente', 'finalmente', 'rapidamente',
  'anteontem', 'nervosamente',
];

/** Locuções adverbiais agrupadas pelo número exato de palavras. */
export const PHRASES_BY_LEN = {
  2: [
    'no jardim', 'na cozinha', 'no telhado', 'na praia', 'no mercado',
    'na escola', 'na floresta', 'na varanda', 'no museu', 'na estação',
    'no porão', 'na biblioteca', 'no elevador', 'na garagem',
  ],
  3: [
    'perto do rio', 'dentro da caixa', 'atrás do muro', 'debaixo da cama',
    'com muita pressa', 'durante a tempestade', 'antes do jantar',
    'depois da chuva', 'longe da cidade', 'sobre o tapete',
  ],
  4: [
    'em cima da mesa', 'no meio da rua', 'ao lado da janela',
    'por causa do barulho', 'no fundo do quintal', 'na frente do portão',
  ],
};

/** Conectivos que unem duas orações (contam como 1 palavra). */
export const CONNECTORS = ['e', 'mas', 'porque', 'enquanto', 'então', 'depois'];

/**
 * Banco de palavras concretas para o modo "palavras aleatórias".
 * Palavras curtas e comuns, fáceis de digitar no celular.
 */
export const WORD_BANK = [
  'abelha', 'agulha', 'alface', 'anel', 'apito', 'areia', 'arroz', 'balde',
  'banco', 'bandeira', 'barco', 'batata', 'bicicleta', 'bilhete', 'bolo',
  'bolsa', 'bota', 'braço', 'bule', 'cabana', 'cachecol', 'caderno', 'caixa',
  'caju', 'caldeira', 'camisa', 'caneca', 'caneta', 'canoa', 'capacete',
  'carroça', 'carta', 'casaco', 'castelo', 'cebola', 'cenoura', 'cesta',
  'chave', 'chapéu', 'chuveiro', 'cinto', 'cofre', 'colar', 'colher',
  'corda', 'coroa', 'cortina', 'dedal', 'dente', 'escada', 'escova',
  'espelho', 'esponja', 'estrela', 'faca', 'farol', 'ferro', 'flauta',
  'flecha', 'floresta', 'fogão', 'folha', 'forno', 'fósforo', 'fralda',
  'funil', 'gaiola', 'galho', 'garfo', 'garrafa', 'geladeira', 'gelo',
  'grade', 'guarda', 'guitarra', 'harpa', 'hélice', 'igreja', 'ilha',
  'janela', 'jarra', 'jornal', 'kiwi', 'lago', 'lâmpada', 'lanterna',
  'lápis', 'laranja', 'leque', 'lençol', 'livro', 'luva', 'maçã', 'machado',
  'malha', 'mangueira', 'manteiga', 'mapa', 'martelo', 'medalha', 'melão',
  'mesa', 'moeda', 'mochila', 'moinho', 'muleta', 'muro', 'navio', 'nevoeiro',
  'ninho', 'novelo', 'nuvem', 'óculos', 'ombro', 'ovelha', 'palito',
  'panela', 'papel', 'parafuso', 'pastel', 'pedra', 'peneira', 'pente',
  'pilha', 'pincel', 'pipa', 'pires', 'planta', 'ponte', 'porta', 'pote',
  'praia', 'prato', 'prego', 'quadro', 'queijo', 'raiz', 'rede', 'relógio',
  'remo', 'rio', 'roda', 'rolha', 'rosa', 'saco', 'sabonete', 'sanduíche',
  'sapato', 'selo', 'sino', 'sofá', 'sorvete', 'tambor', 'tapete', 'teia',
  'telhado', 'tesoura', 'tigela', 'tijolo', 'toalha', 'tomate', 'torneira',
  'trator', 'trilho', 'tronco', 'túnel', 'uva', 'vaso', 'vassoura', 'vela',
  'ventilador', 'vidro', 'violão', 'xícara', 'zebra',
];

/** Artigo definido conforme o gênero. */
export function article(gender) {
  return gender === 'f' ? 'a' : 'o';
}

/** Forma do adjetivo conforme o gênero. */
export function adjForm(adj, gender) {
  return gender === 'f' ? adj.f : adj.m;
}
