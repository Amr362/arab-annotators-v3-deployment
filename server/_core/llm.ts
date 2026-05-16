import { ENV } from "./env";

// ============================================================================
// Type Definitions
// ============================================================================

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice = ToolChoicePrimitive | ToolChoiceByName | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  temperature?: number;
  topP?: number;
  top_p?: number;
  timeout?: number;
  retries?: number;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// ============================================================================
// Constants and Configuration
// ============================================================================

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_MAX_TOKENS = 32768;
const DEFAULT_THINKING_BUDGET = 128;
const DEFAULT_TIMEOUT = 60000; // 60 seconds
const DEFAULT_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
const RETRY_BACKOFF_MULTIPLIER = 2;

// Simple in-memory cache with TTL
const responseCache = new Map<string, { data: InvokeResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Rate limiting
const requestTimestamps = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute

// ============================================================================
// Logger
// ============================================================================

type LogLevel = "debug" | "info" | "warn" | "error";

const logger = {
  log: (level: LogLevel, message: string, data?: unknown) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [LLM] [${level.toUpperCase()}]`;
    const logMessage = data ? `${prefix} ${message} ${JSON.stringify(data)}` : `${prefix} ${message}`;

    if (level === "error") {
      console.error(logMessage);
    } else if (level === "warn") {
      console.warn(logMessage);
    } else if (level === "info") {
      console.info(logMessage);
    } else {
      console.debug(logMessage);
    }
  },

  debug: (message: string, data?: unknown) => logger.log("debug", message, data),
  info: (message: string, data?: unknown) => logger.log("info", message, data),
  warn: (message: string, data?: unknown) => logger.log("warn", message, data),
  error: (message: string, data?: unknown) => logger.log("error", message, data),
};

// ============================================================================
// Utility Functions
// ============================================================================

const ensureArray = (value: MessageContent | MessageContent[]): MessageContent[] =>
  Array.isArray(value) ? value : [value];

const normalizeContentPart = (part: MessageContent): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error('tool_choice "required" was provided but no tools were configured');
    }

    if (tools.length > 1) {
      throw new Error(
        'tool_choice "required" needs a single tool or specify the tool name explicitly'
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = (): string => {
  if (ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0) {
    return `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`;
  }
  return "https://forge.manus.im/v1/chat/completions";
};

const assertApiKey = (): void => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error("responseFormat json_schema requires a defined schema object");
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// ============================================================================
// Cache Management
// ============================================================================

const generateCacheKey = (params: InvokeParams): string => {
  const key = {
    messages: params.messages,
    tools: params.tools,
    model: params.model || DEFAULT_MODEL,
    temperature: params.temperature,
    topP: params.topP || params.top_p,
  };
  return JSON.stringify(key);
};

const getCachedResponse = (cacheKey: string): InvokeResult | null => {
  const cached = responseCache.get(cacheKey);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL) {
    responseCache.delete(cacheKey);
    return null;
  }

  logger.debug("Cache hit", { cacheKey: cacheKey.substring(0, 50) });
  return cached.data;
};

const setCachedResponse = (cacheKey: string, data: InvokeResult): void => {
  responseCache.set(cacheKey, { data, timestamp: Date.now() });
};

const clearCache = (): void => {
  responseCache.clear();
  logger.info("LLM response cache cleared");
};

// ============================================================================
// Rate Limiting
// ============================================================================

const checkRateLimit = (apiKey: string): boolean => {
  const now = Date.now();
  const keyTimestamps = requestTimestamps.get(apiKey) || [];

  // Remove timestamps older than the rate limit window
  const recentTimestamps = keyTimestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW);

  if (recentTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    logger.warn("Rate limit exceeded", { apiKey: apiKey.substring(0, 10), count: recentTimestamps.length });
    return false;
  }

  recentTimestamps.push(now);
  requestTimestamps.set(apiKey, recentTimestamps);
  return true;
};

// ============================================================================
// Retry Logic
// ============================================================================

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (error: Error | unknown): boolean => {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("econnrefused") ||
    message.includes("econnreset") ||
    message.includes("429") || // Too many requests
    message.includes("503") || // Service unavailable
    message.includes("502") // Bad gateway
  );
};

// ============================================================================
// Input Validation
// ============================================================================

const validateInvokeParams = (params: InvokeParams): void => {
  if (!params.messages || !Array.isArray(params.messages) || params.messages.length === 0) {
    throw new Error("At least one message is required");
  }

  if (params.maxTokens && (params.maxTokens < 1 || params.maxTokens > 128000)) {
    throw new Error("maxTokens must be between 1 and 128000");
  }

  if (params.temperature !== undefined && (params.temperature < 0 || params.temperature > 2)) {
    throw new Error("temperature must be between 0 and 2");
  }

  if (params.topP !== undefined && params.top_p !== undefined && params.topP !== params.top_p) {
    throw new Error("Cannot specify both topP and top_p");
  }

  const topP = params.topP || params.top_p;
  if (topP !== undefined && (topP < 0 || topP > 1)) {
    throw new Error("topP must be between 0 and 1");
  }

  if (params.retries !== undefined && (params.retries < 0 || params.retries > 10)) {
    throw new Error("retries must be between 0 and 10");
  }

  if (params.timeout !== undefined && params.timeout < 1000) {
    throw new Error("timeout must be at least 1000ms");
  }
};

// ============================================================================
// Main LLM Invocation Function
// ============================================================================

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  // Validate inputs
  validateInvokeParams(params);
  assertApiKey();

  const apiKey = ENV.forgeApiKey!;
  const maxRetries = params.retries ?? DEFAULT_RETRIES;
  const timeout = params.timeout ?? DEFAULT_TIMEOUT;
  const model = params.model ?? DEFAULT_MODEL;

  // Check rate limit
  if (!checkRateLimit(apiKey)) {
    throw new Error("Rate limit exceeded. Please try again later.");
  }

  // Check cache
  const cacheKey = generateCacheKey(params);
  const cachedResponse = getCachedResponse(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  // Prepare request payload
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    temperature,
    topP,
    top_p,
  } = params;

  const payload: Record<string, unknown> = {
    model,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(toolChoice || tool_choice, tools);
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = params.maxTokens || params.max_tokens || DEFAULT_MAX_TOKENS;

  if (temperature !== undefined) {
    payload.temperature = temperature;
  }

  const topPValue = topP || top_p;
  if (topPValue !== undefined) {
    payload.top_p = topPValue;
  }

  payload.thinking = {
    budget_tokens: DEFAULT_THINKING_BUDGET,
  };

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  // Retry logic
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`LLM invoke attempt ${attempt + 1}/${maxRetries + 1}`, {
        model,
        messageCount: messages.length,
        toolCount: tools?.length || 0,
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(resolveApiUrl(), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(
            `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
          );
          throw error;
        }

        const result = (await response.json()) as InvokeResult;

        // Validate response
        if (!result.choices || !Array.isArray(result.choices) || result.choices.length === 0) {
          throw new Error("Invalid LLM response: no choices returned");
        }

        // Cache the successful response
        setCachedResponse(cacheKey, result);

        logger.info("LLM invoke successful", {
          model: result.model,
          tokens: result.usage?.total_tokens || 0,
          finishReason: result.choices[0]?.finish_reason,
        });

        return result;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries && isRetryableError(lastError)) {
        const delayMs = RETRY_DELAY * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt);
        logger.warn(`LLM invoke failed, retrying in ${delayMs}ms`, {
          attempt: attempt + 1,
          error: lastError.message,
        });
        await sleep(delayMs);
      } else {
        logger.error("LLM invoke failed after all retries", {
          attempts: attempt + 1,
          error: lastError.message,
        });
        throw lastError;
      }
    }
  }

  // This should never be reached, but just in case
  throw lastError || new Error("LLM invoke failed for unknown reason");
}

// ============================================================================
// Utility Exports
// ============================================================================

export const LLMUtils = {
  clearCache,
  getDefaultModel: () => DEFAULT_MODEL,
  getDefaultMaxTokens: () => DEFAULT_MAX_TOKENS,
};
