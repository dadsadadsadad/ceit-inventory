/**
 * The name to show for a staff member. History keeps "username | email" so it can be searched by
 * either; people are shown by username everywhere, and by email only when that is all there is.
 */
export function personName(stored: string | null | undefined) {
  const name = stored?.split(" | ")[0]?.trim();
  return name || null;
}
