import { act, render, screen, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import Providers from "../../app/providers";
import { ChatClient } from "../../app/chat-client";
import type { MarkdownStore } from "../../app/lib/markdown-store";

expect.extend(toHaveNoViolations);

declare global {
  // eslint-disable-next-line no-var
  var __vibeMarkdownStore: MarkdownStore | undefined;
  interface Window {
    __vibeMarkdownStore?: MarkdownStore;
  }
}

const ensureMatchMedia = () => {
  if (typeof window === "undefined") {
    return;
  }
  if (!window.matchMedia) {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  }
};

describe("Markdown viewer accessibility", () => {
  beforeAll(() => {
    ensureMatchMedia();
  });

  it("passes axe checks with rendered tables and math", async () => {
    const { container } = render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    await waitFor(() => expect(globalThis.__vibeMarkdownStore).toBeDefined());

    const store = globalThis.__vibeMarkdownStore;
    expect(store).toBeDefined();

    await act(async () => {
      await store?.apply({
        title: "Accessibility Doc",
        markdown: `# Accessibility Doc\n\n| Column | Value |\n| ------ | ----- |\n| Foo | 1 |\n\nInline math $a^2 + b^2 = c^2$`,
      });
    });

    await screen.findByTestId("markdown-viewer");

    const results = await axe(container, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });

    expect(results).toHaveNoViolations();
  });
});
