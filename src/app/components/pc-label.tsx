import Image from "next/image";

import { formatManilaDate } from "@/lib/manila-date";
import { pcHardwareRows, pcLabelLayout, type PcLabelSize } from "@/lib/pc-label";

type Software = { name: string; version: string | null };

export type PcLabelData = Parameters<typeof pcHardwareRows>[0] & {
  createdAt: Date;
  id: string;
  image: string;
  lastServiceAt: Date | null;
  purchaseDate: Date | null;
  qrCode: string;
  software: Software[];
};

function monthYear(value: Date | null) {
  return value ? formatManilaDate(value, { month: "long", year: "numeric" }).toUpperCase() : "-";
}

export function PcLabel({ item, size }: { item: PcLabelData; size: PcLabelSize }) {
  const hardware = pcHardwareRows(item);
  const { rows, softwareColumns } = pcLabelLayout(hardware.length, item.software.length);
  const software = item.software.map((entry) =>
    [entry.name, entry.version].filter(Boolean).join(" "),
  );
  // fill down the first software column, then the second
  const softwareAt = (row: number, column: number) => software[column * rows + row] ?? "";

  return (
    <article
      className={`pc-label pc-label-${size}${softwareColumns > 1 ? " pc-label-split" : ""}`}
      aria-label={`PC label for ${item.name}`}
    >
      <table className="pc-label-table">
        <colgroup>
          <col className="pc-label-col-name" />
          <col className="pc-label-col-value" />
          {Array.from({ length: softwareColumns }, (_, column) => (
            <col key={column} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th colSpan={2}>Hardware parts / info</th>
            <th colSpan={softwareColumns}>Software installed</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              <th scope="row">{hardware[row]?.[0] ?? ""}</th>
              <td className="pc-label-value">{hardware[row]?.[1] ?? ""}</td>
              {Array.from({ length: softwareColumns }, (_, column) => (
                <td key={column} className="pc-label-software">
                  {software.length || row || column ? softwareAt(row, column) : "None recorded"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>
              <b>Deployed:</b> {monthYear(item.purchaseDate ?? item.createdAt)}
            </td>
            <td colSpan={softwareColumns}>
              <b>Last service:</b> {monthYear(item.lastServiceAt)}
            </td>
          </tr>
        </tfoot>
      </table>
      <div className="pc-label-qr">
        {/* eager so the code is loaded before printing */}
        <Image
          unoptimized
          loading="eager"
          src={item.image}
          alt={`QR code for ${item.assetTag ?? item.name}`}
          width={320}
          height={320}
        />
        <strong>{item.assetTag ?? item.qrCode}</strong>
        <span>CEIT - scan to borrow or report</span>
      </div>
    </article>
  );
}
