'use client';

import Calculator from "@/components/Calculator";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import React from "react";

const MortgageCalculatorPage: React.FC = () => {
  return (
    <main className="min-h-screen">
      <Header />
      <Calculator />
      <Footer />
    </main>
  );
};

export default MortgageCalculatorPage;
