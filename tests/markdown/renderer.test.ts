import { randomUUID } from "node:crypto";
import { render, screen } from "@testing-library/react";
import { renderMarkdown } from "../../app/lib/markdown/renderer";
import {
  MarkdownPayloadSchema,
  MarkdownStore,
  MAX_MARKDOWN_BYTES,
  createShowMarkdownTool,
} from "../../app/lib/markdown-store";
import type { RealtimeSession } from "@openai/agents/realtime";


// ReactMarkdown is mocked globally via tests/setupTests.ts.


jest.mock("remark-gfm", () => () => null);
jest.mock("remark-math", () => () => null);

const ensureRandomUUID = () => {
  if (typeof globalThis.crypto === "undefined") {
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID },
      configurable: true,
    });
    return;
  }

  if (typeof globalThis.crypto.randomUUID !== "function") {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: randomUUID,
      configurable: true,
    });
  }
};

ensureRandomUUID();

describe("renderMarkdown", () => {
  it("renders headings, lists, code, tables, and math content", () => {
    const markdown = `
# Heading One

- First item
- Second item

\`\`\`js
console.log('hello');
\`\`\`

| Name | Value |
| ---- | ----- |
| Pi   | 3.14  |

Inline math $E = mc^2$ and block math:

$$
c = \\\\pm\\\\sqrt{a^2 + b^2}
$$
`;

    const { container } = render(renderMarkdown(markdown));

    expect(screen.getByRole("heading", { level: 1, name: "Heading One" })).toBeInTheDocument();
    expect(screen.getByText(/First item/)).toBeInTheDocument();
    expect(screen.getByText("console.log('hello');")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    const katexNodes = container.querySelectorAll('.katex');
    expect(katexNodes.length).toBeGreaterThanOrEqual(2);
    expect(Array.from(katexNodes).some((el) => el.textContent?.includes('E = mc^2'))).toBe(true);
  });

  it("normalizes square bracket math delimiters", () => {
    const markdown = "The relation [ E = mc^2 ] explains energy.";
    const { container } = render(renderMarkdown(markdown));
    const inline = container.querySelector('.katex');
    expect(inline).toBeTruthy();
    expect(inline?.textContent?.replace(/\s+/g, ' ')).toContain('E = mc^2');
  });

  it("escapes raw HTML content", () => {
    const { container } = render(renderMarkdown("Alert: <script>alert('xss')</script>"));
    expect(container.textContent).toContain("<script>alert('xss')</script>");
  });
});

describe("MarkdownPayloadSchema", () => {
  it("accepts valid payloads", () => {
    const result = MarkdownPayloadSchema.safeParse({
      documentId: "doc-1",
      title: "Report",
      markdown: "# Hello\n\nContent",
    });
    expect(result.success).toBe(true);
  });

  it("rejects oversized payloads", () => {
    const big = "a".repeat(MAX_MARKDOWN_BYTES + 1);
    const result = MarkdownPayloadSchema.safeParse({ markdown: big });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("markdown exceeds maximum size");
    }
  });

  it("rejects payloads containing unsafe HTML", () => {
    const result = MarkdownPayloadSchema.safeParse({
      markdown: "Please run <script>alert('hack')</script>",
    });
    expect(result.success).toBe(false);
  });

  it("allows escaped script tags inside fenced code blocks", () => {
    const result = MarkdownPayloadSchema.safeParse({
      markdown: "```html\n<script>alert('demo')</script>\n```",
    });
    expect(result.success).toBe(true);
  });
});

describe("MarkdownStore", () => {
  const createSessionStub = () => {
    const listeners = new Map<string, Set<(payload: unknown) => void>>();
    return {
      on(event: string, listener: (payload: unknown) => void) {
        const list = listeners.get(event) ?? new Set<(payload: unknown) => void>();
        list.add(listener);
        listeners.set(event, list);
      },
      off(event: string, listener: (payload: unknown) => void) {
        const list = listeners.get(event);
        list?.delete(listener);
      },
      emitTransport(payload: unknown) {
        const handlerList = listeners.get("transport_event");
        if (!handlerList) {
          return;
        }
        handlerList.forEach((handler) => handler(payload));
      },
    };
  };

  it("notifies subscribers on updates and reset", () => {
    const store = new MarkdownStore();
    const updates: Array<string | null> = [];
    store.subscribe((doc) => {
      updates.push(doc ? doc.markdown : null);
    });

    store.apply({ markdown: "# Update" });
    expect(updates).toEqual([null, "# Update"]);

    store.reset();
    expect(updates).toEqual([null, "# Update", null]);
  });

  it("resets document when session closes", () => {
    const store = new MarkdownStore();
    const session = createSessionStub();
    store.apply({ markdown: "# Existing" });
    store.setSession(session as unknown as RealtimeSession);
    expect(store.getDocument()).toBeNull();

    store.apply({ markdown: "# Active" });
    session.emitTransport({ type: "session.closed" });
    expect(store.getDocument()).toBeNull();
  });
});

describe("show_markdown tool", () => {
  it("applies validated payloads to the store", async () => {
    const store = new MarkdownStore();
    const tool = createShowMarkdownTool(store);

    const result = await tool.execute({
      documentId: "summary",
      title: "Daily Summary",
      markdown: "# Summary\n\nAll systems nominal.",
    });

    expect(result.documentId).toBe("summary");
    expect(result.title).toBe("Daily Summary");
    expect(store.getDocument()?.markdown).toContain("All systems nominal.");
  });

  it("throws when payload is invalid", async () => {
    const store = new MarkdownStore();
    const tool = createShowMarkdownTool(store);

    await expect(
      tool.execute({ markdown: "<script>alert('fail')</script>" }),
    ).rejects.toThrow("Invalid markdown payload");
  });
});
