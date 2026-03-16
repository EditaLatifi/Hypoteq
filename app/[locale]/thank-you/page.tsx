"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ThankYouPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/");
    }, 4000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white">
      <h1 className="text-3xl font-bold mb-4">Thank you!</h1>
      <p className="text-lg text-gray-700 mb-8">Your request was submitted successfully.</p>
      <p className="text-sm text-gray-500">You will be redirected to the homepage in a few seconds...</p>
    </main>
  );
}
