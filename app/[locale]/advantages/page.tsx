
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Benefits from "@/components/Benefits";
import YourBenefits from "@/components/YourBenefits";
import Strategie from "@/components/Strategie";

export default function AdvantagesPage() {
  return (
    <main className="min-h-screen">
      <Header />
      <Benefits />
      <YourBenefits />
      <Strategie />
      <Footer />
    </main>
  );
}
