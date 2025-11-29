'use client';
import Hypotheken from "@/components/Hypotheken";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import React from "react";

const HypothekenPage: React.FC = () => {
  return (
    <main className="min-h-screen">
      <Header />
   <Hypotheken />
      <Footer />
    </main>
  );
};

export default HypothekenPage;
