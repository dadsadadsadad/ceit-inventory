import { stripControlCharacters } from "./clean-text";

const maxTerms = 6;
const maxTermLength = 80;

export function searchTerms(value: string | null | undefined) {
  return stripControlCharacters(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxTerms)
    .map((term) => term.slice(0, maxTermLength));
}

// every word has to match some field
export function everyTermMatches<Condition>(
  terms: string[],
  conditionsFor: (term: string) => Condition[],
) {
  return terms.map((term) => ({ OR: conditionsFor(term) }));
}
