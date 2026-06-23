import { Images, Layout, GalleryHorizontalEnd } from "lucide-react";
import type React from "react";

export type WorkspaceSection = "assets" | "template" | "results";

export const SECTIONS: { id: WorkspaceSection; label: string; Icon: React.ElementType }[] = [
  { id: "assets", label: "Assets", Icon: Images },
  { id: "template", label: "Template", Icon: Layout },
  { id: "results", label: "Results", Icon: GalleryHorizontalEnd },
];

const VALID_SECTIONS: WorkspaceSection[] = ["assets", "template", "results"];

export function resolveSection(param: string | null): WorkspaceSection {
  return VALID_SECTIONS.includes(param as WorkspaceSection) ? (param as WorkspaceSection) : "assets";
}
