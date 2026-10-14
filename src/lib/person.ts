// stored as "username | email", show the username
export function personName(stored: string | null | undefined) {
  const name = stored?.split(" | ")[0]?.trim();
  return name || null;
}
