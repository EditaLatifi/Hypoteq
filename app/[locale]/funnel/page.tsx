import FunnelV3 from "@/components/funnel-v3/FunnelV3";

/**
 * The financing funnel (Funnel v3, docs/funnel-v3). The locale comes from the segment: the
 * [locale] layout validates it and provides the metadata; the funnel reads its texts for the
 * language in the path (lib/funnel-v3/useFunnelT.ts).
 *
 * The previous funnel's step components stay in app/funnel/steps for now.
 */
export default function FunnelPage() {
  return <FunnelV3 />;
}
