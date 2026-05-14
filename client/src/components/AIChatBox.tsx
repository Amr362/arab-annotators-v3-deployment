import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Loader2, Send, User, Sparkles, Copy, Trash2, Check } from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo, ErrorInfo } from "react";
import { Streamdown } from "streamdown";

/**
 * Message type matching server-side LLM Message interface
 */
export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
  id?: string;
};

export type AIChatBoxProps = {
  /**
   * Messages array to display in the chat.
   * Should match the format used by invokeLLM on the server.
   */
  messages: Message[];

  /**
   * Callback when user sends a message.
   * Typically you'll call a tRPC mutation here to invoke the LLM.
   */
  onSendMessage: (content: string) => void;

  /**
   * Optional callback when user deletes a message
   */
  onDeleteMessage?: (messageId: string) => void;

  /**
   * Whether the AI is currently generating a response
   */
  isLoading?: boolean;

  /**
   * Placeholder text for the input field
   */
  placeholder?: string;

  /**
   * Custom className for the container
   */
  className?: string;

  /**
   * Height of the chat box (default: 600px)
   */
  height?: string | number;

  /**
   * Empty state message to display when no messages
   */
  emptyStateMessage?: string;

  /**
   * Suggested prompts to display in empty state
   * Click to send directly
   */
  suggestedPrompts?: string[];

  /**
   * Error state and message
   */
  error?: string | null;

  /**
   * Callback when error is dismissed
   */
  onErrorDismiss?: () => void;
};

/**
 * Error boundary component for AIChatBox
 */
class AIChatBoxErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[AIChatBox] Error caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full bg-destructive/10 rounded-lg p-4">
          <div className="text-center">
            <p className="text-sm font-medium text-destructive mb-2">
              حدث خطأ في مكون الدردشة
            </p>
            <p className="text-xs text-muted-foreground">
              {this.state.error?.message}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-2"
            >
              إعادة محاولة
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * A production-ready AI chat box component with enhanced features.
 *
 * Features:
 * - Matches server-side Message interface for seamless integration
 * - Markdown rendering with Streamdown
 * - Auto-scrolls to latest message with smooth animation
 * - Loading states with typing indicator
 * - Copy and delete message actions
 * - Error boundary and error handling
 * - Accessibility improvements (ARIA labels, keyboard navigation)
 * - Performance optimizations (useCallback, useMemo)
 * - Dark mode support
 * - Suggested prompts in empty state
 *
 * @example
 * ```tsx
 * const ChatPage = () => {
 *   const [messages, setMessages] = useState<Message[]>([
 *     { role: "system", content: "You are a helpful assistant." }
 *   ]);
 *   const [error, setError] = useState<string | null>(null);
 *
 *   const chatMutation = trpc.ai.chat.useMutation({
 *     onSuccess: (response) => {
 *       setMessages(prev => [...prev, {
 *         role: "assistant",
 *         content: response,
 *         id: crypto.randomUUID()
 *       }]);
 *     },
 *     onError: (error) => {
 *       setError(error.message);
 *     }
 *   });
 *
 *   const handleSend = (content: string) => {
 *     const newMessages = [...messages, { 
 *       role: "user", 
 *       content,
 *       id: crypto.randomUUID()
 *     }];
 *     setMessages(newMessages);
 *     chatMutation.mutate({ messages: newMessages });
 *   };
 *
 *   const handleDelete = (messageId: string) => {
 *     setMessages(prev => prev.filter(m => m.id !== messageId));
 *   };
 *
 *   return (
 *     <AIChatBox
 *       messages={messages}
 *       onSendMessage={handleSend}
 *       onDeleteMessage={handleDelete}
 *       isLoading={chatMutation.isPending}
 *       error={error}
 *       onErrorDismiss={() => setError(null)}
 *       suggestedPrompts={[
 *         "اشرح الحوسبة الكمية",
 *         "اكتب hello world في Python"
 *       ]}
 *     />
 *   );
 * };
 * ```
 */
export function AIChatBox({
  messages,
  onSendMessage,
  onDeleteMessage,
  isLoading = false,
  placeholder = "اكتب رسالتك...",
  className,
  height = "600px",
  emptyStateMessage = "ابدأ محادثة مع الذكاء الاصطناعي",
  suggestedPrompts,
  error,
  onErrorDismiss,
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Filter out system messages
  const displayMessages = useMemo(
    () => messages.filter((msg) => msg.role !== "system"),
    [messages]
  );

  // Calculate min-height for last assistant message to push user message to top
  const [minHeightForLastMessage, setMinHeightForLastMessage] = useState(0);

  useEffect(() => {
    if (containerRef.current && inputAreaRef.current) {
      const containerHeight = containerRef.current.offsetHeight;
      const inputHeight = inputAreaRef.current.offsetHeight;
      const scrollAreaHeight = containerHeight - inputHeight;

      const userMessageReservedHeight = 56;
      const calculatedHeight = scrollAreaHeight - 32 - userMessageReservedHeight;

      setMinHeightForLastMessage(Math.max(0, calculatedHeight));
    }
  }, []);

  // Scroll to bottom helper function with smooth animation
  const scrollToBottom = useCallback(() => {
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLDivElement;

    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  }, []);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [displayMessages, isLoading, scrollToBottom]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedInput = input.trim();
      if (!trimmedInput || isLoading) return;

      onSendMessage(trimmedInput);
      setInput("");

      // Keep focus on input
      textareaRef.current?.focus();
    },
    [input, isLoading, onSendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e as any);
      }
    },
    [handleSubmit]
  );

  const handleCopyMessage = useCallback(
    async (content: string, messageId: string) => {
      try {
        await navigator.clipboard.writeText(content);
        setCopiedId(messageId);
        setTimeout(() => setCopiedId(null), 2000);
      } catch (err) {
        console.error("[AIChatBox] Failed to copy message:", err);
      }
    },
    []
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      if (onDeleteMessage) {
        onDeleteMessage(messageId);
      }
    },
    [onDeleteMessage]
  );

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      onSendMessage(prompt);
    },
    [onSendMessage]
  );

  return (
    <AIChatBoxErrorBoundary>
      <div
        ref={containerRef}
        className={cn(
          "flex flex-col bg-card text-card-foreground rounded-lg border shadow-sm",
          className
        )}
        style={{ height }}
        role="region"
        aria-label="منطقة الدردشة مع الذكاء الاصطناعي"
      >
        {/* Error Banner */}
        {error && (
          <div
            className="bg-destructive/10 border-b border-destructive/20 px-4 py-3 flex items-center justify-between"
            role="alert"
            aria-live="polite"
          >
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={onErrorDismiss}
              className="text-destructive hover:opacity-70 transition-opacity"
              aria-label="إغلاق الخطأ"
            >
              ✕
            </button>
          </div>
        )}

        {/* Messages Area */}
        <div ref={scrollAreaRef} className="flex-1 overflow-hidden">
          {displayMessages.length === 0 ? (
            <div className="flex h-full flex-col p-4">
              <div className="flex flex-1 flex-col items-center justify-center gap-6 text-muted-foreground">
                <div className="flex flex-col items-center gap-3">
                  <Sparkles className="size-12 opacity-20" />
                  <p className="text-sm">{emptyStateMessage}</p>
                </div>

                {suggestedPrompts && suggestedPrompts.length > 0 && (
                  <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                    {suggestedPrompts.map((prompt, index) => (
                      <button
                        key={index}
                        onClick={() => handleSuggestedPrompt(prompt)}
                        disabled={isLoading}
                        className="rounded-lg border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`الاقتراح: ${prompt}`}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="flex flex-col space-y-4 p-4">
                {displayMessages.map((message, index) => {
                  const messageId = message.id || `msg-${index}`;
                  const isLastMessage = index === displayMessages.length - 1;
                  const shouldApplyMinHeight =
                    isLastMessage && !isLoading && minHeightForLastMessage > 0;

                  return (
                    <div
                      key={messageId}
                      className={cn(
                        "flex gap-3 group",
                        message.role === "user"
                          ? "justify-end items-start"
                          : "justify-start items-start"
                      )}
                      style={
                        shouldApplyMinHeight
                          ? { minHeight: `${minHeightForLastMessage}px` }
                          : undefined
                      }
                      role="article"
                      aria-label={`رسالة من ${
                        message.role === "user" ? "المستخدم" : "الذكاء الاصطناعي"
                      }`}
                    >
                      {message.role === "assistant" && (
                        <div className="size-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                          <Sparkles className="size-4 text-primary" />
                        </div>
                      )}

                      <div
                        className={cn(
                          "max-w-[80%] rounded-lg px-4 py-2.5 relative group/message",
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        )}
                      >
                        {message.role === "assistant" ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <Streamdown>{message.content}</Streamdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-sm">
                            {message.content}
                          </p>
                        )}

                        {/* Message Actions */}
                        <div className="absolute -right-12 top-0 flex gap-1 opacity-0 group-hover/message:opacity-100 transition-opacity">
                          <button
                            onClick={() =>
                              handleCopyMessage(message.content, messageId)
                            }
                            className={cn(
                              "p-1 rounded hover:bg-accent transition-colors",
                              copiedId === messageId
                                ? "text-green-600"
                                : "text-muted-foreground"
                            )}
                            title="نسخ الرسالة"
                            aria-label="نسخ الرسالة"
                          >
                            {copiedId === messageId ? (
                              <Check className="size-4" />
                            ) : (
                              <Copy className="size-4" />
                            )}
                          </button>
                          {onDeleteMessage && (
                            <button
                              onClick={() => handleDeleteMessage(messageId)}
                              className="p-1 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                              title="حذف الرسالة"
                              aria-label="حذف الرسالة"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {message.role === "user" && (
                        <div className="size-8 shrink-0 mt-1 rounded-full bg-secondary flex items-center justify-center">
                          <User className="size-4 text-secondary-foreground" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {isLoading && (
                  <div
                    className="flex items-start gap-3"
                    style={
                      minHeightForLastMessage > 0
                        ? { minHeight: `${minHeightForLastMessage}px` }
                        : undefined
                    }
                    aria-label="الذكاء الاصطناعي يكتب..."
                    aria-live="polite"
                  >
                    <div className="size-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                      <Sparkles className="size-4 text-primary" />
                    </div>
                    <div className="rounded-lg bg-muted px-4 py-2.5">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" />
                        <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce delay-100" />
                        <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce delay-200" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Input Area */}
        <form
          ref={inputAreaRef}
          onSubmit={handleSubmit}
          className="flex gap-2 p-4 border-t bg-background/50 items-end"
          aria-label="نموذج إرسال الرسالة"
        >
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 max-h-32 resize-none min-h-9"
            rows={1}
            aria-label="حقل إدخال الرسالة"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            className="shrink-0 h-[38px] w-[38px]"
            aria-label={isLoading ? "جاري الإرسال..." : "إرسال الرسالة"}
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </form>
      </div>
    </AIChatBoxErrorBoundary>
  );
}

export default AIChatBox;
