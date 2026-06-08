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
        className="btn btn-ghost btn-sm whitespace-nowrap"
      >
        + New
        <span aria-hidden className="text-xs">
          ▾
        </span>
      </button>
      {open && (
        <ul
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className="card absolute right-0 z-20 mt-1 w-56 py-1 shadow-lg"
        >
          <li role="none">
            <button
              ref={(el) => {
                itemRefs.current[0] = el;
              }}
              role="menuitem"
              type="button"
              onClick={activateNote}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none"
            >
              <span>Note</span>
              <kbd className="font-mono text-xs text-gray-400">
                Ctrl+⇧+Space
              </kbd>
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
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none"
            >
              <span>Structure note</span>
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}
