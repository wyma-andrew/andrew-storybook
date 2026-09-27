"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCueTime, timelineTickStep, type TranslateCue } from "@/lib/translate";

const MAX_PX_PER_FRAME = 14;

type Drag = { index: number; edge: "start" | "end"; value: number; saving?: boolean };

export function TranslateTimeline({ duration, currentTime, fps, cues, activeIndex, editable, toolbar, onSeek, onRetime, onEdit }: {
  duration: number;
  currentTime: number;
  fps: number;
  cues: TranslateCue[];
  activeIndex: number;
  editable: boolean;
  toolbar?: ReactNode;
  onSeek: (seconds: number) => void;
  onRetime: (index: number, start: number, end: number) => Promise<boolean>;
  onEdit: (index: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ left: 0, width: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const scrubbing = useRef(false);
  const anchor = useRef<{ time: number; offset: number } | null>(null);

  const fitScale = view.width > 0 ? view.width / duration : 1;
  const maxScale = Math.max(fitScale, fps * MAX_PX_PER_FRAME);
  const scale = Math.min(maxScale, Math.max(fitScale, zoom ?? fitScale));
  const scaleRef = useRef(scale);
  useLayoutEffect(() => { scaleRef.current = scale; });

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => setView({ left: element.scrollLeft, width: element.clientWidth });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function zoomBy(factor: number, time?: number) {
    const element = scrollRef.current;
    if (!element) return;
    const current = scaleRef.current;
    const playheadX = currentTime * current - element.scrollLeft;
    const pivot = time ?? (playheadX >= 0 && playheadX <= element.clientWidth ? currentTime : (element.scrollLeft + element.clientWidth / 2) / current);
    anchor.current = { time: pivot, offset: pivot * current - element.scrollLeft };
    setZoom(Math.min(maxScale, Math.max(fitScale, current * factor)));
  }
  const zoomRef = useRef(zoomBy);
  useLayoutEffect(() => { zoomRef.current = zoomBy; });

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !anchor.current) return;
    element.scrollLeft = anchor.current.time * scale - anchor.current.offset;
    anchor.current = null;
  }, [scale]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = innerRef.current!.getBoundingClientRect();
      zoomRef.current(event.deltaY < 0 ? 1.25 : 0.8, (event.clientX - rect.left) / scaleRef.current);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || scrubbing.current || drag) return;
    const x = currentTime * scale;
    if (x < element.scrollLeft || x > element.scrollLeft + element.clientWidth - 24) element.scrollLeft = x - element.clientWidth * 0.2;
  }, [currentTime, scale, drag]);

  function timeAt(clientX: number) {
    const rect = innerRef.current!.getBoundingClientRect();
    return Math.min(duration, Math.max(0, (clientX - rect.left) / scale));
  }

  const snap = (seconds: number) => Math.round(seconds * fps) / fps;

  function startScrub(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubbing.current = true;
    onSeek(timeAt(event.clientX));
  }

  function startEdge(event: ReactPointerEvent<HTMLDivElement>, index: number, edge: Drag["edge"]) {
    event.stopPropagation();
    if (event.button !== 0 || drag?.saving) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ index, edge, value: cues[index][edge] });
  }

  function moveEdge(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag || drag.saving) return;
    const cue = cues[drag.index];
    const frame = 1 / fps;
    const value = drag.edge === "start"
      ? Math.min(cue.end - frame, Math.max(0, snap(timeAt(event.clientX))))
      : Math.max(cue.start + frame, Math.min(duration, snap(timeAt(event.clientX))));
    if (value === drag.value) return;
    setDrag({ ...drag, value });
    onSeek(value);
  }

  async function endEdge() {
    if (!drag || drag.saving) return;
    const cue = cues[drag.index];
    const [start, end] = drag.edge === "start" ? [drag.value, cue.end] : [cue.start, drag.value];
    if (start === cue.start && end === cue.end) { setDrag(null); return; }
    setDrag({ ...drag, saving: true });
    await onRetime(drag.index, start, end);
    setDrag(null);
  }

  const from = view.left / scale - 1;
  const to = (view.left + view.width) / scale + 1;
  const step = timelineTickStep(scale, fps);
  const ticks: number[] = [];
  for (let i = Math.max(0, Math.floor(from / step)); i * step <= Math.min(duration, to); i++) ticks.push(i * step);
  const frameTicks: number[] = [];
  if (scale / fps >= 6) {
    for (let frame = Math.max(0, Math.floor(from * fps)); frame / fps <= Math.min(duration, to); frame++) frameTicks.push(frame / fps);
  }

  return <div className="mt-3 shrink-0">
    <div className="mb-2 flex items-center gap-2">
      {toolbar}
      <div className="ml-auto flex shrink-0 gap-1">
        <Button variant="ghost" className="!h-8 !w-8 !p-0" aria-label="Zoom out timeline" disabled={scale <= fitScale} onClick={() => zoomBy(0.5)}><ZoomOut size={15} /></Button>
        <Button variant="ghost" className="!h-8 !w-8 !p-0" aria-label="Zoom in timeline" disabled={scale >= maxScale} onClick={() => zoomBy(2)}><ZoomIn size={15} /></Button>
      </div>
    </div>
    <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden rounded-lg border border-line bg-panel-2 [scrollbar-color:var(--gecko-ui-scrollbar-thumb)_transparent] [scrollbar-width:thin]" onScroll={(event) => setView({ left: event.currentTarget.scrollLeft, width: event.currentTarget.clientWidth })}>
      <div ref={innerRef} className="relative h-[68px] max-md:h-[54px] cursor-pointer touch-pan-x select-none" style={{ width: `${Math.max(view.width, duration * scale)}px` }}
        onPointerDown={startScrub}
        onPointerMove={(event) => { if (scrubbing.current) onSeek(timeAt(event.clientX)); }}
        onPointerUp={() => { scrubbing.current = false; }}
        onPointerCancel={() => { scrubbing.current = false; }}>
        <div className="absolute inset-x-0 top-0 h-5 border-b border-line">
          {frameTicks.map((tick) => <div key={`f${tick}`} className="absolute bottom-0 h-1 w-px bg-line-2" style={{ left: `${tick * scale}px` }} />)}
          {ticks.map((tick) => <div key={tick} className="absolute top-0 bottom-0 border-l border-line-2 pl-1 font-mono text-[10px] leading-5 text-fg-3 tabular-nums" style={{ left: `${tick * scale}px` }}>{formatCueTime(tick)}</div>)}
        </div>
        <div className="absolute inset-x-0 top-[26px] h-9 max-md:top-[23px] max-md:h-7">
          {cues.map((cue, index) => {
            if (cue.end < from || cue.start > to) return null;
            const start = drag?.index === index && drag.edge === "start" ? drag.value : cue.start;
            const end = drag?.index === index && drag.edge === "end" ? drag.value : cue.end;
            const width = Math.max(2, (end - start) * scale);
            const handles = editable && width >= 12;
            return <div key={`${index}-${cue.start}`} title={`${formatCueTime(start)}–${formatCueTime(end)}\n${cue.text}`}
              className={`absolute top-0 bottom-0 overflow-hidden rounded border text-[11px] leading-tight ${index === activeIndex ? "border-accent bg-accent-dim text-fg" : "border-line-2 bg-panel text-fg-2"} ${drag?.index === index ? "z-10 border-accent" : ""}`}
              style={{ left: `${start * scale}px`, width: `${width}px` }}
              onPointerDown={(event) => { event.stopPropagation(); if (event.button === 0) onSeek(cue.start); }}
              onDoubleClick={() => { if (editable) onEdit(index); }}>
              {width >= 28 && <div className="truncate px-2 pt-1">{cue.text}</div>}
              {handles && <>
                <div className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize touch-none hover:bg-accent" onPointerDown={(event) => startEdge(event, index, "start")} onPointerMove={moveEdge} onPointerUp={() => void endEdge()} />
                <div className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize touch-none hover:bg-accent" onPointerDown={(event) => startEdge(event, index, "end")} onPointerMove={moveEdge} onPointerUp={() => void endEdge()} />
              </>}
            </div>;
          })}
        </div>
        <div className="absolute top-0 bottom-0 z-20 w-3 -translate-x-1/2 cursor-ew-resize touch-none" style={{ left: `${Math.min(currentTime, duration) * scale}px` }}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            scrubbing.current = true;
          }}
          onPointerMove={(event) => { if (scrubbing.current) onSeek(timeAt(event.clientX)); }}
          onPointerUp={() => { scrubbing.current = false; }}
          onPointerCancel={() => { scrubbing.current = false; }}>
          <div className="absolute inset-y-0 left-1/2 w-px bg-accent" />
          <div className="absolute -top-px left-1/2 h-2 w-[9px] -translate-x-1/2 rounded-b-sm bg-accent" />
        </div>
      </div>
    </div>
  </div>;
}
