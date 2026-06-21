import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WorkspaceSideNav } from "@/components/batch/WorkspaceSideNav";

export const metadata: Metadata = {
  title: "Batch Workspace | MAGA Image Editor",
  description: "Upload background and overlay images to batch-composite.",
};

export default function BatchLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <WorkspaceSideNav />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
