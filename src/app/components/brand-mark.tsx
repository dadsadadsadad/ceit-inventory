import Image from "next/image";
import { ceitLogoDataUrl } from "@/lib/ceit-logo";

export function BrandMark({ size = 46 }: { size?: number }) {
  return (
    <Image
      src={ceitLogoDataUrl}
      alt=""
      aria-hidden="true"
      width={Math.round((size * 200) / 360)}
      height={size}
      className="brand-mark"
      unoptimized
    />
  );
}
