"use client";

import { useState } from "react";
import type { ProjectAsset } from "@maga/projects";

interface AssetListProps {
  label: string;
  assets: ProjectAsset[];
  onReorder?: (newOrder: ProjectAsset[]) => void;
}

export function AssetList({ label, assets, onReorder }: AssetListProps) {
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);

  if (assets.length === 0) return null;

  function handleDragStart(idx: number) {
    setDragSrcIdx(idx);
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    if (!onReorder) return;
    e.preventDefault();
    setDropTargetIdx(idx);
  }

  function handleDragLeave() {
    setDropTargetIdx(null);
  }

  function handleDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault();
    setDropTargetIdx(null);
    const src = dragSrcIdx;
    if (src === null || src === targetIdx || !onReorder) return;
    const next = [...assets];
    const [item] = next.splice(src, 1);
    next.splice(targetIdx, 0, item!);
    onReorder(next);
    setDragSrcIdx(null);
  }

  function handleDragEnd() {
    setDragSrcIdx(null);
    setDropTargetIdx(null);
  }

  const draggable = !!onReorder && assets.length > 1;

  return (
    <section>
      <h3 className="text-sm font-medium text-foreground">{label}</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {assets.map((asset, idx) => (
          <div
            key={asset.id}
            draggable={draggable}
            aria-label={draggable ? `${asset.filename}, drag to reorder` : asset.filename}
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, idx)}
            onDragEnd={handleDragEnd}
            className={[
              "overflow-hidden rounded-lg border bg-card transition-colors",
              dropTargetIdx === idx && dragSrcIdx !== idx
                ? "border-primary ring-2 ring-primary"
                : "border-border",
              draggable ? "cursor-grab active:cursor-grabbing" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {/* blobKey is a client-side object/data URL the next/image optimizer can't process. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.blobKey}
              alt={asset.filename}
              loading="lazy"
              className="h-24 w-full object-cover"
              draggable={false}
            />
            <p className="truncate px-2 py-1 text-xs text-muted-foreground">
              {asset.filename}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
