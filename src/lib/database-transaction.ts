import { Prisma } from "@prisma/client";
import { prisma } from "@/prisma";

// Retry when another write changes the same records.
export async function runTransaction<T>(
  work: (transaction: Prisma.TransactionClient) => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const conflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!conflict || attempt >= attempts) {
        throw error;
      }
    }
  }
}
