import { Monitor, Package } from "lucide-react";

// photo thumbnail if the item has one, otherwise a pc or box icon
export function ItemSymbol({
  itemId,
  photoId,
  isComputer,
  size = 21,
}: {
  itemId: string;
  photoId?: string | null;
  isComputer: boolean;
  size?: number;
}) {
  if (photoId) {
    return (
      <span className="record-symbol has-photo" aria-hidden="true">
        <img
          src={`/dashboard/inventory/${itemId}/photos/${photoId}?size=thumb`}
          alt=""
          loading="lazy"
          decoding="async"
        />
      </span>
    );
  }
  return (
    <span className={`record-symbol ${isComputer ? "is-computer" : ""}`} aria-hidden="true">
      {isComputer ? <Monitor size={size} /> : <Package size={size} />}
    </span>
  );
}
