/**
 * Compartilhar um arquivo pela folha de compartilhamento do aparelho (WhatsApp,
 * Instagram, Telegram…). Sem suporte a arquivos (em geral no computador), baixa.
 */

/** O aparelho sabe compartilhar arquivos de imagem? */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array(1)], "teste.jpg", { type: "image/jpeg" })] });
  } catch {
    return false;
  }
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

/**
 * Precisa ser chamado direto do toque (o navegador exige um gesto recente), então o
 * arquivo já deve estar pronto: nada de gerar a imagem aqui dentro.
 */
export async function shareFile(file: File, text?: string): Promise<ShareOutcome> {
  if (canShareFiles() && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share(text ? { files: [file], text } : { files: [file] });
      return "shared";
    } catch (e) {
      // a pessoa fechou a folha sem escolher
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      throw e;
    }
  }
  downloadFile(file);
  return "downloaded";
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
