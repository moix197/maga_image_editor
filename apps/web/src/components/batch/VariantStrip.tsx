"use client";

import type { ProjectAsset } from "@maga/projects";

interface VariantStripProps {
  overlays: ProjectAsset[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Pure presentational strip of overlay thumbnails.
 * Clicking any thumbnail fires onSelect(id) — no internal state, no data fetching.
 */
export function VariantStrip({ overlays, activeId, onSelect }: VariantStripProps) {
  if (overlays.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Overlay variants"
      className="flex flex-wrap gap-2 rounded-md border border-border bg-muted/40 p-2"
    >
      {overlays.map((overlay, index) => {
        const isActive = overlay.id === activeId;
        return (
          <button
            key={overlay.id}
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
            {isActive && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-[4px] ring-2 ring-inset ring-primary pointer-events-none"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
