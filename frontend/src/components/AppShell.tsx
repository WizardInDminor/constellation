"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getAdminStatus } from "@/lib/api";
import { usePollWhileVisible } from "@/lib/usePollWhileVisible";
import { CaptureDialog } from "./CaptureDialog";
import { IntentionalCaptureDialog } from "./IntentionalCaptureDialog";
import { NewMenu } from "./NewMenu";

const ADMIN_POLL_MS = 30_000;

export function AppShell({ children }: { children: React.ReactNode }) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [intentionalOpen, setIntentionalOpen] = useState(false);
  const [failedJobs, setFailedJobs] = useState(0);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === " " && e.ctrlKey && e.shiftKey && !e.altKey) {
        e.preventDefault();
        setIntentionalOpen(true);
      } else if (e.key === "k" && e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setCaptureOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    getAdminStatus()
      .then((s) => setFailedJobs(s.failed_jobs))
      .catch(() => {});
  }, []);

  usePollWhileVisible(() => {
    getAdminStatus()
      .then((s) => setFailedJobs(s.failed_jobs))
      .catch(() => {});
  }, ADMIN_POLL_MS);

  return (
    <>
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <nav className="w-full px-6 h-12 flex flex-nowrap items-center gap-6">
          <Link href="/" className="font-semibold text-indigo-700 tracking-tight whitespace-nowrap">
            Constellation
          </Link>
          <Link href="/inbox" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">
            Inbox
          </Link>
          <Link href="/notes" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">
            Notes
          </Link>
          <Link href="/graph" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">
            Graph
          </Link>
          <Link href="/discover" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">
            Discover
          </Link>
          <Link href="/search" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">
            Search
          </Link>
          <Link href="/sources" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">
            Sources
          </Link>
          <Link href="/ingest" className="text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap">
            Import
          </Link>
          <Link href="/ask" className="text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap">
            Ask
          </Link>
          <Link href="/synthesize" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 whitespace-nowrap">
            Synthesize
          </Link>
          <Link
            href="/admin"
            className="ml-auto flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 whitespace-nowrap"
            title="Operability dashboard"
          >
            Admin
            {failedJobs > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 text-[10px] font-semibold text-white bg-red-500 rounded-full"
                aria-label={`${failedJobs} failed embedding jobs`}
              >
                {failedJobs}
              </span>
            )}
          </Link>
          <div className="flex flex-nowrap items-center gap-2">
            <NewMenu onCreateNote={() => setIntentionalOpen(true)} />
            <button
              onClick={() => setCaptureOpen(true)}
              title="Capture (Ctrl+K)"
              className="text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 flex items-center gap-1.5 whitespace-nowrap"
            >
              Capture
              <span className="hidden lg:inline opacity-60 text-xs font-mono">Ctrl+K</span>
            </button>
          </div>
        </nav>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
      <CaptureDialog open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <IntentionalCaptureDialog open={intentionalOpen} onClose={() => setIntentionalOpen(false)} />
    </>
  );
}
