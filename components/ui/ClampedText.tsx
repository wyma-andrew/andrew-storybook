"use client";

import { useEffect, useRef, useState } from "react";
import { MiniButton } from "./Button";

/**
 * Long prompt text collapsed to a few lines with a Show more / Show less toggle
 * on its own line below the text.
 */
export function ClampedText({
  text,
  className = "",
  containerClassName = "",
  lines = 4,
}: {
  text: string;
  className?: string;
  containerClassName?: string;
  lines?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return; // collapsed height is the only measurable state
    const check = () => setOverflows(el.scrollHeight - el.clientHeight > 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded, lines]);

  return (
    <div className={containerClassName}>
      <div
        ref={ref}
        className={`overflow-hidden ${className}`}
        style={expanded ? undefined : { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines }}
      >
        {text}
      </div>
      {overflows && (
        <MiniButton ghost className="mt-1 !h-5 !px-1 !text-[11px]" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? "Show less" : "Show more"}
        </MiniButton>
      )}
    </div>
  );
}
