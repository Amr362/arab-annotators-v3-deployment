import { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { LabelOption, RelationEntity, Relation, AnnotationResult } from "./types";
import { Trash2, ArrowRight } from "lucide-react";

interface Props {
  text: string;
  entityLabels: LabelOption[];
  relationLabels: LabelOption[];
  value: { entities: RelationEntity[]; relations: Relation[] };
  onChange: (result: AnnotationResult) => void;
  readOnly?: boolean;
}

export default function RelationsAnnotator({ text, entityLabels, relationLabels, value, onChange, readOnly }: Props) {
  const [mode, setMode] = useState<"entity" | "relation">("entity");
  const [activeEntityLabel, setActiveEntityLabel] = useState<LabelOption | null>(entityLabels[0] ?? null);
  const [activeRelLabel, setActiveRelLabel] = useState<LabelOption | null>(relationLabels[0] ?? null);
  const [relFrom, setRelFrom] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { entities, relations } = value;

  const handleMouseUp = useCallback(() => {
    if (readOnly || mode !== "entity" || !activeEntityLabel || !containerRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);

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

    const start = getOffset(range.startContainer, range.startOffset, containerRef.current);
    const end = getOffset(range.endContainer, range.endOffset, containerRef.current);
    const spanText = text.slice(start, end).trim();
    if (!spanText || start >= end) { sel.removeAllRanges(); return; }

    const trimStart = text.indexOf(spanText, start);
    const trimEnd = trimStart + spanText.length;
    const overlaps = entities.some(e => !(trimEnd <= e.start || trimStart >= e.end));
    if (overlaps) { sel.removeAllRanges(); return; }

    const newEntity: RelationEntity = {
      id: `e_${Date.now()}`,
      start: trimStart, end: trimEnd,
      text: spanText,
      label: activeEntityLabel.value,
      color: activeEntityLabel.color,
    };
    onChange({ type: "relations", entities: [...entities, newEntity].sort((a, b) => a.start - b.start), relations });
    sel.removeAllRanges();
  }, [activeEntityLabel, entities, mode, onChange, readOnly, relations, text]);

  function handleEntityClick(entityId: string) {
    if (readOnly || mode !== "relation") return;
    if (!relFrom) {
      setRelFrom(entityId);
    } else if (relFrom === entityId) {
      setRelFrom(null);
    } else {
      // Create relation
      const newRel: Relation = { from: relFrom, to: entityId, label: activeRelLabel?.value ?? "" };
      onChange({ type: "relations", entities, relations: [...relations, newRel] });
      setRelFrom(null);
    }
  }

  function removeEntity(id: string) {
    if (readOnly) return;
    onChange({
      type: "relations",
      entities: entities.filter(e => e.id !== id),
      relations: relations.filter(r => r.from !== id && r.to !== id),
    });
  }

  function removeRelation(idx: number) {
    if (readOnly) return;
    const next = [...relations]; next.splice(idx, 1);
    onChange({ type: "relations", entities, relations: next });
  }

  function renderText() {
    if (!entities.length) return <span>{text}</span>;
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const entity of entities) {
      if (cursor < entity.start) parts.push(<span key={`t-${cursor}`}>{text.slice(cursor, entity.start)}</span>);
      const isFrom = relFrom === entity.id;
      parts.push(
        <mark
          key={entity.id}
          onClick={() => handleEntityClick(entity.id)}
          className={cn(
            "rounded px-0.5 cursor-pointer transition-all",
            mode === "relation" ? "hover:opacity-75" : "",
            isFrom ? "ring-2 ring-offset-1" : ""
          )}
          style={{
            backgroundColor: entity.color + "25",
            borderBottom: `2.5px solid ${entity.color}`,
            color: "inherit",
            ...(isFrom ? { ringColor: entity.color } : {})
          }}
        >
          {text.slice(entity.start, entity.end)}
          <sup className="text-[9px] font-bold mr-0.5 px-1 rounded text-white" style={{ backgroundColor: entity.color }}>
            {entity.label}
          </sup>
        </mark>
      );
      cursor = entity.end;
    }
    if (cursor < text.length) parts.push(<span key="t-end">{text.slice(cursor)}</span>);
    return parts;
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <>
          {/* Mode switcher */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500">الوضع:</span>
            {(["entity", "relation"] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setRelFrom(null); }}
                className={cn(
                  "px-4 py-1.5 rounded-xl text-sm font-medium transition-all border-2",
                  mode === m ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                )}
              >
                {m === "entity" ? "🏷️ إضافة كيان" : "🔗 إضافة علاقة"}
              </button>
            ))}
          </div>

          {/* Label selectors */}
          {mode === "entity" ? (
            <div className="flex flex-wrap gap-2">
              {entityLabels.map(label => (
                <button key={label.value} onClick={() => setActiveEntityLabel(label)}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all",
                    activeEntityLabel?.value === label.value ? "text-white" : "bg-white text-slate-700")}
                  style={activeEntityLabel?.value === label.value ? { backgroundColor: label.color, borderColor: label.color } : { borderColor: label.color }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: label.color }} />{label.value}
                  {label.shortcut && <span className="text-[10px] opacity-60">[{label.shortcut}]</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-slate-500">نوع العلاقة:</span>
              {relationLabels.map(label => (
                <button key={label.value} onClick={() => setActiveRelLabel(label)}
                  className={cn("px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all",
                    activeRelLabel?.value === label.value ? "text-white" : "bg-white text-slate-700")}
                  style={activeRelLabel?.value === label.value ? { backgroundColor: label.color, borderColor: label.color } : { borderColor: label.color }}>
                  {label.value}
                </button>
              ))}
              {relFrom && <span className="text-xs text-amber-600 animate-pulse">انقر على كيان آخر للربط...</span>}
            </div>
          )}
        </>
      )}

      {/* Text */}
      <div ref={containerRef} onMouseUp={handleMouseUp}
        className={cn("bg-white border-2 rounded-2xl p-6 shadow-sm leading-[2.2] text-lg text-right font-arabic",
          mode === "entity" && activeEntityLabel ? "border-dashed cursor-text" : "border-slate-100",
          mode === "relation" ? "cursor-pointer" : "")}
        style={mode === "entity" && activeEntityLabel ? { borderColor: activeEntityLabel.color + "80" } : {}}
        dir="rtl">
        {renderText()}
      </div>

      {/* Relations list */}
      {(entities.length > 0 || relations.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Entities */}
          <div className="border border-slate-100 rounded-2xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 border-b border-slate-100">
              الكيانات ({entities.length})
            </div>
            <div className="divide-y divide-slate-50 max-h-40 overflow-y-auto">
              {entities.map(e => (
                <div key={e.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-bold" style={{ backgroundColor: e.color }}>{e.label}</span>
                  <span className="flex-1 text-sm text-slate-700 truncate" dir="rtl">{e.text}</span>
                  {!readOnly && <button onClick={() => removeEntity(e.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={12} /></button>}
                </div>
              ))}
            </div>
          </div>
          {/* Relations */}
          <div className="border border-slate-100 rounded-2xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 border-b border-slate-100">
              العلاقات ({relations.length})
            </div>
            <div className="divide-y divide-slate-50 max-h-40 overflow-y-auto">
              {relations.map((r, i) => {
                const from = entities.find(e => e.id === r.from);
                const to = entities.find(e => e.id === r.to);
                const rl = relationLabels.find(l => l.value === r.label);
                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-sm">
                    <span className="text-slate-700 truncate max-w-[80px]" title={from?.text}>{from?.text}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium flex items-center gap-1" style={{ backgroundColor: rl?.color || "#888" }}>
                      <ArrowRight size={10} />{r.label}
                    </span>
                    <span className="text-slate-700 truncate max-w-[80px]" title={to?.text}>{to?.text}</span>
                    {!readOnly && <button onClick={() => removeRelation(i)} className="mr-auto text-slate-300 hover:text-red-500"><Trash2 size={12} /></button>}
                  </div>
                );
              })}
              {!relations.length && <p className="text-xs text-slate-400 p-3 text-center">لا توجد علاقات بعد</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
