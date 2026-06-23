"use client";

import type { ProjectAsset } from "@maga/projects";

interface VariantStripProps {
  overlays: ProjectAsset[];
  activeId: string | null;
  onSelect: (id: string) => void;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

/**
 * Pure presentational strip of overlay thumbnails.
 * Clicking any thumbnail fires onSelect(id).
 * Each thumbnail has a checkbox for multi-select fan-out editing.
 */
export function VariantStrip({ overlays, activeId, onSelect, selectedIds, onSelectionChange }: VariantStripProps) {
  if (overlays.length === 0) return null;

  const allIds = overlays.map((o) => o.id);
  const allSelected = selectedIds.size === allIds.length;

  function handleSelectAll() {
    if (allSelected) {
      onSelectionChange(new Set(activeId ? [activeId] : []));
    } else {
      onSelectionChange(new Set(allIds));
    }
  }

  function handleCheckboxChange(id: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    onSelectionChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <input
          type="checkbox"
          id="variant-select-all"
          className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
          checked={allSelected}
          onChange={handleSelectAll}
          aria-label="Select all variants"
        />
        <label htmlFor="variant-select-all" className="cursor-pointer text-xs text-muted-foreground select-none">
          Select all
        </label>
      </div>
      <div
        role="listbox"
        aria-label="Overlay variants"
        aria-multiselectable="true"
        className="flex flex-wrap gap-2 rounded-md border border-border bg-muted/40 p-2"
      >
        {overlays.map((overlay, index) => {
          const isActive = overlay.id === activeId;
          const isChecked = selectedIds.has(overlay.id);
          return (
            <div key={overlay.id} className="relative">
              <button
                role="option"
                aria-selected={isActive}
                aria-label={overlay.filename || `Variant ${index + 1}`}
                onClick={() => onSelect(overlay.id)}
                className={[
                  "group relative h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  isActive
                    ? "border-primary shadow-sm"
                    : "border-transparent hover:border-border",
                ].join(" ")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={overlay.blobKey}
                  alt={overlay.filename || `Variant ${index + 1}`}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </button>
              <input
                type="checkbox"
                className="h-4 w-4 cursor-pointer rounded border-border accent-primary absolute top-0.5 left-0.5"
                checked={isChecked}
                disabled={isActive}
                aria-label={`Select variant ${overlay.filename || index + 1}`}
                onChange={(e) => handleCheckboxChange(overlay.id, e.target.checked)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
