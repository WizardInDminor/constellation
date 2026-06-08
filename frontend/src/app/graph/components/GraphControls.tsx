"use client";

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export function GraphControls({ onZoomIn, onZoomOut, onFit }: Props) {
  const buttonClass =
    "flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 bg-gray-800 text-gray-200 shadow-sm transition-colors hover:border-gray-600 hover:bg-gray-700";

  return (
    <div
      className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5"
      role="group"
      aria-label="Graph zoom controls"
    >
      <button
        onClick={onFit}
        title="Fit to screen"
        aria-label="Fit graph to screen"
        className={`${buttonClass} font-mono text-xs`}
      >
        <span aria-hidden="true">⊡</span>
      </button>
      <button
        onClick={onZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
        className={`${buttonClass} text-lg leading-none`}
      >
        <span aria-hidden="true">+</span>
      </button>
      <button
        onClick={onZoomOut}
        title="Zoom out"
        aria-label="Zoom out"
        className={`${buttonClass} text-lg leading-none`}
      >
        <span aria-hidden="true">−</span>
      </button>
    </div>
  );
}
