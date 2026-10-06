import "server-only";

import { cache } from "react";

import { prisma } from "@/prisma";

import type { CustomFieldDefinition } from "./custom-fields";

/** Every active custom field, loaded once per request. */
export const loadCustomFields = cache(async (): Promise<CustomFieldDefinition[]> =>
  prisma.customField.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      appliesTo: true,
      categoryId: true,
      choices: true,
      fieldType: true,
      id: true,
      label: true,
      sortOrder: true,
    },
  }),
);
