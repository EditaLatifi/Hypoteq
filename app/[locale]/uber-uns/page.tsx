import AboutContent from "@/components/AboutContent";
import ConsultationBanner from "@/components/ConsultationBanner";
import JoinOurTeam from "@/components/JoinOurTeam";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import PartnersSection from "@/components/PartnersSection";
import StatsSection from "@/components/StatsSection";
import TeamSection from "@/components/TeamSection";

export default function AboutPage() {
  return (
    <main className="min-h-screen">
      <Header />
      <AboutContent />
      <div id="mission">
        <StatsSection />
      </div>

      <div id="team">
        <TeamSection />
      </div>

     

      <div id="join">
        <JoinOurTeam />
      </div>

      <ConsultationBanner />
      <div className="mt-[100px] md:mt-[200px]"></div>
      <Footer />
    </main>
  );
}
