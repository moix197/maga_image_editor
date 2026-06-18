"use client";

import type { OverlayNode, BorderOverlay } from "@maga/editor";
import { Label } from "@/components/ui/label";
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

export function OverlayControlsPanel({ node, onChange, onDelete, onReorder }: OverlayControlsPanelProps) {
  const isBorder = node.overlayType === "border";
  const b = isBorder ? (node as BorderOverlay) : null;

  return (
    <aside
      aria-label="Overlay controls panel"
      className="flex w-64 flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      <h2 className="text-sm font-semibold tracking-tight">
        {isBorder ? "Border" : "Image Overlay"}
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

      {isBorder && b && (
        <>
          <FieldRow label="Border Color">
            <input
              type="color"
              value={b.borderColor}
              onChange={(e) => onChange({ borderColor: e.target.value } as Partial<BorderOverlay>)}
              aria-label="Border color"
              className="h-8 w-full cursor-pointer rounded-md border border-input"
            />
          </FieldRow>

          <FieldRow label={`Border Width (${b.borderWidth}px)`}>
            <Slider
              min={1}
              max={40}
              step={1}
              value={[b.borderWidth]}
              onValueChange={([v]) => onChange({ borderWidth: v } as Partial<BorderOverlay>)}
              aria-label="Border width"
            />
          </FieldRow>

          <FieldRow label="Border Style">
            <Select
              value={b.borderStyle}
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

          <FieldRow label={`Border Radius (${b.borderRadius}px)`}>
            <Slider
              min={0}
              max={200}
              step={1}
              value={[b.borderRadius]}
              onValueChange={([v]) => onChange({ borderRadius: v } as Partial<BorderOverlay>)}
              aria-label="Border radius"
            />
          </FieldRow>
        </>
      )}
    </aside>
  );
}
