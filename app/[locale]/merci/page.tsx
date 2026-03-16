"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MerciPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/");
    }, 4000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white">
      <h1 className="text-3xl font-bold mb-4">Merci!</h1>
      <p className="text-lg text-gray-700 mb-8">Votre demande a été envoyée avec succès.</p>
      <p className="text-sm text-gray-500">Vous serez redirigé(e) vers la page d'accueil dans quelques secondes...</p>
    </main>
  );
}
