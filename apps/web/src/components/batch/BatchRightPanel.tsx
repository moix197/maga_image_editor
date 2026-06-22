"use client";

import type { RefObject } from "react";
import type { NodeId, TextNode, OverlayNode } from "@maga/editor";
import { isBorderOverlay } from "@maga/editor";
import type { ProjectAsset } from "@maga/projects";
import type { TextStyle } from "@maga/projects";
import type { WorkspaceSection } from "./workspace-sections";
import type { useEditorState } from "@/hooks/use-editor-state";
import type { useItemText } from "@/hooks/use-item-text";
import { AssetUploadZone } from "./AssetUploadZone";
import { AssetList } from "./AssetList";
import { LayerStackPanel } from "./LayerStackPanel";
import { BulkTextPanel } from "./BulkTextPanel";
import { TextStylePanel } from "@/components/text-style-panel";
import { OverlayControlsPanel } from "@/components/overlay-controls-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Unlock } from "lucide-react";

interface BatchRightPanelProps {
  activeSection: WorkspaceSection;
  // assets
  background: ProjectAsset | null;
  overlays: ProjectAsset[];
  onBackgroundFiles: (files: File[]) => void;
  onOverlayFiles: (files: File[]) => void;
  onImportZipFiles: (files: File[]) => void;
  onReorderOverlays: (newOrder: ProjectAsset[]) => void;
  // template
  template: ReturnType<typeof useEditorState>["state"] | null;
  editorState: ReturnType<typeof useEditorState>;
  overlayInputRef: RefObject<HTMLInputElement | null>;
  onOverlayFile: (file: File) => void;
  variableSlotNodeId: NodeId | null;
  selectedNodeId: NodeId | null;
  selectedNode: TextNode | OverlayNode | null;
  isSelectedText: boolean;
  isSelectedOverlay: boolean;
  onSetSelectedNodeId: (id: NodeId | null) => void;
  onDeleteOverlayNode: (id: NodeId) => void;
  onToggleVariableSlot: (id: NodeId) => void;
  activeOverlay: ProjectAsset | null;
  textNodes: TextNode[];
  itemText: ReturnType<typeof useItemText>;
  // text
  itemTextValues: Record<string, Record<string, string>>;
  itemTextStyles: Record<string, Record<string, Partial<TextStyle>>>;
  textLayerLocks: Record<string, boolean>;
  setItemTextValue: (overlayId: string, nodeId: string, value: string) => void;
  setItemTextStyle: (nodeId: string, overlayId: string, patch: Partial<TextStyle>) => void;
  setTextLayerLock: (nodeId: string, locked: boolean) => void;
}

export function BatchRightPanel({
  activeSection,
  background,
  overlays,
  onBackgroundFiles,
  onOverlayFiles,
  onImportZipFiles,
  onReorderOverlays,
  template,
  editorState,
  overlayInputRef,
  onOverlayFile,
  variableSlotNodeId,
  selectedNodeId,
  selectedNode,
  isSelectedText,
  isSelectedOverlay,
  onSetSelectedNodeId,
  onDeleteOverlayNode,
  onToggleVariableSlot,
  activeOverlay,
  textNodes,
  itemText,
  itemTextValues,
  itemTextStyles,
  textLayerLocks,
  setItemTextValue,
  setItemTextStyle,
  setTextLayerLock,
}: BatchRightPanelProps) {
  if (activeSection === "assets") {
    return (
      <div className="flex flex-col gap-6 p-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Assets</h2>
          <p className="mt-1 text-sm text-muted-foreground">Upload background and overlay images.</p>
        </div>
        <div className="flex flex-col gap-4">
          <AssetUploadZone label="Background" multiple={false} onFiles={onBackgroundFiles} />
          <AssetUploadZone label="Overlays" multiple onFiles={onOverlayFiles} />
        </div>
        {!background && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Or resume a previously exported project:</p>
            <AssetUploadZone label="Import ZIP" multiple={false} accept=".zip,application/zip" onFiles={onImportZipFiles} />
          </div>
        )}
        <div className="flex flex-col gap-6">
          {background && <AssetList label="Background" assets={[background]} />}
          <AssetList label="Overlays" assets={overlays} onReorder={onReorderOverlays} />
        </div>
        {template !== null && overlays.length === 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">No overlay images uploaded</p>
        )}
      </div>
    );
  }

  if (activeSection === "template") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Template</h2>
          <p className="mt-1 text-sm text-muted-foreground">Design the compositing template.</p>
        </div>
        {background ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => editorState.addTextNode()}>Add Text</Button>
              <Button variant="outline" size="sm" onClick={() => editorState.addBorderNode()}>Add Border</Button>
              <Button variant="outline" size="sm" onClick={() => overlayInputRef.current?.click()}>Add Image Overlay</Button>
              <input
                ref={overlayInputRef}
                type="file"
                accept="image/png,image/svg+xml"
                className="hidden"
                aria-label="Upload image overlay"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await onOverlayFile(file);
                  e.target.value = "";
                }}
              />
            </div>

            {editorState.state.nodes.length > 0 && (
              <LayerStackPanel
                nodes={editorState.state.nodes}
                onReorderNode={(id, dir) => editorState.reorderNode(id, dir)}
              />
            )}

            {(isSelectedText || isSelectedOverlay) && (
              <div className="flex flex-col gap-3">
                {isSelectedText && (
                  <TextStylePanel
                    node={selectedNode as TextNode}
                    onChange={(patch) => editorState.updateTextNode(selectedNodeId!, patch)}
                    onDelete={() => { editorState.removeNode(selectedNodeId!); onSetSelectedNodeId(null); }}
                    onReorder={(dir) => editorState.reorderNode(selectedNodeId!, dir)}
                  />
                )}
                {isSelectedOverlay && (
                  <OverlayControlsPanel
                    node={selectedNode as OverlayNode}
                    onChange={(patch) => editorState.updateOverlayNode(selectedNodeId!, patch)}
                    onDelete={() => onDeleteOverlayNode(selectedNodeId!)}
                    onReorder={(dir) => editorState.reorderNode(selectedNodeId!, dir)}
                    {...(!isBorderOverlay(selectedNode as OverlayNode) && {
                      isVariableSlot: variableSlotNodeId === selectedNodeId,
                      onToggleVariableSlot: () => onToggleVariableSlot(selectedNodeId!),
                    })}
                  />
                )}
              </div>
            )}

            {activeOverlay && textNodes.length > 0 && (
              <ItemTextPanel
                overlayAssetId={activeOverlay.id}
                overlayLabel={activeOverlay.filename}
                textNodes={textNodes}
                itemText={itemText}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Upload a background image first in the Assets section.</p>
        )}
      </div>
    );
  }

  if (activeSection === "text") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Text</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit per-item text for each overlay. Lock a layer to share one value across all items.
          </p>
        </div>
        <BulkTextPanel
          overlays={overlays}
          textNodes={textNodes}
          itemTextValues={itemTextValues}
          itemTextStyles={itemTextStyles}
          textLayerLocks={textLayerLocks}
          setItemTextValue={setItemTextValue}
          setItemTextStyle={setItemTextStyle}
          setTextLayerLock={setTextLayerLock}
        />
      </div>
    );
  }

  // results: panel is hidden (parent renders null for results)
  return null;
}

interface ItemTextPanelProps {
  overlayAssetId: string;
  overlayLabel: string;
  textNodes: TextNode[];
  itemText: ReturnType<typeof useItemText>;
}

function ItemTextPanel({ overlayAssetId, overlayLabel, textNodes, itemText }: ItemTextPanelProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Text for {overlayLabel}</h2>
      {textNodes.map((node, i) => {
        const locked = itemText.isLocked(node.id);
        const value = locked ? node.content : itemText.getTextValue(overlayAssetId, node.id);
        const inputId = `item-text-${overlayAssetId}-${node.id}`;
        return (
          <div key={node.id} className="flex flex-col gap-1.5">
            <Label htmlFor={inputId} className="text-xs text-muted-foreground">
              Text layer {i + 1}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id={inputId}
                value={value}
                disabled={locked}
                placeholder={node.content}
                onChange={(e) => itemText.setTextValue(overlayAssetId, node.id, e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={locked ? "Unlock layer (edit per item)" : "Lock layer (share across items)"}
                aria-pressed={locked}
                onClick={() => itemText.toggleLock(node.id)}
              >
                {locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
