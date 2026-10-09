import "server-only";
import { Prisma } from "@prisma/client";

import { FormError } from "./form-error";

/** Expected form errors must be returned: production Server Actions redact thrown messages. */
export { FormError };

// Return expected form errors and let redirects continue.
export async function formAction(operation: () => Promise<unknown>) {
  try {
    await operation();
    return { error: null };
  } catch (error) {
    if (error instanceof FormError) {
      return { error: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return {
          error:
            "A record with these details already exists. Check for a duplicate before trying again.",
        };
      }
      if (error.code === "P2003") {
        return {
          error:
            "Something this refers to, such as a room or category, no longer exists. Refresh the page and try again.",
        };
      }
      if (error.code === "P2025") {
        return { error: "This record changed or was removed. Refresh the page and try again." };
      }
      if (error.code === "P2034") {
        return { error: "Another update happened at the same time. Please try again." };
      }
    }
    throw error;
  }
}
