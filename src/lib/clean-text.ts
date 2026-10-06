// Control characters (the null byte above all) mean nothing in a name, a note, or a search box, and
// PostgreSQL refuses a null byte in text outright. A request that carries one, typed by hand into
// an address or sent by a script, would make a page's query fail, so they are removed where text
// first arrives. Tabs, line breaks, and carriage returns are kept for multi-line notes.
const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function stripControlCharacters(value: string) {
  return value.replace(controlCharacters, "");
}
