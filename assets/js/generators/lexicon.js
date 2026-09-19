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


/*
 * Vocabulário ampliado.
 *
 * Mantido em blocos temáticos para facilitar revisão e futuras expansões.
 * A deduplicação abaixo permite reaproveitar termos do léxico de frases sem
 * aumentar artificialmente o banco com entradas repetidas.
 */
const EXPANDED_WORD_BANK = `
abacate abacaxi abajur abóbora abridor acampamento acordeão aquário agenda água-forte alicate almofada altar ampulheta antena anzol aquarela arco armário asa avental
azulejo babador bagagem baía balanço bambu banheira banquinho barraca barril bastão bateria baú bebedouro bengala berço berimbau beterraba bigorna binóculo
biscoito boia boné boneca borracha botão brinquedo bússola cabide cabo cacto cadeira caixote calendário câmera caminhão campainha campo canhão canivete
capa carimbo carrinho carteira cartaz cartola casca chaleira chinelo chicote chocolate cilindro clipe cobertor colete computador concha cone controle copo corrente
crachá cravo cruz cubo dado diário disco dominó edredom enxada envelope escudo espátula esquadro estante estátua estojo etiqueta extintor faixa fechadura
ferradura filtro fio fivela flor foguete frigideira furadeira gancho gaveta giz globo grampeador gravata hélice hidrante imã ingresso interruptor jaleco lata
lixeira lupa mala mamadeira manequim máscara medalhão megafone microfone moldura monitor mosaico motor óculos panela paralelepípedo paraquedas pedestal
pergaminho piano picareta pneu portão pulseira rádio raquete régua retrato revista rolamento roldana rolo sacola seringa sino skate tamborete teclado
termômetro tesouro tomada troféu urna válvula varal violino zíper
acelga açafrão açúcar agrião alho amendoim amora aveia azeitona bacalhau bacon banana berinjela beterraba brigadeiro brócolis cacau café cajá
camarão canela carambola carne castanha cereal cereja coco cogumelo couve creme ervilha farinha feijão framboesa goiaba grão inhame iogurte jabuticaba
jaca jiló limão linguiça mamão mandioca manga maracujá mel melancia milho morango mostarda nabo noz orégano ovo paçoca palmito pêra pêssego pimenta
pipoca queijo quiabo rabanete repolho sal salame salsa salsicha tangerina tapioca trigo vagem
albatroz alpaca anta aranha arara avestruz besouro bode borboleta búfalo burro cabra camaleão camelo capivara caracol carneiro castor cavalo centopeia
chimpanzé cisne cobra codorna corvo crocodilo cupim doninha dragão dromedário ema escorpião esquilo falcão flamingo foca gafanhoto gaivota galo gambá
garça gavião golfinho gorila grilo guaxinim hamster hipopótamo iguana jacaré jaguar javali joaninha lagarta lagartixa leão lebre libélula lhama lobo
lontra lula mariposa minhoca morcego mosca mosquito onça ornitorrinco panda pantera pato pavão peixe pelicano pinguim polvo porco preguiça rato rinoceronte
sapo siri tamanduá tatu tigre touro tucano vaga-lume veado vespa
aeroporto alameda apartamento arena avenida bairro barragem bosque cais calçada caminho canal capela celeiro chácara cinema circo colina corredor
deserto doca escritório estádio estrada fazenda fortaleza galpão hospital hotel laboratório lagoa litoral loja montanha oficina palácio parque penhasco
piscina praça restaurante rodovia ruína salão santuário teatro torre trilha universidade vale vila vulcão
alumínio âmbar argila bronze carvão cimento cobre cristal diamante estanho granito madeira mármore ouro palha prata quartzo seda tijolo
amanhecer arco-íris aurora brisa cachoeira céu chuva eclipse fumaça granizo horizonte lago mar neblina neve oceano onda orvalho raio relâmpago riacho
rocha serra sombra tempestade terra trovão vento
alecrim bambuzal bromélia cacto camélia cipó coqueiro dália eucalipto figueira girassol hortelã ipê jasmim lavanda lírio manjericão margarida orquídea
palmeira pinheiro samambaia semente trevo tulipa violeta
âncora arado broca bússola capacete cinzel compasso enxada estilete foice furadeira lima marreta pá pinça plaina serrote trena
algodão bermuda blusa bolsa bota calça camiseta capa carteira chinelo colete gravata jaqueta meia pijama saia sandália tênis vestido
avião balão bonde caminhonete carro charrete helicóptero jangada jipe metrô motocicleta ônibus patinete trem veleiro
bacia bandeja bule canudo colher concha escorredor espremedor frigideira garfo jarro liquidificador ralador taça tábua
apontador arquivo calendário cartucho cola caderno envelope estojo fichário marcador pasta prancheta teclado
acordeão bateria clarinete contrabaixo corneta flautim gaita oboé pandeiro piano saxofone trompete ukulele violino xilofone
bola boliche dama dardo fantoche ioiô peteca quebra-cabeça xadrez
`.trim().split(/\s+/);

const EXTRA_SUBJECTS = [
  { w: 'médico', g: 'm', k: 'h' }, { w: 'músico', g: 'm', k: 'h' },
  { w: 'carteiro', g: 'm', k: 'h' }, { w: 'ferreiro', g: 'm', k: 'h' },
  { w: 'bombeiro', g: 'm', k: 'h' }, { w: 'fotógrafo', g: 'm', k: 'h' },
  { w: 'arquiteto', g: 'm', k: 'h' }, { w: 'bibliotecário', g: 'm', k: 'h' },
  { w: 'fazendeiro', g: 'm', k: 'h' }, { w: 'escultor', g: 'm', k: 'h' },
  { w: 'médica', g: 'f', k: 'h' }, { w: 'musicista', g: 'f', k: 'h' },
  { w: 'carteira', g: 'f', k: 'h' }, { w: 'engenheira', g: 'f', k: 'h' },
  { w: 'bombeira', g: 'f', k: 'h' }, { w: 'fotógrafa', g: 'f', k: 'h' },
  { w: 'arquiteta', g: 'f', k: 'h' }, { w: 'bibliotecária', g: 'f', k: 'h' },
  { w: 'fazendeira', g: 'f', k: 'h' }, { w: 'escultora', g: 'f', k: 'h' },
  { w: 'leão', g: 'm', k: 'a' }, { w: 'tigre', g: 'm', k: 'a' },
  { w: 'pinguim', g: 'm', k: 'a' }, { w: 'golfinho', g: 'm', k: 'a' },
  { w: 'esquilo', g: 'm', k: 'a' }, { w: 'camelo', g: 'm', k: 'a' },
  { w: 'pantera', g: 'f', k: 'a' }, { w: 'capivara', g: 'f', k: 'a' },
  { w: 'lontra', g: 'f', k: 'a' }, { w: 'águia', g: 'f', k: 'a' },
];

const EXTRA_OBJECTS = [
  ['abajur','m','aparelho'], ['aspirador','m','aparelho'], ['câmera','f','aparelho'],
  ['computador','m','aparelho'], ['microfone','m','aparelho'], ['teclado','m','aparelho'],
  ['abacaxi','m','comida'], ['banana','f','comida'], ['chocolate','m','comida'],
  ['morango','m','comida'], ['pipoca','f','comida'], ['sanduíche','m','comida'],
  ['violino','m','instrumento'], ['piano','m','instrumento'], ['trompete','m','instrumento'],
  ['pandeiro','m','instrumento'], ['gaita','f','instrumento'], ['bateria','f','instrumento'],
  ['agenda','f','papel'], ['cartaz','m','papel'], ['envelope','m','papel'],
  ['revista','f','papel'], ['diário','m','papel'], ['pergaminho','m','papel'],
  ['mala','f','recipiente'], ['jarra','f','recipiente'], ['baú','m','recipiente'],
  ['sacola','f','recipiente'], ['bacia','f','recipiente'], ['bandeja','f','recipiente'],
  ['alicate','m','ferramenta'], ['serrote','m','ferramenta'], ['furadeira','f','ferramenta'],
  ['enxada','f','ferramenta'], ['compasso','m','ferramenta'], ['marreta','f','ferramenta'],
  ['avião','m','veiculo'], ['caminhão','m','veiculo'], ['trem','m','veiculo'],
  ['motocicleta','f','veiculo'], ['ônibus','m','veiculo'], ['helicóptero','m','veiculo'],
  ['torre','f','construcao'], ['celeiro','m','construcao'], ['palácio','m','construcao'],
  ['hospital','m','construcao'], ['cabana','f','construcao'], ['fortaleza','f','construcao'],
  ['botão','m','miudeza'], ['bússola','f','miudeza'], ['dado','m','miudeza'],
  ['fivela','f','miudeza'], ['ímã','m','miudeza'], ['chaveiro','m','miudeza'],
].map(([w, g, t]) => ({ w, g, t: [t] }));

const EXTRA_TRANSITIVE = [
  { w: 'abriu', t: ['recipiente','construcao','papel'], h: true },
  { w: 'fechou', t: ['recipiente','construcao','papel'], h: true },
  { w: 'fotografou', t: TODOS, h: true },
  { w: 'organizou', t: PORTATEIS, h: true },
  { w: 'limpou', t: ['aparelho','instrumento','recipiente','ferramenta','veiculo','construcao'], h: true },
  { w: 'montou', t: ['aparelho','instrumento','recipiente','ferramenta','veiculo'], h: true },
  { w: 'poliu', t: ['instrumento','recipiente','ferramenta','veiculo','miudeza'], h: true },
  { w: 'mediu', t: ['roupa','aparelho','instrumento','recipiente','ferramenta','construcao'], h: true },
  { w: 'levantou', t: PORTATEIS },
  { w: 'arrastou', t: ['recipiente','ferramenta','veiculo','miudeza'] },
  { w: 'tocou', t: ['instrumento'], h: true },
  { w: 'provou', t: ['comida'] },
];

const EXTRA_INTRANSITIVE = [
  { w: 'pulou' }, { w: 'nadou' }, { w: 'fugiu' }, { w: 'parou' },
  { w: 'apareceu' }, { w: 'escorregou' }, { w: 'saltou' }, { w: 'descansou' },
  { w: 'conversou', h: true }, { w: 'estudou', h: true }, { w: 'telefonou', h: true },
  { w: 'cozinhou', h: true }, { w: 'trabalhou', h: true }, { w: 'aplaudiu', h: true },
];

const EXTRA_ADJ_PERSON = [
  ['atento','atenta'], ['cansado','cansada'], ['corajoso','corajosa'],
  ['gentil','gentil'], ['impaciente','impaciente'], ['sério','séria'],
  ['tímido','tímida'], ['orgulhoso','orgulhosa'], ['surpreso','surpresa'],
  ['animado','animada'], ['cuidadoso','cuidadosa'], ['apressado','apressada'],
].map(([m, f]) => ({ m, f }));

const EXTRA_ADJ_THING = [
  ['pesado','pesada'], ['leve','leve'], ['redondo','redonda'], ['quadrado','quadrada'],
  ['frágil','frágil'], ['colorido','colorida'], ['empoeirado','empoeirada'],
  ['quente','quente'], ['frio','fria'], ['liso','lisa'], ['áspero','áspera'],
  ['transparente','transparente'], ['quebrado','quebrada'], ['raro','rara'],
].map(([m, f]) => ({ m, f }));

function appendUniqueByWord(target, additions) {
  const existing = new Set(target.map((item) => item.w));
  for (const item of additions) {
    if (!existing.has(item.w)) {
      target.push(item);
      existing.add(item.w);
    }
  }
}

appendUniqueByWord(SUBJECTS, EXTRA_SUBJECTS);
appendUniqueByWord(OBJECTS, EXTRA_OBJECTS);
appendUniqueByWord(VERBS_TRANS, EXTRA_TRANSITIVE);
appendUniqueByWord(VERBS_INTRANS, EXTRA_INTRANSITIVE);

for (const adj of EXTRA_ADJ_PERSON) {
  if (!ADJ_PERSON.some((item) => item.m === adj.m && item.f === adj.f)) ADJ_PERSON.push(adj);
}
for (const adj of EXTRA_ADJ_THING) {
  if (!ADJ_THING.some((item) => item.m === adj.m && item.f === adj.f)) ADJ_THING.push(adj);
}

ADVERBS.push(
  ...['amanhã','aqui','ali','adiante','juntos','sozinho','cuidadosamente',
      'subitamente','calmamente','discretamente','imediatamente','lentamente']
    .filter((word) => !ADVERBS.includes(word)),
);

const EXTRA_PHRASES = {
  2: ['no parque','na praça','no teatro','na oficina','no campo','na fazenda',
      'no corredor','na montanha','na piscina','no escritório','na cabana','na torre'],
  3: ['ao amanhecer','perto da ponte','diante do portão','através da janela',
      'antes da viagem','depois do almoço','durante a manhã','longe do mercado'],
  4: ['à beira do lago','no alto da colina','do outro lado da rua',
      'perto da porta azul','no centro da praça','ao redor da fogueira'],
};
for (const [len, phrases] of Object.entries(EXTRA_PHRASES)) {
  PHRASES_BY_LEN[len].push(...phrases.filter((p) => !PHRASES_BY_LEN[len].includes(p)));
}

const expandedWords = [
  ...EXPANDED_WORD_BANK,
  ...SUBJECTS.map((item) => item.w),
  ...OBJECTS.map((item) => item.w),
];
WORD_BANK.push(...expandedWords.filter((word, index) =>
  !WORD_BANK.includes(word) && expandedWords.indexOf(word) === index
));

/** Artigo definido conforme o gênero. */
export function article(gender) {
  return gender === 'f' ? 'a' : 'o';
}

/** Forma do adjetivo conforme o gênero. */
export function adjForm(adj, gender) {
  return gender === 'f' ? adj.f : adj.m;
}
