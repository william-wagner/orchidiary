import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./ui.tsx";

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const GAP = 16; // margem da foto ampliada até a borda da tela
const OPEN_MS = 340;
const CLOSE_MS = 280;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** Arrastar para baixo (sem zoom) além disto fecha a foto */
const DISMISS_DISTANCE = 110;

type Box = { left: number; top: number; width: number; height: number };
type Point = { x: number; y: number };

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Caixa da foto ampliada: o maior tamanho que cabe na tela mantendo a proporção. */
function fitBox(ratio: number): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = vw - GAP * 2;
  const maxH = vh - GAP * 2;
  const width = Math.min(maxW, maxH * ratio);
  const height = width / ratio;
  return { left: (vw - width) / 2, top: (vh - height) / 2, width, height };
}

const OPEN_CLIP = "inset(0px 0px 0px 0px round 2px)";

/**
 * Quadro que leva a caixa ampliada de volta para cima da foto de origem.
 * "cover": a origem recorta a foto (capa), então o quadro encolhe até cobrir
 * a origem e o excedente é cortado; "contain": a foto inteira cabe na origem.
 */
function originFrame(source: HTMLElement, box: Box, fit: "contain" | "cover") {
  const r = source.getBoundingClientRect();
  // offsetWidth ignora a leve rotação do porta-retrato; o centro vem do retângulo visível
  const w = source.offsetWidth || r.width;
  const h = source.offsetHeight || r.height;
  const scale = (fit === "cover" ? Math.max : Math.min)(w / box.width, h / box.height);
  const dx = r.left + r.width / 2 - (box.left + box.width / 2);
  const dy = r.top + r.height / 2 - (box.top + box.height / 2);
  const rotate = source.closest(".-rotate-1") ? -1 : 0;
  const ix = fit === "cover" ? Math.max(0, (box.width - w / scale) / 2) : 0;
  const iy = fit === "cover" ? Math.max(0, (box.height - h / scale) / 2) : 0;
  return {
    transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${rotate}deg)`,
    clipPath: `inset(${iy}px ${ix}px ${iy}px ${ix}px round 2px)`,
  };
}

/**
 * Foto ampliada: sai da miniatura e vem para perto (como quem traz a foto
 * presa no caderno até os olhos). Pinça, duplo toque ou roda do mouse
 * aproximam; arrastar para baixo, tocar fora, Esc ou o X devolvem a foto.
 */
export function PhotoViewer({
  source,
  thumbSrc,
  fullSrc,
  alt,
  fit = "contain",
  onClose,
}: {
  /** A miniatura clicada: ponto de partida e de volta da animação */
  source: HTMLImageElement;
  thumbSrc: string;
  fullSrc: string;
  alt: string;
  /** Como a origem mostra a foto (o object-fit dela) */
  fit?: "contain" | "cover";
  onClose: () => void;
}) {
  const ratio = source.naturalWidth && source.naturalHeight ? source.naturalWidth / source.naturalHeight : source.offsetWidth / source.offsetHeight || 1;
  const [box, setBox] = useState(() => fitBox(ratio));
  const [fullLoaded, setFullLoaded] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const backdrop = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null); // animação de abrir/fechar
  const stage = useRef<HTMLDivElement>(null); // zoom e arrasto
  const closing = useRef(false);

  // estado do gesto fora do React: cada movimento escreve o transform direto
  const view = useRef({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ scale: number; x: number; y: number; dist: number; mid: Point; moved: boolean } | null>(null);
  const lastTap = useRef<{ t: number; p: Point } | null>(null);

  const apply = useCallback((animate = false) => {
    const el = stage.current;
    if (!el) return;
    const { scale, x, y } = view.current;
    el.style.transition = animate ? `transform 220ms ${EASE}` : "none";
    el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    // arrastando para baixo sem zoom: o fundo clareia para mostrar que vai fechar
    if (backdrop.current && scale === 1) {
      backdrop.current.style.transition = animate ? `opacity 220ms ${EASE}` : "none";
      backdrop.current.style.opacity = String(1 - clamp(Math.abs(y) / 320, 0, 0.6));
    }
    setZoomed(scale > 1.01);
  }, []);

  /** Não deixa a foto ampliada sair da tela; abaixo de 1× volta ao tamanho de leitura. */
  const settle = useCallback(() => {
    const v = view.current;
    if (v.scale <= 1) {
      view.current = { scale: 1, x: 0, y: 0 };
    } else {
      const maxX = Math.max(0, (box.width * v.scale - window.innerWidth) / 2);
      const maxY = Math.max(0, (box.height * v.scale - window.innerHeight) / 2);
      v.x = clamp(v.x, -maxX, maxX);
      v.y = clamp(v.y, -maxY, maxY);
    }
    apply(true);
  }, [apply, box]);

  /** Aproxima mantendo parado o ponto da tela sob os dedos (ou o cursor). */
  const zoomAt = useCallback(
    (scale: number, at: Point, from = view.current) => {
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const px = (at.x - cx - from.x) / from.scale;
      const py = (at.y - cy - from.y) / from.scale;
      view.current = { scale, x: at.x - cx - scale * px, y: at.y - cy - scale * py };
    },
    [box],
  );

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const done = () => onClose();
    if (reducedMotion() || !frame.current || !stage.current) return done();
    const { scale, x, y } = view.current;
    stage.current.animate(
      [{ transform: `translate(${x}px, ${y}px) scale(${scale})` }, { transform: "translate(0, 0) scale(1)" }],
      { duration: CLOSE_MS, easing: EASE, fill: "forwards" },
    );
    backdrop.current?.animate([{ opacity: backdrop.current.style.opacity || 1 }, { opacity: 0 }], {
      duration: CLOSE_MS,
      easing: EASE,
      fill: "forwards",
    });
    frame.current
      .animate(
        [
          { transform: "none", clipPath: OPEN_CLIP, boxShadow: "0 24px 60px #0000004d" },
          { ...originFrame(source, box, fit), boxShadow: "0 1px 2px #0000001a" },
        ],
        { duration: CLOSE_MS, easing: EASE, fill: "forwards" },
      )
      .finished.then(done, done);
  }, [box, fit, onClose, source]);

  // Abrir: parte de cima da miniatura e vem para perto
  useLayoutEffect(() => {
    if (reducedMotion()) return;
    frame.current?.animate(
      [
        { ...originFrame(source, box, fit), boxShadow: "0 1px 2px #0000001a" },
        { transform: "none", clipPath: OPEN_CLIP, boxShadow: "0 24px 60px #0000004d" },
      ],
      { duration: OPEN_MS, easing: EASE },
    );
    backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: EASE });
    // só na abertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onResize = () => {
      setBox(fitBox(ratio));
      view.current = { scale: 1, x: 0, y: 0 };
      apply();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = overflow;
    };
  }, [apply, close, ratio]);

  // Roda do mouse / pinça do trackpad (precisa de listener não passivo para o preventDefault)
  useEffect(() => {
    const el = backdrop.current;
    if (!el) return;
    let timer: number | undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (closing.current) return;
      const scale = clamp(view.current.scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), 1, MAX_SCALE);
      zoomAt(scale, { x: e.clientX, y: e.clientY });
      apply();
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 150);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(timer);
    };
  }, [apply, settle, zoomAt]);

  function startGesture() {
    const pts = [...pointers.current.values()];
    const [a, b] = pts;
    if (!a) return (gesture.current = null);
    gesture.current = {
      ...view.current,
      dist: b ? Math.hypot(b.x - a.x, b.y - a.y) : 0,
      mid: b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a,
      moved: gesture.current?.moved ?? false,
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (closing.current || pointers.current.size >= 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) gesture.current = null;
    startGesture();
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const [a, b] = [...pointers.current.values()];
    if (!a) return;
    if (b) {
      // pinça: escala pela distância entre os dedos, segue o ponto médio
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scale = clamp((g.scale * dist) / (g.dist || dist), 0.6, MAX_SCALE);
      zoomAt(scale, g.mid, g);
      view.current.x += mid.x - g.mid.x;
      view.current.y += mid.y - g.mid.y;
      g.moved = true;
    } else {
      const dx = a.x - g.mid.x;
      const dy = a.y - g.mid.y;
      if (!g.moved && Math.hypot(dx, dy) < 6) return;
      g.moved = true;
      // com zoom, arrasta a foto; sem zoom, só na vertical (arrastar para fechar)
      view.current = g.scale > 1 ? { scale: g.scale, x: g.x + dx, y: g.y + dy } : { scale: 1, x: 0, y: g.y + dy };
    }
    apply();
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!pointers.current.delete(e.pointerId)) return;
    const moved = gesture.current?.moved ?? false;
    if (pointers.current.size > 0) {
      // um dedo saiu da pinça: o outro continua arrastando dali
      startGesture();
      return;
    }
    gesture.current = null;
    const v = view.current;
    if (!moved) return onTap({ x: e.clientX, y: e.clientY });
    if (v.scale <= 1 && Math.abs(v.y) > DISMISS_DISTANCE) return close();
    settle();
  }

  function onTap(p: Point) {
    const now = performance.now();
    const prev = lastTap.current;
    if (prev && now - prev.t < 300 && Math.hypot(p.x - prev.p.x, p.y - prev.p.y) < 30) {
      lastTap.current = null;
      if (view.current.scale > 1) view.current = { scale: 1, x: 0, y: 0 };
      else zoomAt(DOUBLE_TAP_SCALE, p);
      settle();
      return;
    }
    lastTap.current = { t: now, p };
    // toque fora da foto, sem zoom, devolve a foto ao livro
    const outside = p.x < box.left || p.x > box.left + box.width || p.y < box.top || p.y > box.top + box.height;
    if (outside && view.current.scale <= 1) close();
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-30">
      <div
        ref={backdrop}
        className="absolute inset-0 touch-none overscroll-none bg-[#15201a]/88 backdrop-blur-[3px] select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: zoomed ? "grab" : "zoom-in" }}
      />
      <div
        ref={frame}
        className="pointer-events-none absolute overflow-hidden rounded-sm bg-folha"
        style={{ ...box, boxShadow: "0 24px 60px #0000004d" }}
      >
        <div ref={stage} className="relative h-full w-full origin-center">
          <img src={thumbSrc} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
          <img
            src={fullSrc}
            alt={alt}
            draggable={false}
            onLoad={() => setFullLoaded(true)}
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${fullLoaded ? "opacity-100" : "opacity-0"}`}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Fechar foto"
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 inline-flex size-11 items-center justify-center rounded-full bg-[#15201a]/60 text-[#f7f5ec] active:bg-[#15201a]/80"
      >
        <Icon name="close" className="size-5" />
      </button>
      {!zoomed && (
        <p className="typed pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] text-center text-[0.68rem] text-[#f7f5ec]/70">
          pince ou toque duas vezes para aproximar
        </p>
      )}
    </div>,
    document.body,
  );
}
