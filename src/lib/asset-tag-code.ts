// no server imports here, the setup forms use it to suggest codes

export const tagCodeLength = { min: 2, max: 6 } as const;

export function cleanedTagCode(value: string) {
  return value.toUpperCase().replaceAll(/[^A-Z0-9]/g, "");
}

export function normalizeTagCode(value: string) {
  const code = cleanedTagCode(value);
  return code.length >= tagCodeLength.min && code.length <= tagCodeLength.max ? code : null;
}

const shortWord = (word: string) => (word.length <= 6 ? word : word.slice(0, 5));

// readable codes in order of preference, e.g.
// "COMPUTERS (MAC)" -> MAC, "Robotics" -> ROBOT, "Computer Laboratory 1" -> COMP1
export function tagCodeCandidates(name: string) {
  const upper = name.toUpperCase();
  const inner = upper.match(/\(([^)]*)\)/)?.[1] ?? "";
  const outer = upper.replace(/\([^)]*\)/g, " ");
  const innerWords = inner.match(/[A-Z0-9]+/g) ?? [];
  const words = outer.match(/[A-Z0-9]+/g) ?? [];
  const last = words[words.length - 1] ?? "";
  const number = words.length > 1 && /^\d+$/.test(last) ? last : "";
  const named = words.filter((word) => !/^\d+$/.test(word));

  const candidates = [
    innerWords.length ? shortWord(innerWords.join("")) : "",
    named[0] ? `${named[0].slice(0, Math.max(2, 6 - number.length - 1))}${number}` : "",
    named.length > 1 ? shortWord(named[named.length - 1]) : "",
    words.length > 1 ? words.map((word) => (/^\d+$/.test(word) ? word : word[0])).join("") : "",
  ];
  if (named[0] && !number) {
    candidates[1] = shortWord(named[0]);
  }
  return [...new Set(candidates.map(cleanedTagCode))].filter(
    (code) => code.length >= tagCodeLength.min && code.length <= tagCodeLength.max,
  );
}

// first readable code that is free, then numbered ones
export function suggestTagCode(name: string, usedCodes: Iterable<string | null | undefined> = []) {
  const used = new Set(
    [...usedCodes]
      .map((code) => code?.toUpperCase())
      .filter((code): code is string => Boolean(code)),
  );
  const candidates = tagCodeCandidates(name);
  const free = candidates.find((code) => !used.has(code));
  if (free) {
    return free;
  }
  const base = (candidates[0] ?? "CODE").slice(0, 4);
  for (let sequence = 2; sequence <= 99; sequence += 1) {
    const candidate = `${base}${sequence}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  throw new Error("No codes left. Enter one yourself.");
}
