import type { ReactNode } from "react";
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

jest.mock("react-markdown", () => {
  const React: typeof import("react") = require("react");

  const parseInline = (
    text: string,
    components: Record<string, any>,
    keyPrefix: string,
  ): ReactNode => {
    const nodes: ReactNode[] = [];
    const regex = /\$([^$]+)\$/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let inlineIndex = 0;

    while ((match = regex.exec(text))) {
      if (match.index > lastIndex) {
        nodes.push(text.slice(lastIndex, match.index));
      }
      const value = match[1];
      const key = `${keyPrefix}-inline-${inlineIndex}`;
      inlineIndex += 1;

      if (typeof components.inlineMath === "function") {
        nodes.push(
          components.inlineMath({
            key,
            value,
            children: value,
          }),
        );
      } else {
        nodes.push(
          React.createElement(
            "span",
            { key, "data-inline-math": value },
            value,
          ),
        );
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex));
    }

    return nodes.length === 1 ? nodes[0] : nodes;
  };

  const MockReactMarkdown = (props: {
    children?: string;
    components?: Record<string, any>;
    className?: string;
  }) => {
    const { children = "", components = {}, className } = props;
    const blocks = String(children).trim().split(/\n{2,}/);
    const elements: ReactNode[] = [];

    blocks.forEach((rawBlock, blockIndex) => {
      const block = rawBlock.trim();
      if (!block) {
        return;
      }

      if (block.startsWith("```")) {
        const [, ...rest] = block.split("\n");
        const code = rest.join("\n").replace(/```$/, "").trim();
        const codeNode = components.code
          ? components.code({
              inline: false,
              className: undefined,
              children: code,
            })
          : React.createElement("code", null, code);
        elements.push(
          React.createElement(
            "pre",
            { key: `code-${blockIndex}` },
            codeNode,
          ),
        );
        return;
      }

      if (/^\$\$[\s\S]*\$\$$/.test(block)) {
        const value = block.replace(/^\$\$|\$\$$/g, "").trim();
        if (typeof components.math === "function") {
          elements.push(
            components.math({
              key: `math-${blockIndex}`,
              value,
              children: value,
            }),
          );
        }
        return;
      }

      if (block.startsWith("# ")) {
        elements.push(
          React.createElement(
            "h1",
            { key: `h1-${blockIndex}` },
            parseInline(block.slice(2).trim(), components, `h1-${blockIndex}`),
          ),
        );
        return;
      }

      if (block.startsWith("- ")) {
        const items = block
          .split("\n")
          .map((line) => line.replace(/^-+\s*/, "").trim())
          .filter(Boolean)
          .map((item, itemIndex) =>
            React.createElement(
              "li",
              { key: `li-${blockIndex}-${itemIndex}` },
              parseInline(item, components, `li-${blockIndex}-${itemIndex}`),
            ),
          );

        elements.push(
          React.createElement("ul", { key: `list-${blockIndex}` }, items),
        );
        return;
      }

      if (block.includes("|")) {
        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        if (lines.length >= 2 && /^[-:| ]+$/.test(lines[1])) {
          const parseRow = (line: string, cellTag: "th" | "td", rowIndex: number) => {
            const cells = line
              .split("|")
              .map((cell) => cell.trim())
              .filter((cell, index, arr) => {
                if ((index === 0 || index === arr.length - 1) && cell === "") {
                  return false;
                }
                return true;
              });

            return React.createElement(
              "tr",
              { key: `row-${blockIndex}-${rowIndex}` },
              cells.map((cell, cellIndex) =>
                React.createElement(
                  cellTag,
                  { key: `cell-${blockIndex}-${rowIndex}-${cellIndex}` },
                  parseInline(cell, components, `cell-${blockIndex}-${rowIndex}-${cellIndex}`),
                ),
              ),
            );
          };

          const header = parseRow(lines[0], "th", 0);
          const bodyRows = lines
            .slice(2)
            .map((line, rowIndex) => parseRow(line, "td", rowIndex + 1));

          elements.push(
            React.createElement(
              "table",
              { key: `table-${blockIndex}` },
              React.createElement("thead", null, header),
              React.createElement("tbody", null, bodyRows),
            ),
          );
          return;
        }
      }

      const inline = parseInline(block, components, `p-${blockIndex}`);
      elements.push(
        React.createElement("p", { key: `p-${blockIndex}` }, inline),
      );
    });

    return React.createElement(
      "div",
      { className: className ?? undefined, "data-testid": "mock-react-markdown" },
      elements,
    );
  };

  return MockReactMarkdown;
});

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
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("console.log('hello');")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    const inlineMath = container.querySelector('[data-katex-source="E = mc^2"]');
    expect(inlineMath).toBeTruthy();
    const blockMath = container.querySelector('[data-katex-display="block"]');
    expect(blockMath).toBeTruthy();
    expect(blockMath?.getAttribute("data-katex-source")?.replace(/\s+/g, " ")).toBe(
      "c = \\\\pm\\\\sqrt{a^2 + b^2}",
    );
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
