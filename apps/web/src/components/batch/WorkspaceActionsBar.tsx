"use client";

import { Button } from "@/components/ui/button";

export interface WorkspaceActionsBarProps {
  // Primary actions
  onGeneratePreview: () => void;
  onGenerateAll: () => void;
  onCancel: () => void;
  // Secondary actions
  onImportZip: () => void;
  onExportZip: () => void;
  onClearProject: () => void;
  // Disabled states
  generatePreviewDisabled?: boolean;
  generateAllDisabled?: boolean;
  cancelDisabled?: boolean;
  importZipDisabled?: boolean;
  exportZipDisabled?: boolean;
  clearProjectDisabled?: boolean;
  // Tooltip hints shown when buttons are disabled
  generatePreviewTitle?: string;
  generateAllTitle?: string;
}

export function WorkspaceActionsBar({
  onGeneratePreview,
  onGenerateAll,
  onCancel,
  onImportZip,
  onExportZip,
  onClearProject,
  generatePreviewDisabled = false,
  generateAllDisabled = false,
  cancelDisabled = false,
  importZipDisabled = false,
  exportZipDisabled = false,
  clearProjectDisabled = false,
  generatePreviewTitle,
  generateAllTitle,
}: WorkspaceActionsBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Workspace actions"
      className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2"
    >
      {/* Primary group */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="default"
          size="sm"
          disabled={generatePreviewDisabled}
          onClick={onGeneratePreview}
          aria-label="Generate preview"
          title={generatePreviewDisabled ? generatePreviewTitle : undefined}
        >
          Generate Preview
        </Button>
        <Button
          variant="default"
          size="sm"
          disabled={generateAllDisabled}
          onClick={onGenerateAll}
          aria-label="Generate all"
          title={generateAllDisabled ? generateAllTitle : undefined}
        >
          Generate All
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={cancelDisabled}
          onClick={onCancel}
          aria-label="Cancel generation"
        >
          Cancel
        </Button>
      </div>

      <div className="h-6 w-px bg-border" aria-hidden="true" />

      {/* Secondary group */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={importZipDisabled}
          onClick={onImportZip}
          aria-label="Import ZIP"
        >
          Import ZIP
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={exportZipDisabled}
          onClick={onExportZip}
          aria-label="Export ZIP"
        >
          Export ZIP
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={clearProjectDisabled}
          onClick={onClearProject}
          aria-label="Clear project"
        >
          Clear Project
        </Button>
      </div>
    </div>
  );
}
