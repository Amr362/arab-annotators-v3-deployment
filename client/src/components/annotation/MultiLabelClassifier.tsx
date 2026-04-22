import { useEffect } from "react";
import { cn } from "@/lib/utils";
import type { LabelOption, AnnotationResult } from "./types";

interface Props {
  text: string;
  labels: LabelOption[];
  value: string[];
  onChange: (result: AnnotationResult) => void;
  aiSuggestion?: string[] | null;
  readOnly?: boolean;
}

export default function MultiLabelClassifier({ text, labels, value, onChange, aiSuggestion, readOnly }: Props) {
  useEffect(() => {
    if (readOnly) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const label = labels.find(l => l.shortcut === e.key);
      if (label) {
        e.preventDefault();
        const next = value.includes(label.value)
          ? value.filter(v => v !== label.value)
          : [...value, label.value];
        onChange({ type: "multi_classification", labels: next });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [labels, value, onChange, readOnly]);

  function toggle(labelValue: string) {
    if (readOnly) return;
    const next = value.includes(labelValue)
      ? value.filter(v => v !== labelValue)
      : [...value, labelValue];
    onChange({ type: "multi_classification", labels: next });
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border-2 border-slate-100 rounded-2xl p-6 shadow-sm">
        <p className="text-slate-800 text-lg leading-loose text-right font-arabic" dir="rtl">{text}</p>
      </div>

      {aiSuggestion && aiSuggestion.length > 0 && (
        <div className="flex items-center gap-2 text-sm bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5">
          <span className="text-violet-500">🤖</span>
          <span className="text-violet-700 font-medium">اقتراح AI:</span>
          <span className="text-violet-900 font-bold">{aiSuggestion.join("، ")}</span>
          <button
            onClick={() => !readOnly && onChange({ type: "multi_classification", labels: aiSuggestion })}
            className="mr-auto text-xs bg-violet-100 hover:bg-violet-200 text-violet-700 px-2.5 py-1 rounded-full"
          >قبول</button>
        </div>
      )}

      <p className="text-center text-xs text-slate-400">يمكنك اختيار أكثر من تصنيف</p>

      <div className="flex flex-wrap gap-3 justify-center">
        {labels.map(label => {
          const isSelected = value.includes(label.value);
          return (
            <button
              key={label.value}
              disabled={readOnly}
              onClick={() => toggle(label.value)}
              className={cn(
                "relative flex items-center gap-2.5 px-5 py-3 rounded-2xl font-semibold text-sm transition-all duration-200 border-2 shadow-sm",
                isSelected ? "text-white shadow-lg scale-105" : "bg-white text-slate-700 hover:scale-102 hover:shadow-md",
                readOnly && "cursor-default"
              )}
              style={isSelected ? { backgroundColor: label.color, borderColor: label.color } : { borderColor: label.color + "50" }}
            >
              <span className={cn(
                "w-5 h-5 rounded border-2 flex items-center justify-center text-xs flex-shrink-0 transition-all",
                isSelected ? "bg-white/30 border-white/50" : "border-slate-300 bg-white"
              )}>
                {isSelected && <span className="text-white font-bold">✓</span>}
              </span>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: label.color }} />
              <span>{label.value}</span>
              {label.shortcut && (
                <span className={cn("text-xs px-1.5 py-0.5 rounded font-mono border", isSelected ? "bg-white/20 border-white/30 text-white" : "bg-slate-100 border-slate-200 text-slate-400")}>
                  {label.shortcut}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {value.length > 0 && (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400">التصنيفات المختارة:</span>
          {value.map(v => {
            const l = labels.find(x => x.value === v);
            return (
              <span key={v} className="text-xs text-white px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: l?.color || "#888" }}>
                {v}
              </span>
            );
          })}
          {!readOnly && (
            <button onClick={() => onChange({ type: "multi_classification", labels: [] })} className="text-xs text-red-400 hover:text-red-600 mr-1">
              مسح الكل
            </button>
          )}
        </div>
      )}
    </div>
  );
}
