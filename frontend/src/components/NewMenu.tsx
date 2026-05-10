"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Props = {
  onCreateNote: () => void;
};

export function NewMenu({ onCreateNote }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    if (!open) return;

    function handleMouseDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKey);
    itemRefs.current[0]?.focus();
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function focusItem(index: number) {
    const items = itemRefs.current.filter(Boolean) as HTMLElement[];
    if (items.length === 0) return;
    const wrapped = (index + items.length) % items.length;
    items[wrapped]?.focus();
  }

  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    const items = itemRefs.current.filter(Boolean) as HTMLElement[];
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(current + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(items.length - 1);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  function activateNote() {
    setOpen(false);
    triggerRef.current?.focus();
    onCreateNote();
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap flex items-center gap-1"
      >
        + New
        <span aria-hidden className="text-xs">▾</span>
      </button>
      {open && (
        <ul
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded shadow-md z-20 py-1"
        >
          <li role="none">
            <button
              ref={(el) => {
                itemRefs.current[0] = el;
              }}
              role="menuitem"
              type="button"
              onClick={activateNote}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
            >
              <span>Note</span>
              <kbd className="text-xs font-mono opacity-50">Ctrl+⇧+Space</kbd>
            </button>
          </li>
          <li role="none">
            <Link
              ref={(el) => {
                itemRefs.current[1] = el;
              }}
              role="menuitem"
              href="/nodes/new/structure"
              onClick={() => setOpen(false)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
            >
              <span>Structure note</span>
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}
