export default function UsersPage() {
  // Sample users for the account page layout.
  const users = [
    { id: 1, name: "Inventory Admin", email: "admin@ceit.local", role: "Administrator", status: "Active" },
    { id: 2, name: "Laboratory Staff", email: "lab@ceit.local", role: "Staff", status: "Active" },
    { id: 3, name: "Property Custodian", email: "custodian@ceit.local", role: "Custodian", status: "Pending" },
  ];

  return (
    <div className="page">
      <div className="page-inner space-y-6">
        {/* Page heading for user management. */}
        <header>
          <p className="eyebrow">
            Users
          </p>
          <h1 className="title mt-3 text-3xl sm:text-4xl">
            Account Directory
          </h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-6">
            A simple user page structure for reviewing account roles before permissions are connected.
          </p>
        </header>

        {/* User account preview cards. */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {users.map((user) => (
            <article
              key={user.id}
              className="card rounded-lg p-5"
            >
              <div className="flex items-start justify-end gap-4">
                <span className="status-pill rounded-md px-2.5 py-1 text-xs font-semibold">
                  {user.status}
                </span>
              </div>
              <h2 className="mt-4 text-base font-semibold">{user.name}</h2>
              <p className="muted mt-1 text-sm">{user.email}</p>
              <div className="divider mt-5 border-t pt-4 text-sm font-medium">
                {user.role}
              </div>
            </article>
          ))}
        </section>

        {/* Basic role list before permissions are built. */}
        <section className="card rounded-lg">
          <div className="divider border-b px-5 py-4">
            <h2 className="text-base font-semibold">Role outline</h2>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {["Administrator", "Staff", "Custodian"].map((role) => (
              <div key={role} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-semibold">{role}</span>
                <span className="muted text-sm">Permission setup pending</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
