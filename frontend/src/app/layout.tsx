import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Constellation",
  description: "Personal knowledge graph",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
