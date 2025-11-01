import { act, render, screen, within, waitFor } from "@testing-library/react";
import Providers from "../../app/providers";
import { ChatClient } from "../../app/chat-client";
import { MarkdownViewer } from "../../app/components/MarkdownViewer";
import type { MarkdownDocument, MarkdownStore } from "../../app/lib/markdown-store";
import { renderMarkdown } from "../../app/lib/markdown/renderer";
import type { RealtimeSession } from "@openai/agents/realtime";

jest.mock("@openai/agents/realtime", () => {
  const tool = jest.fn().mockImplementation(
    ({
      name,
      description,
      parameters,
      execute,
    }: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
      execute: (input: unknown) => Promise<unknown> | unknown;
    }) => {
      const invoke = jest.fn(async (input: unknown) => execute(input));
      return {
        type: "function",
        name,
        description,
        parameters,
        strict: true,
        invoke,
        execute,
        needsApproval: jest.fn(),
        isEnabled: jest.fn(),
      };
    },
  );

  class MockRealtimeSession {
    connect = jest.fn();
    close = jest.fn();
    mute = jest.fn();
    on = jest.fn();
    off = jest.fn();
    history: unknown[] = [];
    muted: boolean | null = false;
  }

  return {
    tool,
    RealtimeAgent: jest.fn().mockImplementation(() => ({})),
    RealtimeSession: jest.fn().mockImplementation(() => new MockRealtimeSession()),
    OpenAIRealtimeWebRTC: jest.fn().mockImplementation(() => ({})),
  };
});

type TestDocumentOptions = {
  id?: string;
  title?: string | null;
  markdown?: string;
  updatedAt?: number;
};

const createTestDocument = (options: TestDocumentOptions = {}): MarkdownDocument => {
  const markdown =
    options.markdown
    ?? `# Quarterly Summary

- Revenue increased by **24%**
- Expansion into LATAM markets

| Region | Q1 | Q2 |
| ------ | --- | --- |
| NA | 12.4 | 13.1 |
| LATAM | 3.1 | 4.8 |

Inline math $E = mc^2$ and block math:

$$
\\frac{a}{b} = \\sum_{n=1}^{\\infty} x_n
$$
`;

  return {
    id: options.id ?? "doc-1",
    title: options.title ?? "Quarterly Summary",
    markdown,
    rendered: renderMarkdown(markdown),
    bytes: new TextEncoder().encode(markdown).byteLength,
    updatedAt: options.updatedAt ?? Date.now(),
  };
};

describe("MarkdownViewer component", () => {
  it("renders nothing when idle", () => {
    const { container } = render(<MarkdownViewer document={null} />);
    expect(container.querySelector('[data-testid="markdown-viewer"]')).toBeNull();
  });

  it("remains hidden while loading without a document", () => {
    const { container } = render(<MarkdownViewer document={null} isLoading />);
    expect(container.querySelector('[data-testid="markdown-viewer"]')).toBeNull();
  });

  it("renders supplied markdown with tables and math fallbacks", () => {
    const doc = createTestDocument({ updatedAt: 0 });
    const { container } = render(<MarkdownViewer document={doc} />);

    const viewer = screen.getByTestId("markdown-viewer");
    const heading = within(viewer).getByRole("heading", { level: 1, name: /quarterly summary/i });
    expect(heading).toBeInTheDocument();
    expect(within(viewer).getByRole("table")).toBeInTheDocument();

    const katexInline = viewer.querySelector('.katex');
    expect(katexInline).toBeTruthy();
  });

  it("supports RTL layout without losing scroll affordance", () => {
    const doc = createTestDocument({ updatedAt: 0 });
    render(
      <div dir="rtl">
        <MarkdownViewer document={doc} />
      </div>,
    );

    const viewer = screen.getByTestId("markdown-viewer");
    expect(viewer).toHaveAttribute("tabindex", "0");
    expect(within(viewer).getByText(/revenue increased/i)).toBeInTheDocument();
  });
});

declare global {
  // eslint-disable-next-line no-var
  var __vibeMarkdownStore: MarkdownStore | undefined;
  interface Window {
    __vibeMarkdownStore?: MarkdownStore;
  }
}

describe("ChatClient markdown viewer integration", () => {
  it("updates viewer when store receives markdown and clears on reset", async () => {
    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    await waitFor(() => expect(globalThis.__vibeMarkdownStore).toBeDefined());

    const store = globalThis.__vibeMarkdownStore;
    expect(store).toBeDefined();

    let transportListener: ((payload: unknown) => void) | undefined;
    const sessionStub: Pick<RealtimeSession, "on" | "off"> = {
      on: jest.fn((event, listener) => {
        if (event === "transport_event") {
          transportListener = listener;
        }
      }),
      off: jest.fn((event, listener) => {
        if (event === "transport_event" && transportListener === listener) {
          transportListener = undefined;
        }
      }),
    };

    await act(async () => {
      await store?.setSession(sessionStub as RealtimeSession);
    });

    const markdown = `
# Live Update

| Metric | Value |
| ------ | ----- |
| Users  | 1280 |

Inline math $a^2 + b^2 = c^2$
`;

    await act(async () => {
      await store?.apply({
        markdown,
        title: "Live Update",
      });
    });

    expect(await screen.findByRole("article", { name: /live update/i })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();

    await act(async () => {
      transportListener?.({ type: "session.closed" });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("markdown-viewer")).toBeNull();
    });
  });
});
