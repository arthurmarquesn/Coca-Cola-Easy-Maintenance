import { redirect } from "next/navigation";

// Legacy demo URL now uses the authenticated dashboard with actual data.
export default function HomePage() {
  redirect("/dashboard/confiabilidade");
}
