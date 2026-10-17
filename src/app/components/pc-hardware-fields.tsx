import { memoryOptions, storageLabel, storageOptions, storageTypes } from "@/lib/pc-hardware";

export type HardwareSuggestions = {
  graphics: string[];
  processors: string[];
  systems: string[];
};

type HardwareValues = {
  graphics: string | null;
  memoryGb: number | null;
  operatingSystem: string | null;
  processor: string | null;
  storageGb: number | null;
  storageType: string | null;
};

const field = "field mt-2 w-full rounded-lg px-3 py-2.5 text-sm";

// bulk edits start blank, blank means leave it as it is
export function PcHardwareFields({
  computer,
  suggestions,
  bulk = false,
}: {
  computer?: HardwareValues | null;
  suggestions: HardwareSuggestions;
  bulk?: boolean;
}) {
  const blank = bulk ? "Leave as is" : "Not recorded";
  // keep an odd saved value selectable
  const memory = [
    ...new Set([...memoryOptions, ...(computer?.memoryGb ? [computer.memoryGb] : [])]),
  ].sort((a, b) => a - b);
  const storage = [
    ...new Set([...storageOptions, ...(computer?.storageGb ? [computer.storageGb] : [])]),
  ].sort((a, b) => a - b);
  const types = [
    ...new Set([...storageTypes, ...(computer?.storageType ? [computer.storageType] : [])]),
  ];

  return (
    <>
      <label>
        <span className="text-sm font-semibold">Operating system</span>
        <input
          name="operatingSystem"
          list="pc-systems"
          defaultValue={computer?.operatingSystem ?? ""}
          maxLength={255}
          className={field}
          placeholder={bulk ? "Leave as is" : "Windows 11 Pro"}
        />
      </label>
      <label>
        <span className="text-sm font-semibold">Processor</span>
        <input
          name="processor"
          list="pc-processors"
          defaultValue={computer?.processor ?? ""}
          maxLength={255}
          className={field}
          placeholder={bulk ? "Leave as is" : "Pick or type"}
        />
      </label>
      <label>
        <span className="text-sm font-semibold">Graphics</span>
        <input
          name="graphics"
          list="pc-graphics"
          defaultValue={computer?.graphics ?? ""}
          maxLength={255}
          className={field}
          placeholder={bulk ? "Leave as is" : "Pick or type"}
        />
      </label>
      <label>
        <span className="text-sm font-semibold">Memory</span>
        <select name="memoryGb" defaultValue={computer?.memoryGb ?? ""} className={field}>
          <option value="">{blank}</option>
          {memory.map((gb) => (
            <option key={gb} value={gb}>
              {gb} GB
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="text-sm font-semibold">Storage size</span>
        <select name="storageGb" defaultValue={computer?.storageGb ?? ""} className={field}>
          <option value="">{blank}</option>
          {storage.map((gb) => (
            <option key={gb} value={gb}>
              {storageLabel(gb)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="text-sm font-semibold">Storage type</span>
        <select name="storageType" defaultValue={computer?.storageType ?? ""} className={field}>
          <option value="">{blank}</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <datalist id="pc-systems">
        {suggestions.systems.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <datalist id="pc-processors">
        {suggestions.processors.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <datalist id="pc-graphics">
        {suggestions.graphics.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
    </>
  );
}
