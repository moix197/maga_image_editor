"use client";

import { useState, useCallback } from "react";
import { fileToDataUrl } from "@/lib/image-helpers";
import type { ProjectAsset } from "@maga/projects";

interface UseBatchProjectResult {
  background: ProjectAsset | null;
  overlays: ProjectAsset[];
  setBackground: (file: File) => Promise<void>;
  addOverlays: (files: File[]) => Promise<void>;
}

export function useBatchProject(): UseBatchProjectResult {
  const [background, setBackgroundState] = useState<ProjectAsset | null>(null);
  const [overlays, setOverlays] = useState<ProjectAsset[]>([]);

  const setBackground = useCallback(async (file: File) => {
    const blobKey = await fileToDataUrl(file);
    const asset: ProjectAsset = {
      id: crypto.randomUUID(),
      filename: file.name,
      blobKey,
    };
    setBackgroundState(asset);
  }, []);

  const addOverlays = useCallback(async (files: File[]) => {
    const assets: ProjectAsset[] = await Promise.all(
      files.map(async (file) => ({
        id: crypto.randomUUID(),
        filename: file.name,
        blobKey: await fileToDataUrl(file),
      }))
    );
    setOverlays((prev) => [...prev, ...assets]);
  }, []);

  return { background, overlays, setBackground, addOverlays };
}
