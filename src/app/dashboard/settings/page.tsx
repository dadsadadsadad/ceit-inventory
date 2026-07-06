export default function SettingsPage() {
  // Setting groups shown on the setup page.
  const sections = [
    { title: "Organization", detail: "Campus name, office labels, and inventory identity." },
    { title: "Access", detail: "Login rules and user permission defaults." },
    { title: "Records", detail: "Asset categories, locations, and item condition labels." },
  ];

  return (
    <div className="page">
      <div className="page-narrow space-y-6">
        {/* Page heading for system settings. */}
        <header>
          <p className="eyebrow">
            Settings
          </p>
          <h1 className="title mt-3 text-3xl sm:text-4xl">
            System Setup
          </h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-6">
            A basic settings structure for the configuration areas the system will need later.
          </p>
        </header>

        {/* Main settings categories. */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {sections.map((section) => (
            <article
              key={section.title}
              className="card rounded-lg p-5"
            >
              <h2 className="text-base font-semibold">{section.title}</h2>
              <p className="muted mt-3 text-sm leading-6">{section.detail}</p>
            </article>
          ))}
        </section>

        {/* Read-only preview fields for now. */}
        <section className="card rounded-lg">
          <div className="divider border-b px-5 py-4">
            <h2 className="text-base font-semibold">Configuration preview</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold">Application name</span>
              <input
                type="text"
                value="CEIT Inventory"
                readOnly
                className="field mt-2 w-full rounded-lg px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Default location</span>
              <input
                type="text"
                value="CEIT Stock Room"
                readOnly
                className="field mt-2 w-full rounded-lg px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
