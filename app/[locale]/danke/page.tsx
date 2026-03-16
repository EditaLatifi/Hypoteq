
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DankePage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/");
    }, 4000); // 4 seconds
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white">
      <h1 className="text-3xl font-bold mb-4">Vielen Dank!</h1>
      <p className="text-lg text-gray-700 mb-8">Ihre Anfrage wurde erfolgreich übermittelt.</p>
      <p className="text-sm text-gray-500">Sie werden in wenigen Sekunden zur Startseite weitergeleitet...</p>
    </main>
  );
}
