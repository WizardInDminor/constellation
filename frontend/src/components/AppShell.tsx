"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CaptureDialog } from "./CaptureDialog";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [captureOpen, setCaptureOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setCaptureOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <nav className="max-w-4xl mx-auto px-4 h-12 flex items-center gap-6">
          <Link href="/" className="font-semibold text-indigo-700 tracking-tight">
            Constellation
          </Link>
          <Link href="/inbox" className="text-sm text-gray-600 hover:text-gray-900">
            Inbox
          </Link>
          <Link
            href="/nodes/new/structure"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            + Structure note
          </Link>
          <button
            onClick={() => setCaptureOpen(true)}
            className="ml-auto text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 flex items-center gap-1.5"
          >
            Capture{" "}
            <span className="opacity-60 text-xs font-mono">Ctrl+K</span>
          </button>
        </nav>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
      <CaptureDialog open={captureOpen} onClose={() => setCaptureOpen(false)} />
    </>
  );
}
