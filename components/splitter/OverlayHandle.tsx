"use client";

import { useRef } from "react";

// Text placed on the finished frame, centred on its point and dragged there.
export function OverlayHandle({ x, y, onMove, children }: { x: number; y: number; onMove: (x: number, y: number) => void; children: React.ReactNode }) {
  const dragging = useRef(false);
  return <div className="absolute z-20 cursor-move touch-none select-none" style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
    onPointerDown={(event) => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); event.stopPropagation(); }}
    onPointerMove={(event) => {
      const frame = event.currentTarget.parentElement;
      if (!dragging.current || !frame) return;
      const bounds = frame.getBoundingClientRect();
      const clamp = (value: number) => Math.round(Math.min(100, Math.max(0, value)) * 2) / 2;
      onMove(clamp((event.clientX - bounds.left) / bounds.width * 100), clamp((event.clientY - bounds.top) / bounds.height * 100));
    }}
    onPointerUp={() => { dragging.current = false; }}>{children}</div>;
}
