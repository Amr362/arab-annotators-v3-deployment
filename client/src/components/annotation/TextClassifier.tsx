import { useEffect } from "react";
import { cn } from "@/lib/utils";
import type { LabelOption, AnnotationResult } from "./types";

interface Props {
  text: string;
  labels: LabelOption[];
  value: string | null;
  onChange: (result: AnnotationResult) => void;
  aiSuggestion?: string | null;
  readOnly?: boolean;
}

export default function TextClassifier({ text, labels, value, onChange, aiSuggestion, readOnly }: Props) {
  // Keyboard shortcuts
  useEffect(() => {
    if (readOnly) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const label = labels.find(l => l.shortcut === e.key);
      if (label) {
        e.preventDefault();
        onChange({ type: "classification", labels: [label.value] });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [labels, onChange, readOnly]);

  return (
    <div className="space-y-5">
      {/* Text display */}
      <div className="bg-white border-2 border-slate-100 rounded-2xl p-6 shadow-sm">
        <p className="text-slate-800 text-lg leading-loose text-right font-arabic" dir="rtl">
          {text}
        </p>
      </div>

      {/* AI suggestion */}
      {aiSuggestion && (
        <div className="flex items-center gap-2 text-sm bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5">
          <span className="text-violet-500">🤖</span>
          <span className="text-violet-700 font-medium">اقتراح الذكاء الاصطناعي:</span>
          <span className="text-violet-900 font-bold">{aiSuggestion}</span>
          <button
            onClick={() => !readOnly && onChange({ type: "classification", labels: [aiSuggestion] })}
            className="mr-auto text-xs bg-violet-100 hover:bg-violet-200 text-violet-700 px-2.5 py-1 rounded-full transition-colors"
          >
            قبول
          </button>
        </div>
      )}

      {/* Labels */}
      <div className="flex flex-wrap gap-3 justify-center">
        {labels.map((label, i) => {
          const isSelected = value === label.value;
          if (readOnly && !isSelected) return null; // Only show selected label in readOnly mode
          return (
            <button
              key={label.value}
              disabled={readOnly}
              onClick={() => onChange({ type: "classification", labels: [label.value] })}
              className={cn(
                "relative group flex items-center gap-2.5 px-6 py-3.5 rounded-2xl font-semibold text-base transition-all duration-200 border-2 shadow-sm",
                isSelected
                  ? "text-white shadow-lg scale-105"
                  : "bg-white text-slate-700 hover:scale-105 hover:shadow-md",
                readOnly && "cursor-default"
              )}
              style={isSelected ? { backgroundColor: label.color, borderColor: label.color } : { borderColor: label.color + "40" }}
            >
              {/* Color dot */}
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
              <span>{label.value}</span>
              {!readOnly && label.shortcut && (
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-md font-mono border",
                  isSelected ? "bg-white/20 border-white/30 text-white" : "bg-slate-100 border-slate-200 text-slate-400"
                )}>
                  {label.shortcut}
                </span>
              )}
              {isSelected && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-white text-xs shadow">✓</span>
              )}
            </button>
          );
        })}
      </div>

      {value && (
        <p className="text-center text-sm text-slate-400">
          اخترت: <span className="font-semibold text-slate-700">{value}</span>
          {!readOnly && <button onClick={() => onChange({ type: "classification", labels: [] })} className="mr-2 text-red-400 hover:text-red-600">× إلغاء</button>}
        </p>
      )}
    </div>
  );
}
