import Link from "next/link";
import { ArrowRight, Link2Off } from "lucide-react";
import { btn } from "@/components/portal/ui";

export default function InvalidLink({ title, text, retryHref, retryLabel }: { title: string; text: string; retryHref: string; retryLabel: string }) {
  return (
    <div className="flex flex-col gap-5">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-white/[.08] text-[#CAF476]">
        <Link2Off size={26} />
      </span>
      <h2 className="m-0 text-[34px] font-bold leading-[1.1] tracking-[-0.02em]">{title}</h2>
      <p className="m-0 text-white/70">{text}</p>
      <Link href={retryHref} className={`${btn.primary} h-[52px] w-full text-[19px]`}>
        {retryLabel} <ArrowRight size={20} />
      </Link>
    </div>
  );
}
