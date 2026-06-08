"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getAdminStatus } from "@/lib/api";
import { usePollWhileVisible } from "@/lib/usePollWhileVisible";
import { CaptureDialog } from "./CaptureDialog";
import { IntentionalCaptureDialog } from "./IntentionalCaptureDialog";
import { NewMenu } from "./NewMenu";

const ADMIN_POLL_MS = 30_000;

// Primary navigation. Generative ("AI") actions are grouped separately
// so the destination links and the verbs read as two distinct clusters.
const NAV_LINKS = [
  { href: "/inbox", label: "Inbox" },
  { href: "/notes", label: "Notes" },
  { href: "/graph", label: "Graph" },
  { href: "/discover", label: "Discover" },
  { href: "/projects", label: "Projects" },
  { href: "/search", label: "Search" },
  { href: "/sources", label: "Sources" },
  { href: "/ingest", label: "Import" },
] as const;

const AI_LINKS = [
  { href: "/ask", label: "Ask" },
  { href: "/synthesize", label: "Synthesize" },
] as const;

function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({
  href,
  label,
  active,
  accent = false,
}: {
  href: string;
  label: string;
  active: boolean;
  accent?: boolean;
}) {
  const base =
    "relative h-full flex items-center text-sm whitespace-nowrap transition-colors border-b-2 -mb-px px-0.5";
  const state = active
    ? "border-indigo-600 text-gray-900 font-medium"
    : accent
      ? "border-transparent text-indigo-600 hover:text-indigo-800 font-medium"
      : "border-transparent text-gray-600 hover:text-gray-900";
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${base} ${state}`}
    >
      {label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [intentionalOpen, setIntentionalOpen] = useState(false);
  const [failedJobs, setFailedJobs] = useState(0);
  // Full-bleed routes (workspace) opt out of the centered max-w container.
  const pathname = usePathname();
  const fullBleed =
    pathname?.startsWith("/projects/") && pathname !== "/projects";

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
      <header className="border-b border-gray-200 bg-white/95 backdrop-blur sticky top-0 z-10">
        <nav className="w-full px-4 sm:px-6 h-12 flex items-center gap-4">
          <Link
            href="/"
            className="font-semibold text-indigo-700 tracking-tight whitespace-nowrap shrink-0"
          >
            Constellation
          </Link>

          {/* Destination + generative links. Scrolls horizontally on
              narrow viewports instead of clipping or wrapping. */}
          <div className="flex-1 min-w-0 flex items-center gap-5 h-full overflow-x-auto scrollbar-none">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                active={isActivePath(pathname, link.href)}
              />
            ))}
            <span aria-hidden className="h-5 w-px bg-gray-200 shrink-0" />
            {AI_LINKS.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                active={isActivePath(pathname, link.href)}
                accent
              />
            ))}
          </div>

          <Link
            href="/admin"
            aria-current={isActivePath(pathname, "/admin") ? "page" : undefined}
            className={`flex items-center gap-1 text-sm whitespace-nowrap shrink-0 transition-colors ${
              isActivePath(pathname, "/admin")
                ? "text-gray-900 font-medium"
                : "text-gray-400 hover:text-gray-700"
            }`}
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

          <div className="flex items-center gap-2 shrink-0 pl-1 border-l border-gray-200">
            <NewMenu onCreateNote={() => setIntentionalOpen(true)} />
            <button
              onClick={() => setCaptureOpen(true)}
              title="Capture (Ctrl+K)"
              className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-md font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-sm"
            >
              Capture
              <span className="hidden lg:inline opacity-60 text-xs font-mono">
                Ctrl+K
              </span>
            </button>
          </div>
        </nav>
      </header>
      <main
        className={fullBleed ? "w-full" : "max-w-4xl mx-auto px-4 sm:px-6 py-8"}
      >
        {children}
      </main>
      <CaptureDialog open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <IntentionalCaptureDialog
        open={intentionalOpen}
        onClose={() => setIntentionalOpen(false)}
      />
    </>
  );
}
