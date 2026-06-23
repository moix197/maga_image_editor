"use client";

import type { RefObject } from "react";
import type { NodeId, TextNode, OverlayNode } from "@maga/editor";
import { isBorderOverlay } from "@maga/editor";
import type { ProjectAsset } from "@maga/projects";
import type { WorkspaceSection } from "./workspace-sections";
import type { useEditorState } from "@/hooks/use-editor-state";
import type { useItemText } from "@/hooks/use-item-text";
import { AssetUploadZone } from "./AssetUploadZone";
import { AssetList } from "./AssetList";
import { LayerStackPanel } from "./LayerStackPanel";
import { TextStylePanel } from "@/components/text-style-panel";
import { OverlayControlsPanel } from "@/components/overlay-controls-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible } from "@/components/ui/collapsible";

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
              <Collapsible title="Layers">
                <div className="pt-2">
                  <LayerStackPanel
                    nodes={editorState.state.nodes}
                    onReorderNode={(id, dir) => editorState.reorderNode(id, dir)}
                  />
                </div>
              </Collapsible>
            )}

            {(isSelectedText || isSelectedOverlay) && (
              <Collapsible title="Layer properties">
                <div className="flex flex-col gap-3 pt-2">
                  {isSelectedText && (() => {
                    // Compute the effective node for the active variant: merge the
                    // template node's base style with any per-item style override so
                    // the panel displays the active variant's current values.
                    const baseNode = selectedNode as TextNode;
                    const perItemStyle = activeOverlay
                      ? itemText.getTextStyle(activeOverlay.id, selectedNodeId!)
                      : {};
                    const effectiveNode: TextNode = { ...baseNode, ...perItemStyle };
                    return (
                      <TextStylePanel
                        node={effectiveNode}
                        onChange={(patch) => {
                          if (activeOverlay) {
                            // Fan out style edits to every selected variant via itemText
                            // (fanOutItemText.setTextStyle), never mutating the shared template.
                            itemText.setTextStyle(activeOverlay.id, selectedNodeId!, patch);
                          } else {
                            // No overlay context yet (template-only mode) — fall back to
                            // mutating the template directly so the panel still works.
                            editorState.updateTextNode(selectedNodeId!, patch);
                          }
                        }}
                        onDelete={() => { editorState.removeNode(selectedNodeId!); onSetSelectedNodeId(null); }}
                        onReorder={(dir) => editorState.reorderNode(selectedNodeId!, dir)}
                      />
                    );
                  })()}
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
              </Collapsible>
            )}

            {activeOverlay && textNodes.length > 0 && (
              <Collapsible title="Variant text">
                <div className="pt-2">
                  <ItemTextPanel
                    overlayAssetId={activeOverlay.id}
                    overlayLabel={activeOverlay.filename}
                    textNodes={textNodes}
                    itemText={itemText}
                  />
                </div>
              </Collapsible>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Upload a background image first in the Assets section.</p>
        )}
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
        const value = itemText.getTextValue(overlayAssetId, node.id);
        const inputId = `item-text-${overlayAssetId}-${node.id}`;
        return (
          <div key={node.id} className="flex flex-col gap-1.5">
            <Label htmlFor={inputId} className="text-xs text-muted-foreground">
              Text layer {i + 1}
            </Label>
            <Input
              id={inputId}
              value={value}
              placeholder={node.content}
              onChange={(e) => itemText.setTextValue(overlayAssetId, node.id, e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
