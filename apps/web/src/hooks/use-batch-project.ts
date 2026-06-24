"use client";

import { useState, useCallback } from "react";
import { fileToDataUrl } from "@/lib/image-helpers";
import { safeRandomId } from "@/lib/id";
import {
  setNodeOverride as setNodeOverrideOn,
  setNodeHidden as setNodeHiddenOn,
} from "@maga/projects";
import type {
  BatchProject,
  GeneratedOutput,
  ItemNodeOverrides,
  NodeOverride,
  ProjectAsset,
  VariableSlot,
} from "@maga/projects";
import type { EditorState } from "@maga/editor";

interface UseBatchProjectResult {
  background: ProjectAsset | null;
  overlays: ProjectAsset[];
  template: EditorState | null;
  variableSlot: VariableSlot | null;
  outputs: GeneratedOutput[];
  itemNodeOverrides: ItemNodeOverrides;
  setBackground: (file: File) => Promise<void>;
  addOverlays: (files: File[]) => Promise<void>;
  setTemplate: (editorState: EditorState, slot: VariableSlot) => void;
  setEditorTemplate: (editorState: EditorState | undefined) => void;
  addOutput: (output: GeneratedOutput) => void;
  clearOutputs: () => void;
  clearProject: () => void;
  setProject: (project: BatchProject) => void;
  setVariableSlot: (slot: VariableSlot | null) => void;
  setNodeOverride: (overlayAssetId: string, nodeId: string, patch: NodeOverride) => void;
  setNodeHidden: (overlayAssetId: string, nodeId: string, hidden: boolean) => void;
  reorderOverlays: (newOrder: ProjectAsset[]) => void;
}

export function useBatchProject(): UseBatchProjectResult {
  const [background, setBackgroundState] = useState<ProjectAsset | null>(null);
  const [overlays, setOverlays] = useState<ProjectAsset[]>([]);
  const [template, setTemplateState] = useState<EditorState | null>(null);
  const [variableSlot, setVariableSlotState] = useState<VariableSlot | null>(null);
  const [outputs, setOutputs] = useState<GeneratedOutput[]>([]);
  const [itemNodeOverrides, setItemNodeOverridesState] = useState<ItemNodeOverrides>({});

  const setBackground = useCallback(async (file: File) => {
    const blobKey = await fileToDataUrl(file);
    const asset: ProjectAsset = {
      id: safeRandomId(),
      filename: file.name,
      blobKey,
    };
    setBackgroundState(asset);
  }, []);

  const addOverlays = useCallback(async (files: File[]) => {
    const assets: ProjectAsset[] = await Promise.all(
      files.map(async (file) => ({
        id: safeRandomId(),
        filename: file.name,
        blobKey: await fileToDataUrl(file),
      }))
    );
    setOverlays((prev) => [...prev, ...assets]);
  }, []);

  const reorderOverlays = useCallback((newOrder: ProjectAsset[]) => {
    setOverlays(newOrder);
  }, []);

  const setTemplate = useCallback((editorState: EditorState, slot: VariableSlot) => {
    setTemplateState(editorState);
    setVariableSlotState(slot);
  }, []);

  const setEditorTemplate = useCallback((editorState: EditorState | undefined) => {
    setTemplateState(editorState ?? null);
  }, []);

  const addOutput = useCallback((output: GeneratedOutput) => {
    setOutputs((prev) => [...prev, output]);
  }, []);

  const clearOutputs = useCallback(() => {
    setOutputs([]);
  }, []);

  const clearProject = useCallback(() => {
    setBackgroundState(null);
    setOverlays([]);
    setTemplateState(null);
    setVariableSlotState(null);
    setOutputs([]);
    setItemNodeOverridesState({});
  }, []);

  const setProject = useCallback((project: BatchProject) => {
    setBackgroundState(project.background);
    setOverlays(project.overlays);
    setTemplateState(project.template);
    setVariableSlotState(project.variableSlot);
    setOutputs(project.outputs);
    setItemNodeOverridesState(project.itemNodeOverrides ?? {});
  }, []);

  const setVariableSlot = useCallback((slot: VariableSlot | null) => {
    setVariableSlotState(slot);
  }, []);

  /**
   * Merges a {@link NodeOverride} patch onto one overlay's node override.
   * Immutable nested-map update delegated to the package helper.
   */
  const setNodeOverride = useCallback(
    (overlayAssetId: string, nodeId: string, patch: NodeOverride) => {
      setItemNodeOverridesState((prev) => setNodeOverrideOn(prev, overlayAssetId, nodeId, patch));
    },
    [],
  );

  /**
   * Toggles a node's hidden state for one overlay. Immutable and idempotent: a
   * no-op toggle returns the previous state object so referential equality is
   * preserved and no re-render is triggered (handled by the package helper).
   */
  const setNodeHidden = useCallback(
    (overlayAssetId: string, nodeId: string, hidden: boolean) => {
      setItemNodeOverridesState((prev) => setNodeHiddenOn(prev, overlayAssetId, nodeId, hidden));
    },
    [],
  );

  return {
    background,
    overlays,
    template,
    variableSlot,
    outputs,
    itemNodeOverrides,
    setBackground,
    addOverlays,
    setTemplate,
    setEditorTemplate,
    addOutput,
    clearOutputs,
    clearProject,
    setProject,
    setVariableSlot,
    setNodeOverride,
    setNodeHidden,
    reorderOverlays,
  };
}
