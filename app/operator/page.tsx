import { redirect } from "next/navigation";

/** Old name for the admin dashboard. */
export default function OperatorPage() {
  redirect("/admin");
}
