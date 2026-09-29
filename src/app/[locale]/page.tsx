import BecomeListener from "@/components/landing/BecomeListener";
import Faq from "@/components/landing/Faq";
import FinalCta from "@/components/landing/FinalCta";
import Formats from "@/components/landing/Formats";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import ListenerPreview from "@/components/landing/ListenerPreview";
import RoleCards from "@/components/landing/RoleCards";
import SafetyBlock from "@/components/landing/SafetyBlock";
import { setRequestLocale } from "next-intl/server";

export default function LandingPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  return (
    <div className="bg-sahar text-kul">
      <Hero />
      <RoleCards />
      <section className="rounded-t-[48px] bg-sahar-dim px-6 pt-24 md:px-18">
        <HowItWorks />
        <Formats />
        <SafetyBlock />
      </section>
      <ListenerPreview />
      <BecomeListener />
      <Faq />
      <FinalCta />
    </div>
  );
}
