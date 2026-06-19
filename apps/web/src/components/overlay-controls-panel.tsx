"use client";

import { isBorderOverlay } from "@maga/editor";
import type { OverlayNode, BorderOverlay } from "@maga/editor";
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

/** When the lock is on, scales the unedited dimension to preserve the current W:H ratio. */
export function applyAspectRatioLock(patch: OverlayPatch, currentNode: OverlayNode): OverlayPatch {
  if (!currentNode.aspectRatioLocked) return patch;
  const { width: w, height: h } = currentNode;
  if (w <= 0 || h <= 0) return patch;
  if (patch.width !== undefined && patch.height === undefined) {
    return { ...patch, height: Math.round((patch.width * h) / w) };
  }
  if (patch.height !== undefined && patch.width === undefined) {
    return { ...patch, width: Math.round((patch.height * w) / h) };
  }
  return patch;
}

export function OverlayControlsPanel({ node, onChange, onDelete, onReorder }: OverlayControlsPanelProps) {
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
