# Roadmap

## Prioridades

Fila em ordem: o primeiro item sem `[x]` é o próximo a ser feito.

- [x] Gráfico da planta no tempo com ocorrências e janela de período ajustável
  - Hoje o gráfico térmico da ficha mostra só os últimos 30 dias, e sem marcar o que aconteceu com a planta.
  - **Decidido** (estudo de 21.X.2026). Especificação completa em `docs/estudos/clima-e-ocorrencias.md`; protótipo navegável em `docs/estudos/clima-e-ocorrencias.html` (e online: https://claude.ai/artifact/VANUozTHmVT34qUFUW1Tyn):
    - A seção Conforto vira **"Clima e ocorrências"**: três painéis empilhados (noites, dias, umidade) num eixo de tempo só, faixa da ficha ao fundo, e uma fita de ocorrências embaixo valendo para os três.
    - Janela de 30, 90, 180, 360 dias e "tudo"; padrão 90, lembrada no aparelho. Acima de 120 dias a linha agrega por semana; as contas continuam contando dias.
    - Na fita: marcos, fotos e saúde ligados; manejo e notas desligados. Evento com `batch_id` nunca vira ponto. Mudança de lugar é linha vertical nos três painéis; medição manual é marca sobre a linha, não ponto da fita.
    - Agrupamento por proximidade de 17 px (primeiro por dia, depois por distância no eixo), com o número dentro do ponto.
    - Tocar num ponto abre a folha em tela cheia, crescendo do ponto tocado: clima daquele dia no alto e o feed das ocorrências com rolagem, em ordem cronológica e com as **fotos primeiro dentro de cada dia**; as setas andam entre pontos da fita.
    - Sai da interface o "Já sei, não avisar" (volta na Fase 3). Card da Coleção e livro de registro não mudam.
    - API: `?days=` no `/comfort` e o endpoint novo `GET /plants/:id/occurrences?from&to`.
    - Seed de desenvolvimento: planta **FAKE** com as 20 fotos de `.local/seed-fotos-1-ano/`, eventos de um ano e clima real do Open-Meteo.
  - Tarefas, nessa ordem (uma por commit):
    - [x] 1. Seed FAKE: `seedDemo.ts`, `pnpm db:seed:demo`, clima pelo `collectWeather` existente
    - [x] 2. API: `?days=` no `/comfort`, constantes e teste no `packages/shared`, endpoint `/occurrences`
    - [x] 3. Gráfico: `ComfortPanel.tsx` vira a seção "Clima e ocorrências" (painéis, fita, contas, janela e camadas lembradas no aparelho)
    - [x] 4. Folha expandida: feed cronológico (fotos primeiro dentro de cada dia), abertura a partir do ponto, navegação entre pontos, foto abrindo no `PhotoViewer`
- [x] Aplicar ações por local (rega, adubação etc.) de uma vez para todas as plantas daquele local
  - UI decidida (protótipo: https://claude.ai/artifact/VfMz5Wjuzmf3NAfZJf3kkE):
    - Entrada pela Coleção: chips de local acima da grade, que também filtram. Com um local escolhido, aparece o botão "Registrar no local". Atalho na ficha: depois de regar ou adubar uma planta, o toast oferece o lote para as outras do mesmo local.
    - Folha de lote: ação (rega, adubação, tratamento, nota, medição), quando, observação e a lista das plantas ativas do local, todas marcadas. Excluir é desmarcar. O botão é o resumo ("Registrar rega em 6 plantas"); não há tela de confirmação, e o toast oferece "Desfazer" (apaga o lote inteiro).
    - Duplicado: planta que já tem a mesma ação naquele dia vem desmarcada, com o motivo ("já regada hoje às 08:12").
    - Exclusões lembradas: quem foi desmarcado à mão no último lote daquele local e ação vem desmarcado de novo, com aviso e "Incluir de volta". As desmarcadas por duplicado não entram.
  - Modelo:
    - Um evento por planta, como hoje, com a coluna `batch_id` em `events`: desfaz o lote, mostra "com outras N do local" no livro da planta e permite listar os lotes do local.
    - Exclusões lembradas numa tabela pequena por local + ação (as plantas que ficaram de fora no último lote).
    - Medição em lote é do local, não da planta: `manual_readings` ganha `place_id`, `plant_id` passa a aceitar nulo e a restrição exige exatamente um dos dois. O livro da planta mostra as leituras do lugar feitas enquanto o período dela ali estava aberto (nada retroativo). Com "Medição" escolhida, a lista de plantas sai da folha.
- [x] Registrar a cruza (parentais) no tombamento da planta
  - Necessidade: uma planta *Renanthera monachica* × *Vanda falcata*. As duas espécies estão no catálogo, mas hoje a planta guarda um táxon só (`plants.taxon_id`, ou `taxon_text` em nome livre), então não há como dizer que é cruzamento delas. O nothogênero que daria nome ao híbrido (*Renantanda*) também não está em `catalog.ts`.
  - **Decidido e implementado** (estudo de 23.X.2026; migrações `0015_crosses` e `0016_drop_taxon_text`). Especificação em `docs/estudos/cruza-no-tombamento.md`; protótipo navegável em `docs/estudos/cruza-no-tombamento.html`:
    - A cruza sem nome fica na planta, não vira táxon (`taxa` é de todos). O `taxon_id` da planta passa a ser o **Nome**, opcional: gênero híbrido (*Renantanda*), gênero ou grex.
    - Tabela `crosses` (o cruzamento, com `user_id`; nulo = catálogo), apontada por `plants.cross_id` ou `taxa.cross_id` (só grex). Cada lado (semente, pólen) é um táxon de qualquer nível, nome livre ou desconhecido, e os dois desconhecidos valem ("Cruza sem nome"). Irmãs podem compartilhar a cruza. Checks no banco: planta com táxon **ou** cruza; só grex tem cruza no catálogo.
    - Trocar a determinação troca a genealogia, sem histórico. Apagar táxon é sempre `restrict` (inclusive `plants.taxon_id`); fundir táxon fica para depois.
    - Ficha: a de um dos parentais, escolhido tocando no card dele (a semente por padrão), com aviso de que é uma cruza. Sem parental no catálogo, sem ficha. Nada de média dos parentais (ver o item "Ficha de cultivo de uma cruza" em Ideias). Na cruza, o título é a fórmula.
    - Grex registrado se escolhe na Espécie, sem "É uma cruza": a planta é determinada por um táxon **ou** por uma cruza própria, nunca pelos dois. Origem, parentais e ficha do grex vêm do catálogo.
    - Exibição em fórmula: *Renantanda* (*Renanthera monachica* × *Vanda falcata*), sem abreviar gêneros; origem `cross` para toda cruza.
    - Nome e etiqueta lado a lado, como nas coleções botânicas: o Nome (ou a Espécie) é sempre do catálogo; "Como veio na etiqueta" guarda o texto literal sem mexer na ficha (`taxon_text` vira `received_name` e passa a conviver com o táxon), e o app sugere religar quando o texto bate com o catálogo. Vale para toda planta.
  - Entrega mínima: no cadastro e na edição da planta, marcar "É uma cruza" e escolher os dois parentais; a ficha e a Coleção mostram a fórmula; *Renantanda* entra no `catalog.ts`. A genealogia completa (keikis, divisões, árvore de ancestrais; Fase 3) fica de fora, mas o modelo deixa a porta aberta (estudo, §6).

## Fase 1 — Fundação (este commit)

- [x] Monorepo, schema do banco, login com usuário master
- [x] Cadastro de planta com local e ambiente (indoor/outdoor)
- [x] Histórico de locais não retroativo e alerta de foto em outro lugar
- [x] Fotos pela câmera ou galeria, com GPS e EXIF
- [x] Eventos rápidos e medição manual de temperatura/umidade
- [x] Clima diário (Open-Meteo) com backfill
- [x] Alertas de frio/calor no Telegram
- [x] Backup semanal no Google Drive, configurável pelo master
- [x] Guia de Cultivo com as primeiras fichas

## Fase 2 — Linha do tempo de verdade

- [x] Indoor/outdoor e localização como atributos do lugar
  - O lugar passa a ser dono da localização e do ambiente; planta sem lugar guarda os seus. Histórico de localização também para o lugar, clima por lugar (uma série para todas as plantas dele, coletada mesmo sem planta) e tela de Lugares com o clima de cada um. Protótipo: https://claude.ai/artifact/56VzThFUqovHsUA4iNWEFf

- [ ] Linha do tempo com zoom (semana, mês, ano) e a faixa de temperatura ao fundo
- [ ] Gráficos de umidade e chuva entre os cards
- [ ] Time-lapse das fotos e comparação antes/depois
- [ ] Calendário de floração ano a ano
- [x] Índice de conforto: clima real x faixas da ficha
  - Decidido (estudo de 19.X.2026, protótipo: https://claude.ai/artifact/2F78Zhf8dvGSJZkb3bYbGV):
    - Por dimensão, não nota única: noites (`tempMin` x `tempNightMin/Max`), dias (`tempMax` x `tempDayMin/Max`) e umidade. Cada dia fica dentro, perto (margem) ou fora.
    - Base diária do `weather_daily`; nunca a temperatura do momento.
    - Card da Coleção: calado quando está tudo bem; selo só com estresse nos últimos 7 dias, dizendo o quê ("noites frias"). Filtro "Fora da faixa" nos chips da Coleção.
    - Ficha da planta: seção "Conforto" com os últimos 30 dias e o resumo por dimensão. Faixa herdada aparece como "faixa do gênero".
    - Sem notificação diária: resumo no Telegram a cada 14 dias, só com o que mudou de uma quinzena para a outra (3 ou mais dias fora em 14 = em atenção). Nada mudou, nenhuma mensagem.
    - "Já sei, não avisar" por planta e dimensão: tira o selo, o filtro e o resumo até a planta mudar de local.
    - Indoor usa o clima de fora como referência, com aviso na ficha e no resumo, até existirem sensores (ver Zigbee no Backlog). O ambiente agora vem do lugar.
  - Depois: comparar períodos de local, cruzar com o calendário de floração e um "Já sei" nos alertas de previsão do Telegram.
  - Em 21.X.2026 o "Já sei, não avisar" saiu da interface junto com a seção nova (ver o item Próximo); a tabela `comfort_silences` e as rotas ficaram no lugar.
- [ ] Mapa da coleção e do histórico de locais

## Fase 3 — Coleção

- [ ] Etiqueta com QR code para o vaso
- [ ] Genealogia (keikis, divisões, parentais de híbridos)
  - Cruza feita pelo cultivador, com nome dado por ele, vira **táxon pessoal** (`taxa.user_id`, só `hybrid`/`cultivar`, visível só para o dono, selo "não registrado"); as mudas apontam para ele. Lado de cruza apontando para planta da coleção (`seed_plant_id`/`pollen_plant_id`), irmãs, árvore de ancestrais e fundir táxon. Ver `docs/estudos/cruza-no-tombamento.md`, §6.
- [ ] Lembretes de rega/adubação que consideram a chuva
- [ ] Editar ficha do Guia pelo app
- [ ] Faixa própria da planta: o usuário ajusta temperatura e umidade só para aquela planta, sobrescrevendo a ficha ("a minha vive bem a 10°C"). O índice de conforto e os alertas passam a usar a faixa da planta.
- [ ] Silenciar aviso por dimensão ("Já sei, não avisar"): tira selo, filtro e resumo até a planta mudar de local. Saiu da interface em 21.X.2026; a tabela `comfort_silences` continua no banco.
- [ ] Importar fotos antigas em lote (data e local pelo EXIF)

## Fase 4 — Público

- [ ] Cadastro de usuários e perfis
- [ ] Armazenamento de fotos no Amazon S3
  - Decidido em 22.X.2026: S3 (`sa-east-1`), implementado junto com a Fase 4. Hoje não há necessidade: o disco da VM comporta as fotos por anos e o custo não se justifica para um usuário só.
  - Estudo: `docs/estudos/armazenamento-de-fotos.md` (comparação com o bucket do Lightsail e o R2, proposta técnica, migração e tarefas).
- [ ] App nas lojas com Capacitor
- [ ] Identificação de espécie e diagnóstico por foto com IA

## Comunidade

- [ ] Compartilhar a planta: carta de colecionador
  - **Escolhida** em 13.XI.2026 entre três propostas: carta de colecionador, caderneta de carimbos e story da jornada. Protótipo das três: https://claude.ai/artifact/Ws1kKBjkPsqVeeeLTX2ryz
  - A planta vira uma carta de jogo na identidade do caderno botânico: nº de tombo, apelido, nome (táxon ou fórmula da cruza, sempre resolvido pela API), foto de capa, selo de nível ("Nível 4 · Florida"), linha de campo (hábito, origem, "desde 02.IX.2025"), quatro atributos (dias, florações, fotos, cuidados), barra de XP até o próximo nível, "Cultivada por <nome>" em letra manuscrita, o Relógio e orchidiary.com. A cor da moldura pode variar.
  - Compartilha como **link**: o botão Compartilhar na ficha abre a folha de compartilhamento do celular (Web Share API; no desktop, copiar o link). No WhatsApp a carta aparece como prévia do link (og:image 1200×630, versão horizontal da carta), com título "Apelido — nome" e descrição "Nível · florações · dias". Tocar abre a página pública da planta, sem login: carta grande, linha do tempo das fotos e o convite "Crie o seu diário". A carta também pode ser baixada como PNG.
  - Link público por planta, com slug não adivinhável (`/p/aurora-k7f2`), criado só quando o dono compartilha pela primeira vez e revogável.
  - Privacidade: a página pública nunca mostra coordenadas nem endereço. A decidir: mostrar o nome do lugar, só a cidade ou nada.
  - A decidir: regras de nível e XP. Proposta: Muda → Jovem → Adulta → Florida → Veterana; XP por tempo de cultivo, florações, fotos e registros no diário.
  - Tarefas, nessa ordem (uma por commit):
    - [ ] 1. Regras de nível e XP em `packages/shared`, com teste
    - [ ] 2. Link público: slug, data de criação e revogação; rotas para criar e revogar e `GET` público só com os campos da carta
    - [ ] 3. Imagem da carta gerada na API (og:image 1200×630 e versão vertical para baixar)
    - [ ] 4. Página pública `/p/:slug` com as meta tags Open Graph vindas do servidor (o WhatsApp não executa JavaScript ao montar a prévia)
    - [ ] 5. Botão Compartilhar na ficha da planta
  - Depois: a caderneta de carimbos (conquistas carimbadas, com compartilhamento no momento em que a planta ganha um carimbo) e o story da jornada (antes/depois em 9:16 para o Status) reaproveitam o link público e a geração de imagem.

---

# Backlog

Itens soltos que surgem durante o desenvolvimento. Quando um item ganhar corpo, ele pode virar parte de uma fase acima. Itens concluídos ficam marcados com `[x]` até a próxima limpeza.

Convenções: `- [ ] Descrição curta` e, se precisar, uma linha de contexto recuada abaixo. Prioridade opcional no fim: `(alta)`, `(média)` ou `(baixa)`.

## Bugs

Nenhum registrado por enquanto.

## Melhorias

Ajustes em algo que já existe (usabilidade, desempenho, visual, textos).

- [x] Busca na Coleção (média)
  - Feito: campo de busca no topo da Coleção, local (a lista já vem inteira), que soma com os filtros de lugar, "Fora da faixa" e "Ao ar livre" e fica na URL (`?busca=`). Acha por apelido, nº de tombo (`7` ou `0007`), nome da etiqueta, táxon e todos os níveis acima dele (buscar "Vanda" acha as *Vanda* e as cruzas com *Vanda*), nomes populares, os dois parentais de uma cruza (da planta ou do grex) e o lugar onde ela está agora. Cada palavra digitada precisa ser o começo de alguma palavra (`normalizeSearch`, sem acento nem caixa): "ren falc" acha a *Renanthera monachica* × *Vanda falcata*. Regra em `packages/shared/src/plantSearch.ts`.
- [ ] Trocar o ambiente (indoor/outdoor) na edição da planta
  - Hoje o ambiente da planta só é escolhido no tombamento (`EnvironmentPicker` em `NewPlant.tsx`); `EditPlant.tsx` não tem o seletor e, sem trocar de lugar, mantém o `environment` do período atual. Na planta sem lugar, a troca fecha o período atual e abre outro com o ambiente novo (nada retroativo, como a mudança de lugar). Na planta com lugar, o ambiente é do lugar: a edição mostra o do lugar e leva à troca na tela do lugar ("Pôr ao ar livre" / "Pôr dentro de casa"), que vale para todas as plantas dele.

## Ideias

Funcionalidades novas ainda sem fase definida.

- [ ] Compartilhar fotos do feed da planta
  - Do feed de ocorrências (folha expandida de "Clima e ocorrências") e do `PhotoViewer`: botão de compartilhar que manda a foto para outros apps pela folha de compartilhamento do celular (Web Share API com arquivo; no desktop, copiar ou baixar). Decidir se vai junto uma legenda com o nome da planta e a data da foto.
- [ ] Baixar fotos do feed da planta
  - Baixar a foto original (resolução cheia) a partir do feed e do `PhotoViewer`. Estudar também baixar várias de uma vez (um período ou a planta inteira, em .zip) e se o EXIF original segue no arquivo baixado.
- [x] Registro das chamadas a APIs externas no banco (média)
  - Feito: tabela `external_calls` e cliente instrumentado (`apps/api/src/http/`) usado por Open-Meteo (clima e alertas), Nominatim, OpenAI, Telegram e Google (OAuth e Drive). Registra serviço, operação, URL redigida, status, resultado, duração (e tempo até os headers), bytes, `requestId`/origem e, na OpenAI, o uso de tokens. Retenção própria (30 dias; falhas 90). Detalhes em `docs/ARCHITECTURE.md`.
  - Fora do escopo por decisão: rota e tela de consulta para o master (por ora só pelo banco).
- [ ] Ficha de cultivo de uma cruza (média)
  - Hoje a cruza usa a ficha de um dos parentais, escolhido pela pessoa, com um aviso. A média das faixas dos parentais foi descartada: um parental de clima quente e outro de clima frio dão uma faixa que não serve a nenhum. Estudar a regra boa: interseção quando existir, ficha própria da planta (ver "Faixa própria da planta" na Fase 3), aprender com as medições e o comportamento dela, ou só mostrar a ficha de cada parental lado a lado.
- [ ] Integração com interface de automação Zigbee (sensores e dispositivos da casa)
  - Sensores de temperatura e umidade por lugar viram a fonte do microclima indoor — entram como mais uma fonte do período de localização do lugar, do lado da Open-Meteo. O índice de conforto indoor passa a ser calculado sempre a partir deles, e as plantas indoor entram também nos alertas.
