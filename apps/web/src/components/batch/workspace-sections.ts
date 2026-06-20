import { Images, Layout, Type, GalleryHorizontalEnd } from "lucide-react";
import type React from "react";

export type WorkspaceSection = "assets" | "template" | "text" | "results";

export const SECTIONS: { id: WorkspaceSection; label: string; Icon: React.ElementType }[] = [
  { id: "assets", label: "Assets", Icon: Images },
  { id: "template", label: "Template", Icon: Layout },
  { id: "text", label: "Text", Icon: Type },
  { id: "results", label: "Results", Icon: GalleryHorizontalEnd },
];

const VALID_SECTIONS: WorkspaceSection[] = ["assets", "template", "text", "results"];

export function resolveSection(param: string | null): WorkspaceSection {
  return VALID_SECTIONS.includes(param as WorkspaceSection) ? (param as WorkspaceSection) : "assets";
}
