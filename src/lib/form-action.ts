import "server-only";
import { Prisma } from "@prisma/client";

import { FormError } from "./form-error";

// return form errors instead of throwing, prod hides thrown messages
export { FormError };

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
          error: "This already exists.",
        };
      }
      if (error.code === "P2003") {
        return {
          error: "Something this uses was deleted. Refresh and try again.",
        };
      }
      if (error.code === "P2025") {
        return { error: "This was changed or deleted. Refresh and try again." };
      }
      if (error.code === "P2034") {
        return { error: "Someone else saved at the same time. Try again." };
      }
    }
    throw error;
  }
}
