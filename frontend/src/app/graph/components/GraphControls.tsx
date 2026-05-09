"use client";

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export function GraphControls({ onZoomIn, onZoomOut, onFit }: Props) {
  return (
    <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10">
      <button
        onClick={onFit}
        title="Fit to screen"
        className="w-8 h-8 flex items-center justify-center rounded bg-gray-800 border border-gray-600 text-gray-200 hover:bg-gray-700 text-xs font-mono"
      >
        ⊡
      </button>
      <button
        onClick={onZoomIn}
        title="Zoom in"
        className="w-8 h-8 flex items-center justify-center rounded bg-gray-800 border border-gray-600 text-gray-200 hover:bg-gray-700 text-lg leading-none"
      >
        +
      </button>
      <button
        onClick={onZoomOut}
        title="Zoom out"
        className="w-8 h-8 flex items-center justify-center rounded bg-gray-800 border border-gray-600 text-gray-200 hover:bg-gray-700 text-lg leading-none"
      >
        −
      </button>
    </div>
  );
}
