import { createElement, type ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export type RenderMarkdownOptions = {
  /**
   * Optional class name passed through to the rendered container.
   * Useful for theming in client components.
   */
  className?: string;
};

const baseComponents: Components = {
  a({ children, ...props }) {
    return createElement(
      "a",
      {
        ...props,
        target: props.target ?? "_blank",
        rel: props.rel ?? "noreferrer noopener",
      },
      children,
    );
  },
  table({ children, ...props }) {
    return createElement("table", props, children);
  },
  code({ inline, className, children, ...props }) {
    if (inline) {
      return createElement(
        "code",
        { className, ...props },
        children,
      );
    }

    return createElement(
      "pre",
      null,
      createElement("code", { className, ...props }, children),
    );
  },
};

/**
 * Convert Markdown content into a React element suitable for immediate rendering.
 * Math blocks use KaTeX and raw HTML within the Markdown source is escaped.
 */
export function renderMarkdown(
  markdown: string,
  options: RenderMarkdownOptions = {},
): ReactElement {
  const trimmed = typeof markdown === "string" ? markdown.trim() : "";
  const normalized = normalizeSquareBracketMath(trimmed);

  return createElement(
    ReactMarkdown,
    {
      remarkPlugins: [remarkGfm, remarkMath],
      rehypePlugins: [rehypeKatex],
      components: baseComponents,
      skipHtml: true,
      children: normalized,
    },
  );
}

const squareBracketMathPattern = /\[(?<expr>[^\[\]\n]{1,256})\](?!\()/g;
const mathSignalPattern = /[=^_\\]/;

function normalizeSquareBracketMath(source: string): string {
  return source.replace(squareBracketMathPattern, (match, expr) => {
    if (!expr || !mathSignalPattern.test(expr)) {
      return match;
    }

    const trimmed = expr.trim();
    if (!trimmed) {
      return match;
    }

    return '$' + trimmed + '$';
  });
}
