"use client";
import Header from "@/components/layout/Header";

export default function FunnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <div className="flex min-h-screen">
        <div className="flex-1 bg-white overflow-visible">
          {children}
        </div>
      </div>
    </>
  );
}
