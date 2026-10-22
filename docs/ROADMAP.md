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
- [ ] Lembretes de rega/adubação que consideram a chuva
- [ ] Editar ficha do Guia pelo app
- [ ] Faixa própria da planta: o usuário ajusta temperatura e umidade só para aquela planta, sobrescrevendo a ficha ("a minha vive bem a 10°C"). O índice de conforto e os alertas passam a usar a faixa da planta.
- [ ] Silenciar aviso por dimensão ("Já sei, não avisar"): tira selo, filtro e resumo até a planta mudar de local. Saiu da interface em 21.X.2026; a tabela `comfort_silences` continua no banco.
- [ ] Importar fotos antigas em lote (data e local pelo EXIF)

## Fase 4 — Público

- [ ] Cadastro de usuários e perfis
- [ ] Armazenamento de fotos em S3/R2
- [ ] App nas lojas com Capacitor
- [ ] Identificação de espécie e diagnóstico por foto com IA

---

# Backlog

Itens soltos que surgem durante o desenvolvimento. Quando um item ganhar corpo, ele pode virar parte de uma fase acima. Itens concluídos ficam marcados com `[x]` até a próxima limpeza.

Convenções: `- [ ] Descrição curta` e, se precisar, uma linha de contexto recuada abaixo. Prioridade opcional no fim: `(alta)`, `(média)` ou `(baixa)`.

## Bugs

Nenhum registrado por enquanto.

## Melhorias

Ajustes em algo que já existe (usabilidade, desempenho, visual, textos).

Nenhuma registrada por enquanto.

## Ideias

Funcionalidades novas ainda sem fase definida.

- [ ] Registro das chamadas a APIs externas no banco (média)
  - Hoje só vão para `app_logs` os warn/error e a auditoria; chamada que dá certo some (fica no arquivo, e o clima só deixa um resumo por rodada). Não há URL, status HTTP, latência nem payload por requisição.
  - Proposta: tabela `external_calls` (serviço, endpoint, status, duração em ms, erro, `requestId`, quando) e um wrapper de `fetch` que os serviços passam a usar: Open-Meteo (`openMeteo.ts` e `alerts.ts`), Nominatim (`geocode.ts`), OpenAI (`illustration.ts`), Telegram (`telegram.ts`) e Google Drive (`googleDrive.ts`).
  - Cuidados: nunca gravar segredos (o token do Telegram vai na URL; redigir), retenção própria na limpeza de `retention.ts`, e migração via `pnpm db:generate`. Possível tela de consulta para o master em `/api/settings/*`.
- [ ] Integração com interface de automação Zigbee (sensores e dispositivos da casa)
  - Sensores de temperatura e umidade por lugar viram a fonte do microclima indoor — entram como mais uma fonte do período de localização do lugar, do lado da Open-Meteo. O índice de conforto indoor passa a ser calculado sempre a partir deles, e as plantas indoor entram também nos alertas.
