"use client";

import { useState, useCallback } from "react";
import { fileToDataUrl } from "@/lib/image-helpers";
import type { ProjectAsset, VariableSlot } from "@maga/projects";
import type { EditorState } from "@maga/editor";

interface UseBatchProjectResult {
  background: ProjectAsset | null;
  overlays: ProjectAsset[];
  template: EditorState | null;
  variableSlot: VariableSlot | null;
  setBackground: (file: File) => Promise<void>;
  addOverlays: (files: File[]) => Promise<void>;
  setTemplate: (editorState: EditorState, slot: VariableSlot) => void;
}

export function useBatchProject(): UseBatchProjectResult {
  const [background, setBackgroundState] = useState<ProjectAsset | null>(null);
  const [overlays, setOverlays] = useState<ProjectAsset[]>([]);
  const [template, setTemplateState] = useState<EditorState | null>(null);
  const [variableSlot, setVariableSlotState] = useState<VariableSlot | null>(null);

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

  const setTemplate = useCallback((editorState: EditorState, slot: VariableSlot) => {
    setTemplateState(editorState);
    setVariableSlotState(slot);
  }, []);

  return { background, overlays, template, variableSlot, setBackground, addOverlays, setTemplate };
}
