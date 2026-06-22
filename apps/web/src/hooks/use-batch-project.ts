"use client";

import { useState, useCallback } from "react";
import { fileToDataUrl } from "@/lib/image-helpers";
import { safeRandomId } from "@/lib/id";
import type { BatchProject, GeneratedOutput, ProjectAsset, TextStyle, VariableSlot } from "@maga/projects";
import type { EditorState } from "@maga/editor";

interface UseBatchProjectResult {
  background: ProjectAsset | null;
  overlays: ProjectAsset[];
  template: EditorState | null;
  variableSlot: VariableSlot | null;
  outputs: GeneratedOutput[];
  itemTextValues: Record<string, Record<string, string>>;
  textLayerLocks: Record<string, boolean>;
  itemTextStyles: Record<string, Record<string, Partial<TextStyle>>>;
  setBackground: (file: File) => Promise<void>;
  addOverlays: (files: File[]) => Promise<void>;
  setTemplate: (editorState: EditorState, slot: VariableSlot) => void;
  setEditorTemplate: (editorState: EditorState | undefined) => void;
  addOutput: (output: GeneratedOutput) => void;
  clearOutputs: () => void;
  clearProject: () => void;
  setProject: (project: BatchProject) => void;
  setVariableSlot: (slot: VariableSlot | null) => void;
  setItemTextValue: (overlayAssetId: string, textNodeId: string, value: string) => void;
  setItemTextStyle: (overlayAssetId: string, textNodeId: string, style: Partial<TextStyle>) => void;
  setTextLayerLock: (textNodeId: string, locked: boolean) => void;
  reorderOverlays: (newOrder: ProjectAsset[]) => void;
}

export function useBatchProject(): UseBatchProjectResult {
  const [background, setBackgroundState] = useState<ProjectAsset | null>(null);
  const [overlays, setOverlays] = useState<ProjectAsset[]>([]);
  const [template, setTemplateState] = useState<EditorState | null>(null);
  const [variableSlot, setVariableSlotState] = useState<VariableSlot | null>(null);
  const [outputs, setOutputs] = useState<GeneratedOutput[]>([]);
  const [itemTextValues, setItemTextValuesState] = useState<Record<string, Record<string, string>>>({});
  const [textLayerLocks, setTextLayerLocksState] = useState<Record<string, boolean>>({});
  const [itemTextStyles, setItemTextStylesState] = useState<Record<string, Record<string, Partial<TextStyle>>>>({});

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
    setItemTextValuesState({});
    setTextLayerLocksState({});
    setItemTextStylesState({});
  }, []);

  const setProject = useCallback((project: BatchProject) => {
    setBackgroundState(project.background);
    setOverlays(project.overlays);
    setTemplateState(project.template);
    setVariableSlotState(project.variableSlot);
    setOutputs(project.outputs);
    setItemTextValuesState(project.itemTextValues);
    setTextLayerLocksState(project.textLayerLocks);
    setItemTextStylesState(project.itemTextStyles);
  }, []);

  const setVariableSlot = useCallback((slot: VariableSlot | null) => {
    setVariableSlotState(slot);
  }, []);

  const setItemTextValue = useCallback(
    (overlayAssetId: string, textNodeId: string, value: string) => {
      setItemTextValuesState((prev) => ({
        ...prev,
        [overlayAssetId]: { ...prev[overlayAssetId], [textNodeId]: value },
      }));
    },
    [],
  );

  const setItemTextStyle = useCallback(
    (overlayAssetId: string, textNodeId: string, style: Partial<TextStyle>) => {
      setItemTextStylesState((prev) => ({
        ...prev,
        [overlayAssetId]: {
          ...prev[overlayAssetId],
          [textNodeId]: { ...prev[overlayAssetId]?.[textNodeId], ...style },
        },
      }));
    },
    [],
  );

  const setTextLayerLock = useCallback((textNodeId: string, locked: boolean) => {
    setTextLayerLocksState((prev) => ({ ...prev, [textNodeId]: locked }));
  }, []);

  return {
    background,
    overlays,
    template,
    variableSlot,
    outputs,
    itemTextValues,
    textLayerLocks,
    itemTextStyles,
    setBackground,
    addOverlays,
    setTemplate,
    setEditorTemplate,
    addOutput,
    clearOutputs,
    clearProject,
    setProject,
    setVariableSlot,
    setItemTextValue,
    setItemTextStyle,
    setTextLayerLock,
    reorderOverlays,
  };
}
