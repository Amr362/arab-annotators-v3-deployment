import { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { LabelOption, NERSpan, AnnotationResult } from "./types";
import { Trash2 } from "lucide-react";

interface Props {
  text: string;
  labels: LabelOption[];
  value: NERSpan[];
  onChange: (result: AnnotationResult) => void;
  readOnly?: boolean;
}

export default function NERAnnotator({ text, labels, value, onChange, readOnly }: Props) {
  const [activeLabel, setActiveLabel] = useState<LabelOption | null>(labels[0] ?? null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard: press label shortcut to select that label
  useEffect(() => {
    if (readOnly) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const label = labels.find(l => l.shortcut?.toLowerCase() === e.key.toLowerCase());
      if (label) { e.preventDefault(); setActiveLabel(label); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [labels, readOnly]);

  const handleMouseUp = useCallback(() => {
    if (readOnly || !activeLabel) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) return;

    const range = sel.getRangeAt(0);
    const container = containerRef.current;

    // Calculate character offsets within the text
    function getOffset(node: Node, offset: number, root: Node): number {
      let total = 0;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let current: Node | null;
      while ((current = walker.nextNode())) {
        if (current === node) return total + offset;
        total += (current.textContent?.length ?? 0);
      }
      return total;
    }

    const start = getOffset(range.startContainer, range.startOffset, container);
    const end = getOffset(range.endContainer, range.endOffset, container);

    if (start >= end) { sel.removeAllRanges(); return; }

    const spanText = text.slice(start, end).trim();
    if (!spanText) { sel.removeAllRanges(); return; }

    // Trim whitespace offsets
    const trimStart = text.indexOf(spanText, start);
    const trimEnd = trimStart + spanText.length;

    // Check no overlap
    const overlaps = value.some(s => !(trimEnd <= s.start || trimStart >= s.end));
    if (overlaps) { sel.removeAllRanges(); return; }

    const newSpan: NERSpan = { start: trimStart, end: trimEnd, text: spanText, label: activeLabel.value, color: activeLabel.color };
    onChange({ type: "ner", spans: [...value, newSpan].sort((a, b) => a.start - b.start) });
    sel.removeAllRanges();
  }, [activeLabel, text, value, onChange, readOnly]);

  function removeSpan(idx: number) {
    if (readOnly) return;
    const next = [...value];
    next.splice(idx, 1);
    onChange({ type: "ner", spans: next });
  }

  // Render text with spans highlighted
  function renderAnnotatedText() {
    if (!value.length) {
      return <span className="text-slate-800 leading-loose">{text}</span>;
    }
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const span of value) {
      if (cursor < span.start) parts.push(<span key={`t-${cursor}`}>{text.slice(cursor, span.start)}</span>);
      parts.push(
        <mark
          key={`s-${span.start}`}
          className="rounded px-0.5 py-0 cursor-pointer transition-opacity hover:opacity-75"
          style={{ backgroundColor: span.color + "30", borderBottom: `2.5px solid ${span.color}`, color: "inherit" }}
          title={span.label}
        >
          {text.slice(span.start, span.end)}
          <sup className="text-[10px] font-bold mr-0.5 px-1 rounded" style={{ backgroundColor: span.color, color: "#fff" }}>
            {span.label}
          </sup>
        </mark>
      );
      cursor = span.end;
    }
    if (cursor < text.length) parts.push(<span key={`t-end`}>{text.slice(cursor)}</span>);
    return parts;
  }

  return (
    <div className="space-y-4">
      {/* Label selector */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-slate-500 font-medium">اختر تصنيف ثم حدد النص:</span>
        {labels.map(label => (
          <button
            key={label.value}
            disabled={readOnly}
            onClick={() => setActiveLabel(label)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all",
              activeLabel?.value === label.value ? "text-white shadow-md scale-105" : "bg-white text-slate-700 hover:shadow-sm"
            )}
            style={activeLabel?.value === label.value ? { backgroundColor: label.color, borderColor: label.color } : { borderColor: label.color }}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: label.color }} />
            {label.value}
            {label.shortcut && <span className="text-[10px] opacity-60 font-mono">[{label.shortcut}]</span>}
          </button>
        ))}
      </div>

      {/* Annotatable text */}
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className={cn(
          "bg-white border-2 rounded-2xl p-6 shadow-sm select-text leading-[2.2] text-lg text-right font-arabic transition-colors",
          activeLabel && !readOnly ? "border-dashed cursor-text" : "border-slate-100",
          readOnly ? "cursor-default" : ""
        )}
        style={activeLabel && !readOnly ? { borderColor: activeLabel.color + "80" } : {}}
        dir="rtl"
      >
        {renderAnnotatedText()}
      </div>

      {!readOnly && activeLabel && (
        <p className="text-xs text-center text-slate-400">
          حدد نصاً بالفأرة لإضافة كيان <span className="font-bold" style={{ color: activeLabel.color }}>{activeLabel.value}</span>
        </p>
      )}

      {/* Spans list */}
      {value.length > 0 && (
        <div className="border border-slate-100 rounded-2xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 border-b border-slate-100">
            الكيانات المحددة ({value.length})
          </div>
          <div className="divide-y divide-slate-50">
            {value.map((span, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                <span className="text-xs px-2 py-0.5 rounded-full font-bold text-white" style={{ backgroundColor: span.color }}>
                  {span.label}
                </span>
                <span className="flex-1 text-sm text-slate-700 text-right" dir="rtl">{span.text}</span>
                <span className="text-xs text-slate-400">{span.start}:{span.end}</span>
                {!readOnly && (
                  <button onClick={() => removeSpan(i)} className="text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
