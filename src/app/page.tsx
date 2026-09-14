import { redirect } from "next/navigation";

// Send visitors to the dashboard.
export default function HomePage() {
  redirect("/dashboard");
}
