import { Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TextNode } from "@maga/editor";
import type { ProjectAsset } from "@maga/projects";

interface BulkTextPanelProps {
  overlays: ProjectAsset[];
  textNodes: TextNode[];
  itemTextValues: Record<string, Record<string, string>>;
  textLayerLocks: Record<string, boolean>;
  setItemTextValue: (overlayAssetId: string, textNodeId: string, value: string) => void;
  setTextLayerLock: (textNodeId: string, locked: boolean) => void;
}

/**
 * Bulk text editor: one card per overlay item, one row per text layer.
 * Locked rows show the shared template value (input disabled).
 * Unlocked rows show per-item overrides (falling back to template value as placeholder).
 *
 * Presentational only — no hooks, no business logic. All data and callbacks come from props.
 */
export function BulkTextPanel({
  overlays,
  textNodes,
  itemTextValues,
  textLayerLocks,
  setItemTextValue,
  setTextLayerLock,
}: BulkTextPanelProps) {
  if (overlays.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No overlay items yet. Upload overlays in the Assets section.
      </p>
    );
  }

  if (textNodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No text layers in the template. Add text layers in the Template section.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {overlays.map((overlay) => (
        <OverlayTextCard
          key={overlay.id}
          overlay={overlay}
          textNodes={textNodes}
          itemTextValues={itemTextValues}
          textLayerLocks={textLayerLocks}
          setItemTextValue={setItemTextValue}
          setTextLayerLock={setTextLayerLock}
        />
      ))}
    </div>
  );
}

interface OverlayTextCardProps {
  overlay: ProjectAsset;
  textNodes: TextNode[];
  itemTextValues: Record<string, Record<string, string>>;
  textLayerLocks: Record<string, boolean>;
  setItemTextValue: (overlayAssetId: string, textNodeId: string, value: string) => void;
  setTextLayerLock: (textNodeId: string, locked: boolean) => void;
}

function OverlayTextCard({
  overlay,
  textNodes,
  itemTextValues,
  textLayerLocks,
  setItemTextValue,
  setTextLayerLock,
}: OverlayTextCardProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
      aria-label={`Text layers for ${overlay.filename}`}
    >
      <h3 className="text-sm font-semibold tracking-tight truncate" title={overlay.filename}>
        {overlay.filename}
      </h3>

      {textNodes.map((node, i) => (
        <TextLayerRow
          key={node.id}
          overlayAssetId={overlay.id}
          overlayFilename={overlay.filename}
          node={node}
          index={i}
          locked={textLayerLocks[node.id] ?? false}
          perItemValue={itemTextValues[overlay.id]?.[node.id] ?? ""}
          setItemTextValue={setItemTextValue}
          setTextLayerLock={setTextLayerLock}
        />
      ))}
    </div>
  );
}

interface TextLayerRowProps {
  overlayAssetId: string;
  overlayFilename: string;
  node: TextNode;
  index: number;
  locked: boolean;
  perItemValue: string;
  setItemTextValue: (overlayAssetId: string, textNodeId: string, value: string) => void;
  setTextLayerLock: (textNodeId: string, locked: boolean) => void;
}

function TextLayerRow({
  overlayAssetId,
  overlayFilename,
  node,
  index,
  locked,
  perItemValue,
  setItemTextValue,
  setTextLayerLock,
}: TextLayerRowProps) {
  const inputId = `bulk-text-${overlayAssetId}-${node.id}`;

  // Locked: show shared template value; input disabled.
  // Unlocked: show per-item override; fall back to template value as placeholder.
  const value = locked ? node.content : perItemValue;
  const placeholder = locked ? undefined : node.content;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId} className="text-xs text-muted-foreground shrink-0">
          Text layer {index + 1}
        </Label>
        {/* Style preview: font, size, color — read-only display context, not an editable field */}
        <span
          className="text-xs text-muted-foreground truncate"
          style={{ fontFamily: node.fontFamily, color: node.color }}
          aria-hidden="true"
        >
          {node.fontFamily} · {node.fontSize}px
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          value={value}
          disabled={locked}
          placeholder={placeholder}
          className="flex-1 transition-colors duration-150"
          onChange={(e) => setItemTextValue(overlayAssetId, node.id, e.target.value)}
          aria-label={`Text layer ${index + 1} for ${overlayFilename}`}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 cursor-pointer transition-colors duration-150"
          aria-label={
            locked
              ? `Unlock layer ${index + 1} (edit per item)`
              : `Lock layer ${index + 1} (share across items)`
          }
          aria-pressed={locked}
          onClick={() => setTextLayerLock(node.id, !locked)}
        >
          {locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
