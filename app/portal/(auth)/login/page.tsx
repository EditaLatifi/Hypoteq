import { redirect } from "next/navigation";
import { LoginForm } from "@/components/portal/AuthForms";
import { readSession } from "@/lib/portal/session";

export default async function LoginPage() {
  if ((await readSession()).state === "ok") redirect("/portal/dashboard");
  return <LoginForm />;
}
