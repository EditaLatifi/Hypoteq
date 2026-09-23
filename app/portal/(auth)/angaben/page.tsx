import { redirect } from "next/navigation";
import { ConfirmProfileForm } from "@/components/portal/AuthForms";
import { requireUser } from "@/lib/portal/session";

/** First login, step 2: the partner checks the data HYPOTEQ holds about them. */
export default async function ConfirmProfilePage() {
  const user = await requireUser();
  if (user.viewingAs || user.profileConfirmedAt || user.role === "admin") redirect("/portal/dashboard");
  return <ConfirmProfileForm email={user.email} name={user.name || ""} company={user.company || ""} phone={user.phone || ""} />;
}
