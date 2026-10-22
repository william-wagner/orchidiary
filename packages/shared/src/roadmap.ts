/**
 * Leitor do docs/ROADMAP.md: transforma o markdown do roadmap numa árvore
 * que a página /roadmap desenha. O arquivo é a única fonte de dados.
 *
 * Formato esperado (o mesmo que o arquivo já usa):
 *   # Roadmap                      título
 *   ## Prioridades                 fila: o primeiro item sem [x] é o próximo
 *   ## Fase N — Nome               fases (um "## ..." por fase)
 *   # Backlog                      a partir daqui, cada "## ..." é uma lista (Bugs, Melhorias, Ideias)
 *   - [ ] item / - [x] item        item de nível 1; linhas recuadas abaixo viram detalhe (podem ter [ ] também)
 */

export type RoadmapItem = {
  /** Texto do marcador, em markdown inline (`código`, **negrito**, links). */
  text: string;
  /** null = marcador sem caixa de seleção (nota de detalhe). */
  done: boolean | null;
  children: RoadmapItem[];
};

export type RoadmapSection = {
  title: string;
  kind: "queue" | "phase" | "backlog";
  /** Parágrafos soltos logo abaixo do título. */
  intro: string[];
  items: RoadmapItem[];
};

export type Roadmap = {
  title: string;
  queue: RoadmapSection | null;
  phases: RoadmapSection[];
  backlog: RoadmapSection[];
};

export function parseRoadmap(md: string): Roadmap {
  const roadmap: Roadmap = { title: "Roadmap", queue: null, phases: [], backlog: [] };
  let inBacklog = false;
  let titled = false;
  let section: RoadmapSection | null = null;
  let stack: { indent: number; item: RoadmapItem }[] = [];
  let last: RoadmapItem | null = null;

  for (const raw of md.replace(/\t/g, "  ").split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim() || /^-{3,}$/.test(line.trim())) continue;

    const heading = /^(#{1,2})\s+(.*)$/.exec(line);
    if (heading) {
      const text = (heading[2] ?? "").trim();
      section = null;
      stack = [];
      last = null;
      if (heading[1] === "#") {
        if (/^backlog$/i.test(text)) inBacklog = true;
        else if (!titled) {
          roadmap.title = text;
          titled = true;
        }
        continue;
      }
      section = {
        title: text.replace(/\s*\(este commit\)\s*$/i, ""),
        kind: inBacklog ? "backlog" : /^prioridades/i.test(text) ? "queue" : "phase",
        intro: [],
        items: [],
      };
      if (section.kind === "backlog") roadmap.backlog.push(section);
      else if (section.kind === "queue") roadmap.queue = section;
      else roadmap.phases.push(section);
      continue;
    }

    if (!section) continue;

    const bullet = /^(\s*)-\s+(?:\[( |x|X)\]\s+)?(.*)$/.exec(line);
    if (bullet) {
      const indent = (bullet[1] ?? "").length;
      const item: RoadmapItem = {
        text: (bullet[3] ?? "").trim(),
        done: bullet[2] === undefined ? null : bullet[2].toLowerCase() === "x",
        children: [],
      };
      while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop();
      (stack[stack.length - 1]?.item.children ?? section.items).push(item);
      stack.push({ indent, item });
      last = item;
      continue;
    }

    // linha recuada logo abaixo de um item: continuação do texto dele
    if (last && /^\s/.test(line)) last.text += ` ${line.trim()}`;
    else section.intro.push(line.trim());
  }
  return roadmap;
}

/** Itens de nível 1 que têm caixa de seleção: o que conta no progresso. */
const counted = (s: RoadmapSection) => s.items.filter((i) => i.done !== null);

export type Progress = { done: number; total: number; percent: number };

export function sectionProgress(s: RoadmapSection): Progress {
  const items = counted(s);
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, percent: items.length ? Math.round((done / items.length) * 100) : 0 };
}

/** Progresso geral: Prioridades e fases (o backlog não entra). */
export function roadmapProgress(r: Roadmap): Progress {
  const sections = [...(r.queue ? [r.queue] : []), ...r.phases];
  const parts = sections.map(sectionProgress);
  const done = parts.reduce((n, p) => n + p.done, 0);
  const total = parts.reduce((n, p) => n + p.total, 0);
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

export type NextItem = { item: RoadmapItem; section: RoadmapSection; fromQueue: boolean };

/** O próximo da fila de prioridades; com a fila vazia, o primeiro pendente das fases. */
export function nextItem(r: Roadmap): NextItem | null {
  const fromQueue = r.queue?.items.find((i) => i.done === false);
  if (r.queue && fromQueue) return { item: fromQueue, section: r.queue, fromQueue: true };
  for (const section of r.phases) {
    const item = section.items.find((i) => i.done === false);
    if (item) return { item, section, fromQueue: false };
  }
  return null;
}

export type ItemHead = { title: string; priority?: "alta" | "média" | "baixa"; rest?: string };

/**
 * Separa o título do item. A prioridade "(média)" no fim vira etiqueta. Um item sem
 * detalhes cujo texto é "Título: explicação longa" vira título + detalhe.
 */
export function splitItemHead(text: string, hasChildren: boolean): ItemHead {
  let title = text;
  let priority: ItemHead["priority"];
  const p = /\s*\((alta|média|baixa)\)\s*$/.exec(title);
  if (p) {
    priority = p[1] as ItemHead["priority"];
    title = title.slice(0, p.index);
  }
  if (!hasChildren) {
    const colon = title.indexOf(": ");
    if (colon > 0 && colon <= 80 && title.length - colon > 50) {
      return { title: title.slice(0, colon), priority, rest: title.slice(colon + 2) };
    }
  }
  return { title, priority };
}

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "link"; text: string; href: string };

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/\S+)/g;

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Markdown inline mínimo: `código`, **negrito**, [texto](url) e endereços soltos. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const text = (t: string) => t && out.push({ kind: "text", text: t });
  let last = 0;
  for (const m of src.matchAll(INLINE)) {
    text(src.slice(last, m.index));
    if (m[1] !== undefined) out.push({ kind: "code", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "bold", text: m[2] });
    else if (m[3] !== undefined && m[4] !== undefined) out.push({ kind: "link", text: m[3], href: m[4] });
    else if (m[5] !== undefined) {
      // pontuação colada no fim do endereço ("...Tyn):") não faz parte dele
      const url = m[5].replace(/[)\].,;:]+$/, "");
      out.push({ kind: "link", text: hostOf(url), href: url });
      text(m[5].slice(url.length));
    }
    last = m.index + m[0].length;
  }
  text(src.slice(last));
  return out;
}
