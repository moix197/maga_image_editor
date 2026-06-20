"use client";

import { useState, useCallback } from "react";
import { fileToDataUrl } from "@/lib/image-helpers";
import { safeRandomId } from "@/lib/id";
import type { BatchProject, GeneratedOutput, ProjectAsset, VariableSlot } from "@maga/projects";
import type { EditorState } from "@maga/editor";

interface UseBatchProjectResult {
  background: ProjectAsset | null;
  overlays: ProjectAsset[];
  template: EditorState | null;
  variableSlot: VariableSlot | null;
  outputs: GeneratedOutput[];
  setBackground: (file: File) => Promise<void>;
  addOverlays: (files: File[]) => Promise<void>;
  setTemplate: (editorState: EditorState, slot: VariableSlot) => void;
  setEditorTemplate: (editorState: EditorState | undefined) => void;
  addOutput: (output: GeneratedOutput) => void;
  clearOutputs: () => void;
  setProject: (project: BatchProject) => void;
}

export function useBatchProject(): UseBatchProjectResult {
  const [background, setBackgroundState] = useState<ProjectAsset | null>(null);
  const [overlays, setOverlays] = useState<ProjectAsset[]>([]);
  const [template, setTemplateState] = useState<EditorState | null>(null);
  const [variableSlot, setVariableSlotState] = useState<VariableSlot | null>(null);
  const [outputs, setOutputs] = useState<GeneratedOutput[]>([]);

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

  const setProject = useCallback((project: BatchProject) => {
    setBackgroundState(project.background);
    setOverlays(project.overlays);
    setTemplateState(project.template);
    setVariableSlotState(project.variableSlot);
    setOutputs(project.outputs);
  }, []);

  return {
    background,
    overlays,
    template,
    variableSlot,
    outputs,
    setBackground,
    addOverlays,
    setTemplate,
    setEditorTemplate,
    addOutput,
    clearOutputs,
    setProject,
  };
}
