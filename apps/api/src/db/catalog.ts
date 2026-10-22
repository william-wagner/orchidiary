import type { Care, TaxonRank } from "@orchidiary/shared";

/**
 * Catálogo inicial do Guia de Cultivo: a árvore de Orchidaceae segundo a
 * classificação de Chase et al. (2015), com os gêneros e espécies mais
 * cultivados no Brasil, e nomes antigos como nomes populares, para a busca
 * achar "Laelia purpurata", "Oncidium flexuosum" ou "Ascocenda".
 *
 * Fichas de cultivo são pontos de partida, para revisar e completar.
 * Faixas em°C e % de umidade relativa; meses do hemisfério sul.
 */
export interface CatalogNode {
  rank: TaxonRank;
  name: string;
  commonNames?: string[];
  care?: Partial<Care> & { notes?: string };
  children?: CatalogNode[];
}

type Extra = Omit<CatalogNode, "rank" | "name">;
const node =
  (rank: TaxonRank) =>
  (name: string, extra: Extra | CatalogNode[] = {}): CatalogNode =>
    Array.isArray(extra) ? { rank, name, children: extra } : { rank, name, ...extra };

const family = node("family");
const subfamily = node("subfamily");
const tribe = node("tribe");
const subtribe = node("subtribe");
const genus = node("genus");
const nothogenus = node("nothogenus");
const sp = node("species");
const variety = node("variety");
const form = node("form");
const hybrid = node("hybrid");

const words = (list: string) => list.trim().split(/\s+/);
/** Várias espécies de uma vez: spp("amabilis aphrodite") */
const spp = (list: string) => words(list).map((n) => sp(n));
/** Formas de cor (alba, semialba, coerulea…), como os orquidófilos as registram */
const forms = (list: string) => words(list).map((n) => form(n));
const grexes = (...names: string[]) => names.map((n) => hybrid(n));
/** Espécie conhecida também por outro nome (sinônimo antigo ou nome popular) */
const aka = (name: string, ...commonNames: string[]) => sp(name, { commonNames });

// ─── Fichas de cultivo por gênero ────────────────────────────────────────────

const care = {
  walkeriana: {
    tempDayMin: 20, tempDayMax: 32, tempNightMin: 10, tempNightMax: 20, humidityMin: 50, humidityMax: 80,
    light: "Muita luz, sol da manhã; tolera sol filtrado o dia todo.",
    watering: "Deixar secar bem entre regas; reduzir no repouso de inverno.",
    substrate: "Montada em placa/tronco ou vaso pequeno com casca grossa; drenagem rápida.",
    bloomMonths: [4, 5, 6, 7],
    restPeriod: "Inverno seco e mais frio favorece a floração.",
  },
  phalaenopsis: {
    tempDayMin: 20, tempDayMax: 30, tempNightMin: 16, tempNightMax: 22, humidityMin: 50, humidityMax: 80,
    light: "Luz indireta média; sol direto queima as folhas.",
    watering: "Regar quando o substrato estiver quase seco; não deixar água no centro da folha.",
    substrate: "Casca de pinus média, musgo ou mix; vaso com boa drenagem.",
    bloomMonths: [6, 7, 8, 9, 10],
    restPeriod: "Queda de temperatura noturna estimula a haste floral.",
  },
  dendrobiumNobile: {
    tempDayMin: 18, tempDayMax: 30, tempNightMin: 8, tempNightMax: 18, humidityMin: 50, humidityMax: 75,
    light: "Muita luz; tolera algumas horas de sol direto.",
    watering: "Generosa no crescimento; quase seca no outono/inverno para florir.",
    substrate: "Casca grossa com carvão; vaso apertado.",
    bloomMonths: [7, 8, 9, 10],
    restPeriod: "Repouso fresco e seco no inverno é essencial.",
  },
  oncidium: {
    tempDayMin: 18, tempDayMax: 30, tempNightMin: 12, tempNightMax: 20, humidityMin: 50, humidityMax: 80,
    light: "Luz intensa filtrada.",
    watering: "Raízes finas: não deixar secar totalmente no crescimento.",
    substrate: "Casca fina a média com fibra de coco; vaso com drenagem.",
    bloomMonths: [3, 4, 5, 6, 9, 10],
  },
  cattleya: {
    tempDayMin: 18, tempDayMax: 32, tempNightMin: 12, tempNightMax: 20, humidityMin: 50, humidityMax: 80,
    light: "Muita luz filtrada (30–50% de sombrite); folhas verde-claras indicam a luz certa.",
    watering: "Regar quando o substrato secar por completo; espaçar as regas no repouso depois da floração.",
    fertilizing: "Adubo equilibrado diluído a cada 15 dias no crescimento; suspender no repouso.",
    substrate: "Casca de pinus grossa, carvão e brita, em vaso de barro; ou montada em tronco.",
    restPeriod: "Repouso depois que o pseudobulbo amadurece, com regas espaçadas, até o novo broto.",
  },
  laelia: {
    tempDayMin: 15, tempDayMax: 28, tempNightMin: 8, tempNightMax: 16, humidityMin: 40, humidityMax: 70,
    light: "Muita luz, com algumas horas de sol direto.",
    watering: "Bem regada no verão; quase seca no inverno.",
    substrate: "Montada em tronco ou casca grossa com ótima drenagem.",
    restPeriod: "Inverno seco e fresco é necessário para florir.",
  },
  brassavola: {
    tempDayMin: 20, tempDayMax: 33, tempNightMin: 15, tempNightMax: 22, humidityMin: 50, humidityMax: 80,
    light: "Muita luz; tolera sol da manhã.",
    watering: "Regar com frequência no calor; as folhas roliças guardam água, então pode secar entre regas.",
    substrate: "Montada em tronco ou cesto com pouca casca.",
  },
  epidendrum: {
    tempDayMin: 18, tempDayMax: 32, tempNightMin: 12, tempNightMax: 22, humidityMin: 50, humidityMax: 80,
    light: "Sol pleno a meia-sombra; quanto mais luz, mais floração.",
    watering: "Regular, sem encharcar.",
    substrate: "Casca grossa, ou direto em canteiro bem drenado (espécies terrestres como E. radicans).",
  },
  encyclia: {
    tempDayMin: 18, tempDayMax: 32, tempNightMin: 12, tempNightMax: 20, humidityMin: 50, humidityMax: 75,
    light: "Muita luz filtrada.",
    watering: "Deixar secar entre regas; menos água no inverno.",
    substrate: "Montada ou vaso pequeno com casca grossa.",
    restPeriod: "Repouso seco e fresco no inverno.",
  },
  dendrobiumPhal: {
    tempDayMin: 20, tempDayMax: 33, tempNightMin: 16, tempNightMax: 22, humidityMin: 50, humidityMax: 80,
    light: "Muita luz; tolera sol da manhã.",
    watering: "Regular o ano todo, deixando secar levemente entre regas.",
    substrate: "Vaso pequeno com casca e carvão; gosta de ficar apertada.",
    restPeriod: "Sem repouso marcado; sensível a noites abaixo de 15°C.",
  },
  bulbophyllum: {
    tempDayMin: 20, tempDayMax: 30, tempNightMin: 15, tempNightMax: 22, humidityMin: 60, humidityMax: 85,
    light: "Luz média filtrada.",
    watering: "Nunca deixar secar por completo; rizomas finos desidratam rápido.",
    substrate: "Montada em placa ou cesto raso com musgo; cresce rasteira.",
    notes: "Muitas espécies têm cheiro forte para atrair moscas.",
  },
  paphiopedilum: {
    tempDayMin: 18, tempDayMax: 28, tempNightMin: 13, tempNightMax: 20, humidityMin: 50, humidityMax: 70,
    light: "Pouca luz, como a de uma Phalaenopsis; sol direto queima.",
    watering: "Substrato sempre levemente úmido; sem água parada na roseta.",
    fertilizing: "Adubo fraco, a cada 15 dias; sensível a sais.",
    substrate: "Casca fina com perlita e musgo; trocar todo ano.",
    notes: "Não tem pseudobulbo: não pode passar sede.",
  },
  phragmipedium: {
    tempDayMin: 18, tempDayMax: 28, tempNightMin: 13, tempNightMax: 20, humidityMin: 60, humidityMax: 80,
    light: "Luz média filtrada.",
    watering: "Muita água; pode ficar com o pé em um pires raso com água limpa.",
    substrate: "Casca fina com perlita; água de chuva ou com poucos sais.",
  },
  cymbidium: {
    tempDayMin: 15, tempDayMax: 28, tempNightMin: 8, tempNightMax: 16, humidityMin: 40, humidityMax: 70,
    light: "Muita luz; sol da manhã ajuda a florir.",
    watering: "Generosa no verão; moderada no inverno.",
    fertilizing: "Rica em nitrogênio na primavera e verão; rica em potássio no fim do verão.",
    substrate: "Casca média com fibra de coco; vaso fundo.",
    bloomMonths: [6, 7, 8, 9],
    restPeriod: "Noites frias (abaixo de 15°C) no outono disparam as hastes.",
  },
  miltonia: {
    tempDayMin: 18, tempDayMax: 28, tempNightMin: 12, tempNightMax: 18, humidityMin: 60, humidityMax: 80,
    light: "Luz média filtrada; folhas amareladas indicam luz demais.",
    watering: "Manter levemente úmida; não deixar secar por completo.",
    substrate: "Casca fina com fibra de coco, em vaso que drene bem.",
  },
  gomesa: {
    tempDayMin: 18, tempDayMax: 30, tempNightMin: 12, tempNightMax: 20, humidityMin: 50, humidityMax: 80,
    light: "Luz intensa filtrada.",
    watering: "Raízes finas: regar sempre que começar a secar.",
    substrate: "Montada em tronco ou casca fina; boa ventilação.",
  },
  brassia: {
    tempDayMin: 18, tempDayMax: 30, tempNightMin: 13, tempNightMax: 20, humidityMin: 50, humidityMax: 80,
    light: "Luz média a intensa filtrada.",
    watering: "Regular, deixando secar levemente entre regas.",
    substrate: "Casca média com fibra de coco.",
  },
  psychopsis: {
    tempDayMin: 20, tempDayMax: 32, tempNightMin: 16, tempNightMax: 22, humidityMin: 60, humidityMax: 80,
    light: "Muita luz filtrada.",
    watering: "Deixar secar entre regas; nunca acumular água nas folhas.",
    substrate: "Montada ou cesto pequeno.",
    notes: "Não corte a haste depois da flor: ela floresce de novo na mesma haste por anos.",
  },
  zygopetalum: {
    tempDayMin: 18, tempDayMax: 28, tempNightMin: 10, tempNightMax: 16, humidityMin: 50, humidityMax: 80,
    light: "Luz média filtrada.",
    watering: "Substrato úmido no crescimento, sem encharcar.",
    substrate: "Casca média com fibra de coco; raízes grossas gostam de vaso alto.",
    bloomMonths: [4, 5, 6, 7],
  },
  catasetum: {
    tempDayMin: 22, tempDayMax: 35, tempNightMin: 15, tempNightMax: 22, humidityMin: 50, humidityMax: 80,
    light: "Muita luz; tolera sol da manhã.",
    watering: "Muita água enquanto as folhas crescem; nenhuma depois que caem, até o novo broto ter raízes.",
    fertilizing: "Adubo semanal no crescimento: o ciclo é curto e intenso.",
    substrate: "Vaso com casca e fibra de coco, bem drenado.",
    restPeriod: "Perde as folhas no inverno; repouso totalmente seco.",
  },
  cyrtopodium: {
    tempDayMin: 22, tempDayMax: 36, tempNightMin: 14, tempNightMax: 22, humidityMin: 40, humidityMax: 75,
    light: "Sol pleno.",
    watering: "Muita água no verão; seco no inverno.",
    substrate: "Areia grossa, casca e terra vegetal; ou rochas.",
    restPeriod: "Inverno seco; floresce no fim do repouso.",
  },
  maxillaria: {
    tempDayMin: 18, tempDayMax: 30, tempNightMin: 12, tempNightMax: 20, humidityMin: 60, humidityMax: 85,
    light: "Luz média filtrada.",
    watering: "Úmida o ano todo.",
    substrate: "Montada ou vaso com musgo e casca fina.",
  },
  bifrenaria: {
    tempDayMin: 18, tempDayMax: 30, tempNightMin: 10, tempNightMax: 18, humidityMin: 50, humidityMax: 80,
    light: "Muita luz filtrada.",
    watering: "Generosa no crescimento; quase seca depois que o pseudobulbo amadurece.",
    substrate: "Casca grossa com carvão.",
    restPeriod: "Repouso seco e fresco no inverno.",
  },
  stanhopea: {
    tempDayMin: 18, tempDayMax: 28, tempNightMin: 12, tempNightMax: 18, humidityMin: 60, humidityMax: 85,
    light: "Luz média filtrada.",
    watering: "Úmida o ano todo.",
    substrate: "Cesto vazado com musgo: as flores saem por baixo, atravessando o substrato.",
    notes: "Nunca plante em vaso fechado: as hastes ficam presas e apodrecem.",
  },
  masdevallia: {
    tempDayMin: 12, tempDayMax: 24, tempNightMin: 8, tempNightMax: 14, humidityMin: 70, humidityMax: 90,
    light: "Pouca luz.",
    watering: "Úmida sempre, com água de baixa salinidade.",
    substrate: "Musgo esfagno em vaso pequeno.",
    notes: "Planta de altitude: sofre muito acima de 26°C.",
  },
  dracula: {
    tempDayMin: 12, tempDayMax: 22, tempNightMin: 8, tempNightMax: 14, humidityMin: 75, humidityMax: 95,
    light: "Sombra.",
    watering: "Nunca deixar secar.",
    substrate: "Cesto vazado com musgo: as flores saem por baixo.",
    notes: "Planta de neblina: pede frescor, umidade alta e ventilação constante.",
  },
  pleurothallid: {
    tempDayMin: 15, tempDayMax: 26, tempNightMin: 10, tempNightMax: 18, humidityMin: 60, humidityMax: 90,
    light: "Luz baixa a média.",
    watering: "Úmida sempre; sem pseudobulbos, não suporta secar.",
    substrate: "Vaso pequeno com musgo, ou montada com musgo na base.",
  },
  vandeae: {
    tempDayMin: 22, tempDayMax: 35, tempNightMin: 16, tempNightMax: 24, humidityMin: 60, humidityMax: 85,
    light: "Muita luz filtrada.",
    watering: "Raízes expostas: molhar bem todos os dias no calor; devem secar até a noite.",
    fertilizing: "Adubo foliar diluído semanalmente no crescimento.",
    substrate: "Cesto de madeira ou raízes nuas penduradas; ventilação é essencial.",
    restPeriod: "Sem repouso definido; reduzir rega quando as noites ficarem abaixo de 15°C.",
  },
  angraecum: {
    tempDayMin: 20, tempDayMax: 32, tempNightMin: 15, tempNightMax: 22, humidityMin: 60, humidityMax: 80,
    light: "Luz média a intensa filtrada.",
    watering: "Regular o ano todo.",
    substrate: "Casca média ou cesto; raízes grossas.",
    notes: "Flores brancas e perfumadas à noite, polinizadas por mariposas.",
  },
  coelogyne: {
    tempDayMin: 15, tempDayMax: 27, tempNightMin: 8, tempNightMax: 16, humidityMin: 50, humidityMax: 80,
    light: "Luz média filtrada.",
    watering: "Úmida no crescimento; mais seca no inverno.",
    substrate: "Casca média ou cesto.",
    restPeriod: "Muitas espécies pedem inverno fresco para florir.",
  },
  arundina: {
    tempDayMin: 20, tempDayMax: 35, tempNightMin: 12, tempNightMax: 22, humidityMin: 40, humidityMax: 80,
    light: "Sol pleno.",
    watering: "Regular, como uma planta de canteiro.",
    substrate: "Terrestre: canteiro com terra vegetal, areia e matéria orgânica.",
  },
  terrestrialShade: {
    tempDayMin: 18, tempDayMax: 30, tempNightMin: 12, tempNightMax: 20, humidityMin: 50, humidityMax: 80,
    light: "Meia-sombra.",
    watering: "Úmida, sem encharcar.",
    substrate: "Terrestre: terra vegetal, casca fina e areia grossa.",
  },
  ludisia: {
    tempDayMin: 18, tempDayMax: 28, tempNightMin: 15, tempNightMax: 20, humidityMin: 60, humidityMax: 85,
    light: "Pouca luz; cultivada pelas folhas.",
    watering: "Úmida sempre.",
    substrate: "Terrestre: musgo, casca fina e terra vegetal.",
  },
  vanilla: {
    tempDayMin: 22, tempDayMax: 33, tempNightMin: 16, tempNightMax: 22, humidityMin: 60, humidityMax: 85,
    light: "Meia-sombra.",
    watering: "Úmida, sem encharcar.",
    substrate: "Trepadeira: base em substrato orgânico e um tutor (tronco) para subir.",
    notes: "As favas só se formam com polinização manual fora do habitat.",
  },
  sobralia: {
    tempDayMin: 18, tempDayMax: 32, tempNightMin: 12, tempNightMax: 20, humidityMin: 50, humidityMax: 80,
    light: "Muita luz.",
    watering: "Generosa; não deixar secar.",
    substrate: "Vaso grande com terra vegetal, casca e areia.",
    notes: "Flores duram um ou dois dias, mas se sucedem por semanas.",
  },
  leptotes: {
    tempDayMin: 16, tempDayMax: 28, tempNightMin: 10, tempNightMax: 18, humidityMin: 60, humidityMax: 85,
    light: "Luz média filtrada.",
    watering: "Frequente; folhas roliças finas desidratam rápido.",
    substrate: "Montada em galho fino ou cortiça.",
  },
} satisfies Record<string, CatalogNode["care"]>;

// ─── Árvore ──────────────────────────────────────────────────────────────────

export const catalog: CatalogNode[] = [
  family("Orchidaceae", { commonNames: ["orquídea", "orquídeas"], children: [
    subfamily("Apostasioideae", [genus("Apostasia"), genus("Neuwiedia")]),

    subfamily("Vanilloideae", [
      tribe("Vanilleae", [
        genus("Vanilla", { commonNames: ["baunilha"], care: care.vanilla, children: [
          aka("planifolia", "baunilha", "baunilha-verdadeira"),
          ...spp("pompona chamissonis bahiana edwallii phaeantha aphylla imperialis palmarum odorata"),
        ] }),
        genus("Epistephium"),
      ]),
      tribe("Pogonieae", [genus("Pogonia", spp("ophioglossoides")), genus("Cleistes")]),
    ]),

    subfamily("Cypripedioideae", { commonNames: ["sapatinho"], children: [
      genus("Paphiopedilum", { commonNames: ["sapatinho", "sapatinho-de-vênus", "paph"], care: care.paphiopedilum, children: [
        ...spp(`insigne callosum rothschildianum concolor bellatulum niveum delenatii armeniacum micranthum
          malipoense sukhakulii venustum villosum spicerianum philippinense fairrieanum barbatum lawrenceanum
          hirsutissimum primulinum glaucophyllum appletonianum charlesworthii godefroyae henryanum emersonii
          gratrixianum haynaldianum helenae leucochilum lowii parishii purpuratum sanderianum stonei tonsum
          vietnamense wardii exul druryi hangianum chamberlainianum victoria-regina`),
        ...grexes("Maudiae", "Leeanum", "Pinocchio"),
      ] }),
      genus("Phragmipedium", { commonNames: ["phrag"], care: care.phragmipedium, children: [
        ...spp(`besseae caudatum longifolium kovachii schlimii vittatum pearcei lindleyanum sargentianum
          warszewiczianum boissierianum wallisii humboldtii exstaminodium`),
        ...grexes("Sorcerer's Apprentice", "Grande"),
      ] }),
      genus("Cypripedium", spp("calceolus reginae acaule formosanum japonicum parviflorum macranthos kentuckiense tibeticum flavum guttatum montanum candidum")),
      genus("Mexipedium", spp("xerophyticum")),
      genus("Selenipedium"),
    ] }),

    subfamily("Orchidoideae", [
      tribe("Orchideae", [
        subtribe("Orchidinae", [
          genus("Habenaria", spp("rhodocheila medusa repens")),
          genus("Pecteilis", [aka("radiata", "orquídea-garça", "habenaria radiata")]),
          genus("Orchis", spp("mascula italica militaris purpurea")),
          genus("Ophrys", { commonNames: ["orquídea-abelha"], children: spp("apifera speculum insectifera sphegodes") }),
          genus("Dactylorhiza", spp("maculata fuchsii majalis")),
          genus("Anacamptis", spp("pyramidalis morio laxiflora")),
          genus("Serapias", spp("lingua vomeracea")),
          genus("Platanthera", spp("bifolia ciliaris")),
          genus("Bonatea", spp("speciosa")),
        ]),
        subtribe("Disinae", [genus("Disa", spp("uniflora"))]),
      ]),
      tribe("Cranichideae", [
        subtribe("Goodyerinae", [
          genus("Ludisia", { commonNames: ["orquídea-joia"], care: care.ludisia, children: [aka("discolor", "orquídea-joia")] }),
          genus("Macodes", { commonNames: ["orquídea-joia"], care: care.ludisia, children: spp("petola") }),
          genus("Anoectochilus", { commonNames: ["orquídea-joia"], care: care.ludisia, children: spp("roxburghii") }),
          genus("Goodyera", spp("pubescens repens")),
          genus("Dossinia", spp("marmorata")),
        ]),
        subtribe("Spiranthinae", [
          genus("Spiranthes", spp("spiralis cernua")),
          genus("Sacoila", spp("lanceolata")),
          genus("Sarcoglottis"),
        ]),
      ]),
      tribe("Diurideae", [genus("Pterostylis", spp("curta")), genus("Caladenia"), genus("Diuris"), genus("Thelymitra")]),
    ]),

    subfamily("Epidendroideae", [
      tribe("Neottieae", [
        genus("Epipactis", spp("helleborine palustris")),
        genus("Cephalanthera", spp("longifolia")),
        genus("Neottia", spp("ovata")),
      ]),
      tribe("Gastrodieae", [genus("Gastrodia", spp("elata"))]),
      tribe("Nervilieae", [genus("Nervilia")]),

      tribe("Sobralieae", [
        genus("Sobralia", { care: care.sobralia, children: spp("macrantha liliastrum xantholeuca decora") }),
        genus("Elleanthus"),
      ]),

      tribe("Arethuseae", [
        subtribe("Arethusinae", [
          genus("Arundina", { care: care.arundina, children: [aka("graminifolia", "orquídea-bambu")] }),
          genus("Arethusa", spp("bulbosa")),
          genus("Calopogon", spp("tuberosus")),
        ]),
        subtribe("Coelogyninae", [
          genus("Coelogyne", { care: care.coelogyne, children: spp("cristata flaccida pandurata fimbriata mooreana nitida speciosa ochracea tomentosa usitana rochussenii") }),
          genus("Pleione", { care: care.coelogyne, children: spp("formosana bulbocodioides") }),
          genus("Dendrochilum", { commonNames: ["orquídea-colar"], care: care.coelogyne, children: spp("magnum glumaceum cobbianum wenzelii filiforme") }),
          genus("Thunia", spp("alba marshalliana")),
          genus("Bletilla", { care: care.terrestrialShade, children: spp("striata") }),
        ]),
      ]),

      tribe("Malaxideae", [
        subtribe("Dendrobiinae", [
          genus("Dendrobium", { commonNames: ["dendróbio", "dendrobio"], children: [
            sp("nobile", { care: care.dendrobiumNobile }),
            sp("bigibbum", { commonNames: ["dendrobium phalaenopsis", "den-phal", "denfal"], care: care.dendrobiumPhal }),
            aka("lindleyi", "dendrobium aggregatum"),
            ...spp(`kingianum densiflorum thyrsiflorum chrysotoxum farmeri anosmum parishii cuthbertsonii speciosum
              fimbriatum moschatum primulinum loddigesii crumenatum secundum victoriae-reginae jenkinsii spectabile
              antennatum discolor amethystoglossum dearei formosum infundibulum unicum cucumerinum aphyllum
              chrysanthum findlayanum heterocarpum hercoglossum lawesii linguiforme sulcatum tortile aemulum
              falcorostrum teretifolium wardianum devonianum harveyanum senile bellatulum christyanum
              friedericksianum gibsonii lituiflorum pendulum polyanthum`),
          ] }),
          genus("Bulbophyllum", { commonNames: ["bulbo"], care: care.bulbophyllum, children: spp(`
            angustifolium echinolabium medusae lobbii phalaenopsis rothschildianum falcatum frostii ambrosia putidum
            plumatum weddellii exaltatum glutinosum napellii regnellii cocoinum fascinator graveolens longissimum
            makoyanum picturatum careyanum wendlandianum auratum guttulatum macranthum lasiochilum barbigerum
            eberhardtii`) }),
        ]),
        subtribe("Malaxidinae", [genus("Liparis", spp("nervosa")), genus("Malaxis"), genus("Oberonia")]),
      ]),

      tribe("Collabieae", [
        genus("Calanthe", { care: care.terrestrialShade, children: spp("vestita triplicata sylvatica discolor") }),
        genus("Phaius", { care: care.terrestrialShade, children: [aka("tankervilleae", "capuz-de-freira", "orquídea-capuz-de-freira")] }),
        genus("Spathoglottis", { care: { ...care.terrestrialShade, light: "Sol da manhã a meia-sombra." }, children: [aka("plicata", "orquídea-grapete")] }),
      ]),

      tribe("Cymbidieae", [
        subtribe("Cymbidiinae", [
          genus("Cymbidium", { commonNames: ["cimbídio"], care: care.cymbidium, children: spp(`
            eburneum lowianum tracyanum ensifolium sinense goeringii aloifolium finlaysonianum tigrinum kanran
            devonianum floribundum insigne hookerianum erythrostylum madidum dayanum mastersii canaliculatum
            suave faberi iridioides bicolor elegans lancifolium`) }),
          genus("Grammatophyllum", [aka("speciosum", "orquídea-tigre", "orquídea-gigante"), sp("scriptum")]),
        ]),
        subtribe("Eulophiinae", [genus("Eulophia", spp("alta")), genus("Oeceoclades", spp("maculata"))]),
        subtribe("Catasetinae", [
          genus("Catasetum", { care: care.catasetum, children: [
            ...spp(`fimbriatum macrocarpum pileatum saccatum tenebrosum expansum integerrimum discolor barbatum atratum
              cernuum hookeri luridum gnomus denticulatum osculatum trulla juruenense maculatum sanguineum socco
              uncatum vinaceum`),
            ...grexes("Orchidglade"),
          ] }),
          genus("Cycnoches", { commonNames: ["orquídea-cisne"], care: care.catasetum, children: spp("chlorochilon loddigesii egertonianum warszewiczii haagii pentadactylon") }),
          genus("Mormodes", { care: care.catasetum, children: spp("buccinator sinuata") }),
          genus("Clowesia", { care: care.catasetum, children: spp("russelliana rosea thylaciochila") }),
          genus("Galeandra", spp("devoniana baueri beyrichii")),
          genus("Grobya", spp("amherstiae")),
          nothogenus("Fredclarkeara"),
        ]),
        subtribe("Cyrtopodiinae", [
          genus("Cyrtopodium", { commonNames: ["sumaré"], care: care.cyrtopodium, children: spp("andersonii glutiniferum punctatum flavum polyphyllum eugenii saintlegerianum aliciae paludicola") }),
        ]),
        subtribe("Eriopsidinae", [genus("Eriopsis", spp("biloba"))]),
        subtribe("Maxillariinae", [
          genus("Maxillaria", { care: care.maxillaria, children: [
            aka("tenuifolia", "orquídea-coco"),
            aka("schunkeana", "orquídea-negra"),
            ...spp("variabilis picta porphyrostele marginata sanderiana ubatubana cucullata densa juergensis seidelii sophronitis grandiflora coccinea"),
          ] }),
          genus("Lycaste", { care: care.zygopetalum, children: [...spp("aromatica cruenta deppei macrophylla"), aka("virginalis", "lycaste skinneri", "monja-blanca")] }),
          genus("Anguloa", { commonNames: ["orquídea-tulipa"], care: care.zygopetalum, children: spp("clowesii uniflora virginalis cliftonii") }),
          genus("Bifrenaria", { care: care.bifrenaria, children: spp("harrisoniae tyrianthina inodora atropurpurea aureofulva tetragona") }),
          genus("Scuticaria", { care: care.maxillaria, children: spp("hadwenii steelei salesiana") }),
          genus("Rudolfiella", spp("aurantiaca")),
          genus("Mormolyca", spp("ringens")),
          genus("Trigonidium", spp("egertonianum")),
          genus("Xylobium"),
        ]),
        subtribe("Stanhopeinae", [
          genus("Stanhopea", { care: care.stanhopea, children: spp(`
            tigrina oculata wardii graveolens insignis lietzei nigroviolacea grandiflora hernandezii jenischiana
            candida embreei reichenbachiana ecornuta costaricensis tricornis platyceras saccata`) }),
          genus("Gongora", { care: care.stanhopea, children: spp("galeata quinquenervis bufonia armeniaca") }),
          genus("Coryanthes", { commonNames: ["orquídea-balde"], care: care.stanhopea, children: spp("macrantha speciosa") }),
          genus("Acineta", { care: care.stanhopea, children: spp("superba chrysantha") }),
          genus("Cirrhaea", spp("dependens")),
          genus("Houlletia", spp("brocklehurstiana")),
          genus("Paphinia", spp("cristata")),
          genus("Embreea", spp("rodigasiana")),
          genus("Lacaena", spp("bicolor")),
        ]),
        subtribe("Coeliopsidinae", [
          genus("Peristeria", [aka("elata", "flor-do-espírito-santo", "orquídea-pomba")]),
          genus("Coeliopsis", spp("hyacinthosma")),
        ]),
        subtribe("Zygopetalinae", [
          genus("Zygopetalum", { commonNames: ["zigopétalo"], care: care.zygopetalum, children: [
            ...spp("maxillare mackayi intermedium crinitum triste maculatum pabstii brachypetalum sellowii"),
            ...grexes("Louisendorf"),
          ] }),
          genus("Promenaea", { care: care.zygopetalum, children: spp("xanthina stapelioides rollissonii") }),
          genus("Pescatoria", { care: care.zygopetalum, children: [aka("coelestis", "bollea coelestis"), ...spp("cerina klabochorum lehmannii dayana")] }),
          genus("Huntleya", spp("meleagris")),
          genus("Koellensteinia", spp("graminea")),
          genus("Kefersteinia"),
          genus("Warczewiczella", spp("discolor amazonica marginata")),
          genus("Pabstia", spp("jugosa viridis")),
          genus("Warrea", spp("warreana")),
          genus("Dichaea", spp("pendula cogniauxiana")),
          genus("Aganisia", spp("cyanea")),
          genus("Neogardneria", spp("murrayana")),
        ]),
        subtribe("Oncidiinae", { commonNames: ["chuva-de-ouro"], children: [
          genus("Oncidium", { commonNames: ["chuva-de-ouro", "bailarina", "odontoglossum"], care: care.oncidium, children: [
            aka("alexandrae", "odontoglossum crispum"),
            ...spp(`sphacelatum maculatum ornithorhynchum cheirophorum obryzatum leucochilum wentworthianum harryanum
              hastilabium tigrinum cirrhosum baueri hastatum incurvum sotoanum`),
            ...grexes("Sharry Baby", "Twinkle"),
          ] }),
          genus("Gomesa", { commonNames: ["chuva-de-ouro", "bailarina"], care: care.gomesa, children: [
            aka("flexuosa", "oncidium flexuosum", "chuva-de-ouro"),
            aka("varicosa", "oncidium varicosum"),
            aka("forbesii", "oncidium forbesii"),
            aka("crispa", "oncidium crispum"),
            aka("gardneri", "oncidium gardneri"),
            aka("praetexta", "oncidium praetextum"),
            aka("marshalliana", "oncidium marshallianum"),
            aka("imperatoris-maximiliani", "oncidium imperatoris-maximiliani"),
            aka("sarcodes", "oncidium sarcodes"),
            aka("ranifera", "oncidium raniferum"),
            aka("concolor", "oncidium concolor"),
            aka("longipes", "oncidium longipes"),
            aka("cornigera", "oncidium cornigerum"),
            aka("barbata", "oncidium barbatum"),
            aka("pubes", "oncidium pubes"),
            aka("echinata", "baptistonia echinata"),
            aka("radicans", "ornithophora radicans"),
            aka("divaricata", "oncidium divaricatum"),
            aka("bifolia", "oncidium bifolium"),
            aka("welteri", "oncidium welteri"),
            ...spp("recurva planifolia"),
          ] }),
          genus("Brassia", { commonNames: ["orquídea-aranha"], care: care.brassia, children: [aka("arcuigera", "brassia longissima"), ...spp("verrucosa caudata gireoudiana maculata")] }),
          genus("Miltonia", { commonNames: ["miltônia"], care: care.miltonia, children: [
            sp("spectabilis", [variety("moreliana")]),
            ...spp("clowesii flavescens regnellii cuneata russelliana candida kayasimae phymatochila"),
          ] }),
          genus("Miltoniopsis", { commonNames: ["orquídea-amor-perfeito"], care: { ...care.miltonia, tempNightMin: 10, tempDayMax: 26 }, children: spp("vexillaria roezlii phalaenopsis santanaei warszewiczii") }),
          genus("Rossioglossum", [aka("grande", "odontoglossum grande"), sp("williamsianum")]),
          genus("Trichocentrum", { care: care.psychopsis, children: [
            aka("lanceanum", "oncidium lanceanum"),
            aka("cebolleta", "oncidium cebolleta", "rabo-de-rato"),
            aka("pumilum", "oncidium pumilum"),
            aka("splendidum", "oncidium splendidum"),
            ...spp("carthagenense jonesianum pulchrum"),
          ] }),
          genus("Psychopsis", { commonNames: ["orquídea-borboleta"], care: care.psychopsis, children: [aka("papilio", "oncidium papilio"), ...spp("krameriana versteegiana")] }),
          genus("Tolumnia", { care: care.psychopsis, children: [sp("pulchella"), aka("variegata", "oncidium variegatum")] }),
          genus("Comparettia", spp("macroplectron coccinea falcata speciosa")),
          genus("Ionopsis", spp("utricularioides")),
          genus("Rodriguezia", { care: care.gomesa, children: spp("venusta lanceolata decora bracteata") }),
          genus("Capanemia", spp("superflua")),
          genus("Notylia", spp("barkeri")),
          genus("Lockhartia", spp("lunifera oerstedii")),
          genus("Erycina", [aka("pusilla", "psygmorchis pusilla"), sp("crista-galli")]),
          genus("Zelenkoa", spp("onusta")),
          genus("Cyrtochilum", spp("macranthum")),
          genus("Cuitlauzina", spp("pendula")),
          genus("Rhynchostele", spp("cervantesii")),
          nothogenus("Oncidesa", { commonNames: ["chuva-de-ouro"], care: care.gomesa, children: grexes("Gower Ramsey", "Sweet Sugar") }),
          nothogenus("Beallara", grexes("Marfitch")),
          nothogenus("Aliceara"),
          nothogenus("Brassidium"),
          nothogenus("Miltassia"),
          nothogenus("Miltonidium"),
        ] }),
      ]),

      tribe("Epidendreae", [
        subtribe("Laeliinae", [
          genus("Cattleya", { commonNames: ["catleia", "catléia", "sophronitis", "hoffmannseggella"], care: care.cattleya, children: [
            sp("walkeriana", { commonNames: ["walkeriana"], care: care.walkeriana, children: forms("alba semialba coerulea concolor rubra") }),
            sp("intermedia", forms("alba aquinii orlata coerulea amethystina")),
            sp("labiata", { commonNames: ["rainha-do-nordeste"], care: { bloomMonths: [2, 3, 4] }, children: forms("alba semialba coerulea rubra") }),
            sp("purpurata", {
              commonNames: ["laelia purpurata"],
              care: { bloomMonths: [10, 11, 12] },
              children: forms("alba semialba carnea rubra sanguinea werkhauseri flamea striata venosa roxo-violeta"),
            }),
            sp("loddigesii", forms("alba coerulea")),
            sp("harrisoniana", forms("alba coerulea")),
            sp("nobilior", forms("alba")),
            aka("tigrina", "leopoldii", "cattleya leopoldii"),
            aka("tenebrosa", "laelia tenebrosa"),
            aka("lobata", "laelia lobata"),
            aka("crispa", "laelia crispa"),
            aka("perrinii", "laelia perrinii"),
            aka("jongheana", "laelia jongheana"),
            aka("xanthina", "laelia xanthina"),
            aka("grandis", "laelia grandis"),
            aka("fidelensis", "laelia fidelensis"),
            aka("sincorana", "laelia sincorana"),
            aka("pumila", "laelia pumila"),
            aka("praestans", "laelia praestans"),
            aka("dayana", "laelia dayana"),
            aka("coccinea", "sophronitis coccinea"),
            aka("cernua", "sophronitis cernua"),
            aka("brevipedunculata", "sophronitis brevipedunculata"),
            aka("mantiqueirae", "sophronitis mantiqueirae"),
            aka("wittigiana", "sophronitis wittigiana"),
            aka("milleri", "laelia milleri"),
            aka("harpophylla", "laelia harpophylla"),
            aka("briegeri", "laelia briegeri"),
            aka("bradei", "laelia bradei"),
            aka("caulescens", "laelia caulescens"),
            aka("crispata", "laelia crispata", "laelia flava"),
            aka("cinnabarina", "laelia cinnabarina"),
            aka("liliputana", "laelia liliputana"),
            ...spp(`aclandiae amethystoglossa bicolor dormaniana elongata forbesii granulosa guttata kerrii porphyroglossa
              schilleriana schofieldiana tenuis velutina violacea warneri mossiae trianae warscewiczii gaskelliana
              percivaliana lueddemanniana dowiana maxima quadricolor jenmanii lawrenceana eldorado rex mendelii
              iricolor luteola`),
          ] }),
          genus("Laelia", { care: care.laelia, children: spp("anceps gouldiana speciosa rubescens albida autumnalis furfuracea superbiens") }),
          genus("Brassavola", { care: care.brassavola, children: [
            aka("nodosa", "dama-da-noite"),
            ...spp("tuberculata cucullata perrinii flagellaris martiana subulifolia acaulis"),
          ] }),
          genus("Rhyncholaelia", { care: care.brassavola, children: [aka("digbyana", "brassavola digbyana"), aka("glauca", "brassavola glauca")] }),
          genus("Guarianthe", { care: care.cattleya, children: [
            aka("aurantiaca", "cattleya aurantiaca"),
            aka("skinneri", "cattleya skinneri", "guaria-morada"),
            aka("bowringiana", "cattleya bowringiana"),
            ...spp("patinii deckeri"),
          ] }),
          genus("Encyclia", { care: care.encyclia, children: spp(`
            cordigera alata oncidioides patens dichroma odoratissima osmantha randii flava bractescens tampensis
            adenocaula phoenicea granitica guatemalensis`) }),
          genus("Prosthechea", { care: care.encyclia, children: [
            aka("cochleata", "encyclia cochleata", "orquídea-polvo"),
            aka("fragrans", "encyclia fragrans"),
            aka("vespa", "encyclia vespa"),
            aka("citrina", "encyclia citrina"),
            aka("vitellina", "encyclia vitellina"),
            aka("radiata", "encyclia radiata"),
            ...spp("prismatocarpa garciana mariae brassavolae aemula pygmaea"),
          ] }),
          genus("Epidendrum", { commonNames: ["epidendro", "orquídea-crucifixo"], care: care.epidendrum, children: [
            aka("magnoliae", "epidendrum conopseum"),
            ...spp(`radicans ibaguense secundum denticulatum ciliare nocturnum porpax stamfordianum parkinsonianum
              fulgens cinnabarinum pseudepidendrum ilense difforme anceps rigidum paniculatum`),
          ] }),
          genus("Broughtonia", { care: care.brassavola, children: spp("sanguinea negrilensis") }),
          genus("Myrmecophila", spp("tibicinis thomsoniana humboldtii")),
          genus("Barkeria", spp("spectabilis skinneri lindleyana melanocaulon")),
          genus("Leptotes", { care: care.leptotes, children: spp("bicolor unifolia cogniauxiana tenuis pauloensis") }),
          genus("Isabelia", { care: care.leptotes, children: spp("virginalis pulchella violacea") }),
          genus("Loefgrenianthus", spp("blanche-amesiae")),
          genus("Caularthron", spp("bicornutum bilamellatum")),
          genus("Dimerandra", spp("emarginata")),
          genus("Pseudolaelia", spp("vellozicola")),
          genus("Constantia", spp("cipoensis")),
          genus("Alamania", spp("punicea")),
          genus("Scaphyglottis"),
          nothogenus("Laeliocattleya", { commonNames: ["lc"], care: care.cattleya }),
          nothogenus("Rhyncholaeliocattleya", { commonNames: ["rlc", "blc", "brassolaeliocattleya"], care: care.cattleya }),
          nothogenus("Brassocattleya", { commonNames: ["bc"], care: care.cattleya }),
          nothogenus("Cattlianthe", { commonNames: ["ctt"], care: care.cattleya, children: grexes("Chocolate Drop") }),
          nothogenus("Rhyncattleanthe", { commonNames: ["rth", "potinara"], care: care.cattleya }),
          nothogenus("Epicattleya", { care: care.cattleya }),
        ]),
        subtribe("Pleurothallidinae", { commonNames: ["pleurotalídea"], children: [
          genus("Masdevallia", { care: care.masdevallia, children: spp("veitchiana coccinea ignea tovarensis infracta caudata triangularis strobelii glandulosa decumana") }),
          genus("Dracula", { care: care.dracula, children: [aka("simia", "cara-de-macaco", "orquídea-macaco"), ...spp("vampira chimaera bella wallisii gigas roezlii")] }),
          genus("Pleurothallis", { care: care.pleurothallid, children: spp("ruscifolia restrepioides truncata cardiothallis") }),
          genus("Restrepia", { care: care.pleurothallid, children: spp("guttulata brachypus sanguinea contorta elegans") }),
          genus("Acianthera", { care: care.pleurothallid, children: [aka("saurocephala", "pleurothallis saurocephala"), ...spp("prolifera recurva luteola pubescens ochreata")] }),
          genus("Specklinia", { care: care.pleurothallid, children: spp("grobyi") }),
          genus("Octomeria", { care: care.pleurothallid, children: spp("grandiflora crassifolia") }),
          genus("Dryadella", { care: care.pleurothallid, children: spp("zebrina edwallii") }),
          genus("Lepanthes", { care: care.pleurothallid, children: spp("telipogoniflora calodictyon") }),
          genus("Platystele", { care: care.pleurothallid, children: spp("jungermannioides") }),
          genus("Porroglossum", { care: care.pleurothallid, children: spp("muscosum") }),
          genus("Stelis", { care: care.pleurothallid }),
          genus("Anathallis", { care: care.pleurothallid }),
          genus("Trisetella", { care: care.pleurothallid }),
          genus("Zootrophion", { care: care.pleurothallid }),
        ] }),
        subtribe("Bletiinae", [genus("Bletia", spp("catenulata purpurea"))]),
        subtribe("Chysinae", [genus("Chysis", spp("bractescens aurea laevis"))]),
        subtribe("Ponerinae", [genus("Isochilus", spp("linearis"))]),
        subtribe("Calypsoinae", [genus("Calypso", spp("bulbosa")), genus("Govenia")]),
      ]),

      tribe("Vandeae", [
        subtribe("Aeridinae", [
          genus("Vanda", {
            commonNames: ["vanda", "ascocenda", "ascocentrum", "neofinetia", "euanthe"],
            care: care.vandeae,
            children: [
              aka("coerulea", "vanda azul", "vanda-azul"),
              aka("sanderiana", "euanthe sanderiana", "waling-waling"),
              aka("falcata", "neofinetia falcata", "neofinetia", "fukiran"),
              aka("ampullacea", "ascocentrum ampullaceum"),
              aka("curvifolia", "ascocentrum curvifolium"),
              aka("garayi", "ascocentrum miniatum"),
              ...spp(`tricolor luzonica dearei denisoniana tessellata testacea coerulescens christensoniana lamellata
                merrillii roeblingiana cristata bensonii brunnea insignis javierae liouvillei limbata helvola
                flabellata fuscoviridis hindsii lilacina ustii pumila alpina concolor`),
              ...grexes("Rothschildiana", "Sansai Blue", "Pachara Delight", "Kasem's Delight", "Robert's Delight", "Gordon Dillon", "Fuchs Delight"),
            ],
          }),
          genus("Phalaenopsis", { commonNames: ["orquídea-borboleta", "falenópsis", "doritaenopsis", "doritis"], care: care.phalaenopsis, children: [
            aka("pulcherrima", "doritis pulcherrima"),
            aka("japonica", "sedirea japonica"),
            ...spp(`amabilis aphrodite schilleriana stuartiana sanderiana equestris lueddemanniana violacea bellina gigantea
              cornu-cervi mannii parishii lobbii appendiculata tetraspis hieroglyphica fasciata mariae pantherina
              philippinensis celebensis deliciosa wilsonii braceana honghenensis hainanensis venosa modesta
              amboinensis fimbriata javanica sumatrana speciosa corningiana micholitzii lindenii inscriptiosinensis
              floresensis stobartiana lowii finleyi kunstleri pallens reichenbachiana viridis bastianii`),
            ...grexes("Sogo Yukidian", "Golden Peoker"),
          ] }),
          genus("Papilionanthe", { care: { ...care.vandeae, light: "Sol pleno: as folhas roliças pedem muita luz." }, children: [
            aka("teres", "vanda teres"),
            ...spp("hookeriana vandarum"),
          ] }),
          genus("Aerides", { care: care.vandeae, children: spp("odorata lawrenceae multiflora rosea houlletiana quinquevulnera falcata crassifolia crispa krabiensis") }),
          genus("Rhynchostylis", { commonNames: ["rabo-de-raposa"], care: care.vandeae, children: [aka("gigantea", "rabo-de-raposa"), ...spp("retusa coelestis")] }),
          genus("Renanthera", { care: { ...care.vandeae, light: "Sol pleno a muita luz." }, children: spp("monachica coccinea imschootiana storiei philippinensis") }),
          genus("Arachnis", { commonNames: ["orquídea-escorpião"], care: care.vandeae, children: spp("flos-aeris hookeriana") }),
          genus("Sarcochilus", spp("falcatus hartmannii fitzgeraldii")),
          genus("Gastrochilus", spp("bellinus calceolaris")),
          genus("Acampe", { care: care.vandeae, children: spp("rigida") }),
          genus("Trichoglottis", { care: care.vandeae, children: spp("atropurpurea philippinensis") }),
          genus("Holcoglossum", spp("kimballianum")),
          genus("Smitinandia", spp("micrantha")),
          genus("Vandopsis", { care: care.vandeae, children: spp("gigantea lissochiloides") }),
          genus("Chiloschista", spp("lunifera")),
          genus("Seidenfadenia", spp("mitrata")),
          genus("Tuberolabium", spp("kotoense")),
          genus("Micropera", { care: care.vandeae, children: spp("utriculosa") }),
          genus("Cleisostoma"),
          genus("Robiquetia"),
          genus("Pomatocalpa"),
          nothogenus("Aranda", { care: care.vandeae }),
          nothogenus("Mokara", { care: care.vandeae }),
          nothogenus("Vandachostylis", { commonNames: ["rhynchovanda"], care: care.vandeae }),
          nothogenus("Aranthera", { care: care.vandeae }),
        ]),
        subtribe("Angraecinae", [
          genus("Angraecum", { care: care.angraecum, children: [
            aka("sesquipedale", "orquídea-de-darwin", "estrela-de-belém"),
            ...spp("eburneum leonis didieri magdalenae distichum compactum scottianum longicalcar sororium"),
            ...grexes("Veitchii"),
          ] }),
          genus("Aerangis", { care: care.angraecum, children: spp("citrata fastuosa luteoalba biloba kotschyana modesta") }),
          genus("Dendrophylax", [aka("lindenii", "orquídea-fantasma"), sp("funalis")]),
          genus("Mystacidium", spp("capense")),
          genus("Cyrtorchis", spp("arcuata")),
          genus("Campylocentrum"),
          genus("Jumellea"),
          genus("Aeranthes"),
        ]),
        subtribe("Polystachyinae", [genus("Polystachya", spp("concreta bella pubescens estrellensis cultriformis"))]),
      ]),
    ]),
  ] }),
];
