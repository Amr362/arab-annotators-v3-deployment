import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { LabelOption, NERSpan, AnnotationResult } from "./types";
import { Trash2, RotateCcw, RotateCw, Copy, Check } from "lucide-react";

// ============================================================================
// Types and Interfaces
// ============================================================================

interface Props {
  text: string;
  labels: LabelOption[];
  value: NERSpan[];
  onChange: (result: AnnotationResult) => void;
  readOnly?: boolean;
  maxHistorySize?: number;
  onError?: (error: Error) => void;
}

interface HistoryState {
  spans: NERSpan[];
  timestamp: number;
}

interface SelectionState {
  start: number;
  end: number;
  text: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_HISTORY = 50;
const DEBOUNCE_DELAY = 300;
const MIN_SPAN_LENGTH = 1;
const MAX_SPANS_PER_ANNOTATION = 1000;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * حساب موضع الحرف في النص بناءً على موضع DOM
 */
function getCharOffset(node: Node, offset: number, root: Node): number {
  let total = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null;

  while ((current = walker.nextNode())) {
    if (current === node) return total + offset;
    total += current.textContent?.length ?? 0;
  }

  return total;
}

/**
 * التحقق من تداخل النطاقات
 */
function hasOverlap(span1: NERSpan, span2: NERSpan): boolean {
  return !(span1.end <= span2.start || span1.start >= span2.end);
}

/**
 * التحقق من صحة النطاق
 */
function isValidSpan(span: NERSpan, textLength: number): boolean {
  return (
    span.start >= 0 &&
    span.end <= textLength &&
    span.start < span.end &&
    span.end - span.start >= MIN_SPAN_LENGTH &&
    span.text.length > 0 &&
    span.label.length > 0
  );
}

/**
 * نسخ النص إلى الحافظة
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Main Component
// ============================================================================

export default function NERAnnotator({
  text,
  labels,
  value,
  onChange,
  readOnly = false,
  maxHistorySize = DEFAULT_MAX_HISTORY,
  onError,
}: Props) {
  // ========================================================================
  // State Management
  // ========================================================================

  const [activeLabel, setActiveLabel] = useState<LabelOption | null>(labels[0] ?? null);
  const [history, setHistory] = useState<HistoryState[]>([{ spans: value, timestamp: Date.now() }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout>();

  // ========================================================================
  // Memoized Values
  // ========================================================================

  const currentSpans = useMemo(() => history[historyIndex]?.spans ?? [], [history, historyIndex]);

  const canUndo = useMemo(() => historyIndex > 0, [historyIndex]);
  const canRedo = useMemo(() => historyIndex < history.length - 1, [historyIndex, history.length]);

  const spansByStart = useMemo(
    () => [...currentSpans].sort((a, b) => a.start - b.start),
    [currentSpans]
  );

  const statistics = useMemo(
    () => ({
      totalSpans: currentSpans.length,
      uniqueLabels: new Set(currentSpans.map((s) => s.label)).size,
      labelCounts: currentSpans.reduce(
        (acc, span) => {
          acc[span.label] = (acc[span.label] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    }),
    [currentSpans]
  );

  // ========================================================================
  // Error Handling
  // ========================================================================

  const handleError = useCallback(
    (err: Error) => {
      console.error("[NERAnnotator Error]", err);
      setError(err);
      onError?.(err);
    },
    [onError]
  );

  // ========================================================================
  // History Management
  // ========================================================================

  const updateHistory = useCallback(
    (newSpans: NERSpan[]) => {
      try {
        // التحقق من صحة جميع النطاقات
        for (const span of newSpans) {
          if (!isValidSpan(span, text.length)) {
            throw new Error(`نطاق غير صحيح: ${span.text}`);
          }
        }

        // التحقق من عدم تجاوز الحد الأقصى
        if (newSpans.length > MAX_SPANS_PER_ANNOTATION) {
          throw new Error(`تم تجاوز الحد الأقصى من الكيانات: ${MAX_SPANS_PER_ANNOTATION}`);
        }

        // إضافة إلى السجل
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push({ spans: newSpans, timestamp: Date.now() });

        // تحديد حجم السجل
        if (newHistory.length > maxHistorySize) {
          newHistory.shift();
        } else {
          setHistoryIndex(newHistory.length - 1);
        }

        setHistory(newHistory);
        onChange({ type: "ner", spans: newSpans });
        setError(null);
      } catch (err) {
        handleError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [history, historyIndex, text.length, maxHistorySize, onChange, handleError]
  );

  // ========================================================================
  // Undo/Redo Functions
  // ========================================================================

  const undo = useCallback(() => {
    if (!canUndo) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    const newSpans = history[newIndex]?.spans ?? [];
    onChange({ type: "ner", spans: newSpans });
  }, [canUndo, historyIndex, history, onChange]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    const newSpans = history[newIndex]?.spans ?? [];
    onChange({ type: "ner", spans: newSpans });
  }, [canRedo, historyIndex, history, onChange]);

  // ========================================================================
  // Keyboard Shortcuts
  // ========================================================================

  useEffect(() => {
    if (readOnly) return;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      // Ctrl/Cmd + Z: Undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl/Cmd + Shift + Z: Redo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl/Cmd + Y: Redo
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
        return;
      }

      // Label shortcuts (1-9, A-Z)
      const label = labels.find((l) => l.shortcut?.toLowerCase() === e.key.toLowerCase());
      if (label) {
        e.preventDefault();
        setActiveLabel(label);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [labels, readOnly, undo, redo]);

  // ========================================================================
  // Text Selection and Annotation
  // ========================================================================

  const handleMouseUp = useCallback(() => {
    if (readOnly || !activeLabel || !containerRef.current) return;

    try {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;

      const range = sel.getRangeAt(0);
      const start = getCharOffset(range.startContainer, range.startOffset, containerRef.current);
      const end = getCharOffset(range.endContainer, range.endOffset, containerRef.current);

      if (start >= end) {
        sel.removeAllRanges();
        return;
      }

      // استخراج النص والتحقق من صحته
      let spanText = text.slice(start, end);
      const trimStart = text.indexOf(spanText, start);
      const trimEnd = trimStart + spanText.length;

      if (trimStart === -1 || trimEnd > text.length) {
        sel.removeAllRanges();
        return;
      }

      // التحقق من عدم التداخل
      const hasConflict = currentSpans.some((s) => hasOverlap(s, { start: trimStart, end: trimEnd, text: spanText, label: "", color: "" }));
      if (hasConflict) {
        sel.removeAllRanges();
        return;
      }

      // إنشاء نطاق جديد
      const newSpan: NERSpan = {
        start: trimStart,
        end: trimEnd,
        text: spanText,
        label: activeLabel.value,
        color: activeLabel.color,
      };

      const newSpans = [...currentSpans, newSpan].sort((a, b) => a.start - b.start);
      updateHistory(newSpans);
      sel.removeAllRanges();
    } catch (err) {
      handleError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [readOnly, activeLabel, text, currentSpans, updateHistory, handleError]);

  // ========================================================================
  // Span Management
  // ========================================================================

  const removeSpan = useCallback(
    (index: number) => {
      if (readOnly) return;
      try {
        const newSpans = currentSpans.filter((_, i) => i !== index);
        updateHistory(newSpans);
      } catch (err) {
        handleError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [readOnly, currentSpans, updateHistory, handleError]
  );

  const editSpan = useCallback(
    (index: number, newLabel: LabelOption) => {
      if (readOnly) return;
      try {
        const newSpans = [...currentSpans];
        newSpans[index] = {
          ...newSpans[index],
          label: newLabel.value,
          color: newLabel.color,
        };
        updateHistory(newSpans);
      } catch (err) {
        handleError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [readOnly, currentSpans, updateHistory, handleError]
  );

  const clearAll = useCallback(() => {
    if (readOnly || !window.confirm("هل تريد حذف جميع الكيانات؟")) return;
    updateHistory([]);
  }, [readOnly, updateHistory]);

  // ========================================================================
  // Copy to Clipboard
  // ========================================================================

  const handleCopySpan = useCallback(
    async (index: number) => {
      const span = currentSpans[index];
      if (!span) return;

      const success = await copyToClipboard(span.text);
      if (success) {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
      }
    },
    [currentSpans]
  );

  // ========================================================================
  // Render Functions
  // ========================================================================

  const renderAnnotatedText = useCallback(() => {
    if (!spansByStart.length) {
      return <span className="text-slate-800 leading-loose">{text}</span>;
    }

    const parts: React.ReactNode[] = [];
    let cursor = 0;

    for (const span of spansByStart) {
      // إضافة النص قبل النطاق
      if (cursor < span.start) {
        parts.push(
          <span key={`t-${cursor}`} className="text-slate-800">
            {text.slice(cursor, span.start)}
          </span>
        );
      }

      // إضافة النطاق المميز
      parts.push(
        <mark
          key={`s-${span.start}`}
          className="rounded px-1 py-0.5 cursor-pointer transition-all hover:opacity-75 hover:shadow-md"
          style={{
            backgroundColor: span.color + "30",
            borderBottom: `2.5px solid ${span.color}`,
            color: "inherit",
          }}
          title={`${span.label} (${span.start}:${span.end})`}
        >
          {text.slice(span.start, span.end)}
          <sup className="text-[10px] font-bold ml-1 px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: span.color }}>
            {span.label}
          </sup>
        </mark>
      );

      cursor = span.end;
    }

    // إضافة النص المتبقي
    if (cursor < text.length) {
      parts.push(
        <span key={`t-end`} className="text-slate-800">
          {text.slice(cursor)}
        </span>
      );
    }

    return parts;
  }, [spansByStart, text]);

  // ========================================================================
  // JSX
  // ========================================================================

  return (
    <div className="space-y-4">
      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex justify-between items-center">
          <span>{error.message}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap gap-2 items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div className="flex gap-2">
            <button
              onClick={undo}
              disabled={!canUndo}
              title="تراجع (Ctrl+Z)"
              className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw size={18} />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="إعادة (Ctrl+Y)"
              className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCw size={18} />
            </button>
            <div className="w-px bg-slate-300" />
            <button
              onClick={clearAll}
              disabled={currentSpans.length === 0}
              className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              حذف الكل
            </button>
          </div>

          {/* Statistics */}
          <div className="text-xs text-slate-600 flex gap-4">
            <span>الكيانات: <span className="font-bold">{statistics.totalSpans}</span></span>
            <span>الأنواع: <span className="font-bold">{statistics.uniqueLabels}</span></span>
          </div>
        </div>
      )}

      {/* Label Selector */}
      {!readOnly && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-slate-500 font-medium">اختر تصنيف ثم حدد النص:</span>
          {labels.map((label) => (
            <button
              key={label.value}
              onClick={() => setActiveLabel(label)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all",
                activeLabel?.value === label.value
                  ? "text-white shadow-md scale-105"
                  : "bg-white text-slate-700 hover:shadow-sm"
              )}
              style={
                activeLabel?.value === label.value
                  ? { backgroundColor: label.color, borderColor: label.color }
                  : { borderColor: label.color }
              }
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: label.color }} />
              {label.value}
              {label.shortcut && (
                <span className="text-[10px] opacity-60 font-mono">[{label.shortcut}]</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Annotatable Text */}
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className={cn(
          "bg-white border-2 rounded-2xl p-6 shadow-sm select-text leading-[2.2] text-lg text-right font-arabic transition-colors",
          activeLabel && !readOnly ? "border-dashed cursor-text" : "border-slate-100",
          readOnly ? "cursor-default bg-slate-50" : ""
        )}
        style={activeLabel && !readOnly ? { borderColor: activeLabel.color + "80" } : {}}
        dir="rtl"
      >
        {renderAnnotatedText()}
      </div>

      {!readOnly && activeLabel && (
        <p className="text-xs text-center text-slate-400">
          حدد نصاً بالفأرة لإضافة كيان{" "}
          <span className="font-bold" style={{ color: activeLabel.color }}>
            {activeLabel.value}
          </span>
        </p>
      )}

      {/* Spans List */}
      {currentSpans.length > 0 && (
        <div className="border border-slate-100 rounded-2xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 border-b border-slate-100 flex justify-between">
            <span>الكيانات المحددة ({currentSpans.length})</span>
            {!readOnly && (
              <span className="text-slate-400">
                {history.length > 1 && `السجل: ${historyIndex + 1}/${history.length}`}
              </span>
            )}
          </div>
          <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
            {spansByStart.map((span, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                {!readOnly && (
                  <select
                    value={span.label}
                    onChange={(e) => {
                      const newLabel = labels.find((l) => l.value === e.target.value);
                      if (newLabel) editSpan(i, newLabel);
                    }}
                    className="text-xs px-2 py-0.5 rounded-full font-bold text-white border-none cursor-pointer"
                    style={{ backgroundColor: span.color }}
                  >
                    {labels.map((label) => (
                      <option key={label.value} value={label.value}>
                        {label.value}
                      </option>
                    ))}
                  </select>
                )}
                {readOnly && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-bold text-white"
                    style={{ backgroundColor: span.color }}
                  >
                    {span.label}
                  </span>
                )}
                <span className="flex-1 text-sm text-slate-700 text-right truncate" dir="rtl" title={span.text}>
                  {span.text}
                </span>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {span.start}:{span.end}
                </span>
                {!readOnly && (
                  <>
                    <button
                      onClick={() => handleCopySpan(i)}
                      className="text-slate-300 hover:text-blue-500 transition-colors"
                      title="نسخ النص"
                    >
                      {copiedIndex === i ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <button
                      onClick={() => removeSpan(i)}
                      className="text-slate-300 hover:text-red-500 transition-colors"
                      title="حذف"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Label Statistics */}
      {currentSpans.length > 0 && Object.keys(statistics.labelCounts).length > 0 && (
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
          <p className="text-xs font-semibold text-slate-600 mb-2">توزيع الكيانات:</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(statistics.labelCounts).map(([label, count]) => {
              const labelOption = labels.find((l) => l.value === label);
              return (
                <span
                  key={label}
                  className="text-xs px-2.5 py-1 rounded-full text-white font-medium"
                  style={{ backgroundColor: labelOption?.color ?? "#999" }}
                >
                  {label}: {count}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
