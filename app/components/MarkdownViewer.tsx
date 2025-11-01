import { useMemo } from "react";
import type { MarkdownDocument } from "../lib/markdown-store";
import styles from "./markdown-viewer.module.css";

export type MarkdownViewerProps = {
  document: MarkdownDocument | null;
  isLoading?: boolean;
};

export function MarkdownViewer({ document, isLoading = false }: MarkdownViewerProps) {
  const body = useMemo(() => document?.rendered ?? null, [document]);

  if (!document) {
    return null;
  }

  return (
    <article
      key={document.id}
      className={styles.markdown}
      data-testid="markdown-viewer"
      aria-label={document.title ?? "Markdown document"}
      tabIndex={0}
      data-loading={isLoading ? "true" : "false"}
    >
      {body}
    </article>
  );
}
