import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Batch Compositing | MAGA Image Editor",
  description: "Upload background and overlay images to batch-composite.",
};

export default function BatchLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
