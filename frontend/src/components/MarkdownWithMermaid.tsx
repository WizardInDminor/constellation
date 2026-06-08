"use client";

/**
 * Drop-in replacement for `<ReactMarkdown>` that detects fenced
 * `mermaid` code blocks and renders them inline as diagrams via
 * `<MermaidBlock>`. All other fenced code blocks pass through to
 * react-markdown's default `<code>` rendering — the existing
 * monospace block treatment is preserved.
 *
 * Use this everywhere prose can contain a diagram: note detail view,
 * /ask answer, /synthesize answer, and the workspace Ask result panel.
 */

import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// `mermaid` pulls in a heavyweight runtime that's browser-only. Disable
// SSR so the server bundle stays lean and we don't crash on `window`
// references during the initial render pass.
const MermaidBlock = dynamic(
  () => import("./MermaidBlock").then((m) => m.MermaidBlock),
  { ssr: false },
);

interface Props {
  children: string;
}

export function MarkdownWithMermaid({ children }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code(props) {
          const { className, children, ...rest } = props as {
            className?: string;
            children?: React.ReactNode;
          };
          const match = /language-(\w+)/.exec(className ?? "");
          // react-markdown emits both inline `<code>` and fenced-block
          // `<code>` through the same component. We only handle fenced
          // blocks (those carry a `language-…` class). Inline code falls
          // through to the default treatment.
          if (match && match[1] === "mermaid") {
            const raw =
              typeof children === "string"
                ? children
                : Array.isArray(children)
                  ? children.join("")
                  : "";
            return <MermaidBlock code={raw.replace(/\n$/, "")} />;
          }
          // Inline code (no language- class) gets a subtle chip; fenced
          // blocks keep their language class so block styling can target it.
          const inlineClass = match
            ? className
            : `${className ?? ""} rounded bg-gray-100 px-1 py-0.5 text-[0.85em] font-mono text-gray-800`.trim();
          return (
            <code className={inlineClass} {...rest}>
              {children}
            </code>
          );
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
