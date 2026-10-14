// strip control chars, postgres rejects null bytes in text. keeps tabs and newlines
const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function stripControlCharacters(value: string) {
  return value.replace(controlCharacters, "");
}
