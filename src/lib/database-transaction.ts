import { Prisma } from "@prisma/client";
import { prisma } from "@/prisma";

// retry on serialization conflicts
export async function runTransaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      // P2034 = write conflict or deadlock, safe to retry
      const conflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!conflict || attempt >= attempts) {
        throw error;
      }
    }
  }
}
