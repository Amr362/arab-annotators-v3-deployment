import { useEffect } from "react";
import { cn } from "@/lib/utils";
import type { LabelOption, AnnotationResult } from "./types";

interface Props {
  text: string; // format: "textA|||textB"
  labels: LabelOption[];
  value: string | null;
  onChange: (result: AnnotationResult) => void;
  readOnly?: boolean;
}

export default function PairwiseComparison({ text, labels, value, onChange, readOnly }: Props) {
  const [textA, textB] = text.split("|||").map(s => s.trim());

  useEffect(() => {
    if (readOnly) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const label = labels.find(l => l.shortcut === e.key);
      if (label) { e.preventDefault(); onChange({ type: "pairwise", choice: label.value }); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [labels, onChange, readOnly]);

  return (
    <div className="space-y-5">
      {/* Two texts side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[{ label: "النص أ", content: textA, key: "A" }, { label: "النص ب", content: textB, key: "B" }].map(({ label, content, key }) => {
          const isChosen = labels.find(l => l.value.includes(key) || l.value === key);
          const chosen = isChosen && value === isChosen.value;
          return (
            <div key={key} className={cn(
              "bg-white border-2 rounded-2xl p-5 shadow-sm transition-all",
              chosen ? "border-green-400 shadow-green-100 shadow-md" : "border-slate-100"
            )}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{label}</span>
                {chosen && <span className="text-green-600 text-xs font-bold">✓ مختار</span>}
              </div>
              <p className="text-slate-800 leading-loose text-right font-arabic" dir="rtl">
                {content || "—"}
              </p>
            </div>
          );
        })}
      </div>

      {/* Choice buttons */}
      <div className="flex flex-wrap gap-3 justify-center pt-2">
        {labels.map(label => {
          const isSelected = value === label.value;
          return (
            <button
              key={label.value}
              disabled={readOnly}
              onClick={() => onChange({ type: "pairwise", choice: label.value })}
              className={cn(
                "flex items-center gap-2.5 px-7 py-3.5 rounded-2xl font-bold text-base transition-all duration-200 border-2 shadow-sm",
                isSelected ? "text-white shadow-lg scale-105" : "bg-white text-slate-700 hover:scale-105 hover:shadow-md",
                readOnly && "cursor-default"
              )}
              style={isSelected ? { backgroundColor: label.color, borderColor: label.color } : { borderColor: label.color + "50" }}
            >
              {label.value}
              {label.shortcut && (
                <span className={cn("text-xs px-1.5 py-0.5 rounded font-mono border", isSelected ? "bg-white/20 border-white/30 text-white" : "bg-slate-100 border-slate-200 text-slate-400")}>
                  {label.shortcut}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {value && (
        <p className="text-center text-sm text-slate-400">
          اخترت: <span className="font-semibold text-slate-700">{value}</span>
          {!readOnly && <button onClick={() => onChange({ type: "pairwise", choice: undefined })} className="mr-2 text-red-400 hover:text-red-600">× إلغاء</button>}
        </p>
      )}
    </div>
  );
}
