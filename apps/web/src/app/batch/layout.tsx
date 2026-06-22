import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Batch Workspace | MAGA Image Editor",
  description: "Upload background and overlay images to batch-composite.",
};

// The workspace side nav is rendered inside BatchWorkspace's 3-column shell
// (under the topbar), so the layout is just a full-height container.
export default function BatchLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col overflow-y-auto">
      {children}
    </main>
  );
}
