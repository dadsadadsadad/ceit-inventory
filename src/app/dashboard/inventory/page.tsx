//import { prisma } from "@/utils/db/prisma";

// Always read this page from the database at request time.
export const dynamic = "force-dynamic";

function formatStatus(status: string) {
  // Turns database enum values like FOR_REVIEW into readable text.
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

async function getInventoryItems() {
  // The page needs a PostgreSQL connection string before Prisma can query Supabase.
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Add your Supabase PostgreSQL connection string to .env.local, then restart the dev server.");
  }

  if (process.env.DATABASE_URL.includes("[YOUR-PASSWORD]")) {
    throw new Error("DATABASE_URL still has [YOUR-PASSWORD]. Replace it with your real Supabase database password.");
  }

  if (process.env.DATABASE_URL.includes("YOUR_PASSWORD")) {
    throw new Error("DATABASE_URL still has YOUR_PASSWORD. Replace it with your real Supabase database password.");
  }

  // Loads inventory rows with their category and location names.
  return prisma.inventoryItem.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      category: true,
      location: true,
    },
  });
}

export default async function InventoryPage() {
  let inventoryItems: Awaited<ReturnType<typeof getInventoryItems>> = [];
  let databaseError = "";

  try {
    inventoryItems = await getInventoryItems();
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "Could not load inventory from the database.";
  }

  return (
    <div className="page">
      <div className="page-inner space-y-6">
        {/* Page heading for the inventory section. */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">
              Inventory
            </p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">
              Item Register
            </h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">
              Inventory records loaded directly from Supabase PostgreSQL through Prisma.
            </p>
          </div>
          <span className="card rounded-lg px-4 py-2 text-sm font-semibold">
            {databaseError ? "Database not connected" : "Loaded from database"}
          </span>
        </header>

        {databaseError ? (
          /* Database setup message. */
          <div className="notice rounded-lg px-5 py-4 text-sm">
            {databaseError}
          </div>
        ) : inventoryItems.length === 0 ? (
          /* Empty state after the database is connected. */
          <div className="notice rounded-lg px-5 py-4 text-sm">
            No inventory items found. Run npm run db:seed to add the two starter records.
          </div>
        ) : (
          /* Inventory table from Supabase/PostgreSQL. */
          <div className="card overflow-hidden rounded-lg">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="table-heading divider border-b">
                    <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]">
                      Asset Tag
                    </th>
                    <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]">
                      Item
                    </th>
                    <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]">
                      Category
                    </th>
                    <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]">
                      Location
                    </th>
                    <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryItems.map((item) => (
                    <tr key={item.id} className="table-row border-b last:border-0">
                      <td className="muted px-5 py-4 text-sm">{item.assetTag}</td>
                      <td className="px-5 py-4 text-sm font-semibold">{item.name}</td>
                      <td className="muted px-5 py-4 text-sm">{item.category.name}</td>
                      <td className="muted px-5 py-4 text-sm">{item.location.name}</td>
                      <td className="px-5 py-4">
                        <span className="status-pill rounded-md px-2.5 py-1 text-xs font-semibold">
                          {formatStatus(item.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Note for the current database setup step. */}
        <div className="notice rounded-lg px-5 py-4 text-sm">
          Run the Prisma database command first so Supabase creates the tables from the schema.
        </div>
      </div>
    </div>
  );
}
