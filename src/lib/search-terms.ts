import { stripControlCharacters } from "./clean-text";

const maximumTerms = 6;
const maximumTermLength = 80;

/** Split a search box value into words so "dell lab 2" can match across several fields. */
export function searchTerms(value: string | null | undefined) {
  return stripControlCharacters(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maximumTerms)
    .map((term) => term.slice(0, maximumTermLength));
}

/**
 * Every word must match at least one of the fields, so each added word narrows the results
 * instead of requiring the whole phrase to appear inside a single field.
 */
export function everyTermMatches<Condition>(
  terms: string[],
  conditionsFor: (term: string) => Condition[],
) {
  return terms.map((term) => ({ OR: conditionsFor(term) }));
}
