"use client";

import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import TopicTag from "@/components/ui/TopicTag";
import { useRouter } from "@/i18n/navigation";
import { TOPIC_CODES, type TopicCode } from "@/lib/topics";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Role = "speaker" | "listener" | "both";
type Step = 1 | 2 | 3 | 4;

interface FormState {
  nickname: string;
  ageRange: string;
  gender: "male" | "female" | "skip" | "";
  phone: string;
  role: Role | "";
  topics: TopicCode[];
  bio: string;
  acceptedRules: boolean;
}

const AGE_RANGES = ["18-24", "25-34", "35-44", "45+"];

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "").replace(/^998/, "");
  const parts = [
    digits.slice(0, 2),
    digits.slice(2, 5),
    digits.slice(5, 7),
    digits.slice(7, 9),
  ].filter(Boolean);

  if (parts.length === 0) return "+998 ";
  return "+998 " + parts.join(" ");
}

export default function OnboardingForm() {
  const t = useTranslations("onboarding");
  const tTopics = useTranslations("topics");
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = (searchParams.get("role") as Role) || "";
  const toast = useToast();
  const [step, setStep] = useState<Step>(1);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<FormState>({
    nickname: "",
    ageRange: "",
    gender: "",
    phone: "",
    role: initialRole,
    topics: [],
    bio: "",
    acceptedRules: false,
  });

  useEffect(() => {
    fetch("/api/profile", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          router.push(
            `/auth?next=/onboarding${form.role ? `?role=${form.role}` : ""}`,
          );
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        const p = data?.profile;
        if (!p) return;
        setForm((prev) => ({
          ...prev,
          nickname: p.nickname || prev.nickname,
          ageRange: p.age_range || prev.ageRange,
          gender: p.gender || prev.gender,
          phone: p.phone || prev.phone,
          role: p.wants || prev.role,
          topics: p.topics?.length ? p.topics : prev.topics,
          bio: p.bio || prev.bio,
        }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wantsListener = form.role === "listener" || form.role === "both";
  const totalSteps: Step = wantsListener ? 4 : 3;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleTopic(code: TopicCode) {
    setForm((prev) => ({
      ...prev,
      topics: prev.topics.includes(code)
        ? prev.topics.filter((c) => c !== code)
        : [...prev.topics, code],
    }));
  }

  const canProceed = useMemo(() => {
    if (step === 1)
      return form.nickname.trim().length >= 2 && form.ageRange !== "";
    if (step === 2) return form.role !== "";
    if (step === 3) return form.topics.length > 0;
    if (step === 4) return form.bio.trim().length > 0 && form.acceptedRules;
    return false;
  }, [step, form]);

  async function handleFinish() {
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...form, wants: form.role }),
      });
      if (!res.ok) throw new Error("Saqlashda xato");
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      toast.push("Xatolik yuz berdi, qayta urinib ko'ring", "error");
    }
  }

  if (submitted && wantsListener) {
    return (
      <section className="flex min-h-[70vh] items-center justify-center bg-sahar px-6 py-16">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 h-14 w-14 rounded-full bg-yulduz/20 flex items-center justify-center text-2xl">
            🟡
          </div>
          <h1 className="font-display text-2xl text-kul">
            {t("pendingTitle")}
          </h1>
          <p className="mt-3 text-kul/70">{t("pendingBody")}</p>
          <Button className="mt-8" onClick={() => router.push("/dashboard")}>
            {t("finish")}
          </Button>
        </div>
      </section>
    );
  }

  if (submitted) {
    router.push("/dashboard");
    return null;
  }

  return (
    <section className="bg-sahar px-6 py-14">
      <div className="mx-auto max-w-xl">
        <p className="mb-2 text-sm font-semibold text-barg">
          {t("stepLabel", { current: step, total: totalSteps })}
        </p>
        <div className="mb-10 h-1.5 w-full overflow-hidden rounded-full bg-kul/10">
          <div
            className="h-full rounded-full bg-barg transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <h1 className="font-display text-2xl text-kul">
              {t("step1Title")}
            </h1>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-kul/80">
                {t("nickname")}
              </label>
              <input
                value={form.nickname}
                onChange={(e) => update("nickname", e.target.value)}
                placeholder={t("nicknamePlaceholder")}
                className="w-full rounded-2xl border border-kul/15 bg-white/70 px-4 py-3 outline-none focus:border-barg"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-kul/80">
                {t("ageRange")}
              </label>
              <div className="flex flex-wrap gap-2">
                {AGE_RANGES.map((range) => (
                  <TopicTag
                    key={range}
                    as="button"
                    label={range}
                    selected={form.ageRange === range}
                    onClick={() => update("ageRange", range)}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-kul/80">
                {t("gender")}
              </label>
              <div className="flex flex-wrap gap-2">
                <TopicTag
                  as="button"
                  label={t("genderMale")}
                  selected={form.gender === "male"}
                  onClick={() => update("gender", "male")}
                />
                <TopicTag
                  as="button"
                  label={t("genderFemale")}
                  selected={form.gender === "female"}
                  onClick={() => update("gender", "female")}
                />
                <TopicTag
                  as="button"
                  label={t("genderSkip")}
                  selected={form.gender === "skip"}
                  onClick={() => update("gender", "skip")}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-kul/80">
                {t("phone")}
              </label>
              <input
                value={form.phone}
                onChange={(e) =>
                  update("phone", formatPhoneNumber(e.target.value))
                }
                onFocus={() => {
                  if (!form.phone) update("phone", "+998 ");
                }}
                placeholder="+998 90 123 45 67"
                type="tel"
                inputMode="numeric"
                maxLength={17}
                className="w-full rounded-2xl border border-kul/15 bg-white/70 px-4 py-3 outline-none focus:border-barg"
              />
              <p className="mt-1.5 text-xs text-kul/50">{t("phoneNote")}</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h1 className="font-display text-2xl text-kul">
              {t("step2Title")}
            </h1>
            <p className="text-sm text-kul/60">{t("step2Subtitle")}</p>

            <div className="mt-4 grid gap-3">
              {(
                [
                  ["speaker", t("optSpeak")],
                  ["listener", t("optListen")],
                  ["both", t("optBoth")],
                ] as [Role, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => update("role", value)}
                  className={`rounded-2xl border px-5 py-4 text-left transition-colors ${
                    form.role === value
                      ? "border-barg bg-barg/10 text-kul"
                      : "border-kul/15 bg-white/60 text-kul/80 hover:border-barg/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h1 className="font-display text-2xl text-kul">
              {t("step3Title")}
            </h1>
            <p className="text-sm text-kul/60">{t("step3Subtitle")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {TOPIC_CODES.map((code) => (
                <TopicTag
                  key={code}
                  as="button"
                  label={tTopics(code)}
                  selected={form.topics.includes(code)}
                  onClick={() => toggleTopic(code)}
                />
              ))}
            </div>
          </div>
        )}

        {step === 4 && wantsListener && (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-2xl text-kul">
                {t("step4Title")}
              </h1>
              <textarea
                value={form.bio}
                onChange={(e) => update("bio", e.target.value)}
                placeholder={t("bioPlaceholder")}
                rows={4}
                maxLength={300}
                className="mt-3 w-full rounded-2xl border border-kul/15 bg-white/70 px-4 py-3 outline-none focus:border-barg"
              />
            </div>

            <div className="rounded-2xl border border-kul/10 bg-white/50 p-5">
              <h2 className="font-display text-lg text-kul">
                {t("rulesTitle")}
              </h2>
              <ul className="mt-3 space-y-1.5 text-sm text-kul/70">
                <li>• {t("rule1")}</li>
                <li>• {t("rule2")}</li>
                <li>• {t("rule3")}</li>
                <li>• {t("rule4")}</li>
                <li>• {t("rule5")}</li>
              </ul>
              <label className="mt-4 flex items-center gap-2 text-sm text-kul/80">
                <input
                  type="checkbox"
                  checked={form.acceptedRules}
                  onChange={(e) => update("acceptedRules", e.target.checked)}
                  className="h-4 w-4 accent-barg"
                />
                {t("acceptRules")}
              </label>
            </div>
          </div>
        )}

        <div className="mt-10 flex justify-between">
          {step > 1 ? (
            <Button
              variant="ghost"
              onClick={() => setStep((s) => (s - 1) as Step)}
            >
              {t("back")}
            </Button>
          ) : (
            <span />
          )}

          {step < totalSteps ? (
            <Button
              disabled={!canProceed}
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              {t("next")}
            </Button>
          ) : (
            <Button disabled={!canProceed} onClick={handleFinish}>
              {t("finish")}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
