"use client";

import type { TextNode, TextShadow, TextBackground } from "@maga/editor";
import { FONT_FAMILIES } from "@maga/editor";
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

interface TextStylePanelProps {
  node: TextNode;
  onChange: (patch: Partial<TextNode>) => void;
  onDelete: () => void;
  onReorder: (direction: "up" | "down") => void;
  /** When true, hides the Move Up/Down and Delete controls (for embedded bulk-edit use). */
  hideControls?: boolean;
  /** Additional class names applied to the root <aside> element. */
  className?: string;
  /** When true, marks the panel as disabled for assistive tech (aria-disabled). */
  disabled?: boolean;
}

const DEFAULT_SHADOW: TextShadow = { color: "#000000", blur: 4, offsetX: 2, offsetY: 2 };
const DEFAULT_TEXT_BACKGROUND: TextBackground = { color: "#000000", opacity: 0.5, blur: 0, paddingX: 8, paddingY: 4 };

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function TextStylePanel({ node, onChange, onDelete, onReorder, hideControls = false, className, disabled = false }: TextStylePanelProps) {
  return (
    <aside
      aria-label="Text style panel"
      aria-disabled={disabled || undefined}
      className={className ?? "flex w-64 flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"}
    >
      <h2 className="text-sm font-semibold tracking-tight">Text Style</h2>

      {!hideControls && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => onReorder("up")}>
              Move Up
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => onReorder("down")}>
              Move Down
            </Button>
          </div>
          <Button variant="destructive" size="sm" className="w-full" onClick={() => onDelete()}>
            Delete
          </Button>
        </div>
      )}

      <FieldRow label="Font Family">
        <Select value={node.fontFamily} onValueChange={(v) => onChange({ fontFamily: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map((f) => (
              <SelectItem key={f} value={f} className="text-xs">
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow label="Font Weight">
        <Select value={node.fontWeight} onValueChange={(v) => onChange({ fontWeight: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal" className="text-xs">Normal</SelectItem>
            <SelectItem value="bold" className="text-xs">Bold</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow label="Font Style">
        <Select value={node.fontStyle} onValueChange={(v) => onChange({ fontStyle: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal" className="text-xs">Normal</SelectItem>
            <SelectItem value="italic" className="text-xs">Italic</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow label="Font Size">
        <Input
          type="number"
          min={8}
          max={200}
          value={node.fontSize}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          className="h-8 text-xs"
        />
      </FieldRow>

      <FieldRow label="Color">
        <input
          type="color"
          value={node.color}
          onChange={(e) => onChange({ color: e.target.value })}
          aria-label="Text color"
          className="h-8 w-full cursor-pointer rounded-md border border-input"
        />
      </FieldRow>

      <FieldRow label={`Opacity (${Math.round(node.opacity * 100)}%)`}>
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={[node.opacity]}
          onValueChange={([v]) => onChange({ opacity: v })}
          aria-label="Opacity"
        />
      </FieldRow>

      <FieldRow label={`Rotation (${node.rotation}°)`}>
        <Slider
          min={-180}
          max={180}
          step={1}
          value={[node.rotation]}
          onValueChange={([v]) => onChange({ rotation: v })}
          aria-label="Rotation"
        />
      </FieldRow>

      <FieldRow label="Shadow">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="shadow-toggle"
            checked={node.shadow !== null}
            onChange={(e) =>
              onChange({ shadow: e.target.checked ? DEFAULT_SHADOW : null })
            }
            className="h-4 w-4 cursor-pointer rounded"
          />
          <label htmlFor="shadow-toggle" className="cursor-pointer text-xs">
            Enable shadow
          </label>
        </div>
        {node.shadow && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Label className="w-12 text-xs text-muted-foreground">Color</Label>
              <input
                type="color"
                value={node.shadow.color}
                onChange={(e) =>
                  onChange({ shadow: { ...node.shadow!, color: e.target.value } })
                }
                aria-label="Shadow color"
                className="h-7 flex-1 cursor-pointer rounded border border-input"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">
                Blur ({node.shadow.blur}px)
              </Label>
              <Slider
                min={0}
                max={40}
                step={1}
                value={[node.shadow.blur]}
                onValueChange={([v]) =>
                  onChange({ shadow: { ...node.shadow!, blur: v ?? 0 } })
                }
                aria-label="Shadow blur"
              />
            </div>
          </div>
        )}
      </FieldRow>

      <FieldRow label="Text Background">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="bg-toggle"
            checked={node.textBackground !== null}
            onChange={(e) =>
              onChange({ textBackground: e.target.checked ? DEFAULT_TEXT_BACKGROUND : null })
            }
            className="h-4 w-4 cursor-pointer rounded"
          />
          <label htmlFor="bg-toggle" className="cursor-pointer text-xs">
            Enable background
          </label>
        </div>
        {node.textBackground && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Label className="w-16 text-xs text-muted-foreground">Color</Label>
              <input
                type="color"
                value={node.textBackground.color}
                onChange={(e) =>
                  onChange({ textBackground: { ...node.textBackground!, color: e.target.value } })
                }
                aria-label="Background color"
                className="h-7 flex-1 cursor-pointer rounded border border-input"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">
                Opacity ({Math.round(node.textBackground.opacity * 100)}%)
              </Label>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[node.textBackground.opacity]}
                onValueChange={([v]) =>
                  onChange({ textBackground: { ...node.textBackground!, opacity: v ?? 0 } })
                }
                aria-label="Background opacity"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">
                Blur ({node.textBackground.blur}px)
              </Label>
              <Slider
                min={0}
                max={20}
                step={1}
                value={[node.textBackground.blur]}
                onValueChange={([v]) =>
                  onChange({ textBackground: { ...node.textBackground!, blur: v ?? 0 } })
                }
                aria-label="Background blur"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="w-16 text-xs text-muted-foreground">Padding X</Label>
              <input
                type="number"
                min={0}
                max={40}
                value={node.textBackground.paddingX}
                onChange={(e) =>
                  onChange({ textBackground: { ...node.textBackground!, paddingX: Number(e.target.value) } })
                }
                aria-label="Background padding X"
                className="h-7 flex-1 rounded border border-input px-2 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="w-16 text-xs text-muted-foreground">Padding Y</Label>
              <input
                type="number"
                min={0}
                max={40}
                value={node.textBackground.paddingY}
                onChange={(e) =>
                  onChange({ textBackground: { ...node.textBackground!, paddingY: Number(e.target.value) } })
                }
                aria-label="Background padding Y"
                className="h-7 flex-1 rounded border border-input px-2 text-xs"
              />
            </div>
          </div>
        )}
      </FieldRow>
    </aside>
  );
}
