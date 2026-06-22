import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Batch Workspace | MAGA Image Editor",
  description: "Upload background and overlay images to batch-composite.",
};

// The workspace side nav is rendered inside BatchWorkspace's 3-column shell
// (under the topbar), so the layout is just a full-height container.
// h-screen (definite height) — not min-h-screen — so the child h-full chain
// (page.tsx → BatchWorkspace shell) resolves and fills the viewport.
export default function BatchLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex h-screen flex-col overflow-hidden">
      {children}
    </main>
  );
}
