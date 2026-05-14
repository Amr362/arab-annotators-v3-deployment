import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Send,
  User,
  Sparkles,
  Copy,
  Trash2,
  Check,
  Search,
  Filter,
  Download,
  RotateCcw,
} from "lucide-react";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  ErrorInfo,
  ReactNode,
} from "react";
import { Streamdown } from "streamdown";

/**
 * Enhanced Message type with additional metadata
 */
export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
  id?: string;
  timestamp?: number;
  edited?: boolean;
  reactions?: string[];
};

export type AIChatBoxProps = {
  /**
   * Messages array to display in the chat
   */
  messages: Message[];

  /**
   * Callback when user sends a message
   */
  onSendMessage: (content: string) => void;

  /**
   * Optional callback when user deletes a message
   */
  onDeleteMessage?: (messageId: string) => void;

  /**
   * Optional callback when user edits a message
   */
  onEditMessage?: (messageId: string, newContent: string) => void;

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
   * Empty state message
   */
  emptyStateMessage?: string;

  /**
   * Suggested prompts
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

  /**
   * Enable search functionality
   */
  enableSearch?: boolean;

  /**
   * Enable message filtering
   */
  enableFilter?: boolean;

  /**
   * Enable export functionality
   */
  enableExport?: boolean;

  /**
   * Custom theme variant
   */
  variant?: "default" | "compact" | "minimal";
};

/**
 * Enhanced Error Boundary for AIChatBox
 */
class AIChatBoxErrorBoundary extends React.Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
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
            <p className="text-xs text-muted-foreground line-clamp-2">
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
 * Enhanced AI Chat Box Component v2
 *
 * Improvements over v1:
 * - Better performance with memoization
 * - Search and filter capabilities
 * - Export functionality
 * - Enhanced accessibility
 * - Message timestamps and metadata
 * - Improved error handling
 * - Theme variants
 * - Better mobile responsiveness
 */
export function AIChatBox({
  messages,
  onSendMessage,
  onDeleteMessage,
  onEditMessage,
  isLoading = false,
  placeholder = "اكتب رسالتك...",
  className,
  height = "600px",
  emptyStateMessage = "ابدأ محادثة مع الذكاء الاصطناعي",
  suggestedPrompts,
  error,
  onErrorDismiss,
  enableSearch = true,
  enableFilter = true,
  enableExport = true,
  variant = "default",
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | "user" | "assistant">(
    "all"
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Filter out system messages
  const displayMessages = useMemo(() => {
    let filtered = messages.filter((msg) => msg.role !== "system");

    // Apply role filter
    if (filterRole !== "all") {
      filtered = filtered.filter((msg) => msg.role === filterRole);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((msg) =>
        msg.content.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [messages, filterRole, searchQuery]);

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

  const scrollToBottom = useCallback(() => {
    const viewport = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
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

  const handleEditMessage = useCallback(
    (messageId: string) => {
      const message = messages.find((m) => m.id === messageId);
      if (message) {
        setEditingId(messageId);
        setEditContent(message.content);
      }
    },
    [messages]
  );

  const handleSaveEdit = useCallback(
    (messageId: string) => {
      if (onEditMessage && editContent.trim()) {
        onEditMessage(messageId, editContent);
        setEditingId(null);
        setEditContent("");
      }
    },
    [editContent, onEditMessage]
  );

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      onSendMessage(prompt);
    },
    [onSendMessage]
  );

  const handleExport = useCallback(() => {
    const chatContent = displayMessages
      .map((msg) => `[${msg.role.toUpperCase()}]: ${msg.content}`)
      .join("\n\n");

    const element = document.createElement("a");
    element.setAttribute(
      "href",
      "data:text/plain;charset=utf-8," + encodeURIComponent(chatContent)
    );
    element.setAttribute("download", `chat-${Date.now()}.txt`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }, [displayMessages]);

  const handleReset = useCallback(() => {
    setSearchQuery("");
    setFilterRole("all");
  }, []);

  const containerClasses = cn(
    "flex flex-col bg-card text-card-foreground rounded-lg border shadow-sm transition-all",
    variant === "compact" && "border-0 shadow-none",
    variant === "minimal" && "border-0 shadow-none bg-transparent",
    className
  );

  return (
    <AIChatBoxErrorBoundary>
      <div
        ref={containerRef}
        className={containerClasses}
        style={{ height }}
        role="region"
        aria-label="منطقة الدردشة مع الذكاء الاصطناعي"
      >
        {/* Error Banner */}
        {error && (
          <div
            className="bg-destructive/10 border-b border-destructive/20 px-4 py-3 flex items-center justify-between animate-in fade-in"
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

        {/* Toolbar */}
        {(enableSearch || enableFilter || enableExport) && (
          <div className="flex gap-2 p-3 border-b bg-muted/30 flex-wrap">
            {enableSearch && (
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="بحث..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label="البحث في الرسائل"
                />
              </div>
            )}

            {enableFilter && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={filterRole === "all" ? "default" : "outline"}
                  onClick={() => setFilterRole("all")}
                  className="text-xs"
                >
                  الكل
                </Button>
                <Button
                  size="sm"
                  variant={filterRole === "user" ? "default" : "outline"}
                  onClick={() => setFilterRole("user")}
                  className="text-xs"
                >
                  أنت
                </Button>
                <Button
                  size="sm"
                  variant={filterRole === "assistant" ? "default" : "outline"}
                  onClick={() => setFilterRole("assistant")}
                  className="text-xs"
                >
                  الذكاء الاصطناعي
                </Button>
              </div>
            )}

            {(searchQuery || filterRole !== "all") && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleReset}
                className="text-xs"
                aria-label="إعادة تعيين الفلاتر"
              >
                <RotateCcw className="size-3.5" />
              </Button>
            )}

            {enableExport && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                className="text-xs"
                aria-label="تصدير المحادثة"
              >
                <Download className="size-3.5" />
              </Button>
            )}
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
                        className="rounded-lg border border-border bg-card px-4 py-2 text-sm transition-all hover:bg-accent hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
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
                  const isEditing = editingId === messageId;

                  return (
                    <div
                      key={messageId}
                      className={cn(
                        "flex gap-3 group animate-in fade-in slide-in-from-bottom-2",
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
                          "max-w-[80%] rounded-lg px-4 py-2.5 relative group/message transition-all",
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground",
                          isEditing && "ring-2 ring-primary"
                        )}
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="min-h-[60px] resize-none"
                            />
                            <div className="flex gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditContent("");
                                }}
                              >
                                إلغاء
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleSaveEdit(messageId)}
                              >
                                حفظ
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {message.role === "assistant" ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none">
                                <Streamdown>{message.content}</Streamdown>
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap text-sm">
                                {message.content}
                              </p>
                            )}
                            {message.edited && (
                              <p className="text-xs opacity-60 mt-1">
                                (معدل)
                              </p>
                            )}
                          </>
                        )}

                        {/* Message Actions */}
                        {!isEditing && (
                          <div className="absolute -right-16 top-0 flex gap-1 opacity-0 group-hover/message:opacity-100 transition-opacity">
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
                            {message.role === "user" && onEditMessage && (
                              <button
                                onClick={() => handleEditMessage(messageId)}
                                className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-primary"
                                title="تعديل الرسالة"
                                aria-label="تعديل الرسالة"
                              >
                                ✎
                              </button>
                            )}
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
                        )}
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
                    className="flex items-start gap-3 animate-in fade-in"
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
