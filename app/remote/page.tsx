import { redirect } from "next/navigation";

/** The remote buttons live on the admin dashboard now. */
export default function RemotePage() {
  redirect("/admin");
}
