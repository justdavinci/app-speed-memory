// MEMORY LAB — corpus inicial de literatura real.
//
// Os textos-base são obras de Machado de Assis em domínio público. Este pack
// não incorpora PDFs, notas críticas, estudos, capas ou diagramação das edições
// fornecidas ao projeto. Os trechos foram normalizados para a ortografia do app
// e servem apenas como seed técnico; a arquitetura aceita packs maiores.
//
// Regra metodológica: o split é da UNIDADE DE CONTEÚDO. Derivações de uma
// unidade (página, binding, delayed probe) nunca podem atravessar splits.

export const LITERATURE_SEED_META = {
  id: 'machado-seed-v1',
  version: 1,
  label: 'Machado de Assis — corpus real v1',
  kind: 'literature',
  language: 'pt-BR',
  note: 'Corpus inicial para validar o Memory Lab; não é um holdout ecológico forte porque as obras podem ser familiares ao usuário.',
};

const S = (x) => ({ family: 'literature', packId: LITERATURE_SEED_META.id, ...x });

export const LITERATURE_SEED = [
  S({
    id: 'dc-title-01', split: 'train', source: 'Dom Casmurro', chapter: 'I — Do título',
    title: 'O apelido no trem',
    blocks: [
      'Numa viagem curta de trem para o Engenho Novo, o narrador encontrou um rapaz do bairro que começou a recitar versos. Cansado, fechou os olhos algumas vezes; o rapaz interrompeu a leitura e guardou os versos.',
      'No dia seguinte, o rapaz passou a chamá-lo de Dom Casmurro. Os vizinhos adotaram a alcunha. “Casmurro”, ali, queria dizer homem calado e metido consigo; “Dom” entrou por ironia, como se lhe desse ares de fidalgo.',
    ],
    summary: 'O narrador explica que ganhou o nome Dom Casmurro depois de cochilar enquanto um conhecido recitava versos no trem.',
    semanticDistractors: [
      'O narrador escolhe o título em homenagem a um parente que vivia no Engenho Novo.',
      'Um poeta publica versos usando o nome do narrador sem autorização.',
      'Os vizinhos inventam o nome para celebrar a mudança do narrador para Petrópolis.',
    ],
    anchors: [{ text: 'Engenho Novo', block: 0 }, { text: 'versos', block: 0 }, { text: 'Casmurro', block: 1 }, { text: 'fidalgo', block: 1 }],
    facts: [
      { prompt: 'Onde ocorreu o encontro que originou o apelido?', answer: 'No trem', distractors: ['Num teatro', 'Numa igreja', 'Numa praça'] },
      { prompt: 'O que o rapaz fazia durante a viagem?', answer: 'Recitava versos', distractors: ['Vendia jornais', 'Jogava cartas', 'Contava moedas'] },
      { prompt: 'Por que o rapaz interrompeu a leitura?', answer: 'Porque o narrador cochilou', distractors: ['Porque o trem parou', 'Porque perdeu o papel', 'Porque chegou um fiscal'] },
    ],
  }),
  S({
    id: 'dc-house-02', split: 'train', source: 'Dom Casmurro', chapter: 'II — Do livro',
    title: 'A casa reproduzida',
    blocks: [
      'No Engenho Novo, o narrador mandou construir uma casa que reproduzisse a antiga residência de Mata-cavalos. O prédio tinha três janelas de frente, varanda ao fundo e disposição semelhante de alcovas e salas.',
      'Na sala principal, o teto e as paredes traziam grinaldas, pássaros e figuras das estações. Havia ainda medalhões de César, Augusto, Nero e Massinissa, com os nomes por baixo.',
      'A tentativa de repetir a casa antiga tinha um propósito: ligar as duas pontas da vida e restaurar, na velhice, a adolescência. O narrador reconhece que conseguiu imitar a aparência, mas não recompor o que ele próprio fora.',
    ],
    summary: 'A reconstrução da casa antiga é uma tentativa de ligar a velhice à adolescência, mas a aparência não restaura a vida passada.',
    semanticDistractors: [
      'A casa nova é construída para substituir uma propriedade vendida por dívidas.',
      'O narrador pretende abrir um museu dedicado aos imperadores romanos.',
      'A decoração da casa é usada para provar que a residência pertenceu à família imperial.',
    ],
    anchors: [{ text: 'três janelas', block: 0 }, { text: 'Massinissa', block: 1 }, { text: 'adolescência', block: 2 }, { text: 'Mata-cavalos', block: 0 }],
    facts: [
      { prompt: 'Quantas janelas de frente são mencionadas?', answer: 'Três', distractors: ['Duas', 'Quatro', 'Cinco'] },
      { prompt: 'Qual destes nomes aparece nos medalhões?', answer: 'Massinissa', distractors: ['Sócrates', 'Cícero', 'Homero'] },
      { prompt: 'O que o narrador queria ligar simbolicamente?', answer: 'As duas pontas da vida', distractors: ['Duas casas vizinhas', 'O campo e a cidade', 'A família e a política'] },
    ],
  }),
  S({
    id: 'dc-denuncia-03', split: 'train', source: 'Dom Casmurro', chapter: 'III — A denúncia',
    title: 'A conversa atrás da porta',
    blocks: [
      'Ao ouvir o próprio nome na sala, Bentinho escondeu-se atrás da porta. Era 1857. José Dias perguntava a D. Glória se ela ainda pretendia mandar o rapaz para o seminário.',
      'José Dias disse haver uma dificuldade: Bentinho andava em segredos com a filha do Pádua. D. Glória respondeu que os dois eram crianças, lembrando que Bentinho tinha quinze anos e Capitu fizera quatorze na semana anterior.',
      'Apesar da dúvida sobre o namoro, D. Glória concluiu que já era tempo de encaminhar Bentinho ao seminário e tratar do cumprimento da promessa.',
    ],
    summary: 'Bentinho ouve escondido a denúncia de José Dias sobre sua proximidade com Capitu e a conversa acelera o plano do seminário.',
    semanticDistractors: [
      'Bentinho revela voluntariamente a D. Glória que deseja entrar no seminário.',
      'José Dias tenta impedir Capitu de estudar com Bentinho por causa de uma dívida.',
      'D. Glória decide abandonar a promessa religiosa depois de conversar com Pádua.',
    ],
    anchors: [{ text: '1857', block: 0 }, { text: 'quinze', block: 1 }, { text: 'quatorze', block: 1 }, { text: 'seminário', block: 2 }],
    facts: [
      { prompt: 'Em que ano se passa a conversa?', answer: '1857', distractors: ['1842', '1869', '1875'] },
      { prompt: 'Qual idade de Bentinho é mencionada?', answer: 'Quinze anos', distractors: ['Treze anos', 'Quatorze anos', 'Dezesseis anos'] },
      { prompt: 'Quem apresentou a “dificuldade” a D. Glória?', answer: 'José Dias', distractors: ['Tio Cosme', 'Pádua', 'Padre Cabral'] },
    ],
  }),
  S({
    id: 'dc-josedias-04', split: 'train', source: 'Dom Casmurro', chapter: 'IV — Um dever amaríssimo!',
    title: 'José Dias em detalhes',
    blocks: [
      'José Dias gostava de superlativos e os usava para dar feição monumental às ideias. Ao levantar-se, aparecia com calças brancas engomadas, presilhas, rodaque e gravata de mola.',
      'Era magro, tinha princípio de calva e cerca de cinquenta e cinco anos. Seu passo habitual era vagaroso, mas não por preguiça: parecia calculado, como um silogismo que passa de premissa a consequência e conclusão.',
    ],
    summary: 'A descrição de José Dias combina roupa, aparência física e um modo de andar deliberadamente calculado.',
    semanticDistractors: [
      'José Dias é descrito como um jovem impulsivo que rejeita formalidades.',
      'O personagem abandona os superlativos porque deseja falar de maneira mais simples.',
      'A cena enfatiza que José Dias era conhecido principalmente por sua velocidade ao caminhar.',
    ],
    anchors: [{ text: 'superlativos', block: 0 }, { text: 'gravata de mola', block: 0 }, { text: 'cinquenta e cinco', block: 1 }, { text: 'silogismo', block: 1 }],
    facts: [
      { prompt: 'Que recurso de linguagem José Dias amava?', answer: 'Superlativos', distractors: ['Diminutivos', 'Provérbios', 'Rimas'] },
      { prompt: 'Aproximadamente quantos anos ele tinha?', answer: 'Cinquenta e cinco', distractors: ['Quarenta', 'Sessenta e cinco', 'Trinta e cinco'] },
      { prompt: 'A que seu passo calculado é comparado?', answer: 'A um silogismo', distractors: ['A um relógio', 'A uma valsa', 'A uma marcha militar'] },
    ],
  }),
  S({
    id: 'dc-capitu-05', split: 'novel', source: 'Dom Casmurro', chapter: 'XXXI — As curiosidades de Capitu',
    title: 'A curiosidade de Capitu',
    blocks: [
      'Capitu gostava de saber de tudo. Aprendera a ler, escrever e contar, além de francês, doutrina e trabalhos de agulha. Como não sabia fazer renda, pediu que prima Justina lhe ensinasse.',
      'Quis aprender latim, mas ouviu que não era língua de meninas. Tentou inglês com um professor amigo do pai e aprendeu gamão com tio Cosme. Também desenhava, interessava-se por música e folheava livros de gravuras para perguntar por pessoas, campanhas, nomes e lugares.',
      'Certa vez, fez de memória um retrato do pai de Bentinho. O desenho estava longe da perfeição, mas impressionou por ter sido realizado em poucos minutos sem formação artística.',
    ],
    summary: 'O trecho mostra Capitu como intelectualmente curiosa e disposta a aprender muitas habilidades, inclusive por iniciativa própria.',
    semanticDistractors: [
      'Capitu evita aprender assuntos que não fazem parte do currículo do colégio.',
      'A principal habilidade de Capitu é a pintura acadêmica aprendida com José Dias.',
      'Capitu abandona os livros porque prefere dedicar-se exclusivamente ao gamão.',
    ],
    anchors: [{ text: 'francês', block: 0 }, { text: 'latim', block: 1 }, { text: 'gamão', block: 1 }, { text: 'retrato', block: 2 }],
    facts: [
      { prompt: 'Quem ensinou gamão a Capitu?', answer: 'Tio Cosme', distractors: ['José Dias', 'Padre Cabral', 'Bentinho'] },
      { prompt: 'Qual idioma ela tentou aprender com um professor amigo do pai?', answer: 'Inglês', distractors: ['Italiano', 'Alemão', 'Grego'] },
      { prompt: 'O retrato feito de memória representava quem?', answer: 'O pai de Bentinho', distractors: ['José Dias', 'Tio Cosme', 'O pai de Capitu'] },
    ],
  }),
  S({
    id: 'dc-reliquias-06', split: 'holdout', source: 'Dom Casmurro', chapter: 'LXXXVII — A sege',
    title: 'O museu de relíquias',
    blocks: [
      'A mãe de Bentinho conservava hábitos e objetos antigos por apego ao passado. A velha sege da família continuou em uso mesmo quando já era uma raridade no bairro.',
      'Entre as relíquias guardadas havia pentes fora de uso, um trecho de mantilha e moedas de cobre datadas de 1824 e 1825. O que vinha do marido era preservado como se conservasse uma parte da pessoa.',
    ],
    summary: 'Objetos antigos funcionam como vínculos materiais com o passado e com o marido falecido.',
    semanticDistractors: [
      'A família vende todas as peças antigas para custear o seminário de Bentinho.',
      'A sege é mantida porque era o meio de transporte mais barato da cidade.',
      'As moedas antigas são colecionadas por José Dias para estudo econômico.',
    ],
    anchors: [{ text: 'sege', block: 0 }, { text: 'mantilha', block: 1 }, { text: '1824', block: 1 }, { text: '1825', block: 1 }],
    facts: [
      { prompt: 'Quais anos aparecem nas moedas guardadas?', answer: '1824 e 1825', distractors: ['1814 e 1815', '1834 e 1835', '1842 e 1843'] },
      { prompt: 'Qual destes objetos fazia parte das relíquias?', answer: 'Um trecho de mantilha', distractors: ['Uma espada', 'Um telescópio', 'Uma medalha militar'] },
      { prompt: 'A quem os objetos herdados estavam afetivamente ligados?', answer: 'Ao marido falecido', distractors: ['A José Dias', 'A Capitu', 'Ao padre Cabral'] },
    ],
  }),

  S({
    id: 'mp-morte-01', split: 'train', source: 'Memórias Póstumas de Brás Cubas', chapter: 'I — Óbito do autor',
    title: 'A morte de Brás Cubas',
    blocks: [
      'Brás Cubas decide começar suas memórias pela morte, e não pelo nascimento. Diz que morreu às duas horas da tarde de uma sexta-feira de agosto de 1869, em sua chácara de Catumbi.',
      'Tinha cerca de sessenta e quatro anos, era solteiro e possuía aproximadamente trezentos contos. Onze amigos o acompanharam ao cemitério. Chovia de maneira miúda e constante.',
      'Ele atribui a morte à pneumonia, mas anuncia que por trás dela havia também uma ideia grandiosa e útil que pretende explicar ao leitor.',
    ],
    summary: 'Brás Cubas abre o livro pela própria morte e fornece vários detalhes concretos antes de anunciar a história de uma ideia que teria contribuído para ela.',
    semanticDistractors: [
      'Brás Cubas começa pelo nascimento e só depois explica por que abandonou Catumbi.',
      'A abertura descreve uma cerimônia pública grandiosa acompanhada por centenas de pessoas.',
      'O narrador atribui sua morte exclusivamente a um acidente ocorrido durante uma viagem.',
    ],
    anchors: [{ text: '1869', block: 0 }, { text: 'sessenta e quatro', block: 1 }, { text: 'trezentos contos', block: 1 }, { text: 'onze amigos', block: 1 }],
    facts: [
      { prompt: 'Em que ano Brás Cubas diz ter morrido?', answer: '1869', distractors: ['1857', '1882', '1842'] },
      { prompt: 'Quantos amigos o acompanharam ao cemitério?', answer: 'Onze', distractors: ['Sete', 'Dezessete', 'Vinte'] },
      { prompt: 'Onde ocorreu a morte?', answer: 'Na chácara de Catumbi', distractors: ['Em Petrópolis', 'Na Tijuca', 'Em Itaguaí'] },
    ],
  }),
  S({
    id: 'mp-emplasto-02', split: 'train', source: 'Memórias Póstumas de Brás Cubas', chapter: 'II — O emplasto',
    title: 'O emplasto Brás Cubas',
    blocks: [
      'Passeando pela chácara, Brás Cubas imagina um medicamento anti-hipocondríaco destinado, em sua formulação pública, a aliviar a melancolia da humanidade.',
      'Ele admite, porém, que a ideia tinha duas faces. Havia o lado filantrópico e pecuniário, mas também o desejo pessoal de ver o próprio nome impresso em jornais, folhetos, mostradores e caixas de remédio.',
      'O narrador resume essa motivação íntima como amor da glória: queria que três palavras se espalhassem por toda parte — Emplasto Brás Cubas.',
    ],
    summary: 'A invenção do emplasto mistura uma justificativa filantrópica com o desejo pessoal de fama e reconhecimento.',
    semanticDistractors: [
      'O emplasto é criado exclusivamente para enriquecer um tio militar do narrador.',
      'Brás Cubas rejeita qualquer publicidade porque deseja distribuir o medicamento anonimamente.',
      'A invenção surge como resposta a uma ordem direta do governo imperial.',
    ],
    anchors: [{ text: 'anti-hipocondríaco', block: 0 }, { text: 'jornais', block: 1 }, { text: 'caixas de remédio', block: 1 }, { text: 'amor da glória', block: 2 }],
    facts: [
      { prompt: 'Que tipo de medicamento ele imaginava?', answer: 'Um emplasto anti-hipocondríaco', distractors: ['Um tônico para febres', 'Um anestésico', 'Um remédio para os olhos'] },
      { prompt: 'Qual motivação íntima é confessada?', answer: 'Amor da glória', distractors: ['Medo da pobreza', 'Vingança política', 'Obediência familiar'] },
      { prompt: 'O que ele queria ver impresso?', answer: 'Emplasto Brás Cubas', distractors: ['Catumbi Universal', 'Humanitismo', 'Revista Brasileira'] },
    ],
  }),
  S({
    id: 'mp-genealogia-03', split: 'train', source: 'Memórias Póstumas de Brás Cubas', chapter: 'III — Genealogia',
    title: 'A origem dos Cubas',
    blocks: [
      'O fundador da família teria sido Damião Cubas, tanoeiro no Rio de Janeiro. Ele deixou o ofício exclusivo, tornou-se lavrador, acumulou bens e transmitiu patrimônio ao filho Luís Cubas.',
      'Mais tarde, o pai de Brás tentou afastar o sobrenome da imagem da tanoaria. Inventou uma origem heroica: um cavaleiro teria recebido o nome Cubas depois de tomar trezentas cubas aos mouros em jornadas da África.',
      'Antes dessa versão, o pai ainda tentara ligar a família a um homônimo célebre, o capitão-mor Brás Cubas, fundador da vila de São Vicente.',
    ],
    summary: 'A genealogia familiar mistura uma origem modesta real com versões nobres e heroicas inventadas para dar prestígio ao sobrenome.',
    semanticDistractors: [
      'A família sempre se orgulhou publicamente da profissão de tanoeiro de Damião.',
      'O sobrenome Cubas foi concedido oficialmente pelo rei a Luís Cubas.',
      'Brás descobre que sua família veio diretamente de uma linhagem de médicos de Coimbra.',
    ],
    anchors: [{ text: 'Damião Cubas', block: 0 }, { text: 'tanoeiro', block: 0 }, { text: 'trezentas cubas', block: 1 }, { text: 'São Vicente', block: 2 }],
    facts: [
      { prompt: 'Qual era o ofício de Damião Cubas?', answer: 'Tanoeiro', distractors: ['Médico', 'Militar', 'Boticário'] },
      { prompt: 'Quantas cubas aparecem na origem heroica inventada?', answer: 'Trezentas', distractors: ['Cem', 'Duzentas', 'Quinhentas'] },
      { prompt: 'Qual vila é associada ao capitão-mor Brás Cubas?', answer: 'São Vicente', distractors: ['Itaguaí', 'Catumbi', 'Petrópolis'] },
    ],
  }),
  S({
    id: 'mp-jantar-04', split: 'novel', source: 'Memórias Póstumas de Brás Cubas', chapter: 'XII — Um episódio de 1814',
    title: 'O jantar contra Bonaparte',
    blocks: [
      'A notícia da primeira queda de Napoleão provocou grande agitação no Rio de Janeiro. A família de Brás decidiu celebrar a destituição do imperador com um jantar de aparato.',
      'Vieram a velha prataria herdada de Luís Cubas, toalhas de Flandres e grandes jarras da Índia. As salas, escadas, castiçais e arandelas foram limpos e polidos; também se encomendaram compotas e marmeladas.',
      'Entre os convidados havia juiz-de-fora, oficiais militares, comerciantes, letrados e funcionários. O Dr. Vilaça transformou a ocasião em exibição de versos e improvisos.',
    ],
    summary: 'A família transforma a queda de Napoleão em uma celebração doméstica luxuosa, cheia de objetos, convidados e exibição social.',
    semanticDistractors: [
      'A família recebe Napoleão em casa e organiza um jantar para apoiar seu retorno ao poder.',
      'O episódio descreve uma refeição simples preparada apenas para parentes próximos.',
      'Brás recusa participar da celebração porque prefere acompanhar notícias políticas sozinho.',
    ],
    anchors: [{ text: 'Napoleão', block: 0 }, { text: 'Flandres', block: 1 }, { text: 'jarras da Índia', block: 1 }, { text: 'Dr. Vilaça', block: 2 }],
    facts: [
      { prompt: 'Que acontecimento motivou o jantar?', answer: 'A primeira queda de Napoleão', distractors: ['A coroação de Napoleão', 'A morte de Luís Cubas', 'A chegada da família real'] },
      { prompt: 'De onde eram as grandes jarras mencionadas?', answer: 'Da Índia', distractors: ['Da França', 'De Portugal', 'Da Itália'] },
      { prompt: 'Quem improvisava versos durante o jantar?', answer: 'Dr. Vilaça', distractors: ['Quincas Borba', 'Cotrim', 'Damião Cubas'] },
    ],
  }),
  S({
    id: 'mp-sala-05', split: 'train', source: 'Memórias Póstumas de Brás Cubas', chapter: 'CXL — Que explica o anterior',
    title: 'A sala de estudo',
    blocks: [
      'Depois de uma discussão com Quincas Borba, trouxeram café. Era uma hora da tarde. Brás estava em sua sala de estudo, que dava para o fundo da chácara.',
      'Havia bons livros, objetos de arte e um Voltaire de bronze. As cadeiras eram excelentes. Do lado de fora, o sol era forte, soprava vento fresco e o céu estava azul.',
      'Das três janelas pendia uma gaiola com pássaros. Apesar da abundância confortável ao redor, Brás continuava sofrendo pela perda de outra cadeira: a cadeira da Câmara dos Deputados.',
    ],
    summary: 'A descrição detalhada de uma sala confortável contrasta com a frustração política de Brás pela perda do mandato.',
    semanticDistractors: [
      'A sala é vazia e escura, refletindo a pobreza do narrador depois da política.',
      'Quincas Borba convence Brás a vender a casa e abandonar a vida pública.',
      'A principal preocupação de Brás é substituir as gaiolas por obras de arte.',
    ],
    anchors: [{ text: 'uma hora', block: 0 }, { text: 'Voltaire de bronze', block: 1 }, { text: 'três janelas', block: 2 }, { text: 'Câmara dos Deputados', block: 2 }],
    facts: [
      { prompt: 'Que horas eram quando trouxeram o café?', answer: 'Uma hora da tarde', distractors: ['Nove da manhã', 'Três da tarde', 'Sete da noite'] },
      { prompt: 'Quantas janelas tinham gaiolas?', answer: 'Três', distractors: ['Duas', 'Quatro', 'Cinco'] },
      { prompt: 'Que objeto representava Voltaire?', answer: 'Uma peça de bronze', distractors: ['Uma pintura', 'Um livro autografado', 'Uma gravura'] },
    ],
  }),
  S({
    id: 'mp-oportuno-06', split: 'holdout', source: 'Memórias Póstumas de Brás Cubas', chapter: 'LVI — O momento oportuno',
    title: 'Do importuno ao oportuno',
    blocks: [
      'Brás recorda que ele e Virgília chegaram a tratar de casamento no passado, mas se separaram sem grande paixão. Anos depois, reencontraram-se, dançaram algumas voltas de valsa e passaram a amar-se intensamente.',
      'Ele procura explicar a diferença e conclui que a razão era o momento oportuno. Não bastava que os dois indivíduos estivessem prontos para o amor em geral; precisavam estar prontos para aquele amor específico.',
      'Ao perceber a irritação de Virgília com outro pretendente, Brás pensa que talvez já tivesse provocado a mesma reação e resume sua mudança: passara de importuno a oportuno.',
    ],
    summary: 'Brás interpreta a diferença entre dois encontros com Virgília pela ideia de oportunidade: o mesmo par pode produzir resultados diferentes em momentos diferentes.',
    semanticDistractors: [
      'Brás conclui que Virgília mudou completamente de personalidade entre os dois encontros.',
      'A explicação central é que a família de Virgília proibiu qualquer contato entre os dois.',
      'O reencontro fracassa porque ambos continuam exatamente tão indiferentes quanto antes.',
    ],
    anchors: [{ text: 'valsa', block: 0 }, { text: 'momento oportuno', block: 1 }, { text: 'pretendente', block: 2 }, { text: 'importuno', block: 2 }],
    facts: [
      { prompt: 'Que dança aparece no reencontro?', answer: 'Valsa', distractors: ['Polca', 'Mazurca', 'Quadrilha'] },
      { prompt: 'Qual conceito explica a mudança, segundo Brás?', answer: 'O momento oportuno', distractors: ['A sorte política', 'A riqueza', 'A distância geográfica'] },
      { prompt: 'Como Brás resume sua própria evolução?', answer: 'De importuno a oportuno', distractors: ['De pobre a rico', 'De solteiro a casado', 'De cético a religioso'] },
    ],
  }),

  S({
    id: 'oa-bacamarte-01', split: 'train', source: 'O Alienista', chapter: 'I — De como Itaguaí ganhou uma casa de loucos',
    title: 'Simão Bacamarte retorna ao Brasil',
    blocks: [
      'As crônicas de Itaguaí contam que o Dr. Simão Bacamarte, filho da nobreza local, estudou em Coimbra e em Pádua. Aos trinta e quatro anos voltou ao Brasil, embora o rei desejasse mantê-lo em Lisboa.',
      'Bacamarte recusou a perspectiva de servir à monarquia na capital e declarou que a ciência era sua única ocupação. Para ele, Itaguaí seria o seu universo.',
    ],
    summary: 'Bacamarte retorna ao Brasil e escolhe Itaguaí como centro de uma vida inteiramente dedicada à ciência.',
    semanticDistractors: [
      'Bacamarte abandona a medicina para assumir um cargo permanente em Lisboa.',
      'O médico volta ao Brasil por ordem do rei e decide viver no Rio de Janeiro.',
      'Bacamarte retorna a Itaguaí para administrar exclusivamente os negócios da família.',
    ],
    anchors: [{ text: 'Coimbra', block: 0 }, { text: 'Pádua', block: 0 }, { text: 'trinta e quatro', block: 0 }, { text: 'Itaguaí', block: 1 }],
    facts: [
      { prompt: 'Em quais cidades/universidades Bacamarte estudou?', answer: 'Coimbra e Pádua', distractors: ['Lisboa e Paris', 'Roma e Coimbra', 'Madrid e Pádua'] },
      { prompt: 'Com que idade ele voltou ao Brasil?', answer: 'Trinta e quatro anos', distractors: ['Trinta anos', 'Quarenta anos', 'Vinte e cinco anos'] },
      { prompt: 'O que Bacamarte chama de sua única ocupação?', answer: 'A ciência', distractors: ['A política', 'A administração', 'A literatura'] },
    ],
  }),
  S({
    id: 'oa-evarista-02', split: 'train', source: 'O Alienista', chapter: 'I — De como Itaguaí ganhou uma casa de loucos',
    title: 'A escolha de D. Evarista',
    blocks: [
      'Aos quarenta anos, Simão Bacamarte casou-se com D. Evarista da Costa e Mascarenhas, viúva de um juiz de fora e então com vinte e cinco anos.',
      'Bacamarte justificava a escolha por critérios que considerava fisiológicos: ela digeria bem, dormia regularmente, tinha bom pulso e excelente vista. Imaginava que essas condições favoreceriam filhos robustos e inteligentes.',
      'As expectativas não se cumpriram. Depois de anos sem filhos, o médico estudou o problema, consultou autores e universidades e chegou a recomendar à esposa um regime alimentar especial.',
    ],
    summary: 'Bacamarte escolhe a esposa segundo critérios fisiológicos e depois tenta investigar metodicamente por que o casal não tem filhos.',
    semanticDistractors: [
      'O casamento acontece porque D. Evarista é considerada a mulher mais bela da região.',
      'Bacamarte abandona qualquer investigação quando percebe que não terá filhos.',
      'D. Evarista é médica e passa a conduzir os estudos científicos do marido.',
    ],
    anchors: [{ text: 'quarenta', block: 0 }, { text: 'vinte e cinco', block: 0 }, { text: 'bom pulso', block: 1 }, { text: 'regime alimentar', block: 2 }],
    facts: [
      { prompt: 'Com que idade Bacamarte se casou?', answer: 'Quarenta anos', distractors: ['Trinta e quatro anos', 'Trinta anos', 'Cinquenta anos'] },
      { prompt: 'Quantos anos tinha D. Evarista?', answer: 'Vinte e cinco anos', distractors: ['Vinte anos', 'Trinta e cinco anos', 'Quarenta anos'] },
      { prompt: 'Qual destas características foi citada por Bacamarte?', answer: 'Excelente vista', distractors: ['Excelente memória', 'Grande força física', 'Audição absoluta'] },
    ],
  }),
  S({
    id: 'oa-patologia-03', split: 'train', source: 'O Alienista', chapter: 'I — De como Itaguaí ganhou uma casa de loucos',
    title: 'O recanto psíquico',
    blocks: [
      'Depois das frustrações domésticas, Bacamarte mergulhou ainda mais no estudo e na prática da medicina. Um campo chamou sua atenção de modo especial: o exame da patologia cerebral e do que chamava de recanto psíquico.',
      'Ele julgava a matéria pouco explorada tanto na colônia quanto no reino e viu nisso uma oportunidade para a ciência brasileira. Em conversa com o boticário Crispim Soares, afirmou que a saúde da alma era a ocupação mais digna do médico.',
      'Crispim Soares emendou a frase: seria a ocupação mais digna do verdadeiro médico.',
    ],
    summary: 'Bacamarte volta sua ambição científica para o estudo da mente e encontra em Crispim Soares um interlocutor que reforça sua visão profissional.',
    semanticDistractors: [
      'Bacamarte decide abandonar a medicina mental porque já havia muitos especialistas no reino.',
      'Crispim Soares convence o médico de que apenas doenças físicas merecem estudo.',
      'A Câmara proíbe Bacamarte de falar sobre saúde da alma antes da construção da Casa Verde.',
    ],
    anchors: [{ text: 'patologia cerebral', block: 0 }, { text: 'recanto psíquico', block: 0 }, { text: 'Crispim Soares', block: 1 }, { text: 'verdadeiro médico', block: 2 }],
    facts: [
      { prompt: 'Qual área passou a chamar especialmente a atenção de Bacamarte?', answer: 'A patologia cerebral', distractors: ['A cirurgia militar', 'A botânica', 'A astronomia'] },
      { prompt: 'Quem era o interlocutor citado?', answer: 'Crispim Soares', distractors: ['Padre Lopes', 'D. Evarista', 'José Dias'] },
      { prompt: 'O que Bacamarte chama de ocupação mais digna do médico?', answer: 'A saúde da alma', distractors: ['A riqueza da vila', 'A saúde dos cavalos', 'A política da Câmara'] },
    ],
  }),
  S({
    id: 'oa-casaverde-04', split: 'train', source: 'O Alienista', chapter: 'I — De como Itaguaí ganhou uma casa de loucos',
    title: 'A Casa Verde',
    blocks: [
      'Bacamarte pediu à Câmara autorização para reunir e tratar os loucos de Itaguaí e de outras localidades em um edifício próprio. O município pagaria quando a família do enfermo não pudesse fazê-lo.',
      'Com a licença, começou a construção na rua Nova. O prédio teria cinquenta janelas de cada lado, pátio central e numerosos cubículos.',
      'O asilo recebeu o nome de Casa Verde por causa da cor das janelas, novidade em Itaguaí. A inauguração atraiu gente de vilas próximas e até do Rio de Janeiro, e as cerimônias duraram sete dias.',
    ],
    summary: 'Bacamarte cria um grande asilo em Itaguaí, financiado parcialmente pela Câmara e identificado pelas janelas verdes.',
    semanticDistractors: [
      'A Casa Verde começa como residência particular de Bacamarte e só depois vira escola.',
      'O asilo é construído no Rio de Janeiro e possui sete janelas ao todo.',
      'A Câmara rejeita qualquer participação financeira e obriga todas as famílias a pagar integralmente.',
    ],
    anchors: [{ text: 'rua Nova', block: 1 }, { text: 'cinquenta janelas', block: 1 }, { text: 'Casa Verde', block: 2 }, { text: 'sete dias', block: 2 }],
    facts: [
      { prompt: 'Quantas janelas de cada lado são mencionadas?', answer: 'Cinquenta', distractors: ['Vinte', 'Trinta', 'Setenta'] },
      { prompt: 'Por que o asilo recebeu o nome Casa Verde?', answer: 'Pela cor das janelas', distractors: ['Pelo jardim', 'Pelo uniforme dos médicos', 'Pelo sobrenome do arquiteto'] },
      { prompt: 'Quanto duraram as cerimônias de inauguração?', answer: 'Sete dias', distractors: ['Três dias', 'Dez dias', 'Um mês'] },
    ],
  }),
  S({
    id: 'oa-imposto-05', split: 'novel', source: 'O Alienista', chapter: 'I — De como Itaguaí ganhou uma casa de loucos',
    title: 'O imposto dos penachos',
    blocks: [
      'Para financiar o tratamento dos doentes pobres, os vereadores precisavam encontrar uma nova fonte de receita. Quase tudo já estava tributado em Itaguaí.',
      'A solução foi permitir dois penachos nos cavalos dos enterros mediante pagamento. Quem quisesse enfeitar o coche fúnebre pagaria dois tostões à Câmara, repetindo a quantia conforme as horas entre o falecimento e a última bênção na sepultura.',
      'O escrivão tentou calcular o rendimento possível da taxa, mas um vereador considerava o esforço inútil porque não acreditava que Bacamarte realmente conseguisse reunir os loucos numa mesma casa.',
    ],
    summary: 'A Câmara cria uma taxa funerária incomum para financiar o tratamento de doentes pobres na futura instituição de Bacamarte.',
    semanticDistractors: [
      'O imposto é cobrado sobre livros médicos importados por Bacamarte.',
      'A Câmara decide financiar o asilo exclusivamente com doações voluntárias.',
      'A taxa incide sobre as janelas verdes das casas particulares da cidade.',
    ],
    anchors: [{ text: 'dois penachos', block: 1 }, { text: 'dois tostões', block: 1 }, { text: 'última bênção', block: 1 }, { text: 'escrivão', block: 2 }],
    facts: [
      { prompt: 'Quantos penachos eram permitidos mediante a taxa?', answer: 'Dois', distractors: ['Um', 'Três', 'Quatro'] },
      { prompt: 'Qual valor básico era cobrado?', answer: 'Dois tostões', distractors: ['Cinco tostões', 'Um cruzado', 'Dez réis'] },
      { prompt: 'A taxa estava ligada a qual ocasião?', answer: 'Enterros', distractors: ['Casamentos', 'Feiras', 'Batizados'] },
    ],
  }),
  S({
    id: 'oa-frase-06', split: 'holdout', source: 'O Alienista', chapter: 'I — De como Itaguaí ganhou uma casa de loucos',
    title: 'A inscrição da Casa Verde',
    blocks: [
      'Bacamarte encontrou numa referência atribuída ao Corão a ideia de que os loucos seriam veneráveis porque Alá lhes retiraria o juízo para que não pecassem. Gostou da sentença e resolveu gravá-la na fachada do asilo.',
      'Temendo conflito com o vigário e, indiretamente, com o bispo, preferiu atribuir a frase ao papa Bento VIII. O Padre Lopes, acreditando na referência, chegou a contar durante o almoço a vida daquele pontífice.',
    ],
    summary: 'Para evitar conflito religioso, Bacamarte troca deliberadamente a autoria de uma frase que pretende colocar na fachada da instituição.',
    semanticDistractors: [
      'Bacamarte descobre que Padre Lopes havia escrito a frase e o convida para dirigir o asilo.',
      'A inscrição é retirada porque a Câmara proíbe qualquer referência religiosa em edifícios públicos.',
      'O médico atribui ao rei uma frase que na verdade havia sido escrita por D. Evarista.',
    ],
    anchors: [{ text: 'Corão', block: 0 }, { text: 'fachada', block: 0 }, { text: 'Bento VIII', block: 1 }, { text: 'Padre Lopes', block: 1 }],
    facts: [
      { prompt: 'A qual fonte a ideia era inicialmente associada?', answer: 'Ao Corão', distractors: ['À Bíblia', 'A um decreto real', 'A um tratado médico'] },
      { prompt: 'A quem Bacamarte atribuiu publicamente a frase?', answer: 'Ao papa Bento VIII', distractors: ['Ao rei de Portugal', 'A Crispim Soares', 'A Santo Antônio'] },
      { prompt: 'Onde a frase seria gravada?', answer: 'Na fachada da Casa Verde', distractors: ['Na Câmara', 'Na igreja', 'Na casa de D. Evarista'] },
    ],
  }),
];

export function allStimuli() {
  return LITERATURE_SEED.slice();
}

export function stimuliForSplit(split) {
  return LITERATURE_SEED.filter((s) => s.split === split);
}

export function stimulusById(id) {
  return LITERATURE_SEED.find((s) => s.id === id) || null;
}

export function datasetStats() {
  return LITERATURE_SEED.reduce((acc, s) => {
    acc.total += 1;
    acc[s.split] = (acc[s.split] || 0) + 1;
    acc.sources[s.source] = (acc.sources[s.source] || 0) + 1;
    return acc;
  }, { total: 0, train: 0, novel: 0, holdout: 0, sources: {} });
}

/**
 * Valida invariantes que, se quebradas, contaminam o experimento.
 */
export function validateDataset(items = LITERATURE_SEED) {
  const errors = [];
  const ids = new Set();
  for (const s of items) {
    if (!s.id || ids.has(s.id)) errors.push(`id duplicado/ausente: ${s.id || '—'}`);
    ids.add(s.id);
    if (!['train', 'novel', 'holdout'].includes(s.split)) errors.push(`${s.id}: split inválido`);
    if (!Array.isArray(s.blocks) || s.blocks.length < 2) errors.push(`${s.id}: precisa de 2+ blocos`);
    if (!Array.isArray(s.facts) || s.facts.length < 3) errors.push(`${s.id}: precisa de 3+ fatos`);
    if (!Array.isArray(s.anchors) || s.anchors.length < 3) errors.push(`${s.id}: precisa de 3+ âncoras`);
    for (const a of s.anchors || []) {
      if (!Number.isInteger(a.block) || a.block < 0 || a.block >= (s.blocks?.length || 0)) {
        errors.push(`${s.id}: âncora ${a.text} aponta para bloco inválido`);
      }
    }
  }
  return errors;
}
