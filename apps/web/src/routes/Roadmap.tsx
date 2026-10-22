import { useState } from "react";
import {
  type Inline,
  nextItem,
  parseInline,
  parseRoadmap,
  type RoadmapItem,
  type RoadmapSection,
  roadmapProgress,
  sectionProgress,
  splitItemHead,
} from "@orchidiary/shared";
import { Icon, PageHeader, Toggle } from "../components/ui.tsx";
// A fonte de dados é o próprio markdown, embutido no build: atualizou o ROADMAP.md, publicou, a página muda.
import roadmapSource from "../../../../docs/ROADMAP.md?raw";

const roadmap = parseRoadmap(roadmapSource);

/** Roadmap do projeto, desenhado a partir de docs/ROADMAP.md. */
export function Roadmap() {
  const [hideDone, setHideDone] = useState(false);
  const progress = roadmapProgress(roadmap);
  const next = nextItem(roadmap);
  const nextHead = next ? splitItemHead(next.item.text, next.item.children.length > 0) : null;
  const sections = [...(roadmap.queue ? [roadmap.queue] : []), ...roadmap.phases];

  return (
    <main className="pb-10">
      <PageHeader title="Roadmap" kicker="docs/ROADMAP.md" />
      <div className="space-y-6 px-5">
        <p className="-mt-2 text-musgo">
          {roadmap.phases.length} fases, uma fila de prioridades e o backlog.
        </p>

        <section aria-label="Progresso geral" className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-serif text-[1.6rem] leading-tight">
              {progress.done} de {progress.total} itens concluídos
            </span>
            <span className="eyebrow">{progress.percent}%</span>
          </div>
          <Bar percent={progress.percent} label="Progresso geral" />
        </section>

        <section aria-label="Próximo item" className="cartao space-y-3 border-orquidea p-5">
          {next && nextHead ? (
            <>
              <p className="eyebrow text-orquidea">
                {next.fromQueue ? "Próximo na fila" : `Fila vazia · próximo em ${next.section.title}`}
              </p>
              <h2 className="text-[1.35rem] leading-snug">
                <Rich text={nextHead.title} />
              </h2>
              {nextHead.rest && (
                <p className="text-[0.9rem] text-musgo">
                  <Rich text={nextHead.rest} />
                </p>
              )}
              <Detail item={next.item} />
            </>
          ) : (
            <>
              <p className="eyebrow text-orquidea">Próximo na fila</p>
              <p className="font-serif text-[1.35rem]">Tudo concluído por enquanto.</p>
            </>
          )}
        </section>

        <Toggle checked={hideDone} onChange={setHideDone}>
          Ocultar concluídos
        </Toggle>

        <div className="ml-1.5 border-l-2 border-linha">
          {sections.map((s) => (
            <Phase key={s.title} section={s} hideDone={hideDone} />
          ))}
        </div>

        {roadmap.backlog.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[1.5rem]">Backlog</h2>
            {roadmap.backlog.map((s) => (
              <BacklogList key={s.title} section={s} hideDone={hideDone} />
            ))}
          </section>
        )}

        <p className="typed text-[0.74rem]">
          Gerado a partir de docs/ROADMAP.md na versão {__APP_VERSION__}. A contagem considera Prioridades e fases.
        </p>
      </div>
    </main>
  );
}

function Bar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 overflow-hidden rounded-full bg-linha"
    >
      <div className="h-full rounded-full bg-folhagem" style={{ width: `${percent}%` }} />
    </div>
  );
}

function Phase({ section, hideDone }: { section: RoadmapSection; hideDone: boolean }) {
  const p = sectionProgress(section);
  const full = p.total > 0 && p.done === p.total;
  const dot = full
    ? "border-folhagem bg-folhagem"
    : p.done > 0
      ? "border-folhagem bg-[linear-gradient(90deg,var(--folhagem)_50%,var(--papel)_50%)]"
      : "border-contorno bg-papel";
  const items = hideDone ? section.items.filter((i) => i.done !== true) : section.items;

  return (
    <section className="relative space-y-2.5 pb-7 pl-5">
      <span aria-hidden="true" className={`absolute top-1.5 -left-2 size-3.5 rounded-full border-2 ${dot}`} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-[1.3rem]">{section.title}</h2>
        {p.total > 0 && (
          <span className="typed text-[0.8rem] tabular-nums">
            {p.done} de {p.total}
          </span>
        )}
      </div>
      {section.intro.map((t) => (
        <p key={t} className="text-[0.88rem] text-musgo">
          <Rich text={t} />
        </p>
      ))}
      {p.total > 0 && <Bar percent={p.percent} label={`Progresso: ${section.title}`} />}
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <Row key={`${i}-${item.text}`} item={item} />
        ))}
      </ul>
    </section>
  );
}

function BacklogList({ section, hideDone }: { section: RoadmapSection; hideDone: boolean }) {
  const open = section.items.filter((i) => i.done !== true).length;
  const items = hideDone ? section.items.filter((i) => i.done !== true) : section.items;
  const empty = section.intro.find((t) => /^nenhum/i.test(t));
  return (
    <div className="cartao space-y-2 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">{section.title}</p>
        <span className="font-serif text-[1.5rem] leading-none">{open}</span>
      </div>
      {section.items.length === 0 ? (
        <p className="text-[0.9rem] text-musgo">{empty ?? "Nada registrado."}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <Row key={`${i}-${item.text}`} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Um item da lista: linha simples ou, quando há detalhe, uma linha que abre. */
function Row({ item }: { item: RoadmapItem }) {
  const head = splitItemHead(item.text, item.children.length > 0);
  const hasDetail = item.children.length > 0 || !!head.rest;
  const done = item.done === true;
  const label = (
    <>
      <Box done={done} />
      <span className={`min-w-0 flex-1 ${done ? "text-musgo" : ""}`}>
        <Rich text={head.title} />
        {head.priority && <span className="selo selo-ocre ml-2 align-middle">{head.priority}</span>}
        {hasDetail && <span className="typed mt-0.5 block text-[0.7rem] group-open:hidden">detalhes ▾</span>}
        {hasDetail && <span className="typed mt-0.5 hidden text-[0.7rem] group-open:block">detalhes ▴</span>}
      </span>
    </>
  );
  return (
    <li className="cartao">
      {hasDetail ? (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-start gap-2.5 p-3 [&::-webkit-details-marker]:hidden">
            {label}
          </summary>
          <div className="pr-3 pb-3 pl-[2.6rem]">
            {head.rest && (
              <p className="mb-2 text-[0.9rem] text-musgo">
                <Rich text={head.rest} />
              </p>
            )}
            <Detail item={item} />
          </div>
        </details>
      ) : (
        <div className="flex items-start gap-2.5 p-3">{label}</div>
      )}
    </li>
  );
}

function Box({ done, small = false }: { done: boolean; small?: boolean }) {
  const size = small ? "size-4" : "size-[1.15rem]";
  return (
    <span
      aria-label={done ? "Concluído" : "Pendente"}
      role="img"
      className={`mt-[3px] grid shrink-0 place-items-center rounded-[4px] border-[1.5px] ${size} ${
        done ? "border-tinta bg-tinta text-folha" : "border-folhagem"
      }`}
    >
      {done && <Icon name="check" className="size-3" />}
    </span>
  );
}

/** Os sub-itens de um item, recuados. */
function Detail({ item }: { item: RoadmapItem }) {
  if (item.children.length === 0) return null;
  return <Tree items={item.children} />;
}

function Tree({ items }: { items: RoadmapItem[] }) {
  return (
    <ul className="space-y-1.5 text-[0.9rem] text-musgo">
      {items.map((c, i) => (
        <li key={`${i}-${c.text}`} className="flex items-start gap-2">
          {c.done === null ? (
            <span aria-hidden="true" className="mt-[0.6em] size-1 shrink-0 rounded-full bg-contorno" />
          ) : (
            <Box done={c.done} small />
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className={c.done ? "" : "text-tinta"}>
              <Rich text={c.text} />
            </p>
            {c.children.length > 0 && <Tree items={c.children} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Texto com `código`, **negrito** e links. */
function Rich({ text }: { text: string }) {
  return <>{parseInline(text).map((n, i) => <Node key={i} node={n} />)}</>;
}

function Node({ node }: { node: Inline }) {
  switch (node.kind) {
    case "code":
      return <code className="rounded bg-salvia-clara px-1 font-mono text-[0.84em] break-words text-tinta">{node.text}</code>;
    case "bold":
      return <strong className="font-semibold text-tinta">{node.text}</strong>;
    case "link":
      return (
        <a href={node.href} target="_blank" rel="noopener noreferrer" className="text-orquidea underline underline-offset-2">
          {node.text}
        </a>
      );
    default:
      return <>{node.text}</>;
  }
}
