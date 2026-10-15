import type { IllustrationStatus } from "./enums.ts";

/** Uma tentativa que falhou só é repetida depois deste intervalo (cada chamada custa dinheiro). */
export const ILLUSTRATION_RETRY_MS = 24 * 60 * 60 * 1000;
/** "pending" mais antigo que isso foi interrompido (ex.: servidor reiniciado no meio). */
export const ILLUSTRATION_STALE_MS = 15 * 60 * 1000;

export interface IllustrationState {
  status: IllustrationStatus | null;
  updatedAt: Date | null;
}

/** Se a foto de capa precisa (de novo) de uma ilustração. */
export function needsIllustration(photo: IllustrationState, now: Date): boolean {
  if (photo.status === null) return true;
  const age = photo.updatedAt ? now.getTime() - photo.updatedAt.getTime() : Infinity;
  if (photo.status === "error") return age >= ILLUSTRATION_RETRY_MS;
  if (photo.status === "pending") return age >= ILLUSTRATION_STALE_MS;
  return false;
}

/** Instrução para a releitura da foto como prancha de livro de botânica. */
export function illustrationPrompt(taxon: string | null): string {
  const subject = taxon ? `a orquídea ${taxon}` : "a orquídea";
  return [
    `Redesenhe a foto como uma prancha de ilustração botânica de livro antigo, retratando ${subject} da foto.`,
    "A prancha mostra UMA ÚNICA planta: a que está no centro da foto, em primeiro plano.",
    "Outras plantas, folhas, raízes ou flores que aparecem nas laterais ou ao fundo pertencem a outras plantas e NÃO devem ser desenhadas, nem parcialmente.",
    "Técnica: aquarela delicada sobre traço fino de nanquim, cores naturais e suaves, como nas pranchas científicas do século XIX.",
    "Seja fiel à planta central: mesmo número e formato de folhas, raízes, hastes e flores (se houver), na mesma pose.",
    "Remova tudo que não é essa planta: outras plantas, mãos, tela, paredes, vasos de plástico, fundo e sombras.",
    "Planta inteira, sozinha, centralizada, com margem generosa em volta.",
    "Fundo de papel liso, cor creme muito clara e uniforme (#FBFBF7), sem textura, sem moldura, sem bordas.",
    "Sem texto, sem legendas, sem números, sem assinatura.",
  ].join(" ");
}
