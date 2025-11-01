import { tool as createAgentTool, type RealtimeSession } from "@openai/agents/realtime";
import { z } from "zod";
import { renderMarkdown } from "./markdown/renderer";
import type { ReactElement } from "react";

const textEncoder = new TextEncoder();

export const MAX_MARKDOWN_BYTES = 16_384;

const UNSAFE_HTML_PATTERN =
  /<(script|iframe|object|embed|form|link|style|meta|base|template|svg|math|audio|video|source|img|button|input|textarea|select)\b/i;
const EVENT_HANDLER_PATTERN = /\bon[a-z]+\s*=/i;
const JAVASCRIPT_URL_PATTERN = /\bjavascript\s*:/i;

const stripCodeSegments = (input: string): string =>
  input.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");

const containsUnsafeMarkup = (input: string): boolean => {
  const withoutCode = stripCodeSegments(input);
  if (UNSAFE_HTML_PATTERN.test(withoutCode)) {
    return true;
  }
  if (EVENT_HANDLER_PATTERN.test(withoutCode)) {
    return true;
  }
  if (JAVASCRIPT_URL_PATTERN.test(withoutCode)) {
    return true;
  }
  return false;
};

const measureBytes = (value: string): number => textEncoder.encode(value).byteLength;

const markdownContentSchema = z
  .string({
    required_error: "markdown is required",
  })
  .trim()
  .min(1, "markdown must not be empty")
  .superRefine((value, ctx) => {
    const bytes = measureBytes(value);
    if (bytes > MAX_MARKDOWN_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        type: "string",
        maximum: MAX_MARKDOWN_BYTES,
        inclusive: true,
        message: "markdown exceeds maximum size",
      });
    }

    if (containsUnsafeMarkup(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "markdown contains unsafe HTML",
      });
    }
  });

export const MarkdownPayloadSchema = z.object({
  documentId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9._-]+$/, "documentId must be URL safe")
    .optional(),
  title: z
    .string()
    .trim()
    .min(1, "title must not be empty")
    .max(120, "title must be at most 120 characters")
    .optional(),
  markdown: markdownContentSchema,
});

export type MarkdownPayload = z.infer<typeof MarkdownPayloadSchema>;

export type MarkdownDocument = {
  id: string;
  title: string | null;
  markdown: string;
  rendered: ReactElement;
  bytes: number;
  updatedAt: number;
};

type MarkdownSubscriber = (document: MarkdownDocument | null) => void;

const sessionResetEvents = new Set([
  "session.closed",
  "session.disconnected",
  "session.invalidated",
  "session.failed",
  "session.terminated",
]);

const generateDocumentId = (explicitId?: string): string => {
  if (explicitId) {
    return explicitId;
  }
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `markdown-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const toDocument = (payload: MarkdownPayload): MarkdownDocument => {
  const markdown = payload.markdown;
  const bytes = measureBytes(markdown);
  const updatedAt = Date.now();

  return {
    id: generateDocumentId(payload.documentId),
    title: payload.title ?? null,
    markdown,
    rendered: renderMarkdown(markdown),
    bytes,
    updatedAt,
  };
};

export class MarkdownStore {
  private document: MarkdownDocument | null = null;
  private listeners = new Set<MarkdownSubscriber>();
  private session: RealtimeSession | null = null;
  private unbindSession: (() => void) | null = null;

  getDocument(): MarkdownDocument | null {
    return this.document;
  }

  subscribe(listener: MarkdownSubscriber): () => void {
    this.listeners.add(listener);
    listener(this.document);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setSession(session: RealtimeSession | null): void {
    if (this.session === session) {
      return;
    }

    this.teardownSessionBinding();
    this.session = session;
    this.reset();

    if (!session) {
      return;
    }

    const handleTransportEvent = (event: unknown) => {
      const type =
        typeof event === "object" && event !== null && "type" in event
          ? (event as { type?: unknown }).type
          : null;

      if (typeof type === "string" && sessionResetEvents.has(type)) {
        this.reset();
      }
    };

    session.on("transport_event", handleTransportEvent);

    this.unbindSession = () => {
      session.off("transport_event", handleTransportEvent);
    };
  }

  apply(payload: MarkdownPayload): MarkdownDocument {
    const document = toDocument(payload);
    this.document = document;
    this.emit();
    return document;
  }

  reset(): void {
    if (this.document === null) {
      return;
    }
    this.document = null;
    this.emit();
  }

  private teardownSessionBinding(): void {
    if (this.unbindSession) {
      this.unbindSession();
      this.unbindSession = null;
    }
    this.session = null;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.document);
    }
  }
}

export const showMarkdownToolParameters = {
  type: "object",
  properties: {
    documentId: {
      type: "string",
      minLength: 1,
      maxLength: 128,
      pattern: "^[a-zA-Z0-9._-]+$",
      description: "Optional identifier to reuse the rendered document slot.",
    },
    title: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      description: "Short title displayed above the rendered Markdown.",
    },
    markdown: {
      type: "string",
      minLength: 1,
      maxLength: MAX_MARKDOWN_BYTES,
      description: "Markdown content to render, including tables and math.",
    },
  },
  required: ["markdown"],
  additionalProperties: false,
} as const;

export type ShowMarkdownToolResult = {
  documentId: string;
  bytes: number;
  updatedAt: number;
  title: string | null;
};

export const createShowMarkdownTool = (store: MarkdownStore) => {
  const run = async (input: unknown): Promise<ShowMarkdownToolResult> => {
    const result = MarkdownPayloadSchema.safeParse(input);
    if (!result.success) {
      throw new Error(
        `Invalid markdown payload: ${result.error.issues.map((issue) => issue.message).join(", ")}`,
      );
    }

    const document = store.apply(result.data);
    return {
      documentId: document.id,
      bytes: document.bytes,
      updatedAt: document.updatedAt,
      title: document.title,
    };
  };

  const realtimeTool = createAgentTool({
    name: "show_markdown",
    description:
      "Render Markdown content, including tables and LaTeX math, in the main VibeChat view.",
    parameters: showMarkdownToolParameters,
    async execute(input: unknown) {
      return run(input);
    },
  });

  Object.defineProperty(realtimeTool, "execute", {
    value: run,
    enumerable: true,
    configurable: true,
  });

  return realtimeTool as typeof realtimeTool & { execute: typeof run };
};
