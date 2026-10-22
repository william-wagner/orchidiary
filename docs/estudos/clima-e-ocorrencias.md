# Clima e ocorrências — gráfico da planta no tempo

Estudo de 21.X.2026, decidido. Implementa o item **"Gráfico da planta no tempo com ocorrências e janela de período ajustável"** do `docs/ROADMAP.md`.

Protótipo navegável: `docs/estudos/clima-e-ocorrencias.html` (abra no navegador, largura de celular).
Mesmo protótipo online: <https://claude.ai/artifact/VANUozTHmVT34qUFUW1Tyn>

O protótipo é a referência de desenho: escalas, alturas, formas dos pontos, agrupamento e a folha expandida estão resolvidos lá em SVG e podem ser lidos direto do arquivo. Ele usa dados de ensaio (clima simulado) e faixas um pouco mais estreitas que as reais, só para mostrar o estado "fora".

## 1. A seção na ficha da planta

- A seção **Conforto** vira **"Clima e ocorrências"**, no mesmo lugar: entre o cabeçalho da ficha e o livro de registro.
- Vem **fechada** por padrão (decidido depois do primeiro teste no app). O estado aberto/fechado fica lembrado no aparelho e vale para todas as plantas (`orchidiary:clima-aberto`, que só guarda `1` quando aberta).
- Fechada, mostra o resumo dos **últimos 30 dias**, que **substitui o card "Registro térmico"** (ele sai da ficha): uma coluna por dia indo da mínima à máxima, na cor da temperatura média (a escala do antigo registro, como legenda), sobre a faixa de conforto da ficha (da mínima das noites à máxima dos dias), com os limites escritos à esquerda ("30°C", "16°C"). No cabeçalho, "ontem 13,9–24,2°C". Abaixo, os selos das dimensões em atenção, com a contagem da última semana ("noites frias · 3 de 7 dias"), ou "Tudo dentro da faixa na última semana". A umidade fica só nos selos. A janela escolhida não muda esse resumo, e as ocorrências só são buscadas quando a seção abre. Planta sem faixas na ficha mantém o Registro térmico antigo dentro da seção.

## 2. O gráfico (proposta "Pauta")

Três painéis empilhados, **um eixo de tempo só**, na ordem: noites, dias, umidade.

- **Noites** compara `weather_daily.temp_min` com `tempNightMin/Max` da ficha; **dias**, `temp_max` com `tempDayMin/Max`; **umidade**, `humidity_mean` com `humidityMin/Max`.
- Faixa da ficha desenhada ao fundo em `--salvia`, com o intervalo escrito no canto superior direito de cada painel. Faixa herdada ganha a nota "faixa do gênero *Nome*" (regra atual de `inheritCare`).
- Linha do clima em `--folhagem`; dia fora da faixa ganha um ponto em `--ocre`. Margem de "perto": 2°C e 5 pontos de umidade (as mesmas de hoje).
- **Mudança de lugar**: linha vertical pontilhada em `--ocre` atravessando os três painéis, na data em que o período de local começou. Dali para a frente o clima vem de outro local — nada é recalculado para trás.
- **Medições manuais** (`manual_readings`): cruzinha em `--orquidea` sobre a linha. Medida entre 19h e 8h vai para o painel das noites; entre 8h e 19h, para o dos dias; a umidade sempre para o painel de baixo. Camada ligada por padrão.
- **Chuva**: camada opcional, barras discretas no fundo do painel de umidade.
- **Linha-guia**: ao abrir uma ocorrência, uma vertical pontilhada em `--tinta` marca a data nos três painéis.
- Abaixo do gráfico, uma linha por dimensão com as contas do período: `65 dentro · 22 perto · 3 fora` e `pior 12,6°C em 20.VIII`. Contam **dias**, sempre, mesmo quando o desenho está agregado por semana.

### Janela

- Opções: **30, 90, 180, 360 dias e "tudo"**. Padrão **90**. "Tudo" é limitado ao histórico da planta.
- A escolha é lembrada no aparelho (`orchidiary:grafico-janela`) e vale para todas as plantas.
- Acima de **120 dias** a linha é agregada por semana: mínima mais baixa e máxima mais alta da semana (umidade pela média). As faixas, as contas e a fita de ocorrências não mudam.

## 3. Fita de ocorrências

Abaixo do eixo, uma fita só, alinhada aos três painéis.

| Ocorrência | Entra | Camada | Forma na fita |
|---|---|---|---|
| `bloom_start`, `bloom_end` | sim | marcos | círculo em `--orquidea` |
| `new_growth`, `new_root`, `keiki` | sim | marcos | círculo em `--folhagem` |
| `repotting` | sim | marcos | círculo em `--ocre` |
| `moved` | sim | marcos | círculo em `--ocre` + linha vertical |
| `pest`, `disease`, `treatment` | sim | saúde | losango em `--ocre` |
| Fotos | sim | fotos | quadradinho com contorno |
| `note` | sim, desligada por padrão | notas | círculo vazado |
| `watering`, `fertilizing` | sim, desligada por padrão | manejo | tracinho fino |
| Qualquer evento com `batch_id` | **não** | — | — |
| `manual_readings` | **não** como ponto | — | vira marca no gráfico (ver acima) |

- Camadas ligadas por padrão: **marcos, fotos e saúde**. Desligadas: manejo e notas. A escolha é lembrada no aparelho (`orchidiary:grafico-camadas`).
- Existe também um liga/desliga geral das ocorrências.
- **Agrupamento**: primeiro por dia; depois, grupos a menos de **17 px** de distância no eixo viram um ponto só (é o mínimo para os alvos de toque não se encostarem). O ponto agrupado é um círculo com o número dentro. O critério se ajusta sozinho a qualquer janela e largura de tela — não há regra por semana ou por mês.
- Alvo de toque de 24 × 28 px, independente do tamanho do desenho.

## 4. Folha expandida

- Abre **crescendo do ponto tocado** (`clip-path: circle()` com a origem nas coordenadas do toque), em tela cheia. Com `prefers-reduced-motion`, só aparece.
- Conteúdo: cabeçalho com a data em etiqueta (`14.X.2026`) e o local; o clima daquele dia logo abaixo, com o estado contra a faixa; depois o **feed** das ocorrências, com rolagem quando passa da tela.
- Ordem **cronológica por dia**; **dentro de cada dia, as fotos primeiro**, depois os eventos, cada grupo pela hora. Cada item com a hora.
- Ponto que agrupa **dias próximos**: cabeçalho com o intervalo e, em cada item, a sua data e o clima do seu dia numa linha curta. As fotos não sobem para o topo do feed: só passam à frente dos eventos do próprio dia.
- Planta dentro de casa: mantém o aviso "clima de fora, só referência", e as medições manuais do dia aparecem no cabeçalho.
- Rodapé com **anterior / próxima**, que andam entre **pontos da fita** (mesma janela, mesmas camadas ligadas). `Esc` fecha; setas do teclado navegam.
- Tocar a foto no feed abre o `PhotoViewer` que já existe.

## 5. O que sai da seção Conforto atual

- Os três blocos expansíveis por dimensão, cada um com eixo próprio de 30 dias.
- A fita de 30 quadradinhos acima de cada gráfico (a mesma informação está no painel).
- O **"Já sei, não avisar"** sai da interface. O conceito volta mais para a frente (Fase 3 do roadmap). A tabela `comfort_silences` e as rotas `PUT/DELETE /plants/:id/comfort/silences/:dimension` ficam como estão por ora — ninguém cria silêncio novo e o resumo quinzenal do Telegram segue funcionando; a limpeza com migração é um item de backlog.
- **Não muda**: o card da Coleção (selo de estresse nos últimos 7 dias e filtro "Fora da faixa") e o livro de registro.

## 6. API

| Hoje | Depois |
|---|---|
| `GET /api/plants/:id/comfort`, janela fixa de 30 dias (`COMFORT_DETAIL_DAYS`) | aceita `?days=30\|90\|180\|360\|all`; a constante vira o padrão (90) |
| resposta com valor e estado por dimensão | acrescenta `precipitation` do dia e as medições manuais do período |
| ocorrências só pelo `GET /api/plants/:id/timeline` | endpoint novo e leve `GET /api/plants/:id/occurrences?from&to` |

No `packages/shared` (com teste `node:test`, como o resto das regras puras):

```ts
export const CHART_WINDOWS = [30, 90, 180, 360] as const;   // + "all"
export const CHART_DEFAULT_WINDOW = 90;
export const CHART_WEEKLY_ABOVE_DAYS = 120;  // acima disso, agrega por semana
export const OCCURRENCE_CLUSTER_PX = 17;
```

`GET /api/plants/:id/occurrences?from&to` devolve, em ordem crescente de data, só o necessário para desenhar a fita **e** montar o feed sem uma segunda chamada:

```jsonc
{ "items": [
  { "kind": "photo", "id": "…", "at": "2026-01-24T14:10:00Z", "caption": "…",
    "width": 1200, "height": 1600, "placeName": "Varanda leste" },
  { "kind": "event", "id": "…", "at": "…", "type": "bloom_start", "notes": "…",
    "placeName": "Varanda leste" },
  { "kind": "reading", "id": "…", "at": "…", "temperature": 17.8, "humidity": 58 }
] }
```

- Eventos com `batch_id` não entram (o livro de registro continua mostrando).
- `placeName` é o do período de local vigente **na data da ocorrência**, nunca o atual.
- Os índices de que a consulta precisa já existem: `events_plant_idx` e `photos_plant_idx`, ambos por planta + data.
- O cliente agrega por semana quando precisa; a API sempre devolve o dia, para as contas não mentirem.
- `GET /api/plants/:id/timeline` continua como está, servindo o livro de registro.

## 7. Seed de desenvolvimento (planta FAKE)

`apps/api/src/db/seedDemo.ts`, rodado por `pnpm db:seed:demo`. Não precisa de proteção especial de ambiente; é idempotente (recria a planta FAKE do zero a cada execução) e não toca em nenhuma outra planta.

- Planta **FAKE**, apontando para o gênero *Phalaenopsis* do catálogo (faixa herdada: dias 20–30°C, noites 16–22°C, umidade 50–80% — serve também para exercitar o rótulo "faixa do gênero").
- Um lugar criado para ela, com coordenadas reais, e duas mudanças de local no inverno (para dentro em 5.VI, de volta à varanda em 5.IX), usando `movePlant` — nunca editando períodos existentes.
- **20 fotos** de `.local/seed-fotos-1-ano/fotos/`, com a data de `manifest.json`, salvas pelo `savePhoto` (gera webp, thumb e respeita o período de local da data).
- Eventos contando a história que as notas do manifest descrevem: replante na chegada, haste em dezembro, floração em janeiro, mancha em fevereiro, fim da floração em março, folha nova em abril, raiz nova em maio, cochonilha e dois tratamentos em junho/julho, keiki em julho, folhas novas em agosto, nova haste em 19.VIII, segunda floração em outubro. Mais regas e adubações ao longo do ano, parte delas em lote (para exercitar a exclusão de `batch_id`).
- Medições manuais espalhadas, concentradas no período dentro de casa.
- `.local/` está no `.gitignore`: as fotos do seed existem só na máquina de desenvolvimento. Sem a pasta, o comando deve parar com uma mensagem clara em vez de criar a planta pela metade.
- **Clima real do Open-Meteo** para o ano inteiro, pelo caminho que já existe: `collectWeather()` (`apps/api/src/services/weather/collect.ts`) faz o backfill de tudo que falta, em blocos de 120 dias, de forma idempotente.

## 8. Tarefas, nessa ordem

1. **Seed FAKE** — `seedDemo.ts` + `pnpm db:seed:demo` + clima real. Primeiro, para o resto ser desenvolvido com um ano de dados na tela.
2. **API** — `?days=` no `/comfort`, constantes e teste no `packages/shared`, endpoint `/occurrences`.
3. **Gráfico** — `ComfortPanel.tsx` vira o componente da Pauta (três painéis, fita, contas, aviso de indoor, janela e camadas lembradas no aparelho). Sai o "Já sei, não avisar".
4. **Folha expandida** — feed em ordem cronológica (fotos primeiro dentro de cada dia), abertura crescendo do ponto, navegação entre pontos, foto abrindo no `PhotoViewer`.

Cada tarefa é um commit. Ao fim da 4, atualizar `docs/ARCHITECTURE.md` com a seção nova e o endpoint.
