import LegacyRoot, { legacyMetadata } from "@/components/legacy/LegacyRoot";
import FunnelShell from "./FunnelShell";

// Root layout of the bare /funnel (it redirects to /{locale}/funnel): the previous root document.
export const metadata = legacyMetadata;

export default function FunnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LegacyRoot>
      <FunnelShell>{children}</FunnelShell>
    </LegacyRoot>
  );
}
