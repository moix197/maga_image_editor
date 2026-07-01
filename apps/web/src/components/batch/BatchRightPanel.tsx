"use client";

import { useState, type RefObject } from "react";
import type { NodeId, TextNode, OverlayNode } from "@maga/editor";
import { isBorderOverlay } from "@maga/editor";
import type { ProjectAsset } from "@maga/projects";
import type { WorkspaceSection } from "./workspace-sections";
import type { useEditorState } from "@/hooks/use-editor-state";
import type { useItemText } from "@/hooks/use-item-text";
import { AssetUploadZone } from "./AssetUploadZone";
import { AssetList } from "./AssetList";
import { LayerStackPanel } from "./LayerStackPanel";
import { OverlayPickerDialog } from "./OverlayPickerDialog";
import { TextStylePanel } from "@/components/text-style-panel";
import { OverlayControlsPanel } from "@/components/overlay-controls-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Collapsible } from "@/components/ui/collapsible";
import { Eye, EyeOff } from "lucide-react";

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
  onAddOverlayFromAssets: (ids: string[]) => void;
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
  overlayNodes: OverlayNode[];
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
  onAddOverlayFromAssets,
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
  overlayNodes,
  itemText,
}: BatchRightPanelProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

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
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (overlays.length > 0) {
                    setPickerOpen(true);
                  } else {
                    overlayInputRef.current?.click();
                  }
                }}
              >
                Add Image Overlay
              </Button>
              <input
                ref={overlayInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                className="hidden"
                aria-label="Upload image overlay"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onOverlayFile(file);
                  e.target.value = "";
                }}
              />
              <OverlayPickerDialog
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                assets={overlays}
                onConfirm={onAddOverlayFromAssets}
                onUploadNew={() => overlayInputRef.current?.click()}
              />
            </div>

            {editorState.state.nodes.length > 0 && (
              <Collapsible title="Layers">
                <div className="pt-2">
                  <LayerStackPanel
                    nodes={editorState.state.nodes}
                    onReorderNode={(id, dir) => editorState.reorderNode(id, dir)}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={onSetSelectedNodeId}
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
                    // width is NOT in the TextStyle Pick — pull it from getNodeOverride directly.
                    const perItemWidth = activeOverlay
                      ? itemText.getNodeOverride(activeOverlay.id, selectedNodeId!).width
                      : undefined;
                    const effectiveNode: TextNode = {
                      ...baseNode,
                      ...perItemStyle,
                      ...(perItemWidth !== undefined && { width: perItemWidth }),
                    };
                    return (
                      <TextStylePanel
                        node={effectiveNode}
                        onChange={(patch) => {
                          const { width, ...stylePatch } = patch;
                          if (activeOverlay) {
                            // Fans the style edit across every selected variant,
                            // never mutating the shared template.
                            if (Object.keys(stylePatch).length > 0) {
                              itemText.setTextStyle(activeOverlay.id, selectedNodeId!, stylePatch);
                            }
                            // width is NOT in the TextStyle Pick — route via setNodeOverride directly.
                            if (width !== undefined) {
                              itemText.setNodeOverride(activeOverlay.id, selectedNodeId!, { width });
                            }
                          } else {
                            // No overlay context yet (template-only mode) — fall back to
                            // mutating the template directly so the panel still works.
                            editorState.updateTextNode(selectedNodeId!, patch);
                          }
                        }}
                        onDelete={() => {
                          if (activeOverlay) {
                            // Fan-out hide: hides the node for all selected variants
                            // (via fanOutItemText.setNodeHidden). Node stays in the
                            // shared template — only per-variant visibility changes.
                            itemText.setNodeHidden(activeOverlay.id, selectedNodeId!, true);
                          } else {
                            // No overlay context yet — fall back to removing from template.
                            editorState.removeNode(selectedNodeId!);
                          }
                          onSetSelectedNodeId(null);
                        }}
                        onReorder={(dir) => editorState.reorderNode(selectedNodeId!, dir)}
                      />
                    );
                  })()}
                  {isSelectedOverlay && (() => {
                    // Compute the effective overlay node for the active variant: merge
                    // the template node's base values with any per-item override so the
                    // panel displays the active variant's current geometry/style values.
                    // Mirrors how TextStylePanel receives its effectiveNode above.
                    const baseOverlayNode = selectedNode as OverlayNode;
                    const perItemOverride = activeOverlay && !isBorderOverlay(baseOverlayNode)
                      ? itemText.getNodeOverride(activeOverlay.id, selectedNodeId!)
                      : {};
                    // Strip the non-Node `hidden` flag before spreading (same semantics as
                    // usePreviewEditorState's stripHidden and getTextStyle's hidden strip).
                    const { hidden: _hidden, ...overridePatch } = perItemOverride;
                    const effectiveOverlayNode: OverlayNode = { ...baseOverlayNode, ...overridePatch };
                    return (
                    <OverlayControlsPanel
                      node={effectiveOverlayNode}
                      onChange={(patch) => {
                        if (activeOverlay && !isBorderOverlay(selectedNode as OverlayNode)) {
                          // Fans the transform edit across every selected variant,
                          // never mutating the shared template — mirrors the
                          // per-variant TextStylePanel routing above.
                          itemText.setNodeOverride(activeOverlay.id, selectedNodeId!, patch);
                        } else {
                          // No overlay context yet (template-only mode), or a border
                          // overlay (border style is template-level, not per-variant) —
                          // mutate the template directly.
                          editorState.updateOverlayNode(selectedNodeId!, patch);
                        }
                      }}
                      onDelete={() => onDeleteOverlayNode(selectedNodeId!)}
                      onReorder={(dir) => editorState.reorderNode(selectedNodeId!, dir)}
                      {...(!isBorderOverlay(baseOverlayNode) && {
                        isVariableSlot: variableSlotNodeId === selectedNodeId,
                        onToggleVariableSlot: () => onToggleVariableSlot(selectedNodeId!),
                      })}
                    />
                    );
                  })()}
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

            {activeOverlay && overlayNodes.length > 0 && (
              <Collapsible title="Variant overlays">
                <div className="pt-2">
                  <ItemOverlayPanel
                    overlayAssetId={activeOverlay.id}
                    overlayLabel={activeOverlay.filename}
                    overlayNodes={overlayNodes}
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

interface ItemOverlayPanelProps {
  overlayAssetId: string;
  overlayLabel: string;
  overlayNodes: OverlayNode[];
  itemText: ReturnType<typeof useItemText>;
}

export function ItemOverlayPanel({ overlayAssetId, overlayLabel, overlayNodes, itemText }: ItemOverlayPanelProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Overlays for {overlayLabel}</h2>
      {overlayNodes.map((node, i) => {
        const hidden = itemText.isNodeHidden(overlayAssetId, node.id);
        return (
          <div key={node.id} className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Image overlay {i + 1}</span>
            <button
              type="button"
              aria-label={hidden ? "Show image overlay" : "Hide image overlay"}
              onClick={() => itemText.setNodeHidden(overlayAssetId, node.id, !hidden)}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        );
      })}
    </div>
  );
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
        const hidden = itemText.isNodeHidden(overlayAssetId, node.id);
        const value = itemText.getTextValue(overlayAssetId, node.id);
        const inputId = `item-text-${overlayAssetId}-${node.id}`;
        return (
          <div key={node.id} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={inputId} className="text-xs text-muted-foreground">
                Text layer {i + 1}
              </Label>
              <button
                type="button"
                aria-label={hidden ? "Show text layer" : "Hide text layer"}
                onClick={() => itemText.setNodeHidden(overlayAssetId, node.id, !hidden)}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Textarea
              id={inputId}
              value={value}
              placeholder={node.content}
              disabled={hidden}
              rows={3}
              onChange={(e) => itemText.setTextValue(overlayAssetId, node.id, e.target.value)}
              className={hidden ? "opacity-50" : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
