import { createElement, type ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { renderToString as renderMathToString } from "katex";

export type RenderMarkdownOptions = {
  /**
   * Optional class name passed through to the rendered container.
   * Useful for theming in client components.
   */
  className?: string;
};

const mathComponents: Components = {
  math({ value }) {
    const html = renderMathToString(value ?? "", {
      displayMode: true,
      throwOnError: false,
      strict: "warn",
      trust: false,
      output: "html",
    });

    return createElement("span", {
      className: "vc-katex vc-katex-block",
      role: "img",
      "aria-label": value ?? "",
      "data-katex-display": "block",
      dangerouslySetInnerHTML: { __html: html },
      "data-katex-source": value ?? "",
    });
  },
  inlineMath({ value }) {
    const html = renderMathToString(value ?? "", {
      displayMode: false,
      throwOnError: false,
      strict: "warn",
      trust: false,
      output: "html",
    });

    return createElement("span", {
      className: "vc-katex vc-katex-inline",
      role: "img",
      "aria-label": value ?? "",
      "data-katex-display": "inline",
      dangerouslySetInnerHTML: { __html: html },
      "data-katex-source": value ?? "",
    });
  },
};

const baseComponents: Components = {
  ...mathComponents,
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

  return createElement(
    ReactMarkdown,
    {
      className: options.className,
      remarkPlugins: [remarkGfm, remarkMath],
      components: baseComponents,
      skipHtml: true,
      linkTarget: "_blank",
      children: trimmed,
    },
  );
}
