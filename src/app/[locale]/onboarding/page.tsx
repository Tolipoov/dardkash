import { Suspense } from "react";
import OnboardingForm from "@/components/onboarding/OnboardingForm";

// useSearchParams() (rolni URL'dan o'qish uchun) Next.js'da Suspense
// chegarasi ichida bo'lishi shart, aks holda statik eksport paytida xato beradi.
export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingForm />
    </Suspense>
  );
}
