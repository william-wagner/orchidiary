# Cruza (parentais) no tombamento da planta

Estudo de 23.X.2026, **decidido** e **implementado** no mesmo dia (ver "Decisões", no fim; entrega mínima do §8). Trata do item **"Registrar a cruza (parentais) no tombamento da planta"** do `docs/ROADMAP.md`.

Protótipo navegável: `docs/estudos/cruza-no-tombamento.html` (abra no navegador, largura de celular). Ele usa um catálogo de ensaio com uns poucos táxons.

Modelo de dados ilustrado: `docs/estudos/cruza-modelo-de-dados.html`. Escolha uma planta de exemplo e veja as linhas de `plants`, `taxa` e `crosses`, o caminho na árvore de táxons e de onde vem a ficha (inclui o táxon pessoal da Fase 3).

Caso que motivou: uma planta *Renanthera monachica* × *Vanda falcata*. As duas espécies estão no catálogo, mas a planta só guarda um táxon (`plants.taxon_id`) ou um nome livre (`taxon_text`).

## 0. O que existe hoje

- `taxa` é **global** (sem `user_id`): o catálogo é o mesmo para todo mundo, e só o master edita o Guia.
- Grex registrado é um táxon `hybrid` sob `genus` ou `nothogenus`, e a origem dele já é `cross` (`normalizeOrigin`). Mas o catálogo não diz **de que** ele é cruzamento: não há parentais em lugar nenhum.
- `plants.parent_plant_id` já existe para keiki e divisão (planta-mãe **clonal**). Nenhuma tela usa ainda.
- A ficha efetiva, o índice de conforto (`services/comfort.ts`) e os alertas (`services/alerts.ts`) partem **só** de `plants.taxon_id`. Os alertas chegam a filtrar `taxon_id is not null`.
- `plants.taxon_id` usa `on delete set null`: apagar um táxon no Guia tira a identificação das plantas sem aviso.
- **A Coleção não tem busca por texto.** Os filtros são lugar, "Fora da faixa" e "Ao ar livre". E o `TaxonPicker` busca **táxons** do catálogo, não plantas.
- No catálogo, *Vanda falcata* (ex-*Neofinetia*) e *Renanthera monachica* existem. *Renantanda* não. Como *Neofinetia* foi absorvida por *Vanda*, a RHS registra esses cruzamentos (antes *Renanetia*) como *Renantanda*.

## 1. Uma determinação só: táxon **ou** cruza

A planta é determinada **ou** por um táxon do catálogo (`plants.taxon_id`), **ou** por uma cruza (`plants.cross_id`), nunca pelos dois. Um check no banco garante (§2), como o `plant_locations_source_ck` garante "ou `place_id`, ou coordenadas".

- **Grex registrado** é um táxon. A pessoa escolhe *Vanda* Sansai Blue no campo **Espécie**, sem ligar "É uma cruza". A origem já sai `cross` pelo catálogo, os parentais vêm do grex (quando o catálogo os tiver) e a ficha segue a regra do §3. Pedir os parentais de novo na planta criaria uma segunda cópia da mesma informação, que pode divergir.
- **Grex fora do catálogo** também se registra pela Espécie, num nível acima: *Renantanda* (ou *Vanda*), com o nome do grex em "Como veio na etiqueta" (§1.1). Quando o grex entrar no Guia, a sugestão de troca aponta a planta para ele.
- **Cruza sem nome registrado** liga "É uma cruza" e informa os parentais.

A cruza sem nome **não** vira táxon:

- `taxa` é compartilhado. Um táxon criado para a cruza de uma pessoa apareceria no Guia de todo mundo e na busca do `TaxonPicker`.
- O nível `hybrid` é, por definição, um **nome registrado** (grex). `taxonNameError` exige nome com maiúscula, e "Renanthera monachica × Vanda falcata" não é nome, é fórmula.
- Se um dia a cruza for registrada, basta criar o grex no Guia e apontar a planta para ele.
- A exceção é a cruza **com nome dado pela pessoa**, típica de quem poliniza as próprias plantas: ela vira um **táxon pessoal** (§6.1, Fase 3). A cruza sem nome continua só em `crosses`.

**Trocar a determinação troca a genealogia junto, sem histórico.** A identificação de uma planta pode estar errada, inclusive os parentais: quem achava que tinha *x* × *y* pode descobrir que é *z* × *t*. Então, quando a planta passa a apontar para outro táxon ou outra cruza, os parentais anteriores deixam de valer e não ficam guardados. A cruza antiga só some do banco se nenhuma outra planta a usar (§2). É mais simples por enquanto; um histórico de determinações pode vir depois, se fizer falta.

**Perda pequena, aceita**: um grex fora do catálogo cujo gênero não é híbrido (um *Vanda* que ainda não está no Guia) fica com Espécie = *Vanda* e não mostra o ícone de cruzamento até ser religado ao grex. A etiqueta guarda o nome. Quem quiser o ícone já registra como cruza *Vanda* × *Vanda*.

## 1.1 Nome e etiqueta (opção C)

Como em herbários e coleções vivas de jardins botânicos, a planta guarda **duas coisas separadas**:

- **A determinação**: o táxon da Espécie, sempre do catálogo, ou a cruza (§1). O táxon pode ficar num nível acima quando não dá para ir mais fundo: um grex que não está no catálogo fica no gênero híbrido. É dela a classificação, o link para o Guia, a ficha de cultivo e a origem.
- **O nome como recebido**: o texto literal da plaquinha ou do vendedor, opcional, guardado do jeito que veio, mesmo errado. Não muda a ficha. Hoje isso já é o `taxon_text`, mas como **alternativa** ao táxon (escolher um táxon apaga o texto). Passa a **conviver** com ele.

Por que não "catálogo **ou** nome livre" (o que a Espécie faz hoje): obrigaria a escolher entre ter ficha e guardar o nome certo. O catálogo nunca vai ter todos os grexes da RHS (mais de 100 mil), então o caso é frequente. Por que não deixar a pessoa criar o grex registrado que falta: o catálogo é de todos e só o master edita (volta a fazer sentido na Fase 4, com moderação). O táxon pessoal da Fase 3 (§6.1) é outra coisa: um nome que a pessoa dá à própria cruza, visível só para ela.

Regras:

- Coluna `plants.taxon_text` vira `plants.received_name` (migração de **renomear**, sem perder dados: os valores de hoje já são texto de etiqueta). A API para de apagar o texto quando há táxon.
- O nome recebido é independente da determinação: pode existir com táxon, com cruza ou sozinho.
- **Título da planta**: táxon → fórmula da cruza → nome recebido → "Espécie não determinada". Quando não é o título, o nome recebido aparece na etiqueta da exsicata, entre aspas e em `typed`.
- **Sugestão de troca**: se o nome recebido bate com um táxon do catálogo (`normalizeSearch` igual ao `full_name`) mais específico que a Espécie atual, ou a planta não tem Espécie, o app oferece "Usar como espécie" no formulário e na ficha. Nunca troca sozinho. Numa planta com cruza, aceitar troca a cruza pelo táxon e pede confirmação ("os parentais anotados saem"). Assim, quando o grex entrar no Guia, as plantas que o trazem na etiqueta aparecem para religar. Regra pura `receivedNameMatch` no shared, com teste.
- A mesma regra vale para o **nome livre de cada parental** (`seed_text`, `pollen_text`): quando o texto bate com um táxon do catálogo, a edição da cruza oferece trocar o texto pelo táxon.

## 2. Modelo

A cruza é um **acontecimento** (uma polinização, um lote de sementes, um frasco de mudas), não um atributo da planta. Por isso ela vive numa tabela própria e **quem aponta para ela** é a planta ou o grex, como as plantas apontam para um lugar.

```
crosses                       -- o cruzamento, compartilhável
  id               uuid pk
  user_id          uuid null  → users (cascade)    -- dono; null = cruza do catálogo (de um grex)
  seed_taxon_id    uuid null  → taxa (restrict)
  seed_text        text null                       -- nome livre, fora do catálogo
  pollen_taxon_id  uuid null  → taxa (restrict)
  pollen_text      text null
  care_from        cross_side null ('seed' | 'pollen')   -- de qual parental vem a ficha (§3)
  created_at, updated_at

  check crosses_seed_ck:   não (seed_taxon_id e seed_text ao mesmo tempo)
  check crosses_pollen_ck: idem para pollen
  check crosses_care_ck:   care_from = 'seed' só com seed_taxon_id; 'pollen' só com pollen_taxon_id

plants
  taxon_id         uuid null  → taxa (restrict)    -- era set null
  cross_id         uuid null  → crosses (restrict)
  check plants_determination_ck: no máximo um de taxon_id / cross_id

taxa
  cross_id         uuid null  → crosses (restrict) -- os parentais do grex
  check taxa_cross_rank_ck: cross_id só quando rank = 'hybrid'
```

- **As duas regras centrais ficam no banco**: a planta tem táxon ou cruza (`plants_determination_ck`), e só grex tem parentais no catálogo (`taxa_cross_rank_ck`). A API valida antes para dar mensagem clara, mas o banco não aceita o estado errado.
- **Cada lado** é um táxon de qualquer nível (*Vanda falcata*, ou só *Vanda* quando a pessoa não sabe a espécie), um nome livre, ou **desconhecido**, quando os dois campos estão vazios. Assim `Vanda falcata × ?` é possível, e o híbrido de mercado vira *Vanda* × *Vanda*.
- **Os dois lados desconhecidos** também são permitidos: "é cruza, não sei de quê". A planta tem origem `cross` e se chama "Cruza sem nome", sem ficha.
- **Ordem importa**: `seed_*` é a mãe (semente), `pollen_*` é o pai (pólen). O formulário tem um botão de inverter, porque é comum anotar errado.
- **Irmãs compartilham a cruza.** Mudas do mesmo frasco apontam para a mesma linha; corrigir um parental vale para todas, e a interface diz quantas ("vale para as 6 plantas desta cruza"), como o lugar já faz. Na entrega mínima cada planta nova cria a sua cruza; escolher uma cruza existente ("irmã de…") vem depois, sem mudar o banco.
- **Dono e permissão**: cruza com `user_id` é da pessoa e só ela edita; cruza com `user_id` nulo é do catálogo e só o master edita (junto com o grex). Plantas só apontam para cruzas do próprio dono; um táxon só aponta para cruza do mesmo dono que ele (catálogo com catálogo; táxon pessoal da Fase 3 com cruza da mesma pessoa).
- **Cruza órfã sai**: como a seta parte da planta, apagar a planta ou trocar a determinação não apaga a cruza sozinho. A API remove, na mesma transação, a cruza da pessoa que ficou sem nenhuma planta apontando para ela.
- **Apagar táxon é sempre `restrict`**: parental (`seed_taxon_id`, `pollen_taxon_id`) e determinação da planta (`plants.taxon_id`, que hoje é `set null`). O Guia explica por que não apaga ("usado por N plantas", "parental de N cruzas"). Como a taxonomia muda (*Neofinetia* → *Vanda*), o caminho para tirar um táxon em uso é uma operação futura de **fundir táxon**, que repõe todas as referências antes de apagar.
- **A API devolve resolvido**: `plant.cross = { source: "plant" | "taxon", seed, pollen } | null`, com cada lado já como `{ taxon: TaxonSummary } | { text } | null`. `source: "taxon"` quando os parentais vêm do grex (ou do grex acima de um cultivar). O app não decide de onde veio a cruza (mesma filosofia dos períodos de local).

### Gênero híbrido não entra nesta tabela

*Rhyncholaeliocattleya* combina três gêneros, sem semente nem pólen: é um **conjunto** de gêneros, não um `semente × pólen`. Se um dia o app sugerir o nothogênero a partir dos parentais, o lugar disso é uma tabela própria (`nothogenus_genera`), fora deste item.

## 3. Ficha de cultivo

A ficha de uma cruza vem de **um dos parentais**, o marcado em `care_from`. Não há média nem combinação: a média das faixas de um parental de clima quente com outro de clima frio dá uma faixa que não serve a nenhum. Achar uma regra melhor é um item próprio do roadmap ("Ficha de cultivo de uma cruza").

A regra é **a mesma para a cruza da planta e para a do grex**. `careSource(plant)`, regra pura no shared, com teste:

- **Planta com táxon**: cada campo vem, nesta ordem, de
  1. a ficha própria do táxon e dos níveis até o grex (cultivar, grex), como no `inheritCare` de hoje;
  2. se o grex tem cruza no catálogo, o **parental marcado** dela (ou o do catálogo que houver, a semente primeiro);
  3. o resto da linhagem (gênero híbrido, gênero e acima).
  Para espécie, gênero e qualquer táxon fora de um grex, é exatamente a regra de hoje.
- **Planta com cruza**:
  1. o **parental marcado** (`care_from`), com a ficha efetiva dele (a espécie herda do gênero o que não preencheu);
  2. o parental do catálogo que houver, a semente primeiro (o padrão quando ninguém marcou);
  3. **sem ficha**: sem faixa no gráfico, sem índice de conforto, sem alertas.

- No formulário, o card do parental de onde vem a ficha ganha o selo "ficha de cultivo"; com os dois no catálogo, tocar no outro card troca. Com um só no catálogo, não há escolha. Como `care_from` é da cruza, a escolha vale para as irmãs.
- **Aviso** sempre que a ficha vem de um parental: *"Ficha de Renanthera monachica (a semente), porque esta planta é uma cruza. Cada parental pode pedir cuidados um pouco diferentes: observe como ela responde."* Aparece na etiqueta da exsicata e na nota da seção Clima e ocorrências ("faixa de *Renanthera monachica*, a semente · é uma cruza"). Ficha própria do grex não leva aviso.
- Na API, conforto e alertas deixam de partir de `plants.taxon_id` e passam a usar a ficha que `careSource` resolve. Sai o filtro `taxon_id is not null` dos alertas; entra "tem ficha".
- Ajuste da ficha para uma planta só continua sendo outro item ("Faixa própria da planta", Fase 3) e não passa por `care_from`.

## 4. Exibição

Regra pura `crossNameParts(seed, pollen)` no shared, devolvendo `NamePart[]` como `taxonNameParts`. Cada lado usa `taxonNameParts` da sua linhagem, o nome livre vai em itálico (como `taxon_text` hoje), o desconhecido é `?` e o `×` vai em redondo:

| Caso | Como se registra | Exibição |
|---|---|---|
| Cruza sem nome registrado (o comum) | É uma cruza | *Renanthera monachica* × *Vanda falcata* |
| Intragenérica | É uma cruza | *Cattleya walkeriana* × *Cattleya loddigesii* |
| Pólen desconhecido | É uma cruza | *Vanda falcata* × ? |
| Parental fora do catálogo | É uma cruza | *Renanthera coccinea* × *Vanda 'Gordon Dillon'* |
| Híbrido de mercado | É uma cruza, gêneros | *Vanda* × *Vanda* |
| Nada conhecido | É uma cruza, "não sei" × "não sei" | Cruza sem nome (parentais desconhecidos) |
| Grex no catálogo | Espécie | *Vanda* Sansai Blue |
| Grex no catálogo com parentais (depois da entrega mínima) | Espécie | *Vanda* Rothschildiana, e embaixo *Vanda coerulea* × *Vanda sanderiana* |
| Grex fora do catálogo | Espécie no gênero híbrido + etiqueta | *Renantanda*, etiqueta "Rntda. Sunshine" |

- Cruza: **a fórmula é o título**. Grex com parentais: o grex é o título e a fórmula vem logo abaixo, menor, em `folhagem` (cabeçalho da ficha e card da Coleção). Em texto corrido, a fórmula vai entre parênteses depois do grex.
- Sem abreviar gêneros (*Ren.*, *V.*). As abreviações oficiais são uma lista da RHS que não temos, e abreviar errado é pior que quebrar a linha.
- `PlantTaxon` passa a cuidar dos casos acima, e com isso a ficha e o card da Coleção mudam juntos. `plantOrigin` devolve `cross` sempre que a planta tem cruza (com táxon, a origem é a do catálogo, que já é `cross` para grex e gênero híbrido); o `OriginFlag` já desenha o ícone.
- Texto corrido (alertas do Telegram e prompt da prancha em `services/illustration.ts`, que hoje faz `coalesce(full_name, taxon_text)`): uma versão em texto, `crossFormula`, montada da mesma regra, com o nome recebido só quando não há táxon nem cruza (§1.1).

## 5. Cadastro e edição

- Interruptor (`chave`) **"É uma cruza"** no **cabeçalho do campo Espécie**, à direita do rótulo, sem card próprio. Ligado, o campo vira **Parentais** (semente × pólen). Desligado, é a Espécie de hoje, onde também se escolhe o grex registrado.
- Ligado:
  - **Semente (♀)** e **Pólen (♂)**, cada um com o `TaxonPicker` como está e duas saídas: "não está no catálogo" (nome livre) e "não sei". Um botão ⇅ inverte os dois lados, e a marca da ficha acompanha o parental, não o lado.
  - **Ficha nos cards** (§3): selo "ficha de cultivo" no parental escolhido, a semente por padrão; tocar no outro troca. Embaixo, uma linha curta: "Toque no parental de onde vem a ficha de cultivo", ou o aviso de que, sem parental no catálogo, a planta fica sem ficha.
  - Lado em nome livre que bate com o catálogo ganha a sugestão "Usar o do catálogo" (§1.1).
  - Não há campo de nome: grex registrado se escolhe com o interruptor desligado.
  - Uma prévia mostra como o nome vai ficar na ficha.
- Ligar o interruptor com uma Espécie escolhida limpa a Espécie (a prévia mostra a troca). Desligar numa planta que já tinha cruza pede confirmação ali mesmo; salvar solta a cruza da planta e a apaga se ficou órfã.
- Editar os parentais de uma cruza que outras plantas também usam mostra "vale para as N plantas desta cruza" (depois da entrega mínima, quando houver irmãs).
- Escolher na Espécie um grex com parentais no catálogo mostra a fórmula dele, só para leitura (depois da entrega mínima, quando houver grex com parentais).
- Sempre, na cruza ou não, o campo **"Como veio na etiqueta"** (opcional) substitui o "Ou o nome livre". Fica abaixo da Espécie ou dos parentais, com a dica de que não muda a ficha, e oferece "Usar como espécie" quando bate com o catálogo (§1.1).
- Entrada na API: `taxonId` **ou** `cross: { seed: Side, pollen: Side, careFrom?: "seed" | "pollen" }` em `plantCreateSchema`/update, com `Side = { taxonId } | { text } | null`. Os dois juntos são recusados. Criar com `cross` cria a cruza da pessoa; editar altera a cruza que a planta já usa. `cross: null` solta a cruza; `undefined` não mexe.

## 6. A porta para a genealogia (Fase 3)

Não entra agora, mas o modelo deixa o caminho aberto:

- **Parental da própria coleção**: colunas `seed_plant_id`/`pollen_plant_id` em `crosses` (→ `plants`), um terceiro tipo de lado. Uma polinização da pessoa ("polinizei a #12 com a #31") vira **uma** cruza; ao receber nome, vira também um táxon pessoal (§6.1), e as mudas apontam para esse táxon.
- **Irmãs**: escolher uma cruza existente no cadastro ("mesma cruza da nº 0038") e a lista "outras plantas desta cruza" na ficha.
- **Keiki e divisão** continuam em `plants.parent_plant_id`: são clones e herdam táxon e cruza da mãe, sem passar por `crosses`.
- **Árvore de ancestrais**: recursão pelos lados de `crosses` (táxon → `taxa.cross_id` → parentais do grex; planta → `plants.cross_id` → parentais dela).
- **Parentais dos grexes do catálogo**: o modelo já aceita (`taxa.cross_id`). Falta a edição no Guia e, no `catalog.ts`, um campo `cross: { seed: "Vanda coerulea", pollen: "Vanda sanderiana" }` (no grex Rothschildiana) resolvido por nome completo no seed (o teste do catálogo confere que os nomes existem).
- **Fundir táxon**: operação do Guia que repõe `plants.taxon_id`, `taxa.cross_id` e os lados das cruzas antes de apagar o táxon antigo (§2). Serve também para o táxon pessoal que depois é registrado (§6.1).

### 6.1 Cruza do cultivador: táxon pessoal

Quem faz a própria cruza e dá nome a ela (um nome de trabalho, como "Laranja da Varanda") registra um **táxon pessoal**. A cruza continua em `crosses`; o táxon é o nome dela, e as mudas apontam para o táxon como apontariam para um grex do catálogo.

```
taxa
  user_id   uuid null → users (cascade)   -- null = catálogo (de todos); preenchido = táxon pessoal
  cross_id  → crosses do mesmo dono
```

- **O que a pessoa pode criar**: só `hybrid` (e, abaixo dele, `cultivar`), pendurado num táxon do catálogo (o gênero ou gênero híbrido) ou num táxon pessoal dela. Família, gênero e espécie continuam só no catálogo. O catálogo nunca depende de táxon pessoal: um táxon do catálogo não pode ter pai pessoal nem cruza com lado pessoal.
- **Visibilidade**: o Guia, a busca (`/api/taxa?q=`) e o `TaxonPicker` mostram o catálogo mais os táxons pessoais de quem está logado. Ninguém vê os de outra pessoa.
- **Nome único**: `taxa_parent_rank_name_uq` passa a incluir `user_id`, então duas pessoas podem usar o mesmo nome sob *Renantanda*. Um nome pessoal igual a um grex do catálogo é recusado ("já existe *Renantanda* Sunshine no catálogo").
- **Exibição**: igual a um grex (gênero em itálico, nome em redondo: *Renantanda* Laranja da Varanda), com o selo "não registrado" no Guia e na ficha. A RHS só reconhece nomes registrados, e o selo evita confundir um com o outro.
- **Origem**: `cross`, pela regra que já vale para `hybrid`.
- **Ficha**: a pessoa edita a ficha do próprio táxon, e a regra é a do §3: ficha própria do táxon → parental marcado da cruza dele → gênero. É o primeiro lugar em que alguém além do master preenche uma ficha.
- **Dar nome a uma cruza que já existe**: uma cruza sem nome (comprada ou própria) pode ganhar nome depois. O app cria o táxon pessoal apontando para a mesma cruza e passa as plantas que a usavam de `cross_id` para `taxon_id`, numa transação. Nada se perde, e as irmãs continuam juntas.
- **Quando o nome é registrado de verdade**: o master cria o grex no catálogo e a pessoa **funde** o táxon pessoal nele (§6), ou o master adota o táxon pessoal (passa `user_id` a nulo, com a cruza). As plantas não precisam ser editadas uma a uma.
- **Apagar**: o táxon pessoal só sai se nenhuma planta o usar (`restrict`); a cruza dele sai junto se ficar órfã.
- Migração simples quando chegar a hora: `taxa.user_id` nulo para tudo o que existe (tudo é catálogo). Por isso não precisa entrar na entrega mínima.

## 7. Busca

- **Coleção**: não há busca de texto hoje. Vira item próprio do roadmap ("Busca na Coleção"): um campo de busca **local** (a lista já vem inteira) que casa `normalizeSearch` com apelido, nº de tombo, nome do táxon, nome recebido e os `fullName` dos dois parentais. Assim a planta aparece buscando "monachica" ou "falcata".
- **`TaxonPicker`**: continua buscando táxons e passa a servir também para escolher cada parental. Achar plantas pelo táxon parental fica para quando o Guia listar "plantas da coleção deste táxon", que hoje não existe.

## 8. Entrega mínima

1. Migração (`pnpm db:generate`):
   - tabela `crosses` com `user_id`, os checks de lado e de `care_from`;
   - `plants.cross_id` e o check `plants_determination_ck`;
   - `taxa.cross_id` e o check `taxa_cross_rank_ck`;
   - `plants.taxon_id` de `set null` para `restrict`;
   - `taxon_text` renomeada para `received_name` (confirmar que o drizzle-kit gerou um rename, não drop + add).
2. Shared: `crossInputSchema` (táxon **ou** cruza), `crossNameParts`/`crossFormula`, `careSource` e `receivedNameMatch`, com testes (fórmula com lado desconhecido, nome livre e os dois desconhecidos; fontes da ficha para planta com táxon, com grex com cruza e com cruza própria; `care_from` e inversão).
3. API: criar/editar planta com `cross` (cria ou altera a cruza da pessoa), recusa de táxon e cruza juntos, remoção da cruza órfã, `plant.cross` e a fonte da ficha resolvidos no detalhe e na lista, origem `cross`, conforto e alertas pela ficha resolvida, e as mensagens de `restrict` ao apagar táxon.
4. Web: interruptor, parentais e escolha da ficha nos cards no Novo/Editar; campo "Como veio na etiqueta" no lugar do "Ou o nome livre", com a sugestão de troca (formulário e ficha) e a mesma sugestão nos lados em nome livre; `PlantTaxon` e `plantOrigin` com a cruza (ficha e Coleção); aviso da ficha do parental.
5. Catálogo: `nothogenus("Renantanda", { care: care.vandeae })` em Aeridinae, para a Espécie de grex fora do catálogo (o caso "Rntda. Sunshine").
6. Backup: incluir `crosses` no que já é exportado.

Fora da entrega mínima: parentais de grex no Guia e no `catalog.ts`, escolher cruza existente (irmãs), busca da Coleção, ficha que considere os dois parentais, parental da própria coleção, árvore de ancestrais, fundir táxon e sugestão automática de nothogênero.

## Decisões (23.X.2026)

1. **Cruza como atributo da planta**, não como táxon (§1).
2. **Tabela `crosses`** (§2). A forma de ligação foi revista na decisão 8.
3. **Ficha da cruza vem de um parental**, escolhido nos cards (a semente por padrão), com aviso de que é cruza (§3). Nada de média dos parentais; a regra boa é item próprio do roadmap ("Ficha de cultivo de uma cruza"). Substitui a decisão anterior de usar só a ficha do gênero, que pedia um campo Nome que ocupava espaço e pouco acrescentava.
4. **Os dois lados desconhecidos** são permitidos ("Cruza sem nome").
5. **Busca da Coleção** é item próprio do roadmap (§7).
6. **Nome e etiqueta lado a lado** (opção C, §1.1): a determinação é sempre do catálogo (ou a cruza); o texto da etiqueta é guardado à parte, sem mexer na ficha, e o app sugere religar quando ele bate com o catálogo. Vale para toda planta, não só para a cruza.
7. **Grex registrado se escolhe na Espécie**, sem "É uma cruza" (§1). A planta é determinada por um táxon ou por uma cruza, nunca pelos dois; a origem, os parentais e a ficha do grex vêm do catálogo. Substitui o link "Tem nome registrado (grex)?" dentro da cruza.
8. **A seta parte de quem usa a cruza**: `plants.cross_id` e `taxa.cross_id` apontam para `crosses`, que ganha `user_id` (nulo = catálogo). As regras "táxon ou cruza" e "só grex tem cruza no catálogo" viram checks do banco; irmãs podem compartilhar a cruza; cruza órfã da pessoa é removida pela API (§2).
9. **Trocar a determinação troca a genealogia, sem histórico** (§1). Uma planta pode descobrir que tem outros parentais; os anteriores não ficam guardados.
10. **Mesma regra de ficha para a cruza da planta e a do grex** (§3): `care_from` mora na cruza, e grex sem ficha própria usa o parental marcado antes do gênero.
11. **Sugestão de troca também nos lados em nome livre** (§1.1).
12. **Apagar táxon é sempre `restrict`**, inclusive `plants.taxon_id`; tirar táxon em uso fica para a operação futura de fundir táxon (§2, §6).
13. **Cruza com nome dado pela pessoa vira táxon pessoal** (§6.1, Fase 3): `taxa.user_id` (nulo = catálogo), só `hybrid`/`cultivar`, visível só para o dono, com selo "não registrado". Dar nome a uma cruza existente cria o táxon e passa as plantas para ele; quando o nome é registrado, funde-se no grex do catálogo. Fora da entrega mínima.
