import { useEffect, useRef, useState } from "react";
import type { AnnotationResult } from "./types";
import { useAuth } from "@/_core/hooks/useAuth";

interface Props {
  html: string;           // The full HTML string stored in instructions
  text: string;           // Current task text — injected into the iframe
  onChange: (result: AnnotationResult) => void;
  readOnly?: boolean;
}

/**
 * HtmlInterface
 * -------------
 * Renders any custom HTML page (stored in project instructions) inside a
 * sandboxed iframe.  Communication works through postMessage:
 *
 * Parent → iframe (on load):
 *   { type: "init_task", task: { text: string } }
 *
 * iframe → Parent (when tasker submits):
 *   { type: "annotation_result", result: { label?: string, labels?: string[], ... } }
 *
 * The result is then forwarded to the platform via onChange so the normal
 * submit/auto-save pipeline picks it up.
 */
export default function HtmlInterface({ html, text, onChange, readOnly }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [received, setReceived] = useState<AnnotationResult | null>(null);
  const { user } = useAuth();

  // ── Inject task text and role into iframe once it loads ──────────────────
  function handleLoad() {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "init_task", task: { text }, role: user?.role },
      "*"
    );
  }

  // ── Listen for results from iframe ──────────────────────────────────────
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data || e.data.type !== "annotation_result") return;
      const raw = e.data.result ?? {};

      // Normalise to AnnotationResult shape
      const result: AnnotationResult = {
        type: "html_interface" as any,
        labels: raw.labels
          ? raw.labels
          : raw.label
          ? [raw.label]
          : [],
        confidence: raw.confidence,
        ...raw,
      };

      setReceived(result);
      if (!readOnly) onChange(result);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onChange, readOnly]);

  // ── Re-send task text and role whenever they change ──────────────────────
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "init_task", task: { text }, role: user?.role },
      "*"
    );
  }, [text, user?.role]);

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Iframe wrapper */}
      <div className="relative w-full rounded-2xl overflow-hidden border-2 border-slate-100 bg-white shadow-sm">
        {readOnly && (
          <div className="absolute inset-0 z-10 cursor-not-allowed" />
        )}
        <iframe
          ref={iframeRef}
          srcDoc={html}
          onLoad={handleLoad}
          sandbox="allow-scripts allow-same-origin allow-forms"
          className="w-full border-0"
          style={{ minHeight: 420, display: "block" }}
          title="custom-annotation-interface"
        />
      </div>

      {/* Confirmation strip — shows when a result is received */}
      {received && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700" dir="rtl">
          <span className="text-base">✅</span>
          <span>
            تم استلام التصنيف:{" "}
            <strong>{received.labels?.join("، ") || JSON.stringify(received)}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
