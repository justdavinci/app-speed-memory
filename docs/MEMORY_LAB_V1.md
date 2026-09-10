# Memory Lab v1 — One Exposure Memory Pipeline

## 1. Objetivo

O Memory Lab é uma aba separada do Try Hard. O Try Hard isola principalmente captura, disponibilidade e transferência visual; o Lab tenta compor uma habilidade mais ampla:

> **uma única exposição externa → representação consultável → retenção → recuperação → transferência.**

A ambição deliberada é aproximar o comportamento funcional de “vi uma vez e ficou”. Isso é um **alvo de treinamento e mensuração**, não uma garantia de ausência literal de esquecimento, memória fotográfica ou alteração de QI.

O produto deve apostar alto na progressão, mas ser conservador na interpretação dos dados.

---

## 2. Pipeline treinado

A v1 acompanha sete componentes principais:

1. **One-shot capture** — quanto detalhe entra numa única exposição.
2. **Binding** — preservação de relações: quem/qual valor/onde/ordem.
3. **Pattern separation** — manter representações parecidas distintas.
4. **Retention** — quanto tempo uma representação em branco continua utilizável.
5. **Interference resistance** — quanto sobrevive depois de informação nova.
6. **Retrieval / reconstruction** — recuperar estrutura, significado e localização.
7. **Novel / life transfer** — desempenho em material reservado.

Os pontos 0–100 são uma escala interna do protocolo. Não são “subQI”, percentis normativos ou diagnóstico clínico.

---

## 3. Regra One Shot

Uma unidade é `oneShotValid` somente na primeira exposição externa conhecida pelo app.

- Depois de exibida, o `stimulusId` entra num registro monotônico de `seen`.
- Esse registro não é podado para economizar espaço. Em escala maior, deve migrar para IndexedDB, não esquecer exposições antigas.
- Repetições continuam permitidas em drills específicos, mas recebem `measurementEligible=false` e não podem inflar o perfil geral.
- Um material usado como distractor de interferência também é considerado visto.
- Page Capture e Life Transfer exigem material fresco.

**Nunca reclassificar um estímulo visto como virgem.**

---

## 4. Delayed retrieval sem reexposição

One Shot agenda probes em intervalos posteriores. A v1 usa:

- aproximadamente 5 minutos;
- aproximadamente 24 horas.

O probe:

1. não mostra novamente a página;
2. usa uma pergunta não apresentada no teste imediato;
3. registra `actualAgeMs`, e não apenas o intervalo solicitado;
4. entra na curva de retenção como recuperação tardia.

A recuperação em si pode reativar/fortalecer a memória. Por isso probes são identificados separadamente e nunca tratados como novas exposições.

---

## 5. Retention não é Interference Resistance

A curva principal de Retention usa somente condições sem uma segunda carga interveniente.

`separation` e `interference` ficam fora da curva de Retention porque introduzem material adicional antes da recuperação.

Assim:

- **Retention:** “por quanto tempo consigo manter isto sem nova interferência?”
- **Interference:** “quanto desta representação sobrevive quando outro material entra?”

Misturar os dois produziria uma métrica sem interpretação clara.

---

## 6. Adaptação

Meta de treino da v1: aproximadamente **72–86%**.

A adaptação altera uma dimensão temporal por mudança:

1. primeiro preserva precisão;
2. quando sobra desempenho, alterna entre:
   - reduzir exposição;
   - aumentar retenção;
3. quando a performance cai demais, alivia o último eixo;
4. nunca aperta exposição e retenção simultaneamente numa única mudança.

Escadas atuais são versionadas em `memoryLab/config.js`.

---

## 7. Perguntas imprevisíveis

O tipo de pergunta só é conhecido depois da exposição. O banco pode testar:

- detalhe/âncora literal;
- binding factual;
- estrutura da página;
- localização espacial aproximada;
- significado/resumo, quando o dataset possui gabarito explícito;
- distinção entre duas fichas parecidas.

O runtime **não inventa** um resumo correto quando o corpus não traz um gabarito semântico. Packs page-only continuam válidos para captura/topologia/localização.

---

## 8. Modos

### One Shot
Núcleo do sistema. Uma única exposição, perguntas imprevisíveis e probes tardios sem reexposição.

### Page Capture
Pressiona mapa espacial + estrutura + conteúdo + âncoras. O layout pode variar para reduzir dependência do template.

### Binding
Ficha de relações. Depois da primeira medição fresca, prefere material já visto para não desperdiçar o corpus virgem.

### Pattern Separation
Mostra duas fichas muito semelhantes e cobra qual relação pertencia à primeira.

### Interference
Depois do alvo, apresenta outro material real antes da recuperação.

### Life Transfer
Benchmark com `holdout`. Não adapta e o mesmo holdout não é reutilizado como se fosse novidade.

---

## 9. Train / Novel / Holdout

O split pertence à unidade de conteúdo inteira. Qualquer derivação herda esse split.

- `train`: pode ser usado para treino.
- `novel`: reservado para avaliações intermediárias/futuras de generalização dentro de famílias conhecidas.
- `holdout`: usado somente por Life Transfer.

Não dividir páginas adjacentes/derivações da mesma unidade entre train e holdout em datasets maiores.

O seed atual contém 18 unidades: 12 train, 3 novel e 3 holdout.

---

## 10. Corpus Machado v1

Os três livros fornecidos durante o desenvolvimento serviram como primeira família real:

- *Dom Casmurro*;
- *Memórias Póstumas de Brás Cubas*;
- *O Alienista*.

O repositório **não incorpora os PDFs, capas, notas críticas, estudos ou diagramação específica das edições fornecidas**. O seed contém unidades textuais próprias baseadas nas obras de Machado de Assis em domínio público e é renderizado com layouts do próprio app.

Isso também ajuda metodologicamente: o usuário precisa aprender a capturar estrutura/conteúdo, e não o template gráfico de uma edição.

### Limitação

Três obras do mesmo autor são ótimas para validar a arquitetura, mas não constituem um teste amplo de memória geral. Familiaridade prévia com Machado também impede chamar esse seed de “true novel” para todo usuário.

A próxima expansão deve adicionar famílias realmente diferentes: não ficção, ciência, história, tabelas, documentos, interfaces, mapas, código e cenas.

---

## 11. Corpus privado

A aba Corpus aceita pack JSON armazenado localmente. Isso permite preparar material real sem publicá-lo no repositório.

Formato mínimo:

```json
{
  "id": "meu-pack-v1",
  "label": "Material real",
  "stimuli": [
    {
      "id": "pagina-001",
      "split": "train",
      "source": "Fonte",
      "chapter": "Seção",
      "title": "Título",
      "blocks": ["Bloco superior", "Bloco inferior"],
      "anchors": [
        { "text": "âncora A", "block": 0 },
        { "text": "âncora B", "block": 1 }
      ]
    }
  ]
}
```

Para Binding/Pattern Separation, incluir também `facts` com `prompt`, `answer` e distratores. Para semântica, incluir `summary` e `semanticDistractors`.

A v1 usa localStorage e é adequada a packs modestos. Biblioteca grande deve usar IndexedDB.

---

## 12. Critérios de sucesso

A evolução realmente interessante não é apenas score de treino maior. Procuramos convergência entre:

- exposição menor;
- retenção maior;
- binding melhor;
- menor custo de interferência;
- reconstrução mais rica;
- desempenho em novel/holdout aumentando junto;
- eventualmente, Life Benchmarks de famílias que nunca foram treinadas.

Se treino sobe muito e holdout permanece parado, isso é domínio do exercício, não a transformação geral procurada.

---

## 13. Próximas fases

1. Migrar corpus/seen para IndexedDB.
2. Gerador offline de packs a partir de documentos autorizados/privados.
3. Novel Benchmark separado de true holdout.
4. Recall livre e reconstrução digitada, além de múltipla escolha.
5. Material não verbal: cenas, mapas e interfaces.
6. Interferência verbal vs visual para inferir dependência de subvocalização.
7. Probes de dias/semanas com controle de número de recuperações anteriores.
8. Life Benchmark realmente ecológico e heterogêneo.
9. Difficulty-matched longitudinal model para comparar versões do protocolo.
10. Medir transferência para páginas que não compartilham autor, gênero, fonte ou layout com o treino.
