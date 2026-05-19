"use client";

/**
 * Renders a single mermaid fence as an SVG. Errors render the raw source
 * with a visible error indicator rather than crashing the surrounding view.
 *
 * Exposes a ref-friendly access pattern so PNG export can grab the SVG
 * after a successful render (see useMermaidExport in this module).
 */

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

// Initialize once per process. `securityLevel: "loose"` is required for
// embedded links inside diagrams to render — fine for first-party content.
let initialized = false;
function ensureInit() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "loose",
    fontFamily: "inherit",
  });
  initialized = true;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `mermaid-${Date.now()}-${idCounter}`;
}

interface Props {
  code: string;
}

export function MermaidBlock({ code }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Each render gets a fresh ID — mermaid.render mutates DOM by id.
  const idRef = useRef<string>(nextId());

  useEffect(() => {
    ensureInit();
    let cancelled = false;
    setError(null);
    setSvg(null);
    // Reset id on each render attempt so failed renders don't poison reuse.
    idRef.current = nextId();
    (async () => {
      try {
        const { svg } = await mermaid.render(idRef.current, code);
        if (!cancelled) setSvg(svg);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to render diagram");
          // Mermaid sometimes leaves an orphan element in the DOM on parse
          // failure. Clean it up so subsequent renders aren't confused.
          const orphan = document.getElementById(idRef.current);
          orphan?.remove();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div
        className="my-3 rounded border border-rose-200 bg-rose-50 p-3 text-xs"
        data-mermaid-error="true"
      >
        <p className="font-medium text-rose-700 mb-1">Mermaid parse error</p>
        <p className="text-rose-600 mb-2">{error}</p>
        <pre className="bg-white border border-rose-100 rounded p-2 overflow-x-auto text-rose-900 font-mono">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-mermaid="true"
      className="my-3 flex justify-center overflow-x-auto"
      // SVG is trusted: it comes from mermaid.render against our own input.
      // securityLevel: "loose" is documented in ensureInit.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// PNG export helper — finds rendered mermaid SVGs within a container,
// rasterises one to PNG, triggers download. Returns false if no SVG found.
// ---------------------------------------------------------------------------

export async function exportMermaidPngFromContainer(
  container: HTMLElement,
  filename: string,
): Promise<boolean> {
  const svg = container.querySelector<SVGSVGElement>(
    '[data-mermaid="true"] svg',
  );
  if (!svg) return false;

  // Clone so we can set explicit dimensions without disturbing the live SVG.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const bbox = svg.getBBox();
  const width = Math.max(bbox.width || svg.clientWidth || 600, 200);
  const height = Math.max(bbox.height || svg.clientHeight || 400, 200);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const xml = new XMLSerializer().serializeToString(clone);
  const blobUrl = URL.createObjectURL(
    new Blob([xml], { type: "image/svg+xml" }),
  );

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not load SVG"));
      img.src = blobUrl;
    });

    // Render at 2x for crisper output on hi-DPI displays.
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
