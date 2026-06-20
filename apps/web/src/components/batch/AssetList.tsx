import type { ProjectAsset } from "@maga/projects";

interface AssetListProps {
  label: string;
  assets: ProjectAsset[];
}

export function AssetList({ label, assets }: AssetListProps) {
  if (assets.length === 0) return null;

  return (
    <section>
      <h3 className="text-sm font-medium text-foreground">{label}</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className="overflow-hidden rounded-lg border border-border bg-card"
          >
            <img
              src={asset.blobKey}
              alt={asset.filename}
              loading="lazy"
              className="h-24 w-full object-cover"
            />
            <p className="truncate px-2 py-1 text-xs text-muted-foreground">
              {asset.filename}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
