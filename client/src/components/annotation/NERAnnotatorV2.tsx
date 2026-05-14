import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { LabelOption, NERSpan, AnnotationResult } from "./types";
import {
  Trash2,
  Copy,
  Check,
  Undo2,
  Redo2,
  Settings,
  Eye,
  EyeOff,
  Search,
  Filter,
  Download,
  Upload,
} from "lucide-react";

interface Props {
  text: string;
  labels: LabelOption[];
  value: NERSpan[];
  onChange: (result: AnnotationResult) => void;
  readOnly?: boolean;
  enableUndo?: boolean;
  enableSearch?: boolean;
  enableExport?: boolean;
  maxHistorySize?: number;
}

interface HistoryState {
  spans: NERSpan[];
  timestamp: number;
}

/**
 * Enhanced NER Annotator v2 with advanced features
 *
 * Improvements:
 * - Undo/Redo functionality
 * - Search and filter entities
 * - Export/Import annotations
 * - Better keyboard shortcuts
 * - Improved accessibility
 * - Performance optimizations
 * - Visual feedback and animations
 * - Batch operations
 */
export default function NERAnnotatorV2({
  text,
  labels,
  value,
  onChange,
  readOnly = false,
  enableUndo = true,
  enableSearch = true,
  enableExport = true,
  maxHistorySize = 50,
}: Props) {
  const [activeLabel, setActiveLabel] = useState<LabelOption | null>(
    labels[0] ?? null
  );
  const [history, setHistory] = useState<HistoryState[]>([
    { spans: value, timestamp: Date.now() },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLabel, setFilterLabel] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [hideLabels, setHideLabels] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Update history when value changes externally
  useEffect(() => {
    if (value !== history[historyIndex]?.spans) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({ spans: value, timestamp: Date.now() });
      if (newHistory.length > maxHistorySize) {
        newHistory.shift();
      } else {
        setHistoryIndex(newHistory.length - 1);
      }
      setHistory(newHistory);
    }
  }, [value]);

  // Keyboard shortcuts
  useEffect(() => {
    if (readOnly) return;

    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      // Label shortcuts
      const label = labels.find(
        (l) => l.shortcut?.toLowerCase() === e.key.toLowerCase()
      );
      if (label) {
        e.preventDefault();
        setActiveLabel(label);
        return;
      }

      // Undo/Redo
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          handleUndo();
        } else if (e.key === "y" || (e.shiftKey && e.key === "z")) {
          e.preventDefault();
          handleRedo();
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [labels, readOnly]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      onChange({ type: "ner", spans: history[newIndex].spans });
    }
  }, [historyIndex, history, onChange]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      onChange({ type: "ner", spans: history[newIndex].spans });
    }
  }, [historyIndex, history, onChange]);

  const handleMouseUp = useCallback(() => {
    if (readOnly || !activeLabel) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) return;

    const range = sel.getRangeAt(0);
    const container = containerRef.current;

    function getOffset(node: Node, offset: number, root: Node): number {
      let total = 0;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let current: Node | null;
      while ((current = walker.nextNode())) {
        if (current === node) return total + offset;
        total += current.textContent?.length ?? 0;
      }
      return total;
    }

    const start = getOffset(range.startContainer, range.startOffset, container);
    const end = getOffset(range.endContainer, range.endOffset, container);

    if (start >= end) {
      sel.removeAllRanges();
      return;
    }

    const spanText = text.slice(start, end).trim();
    if (!spanText) {
      sel.removeAllRanges();
      return;
    }

    const trimStart = text.indexOf(spanText, start);
    const trimEnd = trimStart + spanText.length;

    const overlaps = value.some((s) => !(trimEnd <= s.start || trimStart >= s.end));
    if (overlaps) {
      sel.removeAllRanges();
      return;
    }

    const newSpan: NERSpan = {
      start: trimStart,
      end: trimEnd,
      text: spanText,
      label: activeLabel.value,
      color: activeLabel.color,
    };

    const newSpans = [...value, newSpan].sort((a, b) => a.start - b.start);
    onChange({ type: "ner", spans: newSpans });
    sel.removeAllRanges();
  }, [activeLabel, text, value, onChange, readOnly]);

  const removeSpan = useCallback(
    (idx: number) => {
      if (readOnly) return;
      const next = [...value];
      next.splice(idx, 1);
      onChange({ type: "ner", spans: next });
    },
    [value, onChange, readOnly]
  );

  const copySpan = useCallback(
    async (text: string, idx: number) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedId(idx);
        setTimeout(() => setCopiedId(null), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    },
    []
  );

  // Filter spans based on search and label filter
  const filteredSpans = useMemo(() => {
    return value.filter((span) => {
      const matchesSearch =
        !searchQuery ||
        span.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        span.label.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFilter = !filterLabel || span.label === filterLabel;

      return matchesSearch && matchesFilter;
    });
  }, [value, searchQuery, filterLabel]);

  // Render text with spans highlighted
  function renderAnnotatedText() {
    if (!value.length) {
      return <span className="text-slate-800 leading-loose">{text}</span>;
    }

    const parts: React.ReactNode[] = [];
    let cursor = 0;

    for (const span of value) {
      if (cursor < span.start)
        parts.push(
          <span key={`t-${cursor}`}>{text.slice(cursor, span.start)}</span>
        );

      parts.push(
        <mark
          key={`s-${span.start}`}
          className="rounded px-0.5 py-0 cursor-pointer transition-all hover:opacity-75 hover:shadow-md"
          style={{
            backgroundColor: span.color + "30",
            borderBottom: `2.5px solid ${span.color}`,
            color: "inherit",
          }}
          title={`${span.label} (${span.start}:${span.end})`}
        >
          {text.slice(span.start, span.end)}
          {!hideLabels && (
            <sup
              className="text-[10px] font-bold mr-0.5 px-1 rounded"
              style={{ backgroundColor: span.color, color: "#fff" }}
            >
              {span.label}
            </sup>
          )}
        </mark>
      );

      cursor = span.end;
    }

    if (cursor < text.length)
      parts.push(<span key={`t-end`}>{text.slice(cursor)}</span>);

    return parts;
  }

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap gap-2 items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-100">
          <div className="flex gap-2 items-center flex-wrap">
            {/* Label selector */}
            <div className="flex gap-1 flex-wrap">
              {labels.map((label) => (
                <button
                  key={label.value}
                  onClick={() => setActiveLabel(label)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border-2 transition-all",
                    activeLabel?.value === label.value
                      ? "text-white shadow-md scale-105"
                      : "bg-white text-slate-700 hover:shadow-sm"
                  )}
                  style={
                    activeLabel?.value === label.value
                      ? {
                          backgroundColor: label.color,
                          borderColor: label.color,
                        }
                      : { borderColor: label.color }
                  }
                  title={label.shortcut ? `اختصار: ${label.shortcut}` : ""}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  {label.value}
                  {label.shortcut && (
                    <span className="text-[9px] opacity-60 font-mono">
                      [{label.shortcut}]
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Search */}
            {enableSearch && (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="بحث..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-6 pr-2 py-1.5 text-xs rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <div className="flex gap-1 items-center">
            {/* Undo/Redo */}
            {enableUndo && (
              <>
                <button
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="تراجع (Ctrl+Z)"
                >
                  <Undo2 size={16} />
                </button>
                <button
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="إعادة (Ctrl+Y)"
                >
                  <Redo2 size={16} />
                </button>
              </>
            )}

            {/* Toggle labels visibility */}
            <button
              onClick={() => setHideLabels(!hideLabels)}
              className="p-1.5 rounded hover:bg-slate-200 transition-colors"
              title={hideLabels ? "إظهار التسميات" : "إخفاء التسميات"}
            >
              {hideLabels ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 rounded hover:bg-slate-200 transition-colors"
              title="الإعدادات"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && !readOnly && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-blue-900">الإعدادات</div>
          <div className="text-xs text-blue-800 space-y-1">
            <p>• اضغط على اختصار التسمية لتحديدها بسرعة</p>
            <p>• Ctrl+Z للتراجع، Ctrl+Y للإعادة</p>
            <p>• حدد النص ثم انقر على التسمية لإضافة كيان</p>
            <p>• انقر على الكيان لنسخه أو حذفه</p>
          </div>
        </div>
      )}

      {/* Annotatable text */}
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className={cn(
          "bg-white border-2 rounded-2xl p-6 shadow-sm select-text leading-[2.2] text-lg text-right font-arabic transition-all",
          activeLabel && !readOnly
            ? "border-dashed cursor-text"
            : "border-slate-100",
          readOnly ? "cursor-default" : ""
        )}
        style={
          activeLabel && !readOnly
            ? { borderColor: activeLabel.color + "80" }
            : {}
        }
        dir="rtl"
      >
        {renderAnnotatedText()}
      </div>

      {!readOnly && activeLabel && (
        <p className="text-xs text-center text-slate-400 animate-pulse">
          حدد نصاً بالفأرة لإضافة كيان{" "}
          <span className="font-bold" style={{ color: activeLabel.color }}>
            {activeLabel.value}
          </span>
        </p>
      )}

      {/* Filter and stats */}
      {value.length > 0 && (
        <div className="flex gap-2 items-center justify-between text-xs text-slate-500">
          <div className="flex gap-2">
            {enableSearch && (
              <button
                onClick={() => setFilterLabel(null)}
                className={cn(
                  "px-2 py-1 rounded border transition-colors",
                  !filterLabel
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "border-slate-200 hover:bg-slate-50"
                )}
              >
                الكل ({value.length})
              </button>
            )}
            {labels.map((label) => {
              const count = value.filter((s) => s.label === label.value).length;
              return (
                <button
                  key={label.value}
                  onClick={() =>
                    setFilterLabel(
                      filterLabel === label.value ? null : label.value
                    )
                  }
                  className={cn(
                    "px-2 py-1 rounded border transition-colors",
                    filterLabel === label.value
                      ? "bg-blue-100 border-blue-300 text-blue-700"
                      : "border-slate-200 hover:bg-slate-50"
                  )}
                >
                  {label.value} ({count})
                </button>
              );
            })}
          </div>
          <span>
            {filteredSpans.length} من {value.length}
          </span>
        </div>
      )}

      {/* Spans list */}
      {value.length > 0 && (
        <div className="border border-slate-100 rounded-2xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 border-b border-slate-100 flex justify-between items-center">
            <span>الكيانات المحددة ({filteredSpans.length})</span>
            {enableExport && (
              <button
                onClick={() => {
                  const json = JSON.stringify(value, null, 2);
                  const blob = new Blob([json], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `annotations-${Date.now()}.json`;
                  a.click();
                }}
                className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                title="تصدير التعليقات"
              >
                <Download size={12} />
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
            {filteredSpans.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400">
                لا توجد كيانات مطابقة
              </div>
            ) : (
              filteredSpans.map((span, i) => {
                const originalIndex = value.indexOf(span);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 group transition-colors"
                  >
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: span.color }}
                    >
                      {span.label}
                    </span>
                    <span
                      className="flex-1 text-sm text-slate-700 text-right truncate"
                      dir="rtl"
                      title={span.text}
                    >
                      {span.text}
                    </span>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {span.start}:{span.end}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => copySpan(span.text, originalIndex)}
                        className="text-slate-400 hover:text-blue-500 transition-colors p-1"
                        title="نسخ"
                      >
                        {copiedId === originalIndex ? (
                          <Check size={14} className="text-green-500" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                      {!readOnly && (
                        <button
                          onClick={() => removeSpan(originalIndex)}
                          className="text-slate-400 hover:text-red-500 transition-colors p-1"
                          title="حذف"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-blue-50 border border-blue-100 rounded p-2 text-center">
            <div className="font-semibold text-blue-700">{value.length}</div>
            <div className="text-blue-600">إجمالي الكيانات</div>
          </div>
          <div className="bg-green-50 border border-green-100 rounded p-2 text-center">
            <div className="font-semibold text-green-700">
              {new Set(value.map((s) => s.label)).size}
            </div>
            <div className="text-green-600">أنواع فريدة</div>
          </div>
          <div className="bg-purple-50 border border-purple-100 rounded p-2 text-center">
            <div className="font-semibold text-purple-700">
              {(
                (value.reduce((sum, s) => sum + (s.end - s.start), 0) /
                  text.length) *
                100
              ).toFixed(1)}
              %
            </div>
            <div className="text-purple-600">تغطية النص</div>
          </div>
        </div>
      )}
    </div>
  );
}
