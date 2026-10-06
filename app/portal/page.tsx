import { redirect } from "next/navigation";
import { readSession } from "@/lib/portal/session";

export default async function PortalIndex() {
  const s = await readSession();
  redirect(s.state === "ok" ? "/portal/dashboard" : "/portal/login");
}
