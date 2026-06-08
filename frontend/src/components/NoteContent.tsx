"use client";

/**
 * Canonical renderer for all note body content in the app.
 *
 * Every surface that displays a note's `content` or `summary` text must go
 * through this component — note detail, inbox, the process page, RAG answers,
 * the graph side panel, and the narrative surfaces. See ADR-034.
 *
 * Rendering contract:
 *   - GitHub-flavored markdown via `remark-gfm`.
 *   - LaTeX math via `remark-math` + `rehype-katex` (KaTeX). Inline math uses
 *     `$...$`; display math uses `$$...$$`. KaTeX CSS is imported globally in
 *     `app/layout.tsx`.
 *   - Fenced ```mermaid``` blocks render inline as diagrams via `<MermaidBlock>`.
 *     All other fenced code blocks fall through to react-markdown's default
 *     `<code>` treatment, preserving the existing monospace block rendering.
 */

import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// `mermaid` pulls in a heavyweight browser-only runtime. Disable SSR so the
// server bundle stays lean and we don't crash on `window` during the initial
// render pass.
const MermaidBlock = dynamic(
  () => import("./MermaidBlock").then((m) => m.MermaidBlock),
  { ssr: false },
);

interface NoteContentProps {
  content: string;
  className?: string;
}

export function NoteContent({ content, className }: NoteContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code(props) {
            const { className, children, ...rest } = props as {
              className?: string;
              children?: React.ReactNode;
            };
            const match = /language-(\w+)/.exec(className ?? "");
            // react-markdown emits both inline `<code>` and fenced-block
            // `<code>` through the same component. We only special-case
            // fenced mermaid blocks (those carry a `language-mermaid` class).
            // Everything else falls through to the default treatment so the
            // existing code-block syntax rendering is preserved.
            if (match && match[1] === "mermaid") {
              const raw =
                typeof children === "string"
                  ? children
                  : Array.isArray(children)
                    ? children.join("")
                    : "";
              return <MermaidBlock code={raw.replace(/\n$/, "")} />;
            }
            return (
              <code className={className} {...rest}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
