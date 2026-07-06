export default function Page() {
  // Temporary dashboard numbers for the basic layout.
  const stats = [
    { label: "Inventory records", value: "24", detail: "Prepared sample entries" },
    { label: "Storage areas", value: "4", detail: "Labs, offices, and supply rooms" },
    { label: "Pending setup", value: "3", detail: "Pages ready for data connection" },
  ];

  return (
    <div className="page">
      <div className="page-inner space-y-8">
        {/* Page title and short status label. */}
        <header className="card rounded-lg px-6 py-7 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow">
                Overview
              </p>
              <h1 className="title mt-3 text-3xl sm:text-4xl">
                Inventory Dashboard
              </h1>
              <p className="muted mt-3 max-w-2xl text-sm leading-6">
                A clean starting point for monitoring CEIT equipment, supplies, and account access.
              </p>
            </div>

            <div className="status-pill rounded-lg px-4 py-3 text-sm font-medium">
              Basic structure ready
            </div>
          </div>
        </header>

        {/* Summary cards across the top. */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <article
              key={stat.label}
              className="card rounded-lg p-6"
            >
              <div className="title text-3xl">{stat.value}</div>
              <div className="mt-2 text-sm font-semibold">{stat.label}</div>
              <p className="muted mt-1 text-sm leading-6">{stat.detail}</p>
            </article>
          ))}
        </section>

        {/* Basic setup progress and next-step note. */}
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.5fr_1fr]">
          <div className="card rounded-lg">
            <div className="divider border-b px-6 py-4">
              <h2 className="text-base font-semibold">Page setup</h2>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {["Dashboard shell", "Inventory listing", "Users directory", "Settings outline"].map((item) => (
                <div key={item} className="flex items-center justify-between gap-4 px-6 py-4">
                  <span className="text-sm font-medium">{item}</span>
                  <span className="status-pill rounded-md px-2.5 py-1 text-xs font-semibold">
                    Ready
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="accent-panel rounded-lg p-6">
            <h2 className="text-base font-semibold">Next milestone</h2>
            <p className="mt-3 text-sm leading-6 text-white/80">
              Connect these pages to real inventory data, authentication, and role permissions when the basic structure is approved.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
