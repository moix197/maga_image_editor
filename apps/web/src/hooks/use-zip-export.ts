"use client";

import { useState, useCallback } from "react";
import { exportProjectZip, SCHEMA_VERSION } from "@maga/projects";
import { safeRandomId } from "@/lib/id";
import type {
  BatchProject,
  GeneratedOutput,
  ProjectAsset,
  TextStyle,
  VariableSlot,
} from "@maga/projects";
import type { EditorState } from "@maga/editor";

interface ProjectState {
  background: ProjectAsset | null;
  overlays: ProjectAsset[];
  template: EditorState | null;
  variableSlot: VariableSlot | null;
  outputs: GeneratedOutput[];
  itemTextValues?: Record<string, Record<string, string>>;
  textLayerLocks?: Record<string, boolean>;
  itemTextStyles?: Record<string, Record<string, Partial<TextStyle>>>;
}

interface UseZipExportResult {
  isExporting: boolean;
  error: string | null;
  exportZip: (state: ProjectState) => Promise<void>;
}

/**
 * Assembles a portable {@link BatchProject} from the in-memory workspace state.
 * The asset `blobKey` / `outputBlobKey` fields still hold raw data URLs here;
 * `exportProjectZip` rewrites them to relative ZIP paths during serialization.
 */
function assembleProject(
  background: ProjectAsset,
  state: ProjectState,
): BatchProject {
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: safeRandomId(),
    name: "Batch project",
    createdAt: now,
    updatedAt: now,
    background,
    overlays: state.overlays,
    template: state.template ?? { nodes: [] },
    variableSlot: state.variableSlot ?? {
      overlayNodeId: "" as VariableSlot["overlayNodeId"],
      width: 0,
      height: 0,
    },
    outputs: state.outputs,
    itemTextValues: state.itemTextValues ?? {},
    textLayerLocks: state.textLayerLocks ?? {},
    itemTextStyles: state.itemTextStyles ?? {},
  };
}

/** Triggers a browser download of `blob` named `filename`, then revokes the URL. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Defer revoke to the next tick so the click-initiated download isn't
  // cancelled mid-flight by some browser engines.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Hook that gathers the workspace's data URLs, builds the project ZIP via
 * `@maga/projects`, and triggers a download. Holds `isExporting` for UI state.
 */
export function useZipExport(): UseZipExportResult {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportZip = useCallback(async (state: ProjectState) => {
    if (!state.background) return;

    setIsExporting(true);
    setError(null);
    try {
      const project = assembleProject(state.background, state);
      const overlayDataUrls = state.overlays.map((o) => o.blobKey);
      const outputDataUrls = state.outputs.map((o) => o.outputBlobKey);

      const blob = await exportProjectZip(
        project,
        state.background.blobKey,
        overlayDataUrls,
        outputDataUrls,
      );
      downloadBlob(blob, "batch-project.zip");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ZIP export failed");
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { isExporting, error, exportZip };
}
