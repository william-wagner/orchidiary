import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  nextItem,
  parseInline,
  parseRoadmap,
  roadmapProgress,
  sectionProgress,
  splitItemHead,
} from "./roadmap.ts";

const MD = `# Roadmap

## Prioridades

Fila em ordem.

- [x] Primeiro feito
  - detalhe com \`código\`
- [ ] Segundo pendente
  - Decidido:
    - [x] 1. tarefa
    - [ ] 2. outra
- [ ] Terceiro

## Fase 1 — Fundação (este commit)

- [x] A
- [ ] B: uma explicação bem longa que passa de cinquenta caracteres no total
  continua aqui

---

# Backlog

## Bugs

Nenhum registrado.

## Ideias

- [ ] Algo (média)
  - contexto
`;

test("roadmap: seções, tipos e título sem '(este commit)'", () => {
  const r = parseRoadmap(MD);
  assert.equal(r.title, "Roadmap");
  assert.equal(r.queue?.items.length, 3);
  assert.deepEqual(r.queue?.intro, ["Fila em ordem."]);
  assert.deepEqual(r.phases.map((p) => p.title), ["Fase 1 — Fundação"]);
  assert.deepEqual(r.backlog.map((p) => [p.title, p.items.length]), [["Bugs", 0], ["Ideias", 1]]);
});

test("roadmap: itens aninhados, tarefas e continuação de linha", () => {
  const r = parseRoadmap(MD);
  const second = r.queue!.items[1]!;
  assert.equal(second.children[0]!.done, null);
  assert.deepEqual(second.children[0]!.children.map((c) => [c.text, c.done]), [["1. tarefa", true], ["2. outra", false]]);
  assert.match(r.phases[0]!.items[1]!.text, /no total continua aqui$/);
});

test("roadmap: progresso conta só o nível 1 de Prioridades e fases", () => {
  const r = parseRoadmap(MD);
  assert.deepEqual(sectionProgress(r.queue!), { done: 1, total: 3, percent: 33 });
  assert.deepEqual(roadmapProgress(r), { done: 2, total: 5, percent: 40 });
});

test("roadmap: próximo é o primeiro pendente da fila; fila vazia cai nas fases", () => {
  const r = parseRoadmap(MD);
  assert.equal(nextItem(r)?.item.text, "Segundo pendente");
  r.queue!.items.forEach((i) => (i.done = true));
  const n = nextItem(r);
  assert.equal(n?.fromQueue, false);
  assert.match(n!.item.text, /^B:/);
});

test("roadmap: título, prioridade e detalhe do item", () => {
  assert.deepEqual(splitItemHead("Algo (média)", false), { title: "Algo", priority: "média" });
  assert.deepEqual(splitItemHead("Curto: explicação curta", false), { title: "Curto: explicação curta", priority: undefined });
  const longo = splitItemHead("Faixa própria: o usuário ajusta temperatura e umidade só para aquela planta", false);
  assert.equal(longo.title, "Faixa própria");
  assert.match(longo.rest ?? "", /^o usuário ajusta/);
  assert.equal(splitItemHead("Título: " + "x".repeat(60), true).rest, undefined);
});

test("roadmap: markdown inline", () => {
  assert.deepEqual(parseInline("veja `a.ts` e **isto** e [site](https://x.com/a) fim"), [
    { kind: "text", text: "veja " },
    { kind: "code", text: "a.ts" },
    { kind: "text", text: " e " },
    { kind: "bold", text: "isto" },
    { kind: "text", text: " e " },
    { kind: "link", text: "site", href: "https://x.com/a" },
    { kind: "text", text: " fim" },
  ]);
  assert.deepEqual(parseInline("(online: https://www.claude.ai/artifact/abc):"), [
    { kind: "text", text: "(online: " },
    { kind: "link", text: "claude.ai", href: "https://www.claude.ai/artifact/abc" },
    { kind: "text", text: "):" },
  ]);
});

test("roadmap: o docs/ROADMAP.md real continua legível pela página", () => {
  const r = parseRoadmap(readFileSync(new URL("../../../docs/ROADMAP.md", import.meta.url), "utf8"));
  assert.ok(r.queue, "falta a seção Prioridades");
  assert.ok(r.phases.length >= 4, "esperava as fases");
  assert.ok(r.backlog.length >= 3, "esperava Bugs, Melhorias e Ideias");
  assert.ok(roadmapProgress(r).total > 0);
  for (const s of [r.queue!, ...r.phases]) assert.ok(s.items.length > 0, `${s.title} sem itens`);
});
