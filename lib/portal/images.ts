// STUB: replaced by the profile branch
import type { SessionUser } from "@/lib/portal/session";

export async function imageMeta(user: SessionUser): Promise<{ photo: { v: number } | null; logo: { v: number; onLight: boolean } | null }> {
  return { photo: null, logo: null };
}
