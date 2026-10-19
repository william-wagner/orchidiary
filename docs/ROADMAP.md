# Roadmap

## Prioridades

- [ ] Aplicar ações por local (rega, adubação etc.) de uma vez para todas as plantas daquele local
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

- [ ] Linha do tempo com zoom (semana, mês, ano) e a faixa de temperatura ao fundo
- [ ] Gráficos de umidade e chuva entre os cards
- [ ] Time-lapse das fotos e comparação antes/depois
- [ ] Calendário de floração ano a ano
- [ ] Índice de conforto: clima real x faixas da ficha
- [ ] Mapa da coleção e do histórico de locais

## Fase 3 — Coleção

- [ ] Etiqueta com QR code para o vaso
- [ ] Genealogia (keikis, divisões, parentais de híbridos)
- [ ] Lembretes de rega/adubação que consideram a chuva
- [ ] Editar ficha do Guia pelo app
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

- [ ] Integração com interface de automação Zigbee (sensores e dispositivos da casa)
