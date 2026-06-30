"use client";

import { isBorderOverlay } from "@maga/editor";
import type { OverlayNode, BorderOverlay, DropShadow } from "@maga/editor";
import { getIntrinsicRatio } from "@/components/overlay-node-layer";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OverlayControlsPanelProps {
  node: OverlayNode;
  onChange: (patch: Partial<Omit<OverlayNode, "id">>) => void;
  onDelete: () => void;
  onReorder: (direction: "up" | "down") => void;
  /**
   * Whether this overlay node is currently the variable slot.
   * Provided only by BatchWorkspace for image overlay nodes; absent on all other
   * call sites (text/border nodes). The component renders the toggle UI only when
   * this prop is supplied — it contains no business logic and calls
   * onToggleVariableSlot on change.
   */
  isVariableSlot?: boolean;
  /**
   * Callback-only: called when the user clicks the variable-slot toggle.
   * All state mutations live in the caller (BatchWorkspace); this component
   * neither reads nor writes variableSlot state directly.
   */
  onToggleVariableSlot?: () => void;
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

type OverlayPatch = Partial<Omit<OverlayNode, "id">>;

const DEFAULT_DROP_SHADOW: DropShadow = { x: 5, y: 5, blur: 10, color: "#000000", opacity: 0.5 };

/**
 * When the lock is on, scales the unedited dimension to preserve the image's
 * intrinsic (natural) W:H ratio — not the box's current, possibly-drifted ratio.
 * Falls back to an unconstrained patch when the intrinsic ratio hasn't been
 * captured yet (image not loaded), see overlay-node-layer.tsx's `recordIntrinsicRatio`.
 */
export function applyAspectRatioLock(patch: OverlayPatch, currentNode: OverlayNode): OverlayPatch {
  if (!currentNode.aspectRatioLocked) return patch;
  const ratio = getIntrinsicRatio(currentNode.id);
  if (ratio === undefined) return patch;
  if (patch.width !== undefined && patch.height === undefined) {
    return { ...patch, height: Math.round(patch.width / ratio) };
  }
  if (patch.height !== undefined && patch.width === undefined) {
    return { ...patch, width: Math.round(patch.height * ratio) };
  }
  return patch;
}

export function OverlayControlsPanel({ node, onChange, onDelete, onReorder, isVariableSlot, onToggleVariableSlot }: OverlayControlsPanelProps) {
  const border: BorderOverlay | null = isBorderOverlay(node) ? node : null;

  return (
    <aside
      aria-label="Overlay controls panel"
      className="flex w-64 flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      <h2 className="text-sm font-semibold tracking-tight">
        {border ? "Border" : "Image Overlay"}
      </h2>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onReorder("up")}>
            Move Up
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onReorder("down")}>
            Move Down
          </Button>
        </div>
        <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
          Delete
        </Button>
      </div>

      <FieldRow label={`Opacity (${Math.round(node.opacity * 100)}%)`}>
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={[node.opacity]}
          onValueChange={([v]) => onChange({ opacity: v })}
          aria-label="Overlay opacity"
        />
      </FieldRow>

      {!border && (
        <>
          <FieldRow label="Position">
            <div className="flex gap-2">
              <div className="flex flex-1 items-center gap-2">
                <Label htmlFor="overlay-x" className="text-xs text-muted-foreground">X %</Label>
                <Input
                  id="overlay-x"
                  type="number"
                  value={node.x}
                  onChange={(e) => onChange({ x: Number(e.target.value) })}
                  aria-label="Position X"
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex flex-1 items-center gap-2">
                <Label htmlFor="overlay-y" className="text-xs text-muted-foreground">Y %</Label>
                <Input
                  id="overlay-y"
                  type="number"
                  value={node.y}
                  onChange={(e) => onChange({ y: Number(e.target.value) })}
                  aria-label="Position Y"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </FieldRow>

          <FieldRow label="Size">
            <div className="flex gap-2">
              <div className="flex flex-1 items-center gap-2">
                <Label htmlFor="overlay-w" className="text-xs text-muted-foreground">W</Label>
                <Input
                  id="overlay-w"
                  type="number"
                  min={1}
                  value={node.width}
                  onChange={(e) =>
                    onChange(applyAspectRatioLock({ width: Number(e.target.value) }, node))
                  }
                  aria-label="Width"
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex flex-1 items-center gap-2">
                <Label htmlFor="overlay-h" className="text-xs text-muted-foreground">H</Label>
                <Input
                  id="overlay-h"
                  type="number"
                  min={1}
                  value={node.height}
                  onChange={(e) =>
                    onChange(applyAspectRatioLock({ height: Number(e.target.value) }, node))
                  }
                  aria-label="Height"
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="checkbox"
                id="aspect-lock-toggle"
                checked={node.aspectRatioLocked ?? true}
                onChange={(e) => onChange({ aspectRatioLocked: e.target.checked })}
                className="h-4 w-4 cursor-pointer rounded"
              />
              <label htmlFor="aspect-lock-toggle" className="cursor-pointer text-xs">
                Lock aspect ratio
              </label>
            </div>
          </FieldRow>

          <FieldRow label={`Rotation (${node.rotation ?? 0}°)`}>
            <div className="flex items-center gap-2">
              <Slider
                min={0}
                max={360}
                step={1}
                value={[node.rotation ?? 0]}
                onValueChange={([v]) => onChange({ rotation: v ?? 0 })}
                aria-label="Rotation"
              />
              <Input
                type="number"
                min={0}
                max={360}
                value={node.rotation ?? 0}
                onChange={(e) => onChange({ rotation: Number(e.target.value) })}
                aria-label="Rotation value"
                className="h-8 w-16 text-xs"
              />
            </div>
          </FieldRow>

          <FieldRow label={`Corner Radius (${node.cornerRadius ?? 0}px)`}>
            <Slider
              min={0}
              max={200}
              step={1}
              value={[node.cornerRadius ?? 0]}
              onValueChange={([v]) => onChange({ cornerRadius: v ?? 0 })}
              aria-label="Corner radius"
            />
          </FieldRow>

          <FieldRow label={`Edge Feather (${node.featherRadius ?? 0}px)`}>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[node.featherRadius ?? 0]}
              onValueChange={([v]) => onChange({ featherRadius: v ?? 0 })}
              aria-label="Edge feather"
            />
          </FieldRow>

          <FieldRow label="Drop Shadow">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="drop-shadow-toggle"
                checked={node.dropShadow !== undefined}
                onChange={(e) =>
                  onChange({ dropShadow: e.target.checked ? DEFAULT_DROP_SHADOW : undefined })
                }
                className="h-4 w-4 cursor-pointer rounded"
              />
              <label htmlFor="drop-shadow-toggle" className="cursor-pointer text-xs">
                Enable drop shadow
              </label>
            </div>
            {node.dropShadow && (
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex gap-2">
                  <div className="flex flex-1 items-center gap-2">
                    <Label className="text-xs text-muted-foreground">X</Label>
                    <Input
                      type="number"
                      value={node.dropShadow.x}
                      onChange={(e) =>
                        onChange({ dropShadow: { ...node.dropShadow!, x: Number(e.target.value) } })
                      }
                      aria-label="Shadow X"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex flex-1 items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Y</Label>
                    <Input
                      type="number"
                      value={node.dropShadow.y}
                      onChange={(e) =>
                        onChange({ dropShadow: { ...node.dropShadow!, y: Number(e.target.value) } })
                      }
                      aria-label="Shadow Y"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="w-10 text-xs text-muted-foreground">Blur</Label>
                  <Input
                    type="number"
                    min={0}
                    value={node.dropShadow.blur}
                    onChange={(e) =>
                      onChange({ dropShadow: { ...node.dropShadow!, blur: Number(e.target.value) } })
                    }
                    aria-label="Shadow blur"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="w-10 text-xs text-muted-foreground">Color</Label>
                  <input
                    type="color"
                    value={node.dropShadow.color}
                    onChange={(e) =>
                      onChange({ dropShadow: { ...node.dropShadow!, color: e.target.value } })
                    }
                    aria-label="Shadow color"
                    className="h-8 flex-1 cursor-pointer rounded border border-input"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">
                    Opacity ({Math.round(node.dropShadow.opacity * 100)}%)
                  </Label>
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={[node.dropShadow.opacity]}
                    onValueChange={([v]) =>
                      onChange({ dropShadow: { ...node.dropShadow!, opacity: v ?? 0 } })
                    }
                    aria-label="Shadow opacity"
                  />
                </div>
              </div>
            )}
          </FieldRow>

          {onToggleVariableSlot !== undefined && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="variable-slot-toggle"
                checked={isVariableSlot ?? false}
                onChange={onToggleVariableSlot}
                className="h-4 w-4 cursor-pointer rounded"
              />
              <label htmlFor="variable-slot-toggle" className="cursor-pointer text-xs">
                Use as variable slot
              </label>
            </div>
          )}
        </>
      )}

      {border && (
        <>
          <FieldRow label="Border Color">
            <input
              type="color"
              value={border.borderColor}
              onChange={(e) => onChange({ borderColor: e.target.value } as Partial<BorderOverlay>)}
              aria-label="Border color"
              className="h-8 w-full cursor-pointer rounded-md border border-input"
            />
          </FieldRow>

          <FieldRow label={`Border Width (${border.borderWidth}px)`}>
            <Slider
              min={1}
              max={40}
              step={1}
              value={[border.borderWidth]}
              onValueChange={([v]) => onChange({ borderWidth: v } as Partial<BorderOverlay>)}
              aria-label="Border width"
            />
          </FieldRow>

          <FieldRow label="Border Style">
            <Select
              value={border.borderStyle}
              onValueChange={(v) => onChange({ borderStyle: v } as Partial<BorderOverlay>)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solid" className="text-xs">Solid</SelectItem>
                <SelectItem value="dashed" className="text-xs">Dashed</SelectItem>
                <SelectItem value="dotted" className="text-xs">Dotted</SelectItem>
                <SelectItem value="double" className="text-xs">Double</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label={`Border Radius (${border.borderRadius}px)`}>
            <Slider
              min={0}
              max={200}
              step={1}
              value={[border.borderRadius]}
              onValueChange={([v]) => onChange({ borderRadius: v } as Partial<BorderOverlay>)}
              aria-label="Border radius"
            />
          </FieldRow>
        </>
      )}
    </aside>
  );
}
