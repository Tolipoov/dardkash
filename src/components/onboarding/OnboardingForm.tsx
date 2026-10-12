"use client";

import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import TopicTag from "@/components/ui/TopicTag";
import { useRouter } from "@/i18n/navigation";
import { authHrefFor } from "@/components/landing/useLandingCta";
import { MAX_TOPICS, TOPIC_CODES, type TopicCode } from "@/lib/topics";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Role = "speaker" | "listener" | "both";
type Step = 1 | 2 | 3 | 4;
type Lang = "uz" | "ru";
type PreferredGender = "any" | "male" | "female";

interface FormState {
  nickname: string;
  ageRange: string;
  gender: "male" | "female" | "skip" | "";
  phone: string;
  role: Role | "";
  // `topics` — "nima haqida gaplashmoqchiman", `listenTopics` — "nimada
  // tinglay olaman". "Ikkalasi ham" rolida ular alohida tanlanadi.
  topics: TopicCode[];
  listenTopics: TopicCode[];
  languages: Lang[];
  preferredListenerGender: PreferredGender;
  bio: string;
  acceptedRules: boolean;
}

const AGE_RANGES = ["18-24", "25-34", "35-44", "45-54", "55+"];
const LANGS: Lang[] = ["uz", "ru"];
// server/src/index.ts'dagi MIN_BIO_LENGTH bilan bir xil bo'lishi kerak.
const MIN_BIO_LENGTH = 30;
const MAX_BIO_LENGTH = 300;

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

// Bo'sh (yoki maydonga bosilganda paydo bo'ladigan yolg'iz "+998") — joiz,
// chunki raqam ixtiyoriy; chala yozilgani — yo'q.
function isPhoneOk(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits === "" || digits === "998" || /^998\d{9}$/.test(digits);
}

function sameItems(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v));
}

export default function OnboardingForm() {
  const t = useTranslations("onboarding");
  const tTopics = useTranslations("topics");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = (searchParams.get("role") as Role) || "";
  const isEditMode = searchParams.get("edit") === "1";
  const toast = useToast();
  const [step, setStep] = useState<Step>(1);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [listenerStatus, setListenerStatus] = useState<string | null>(null);
  // Yangi cheklovlar (mavzular soni, bio uzunligi) qo'shilishidan oldin
  // saqlangan qiymatlar — o'zgarmagan bo'lsa, forma ularni rad etmaydi
  // (backend ham xuddi shunday qiladi).
  const [saved, setSaved] = useState<{
    topics: string[];
    listenTopics: string[];
    bio: string;
  }>({ topics: [], listenTopics: [], bio: "" });
  const [form, setForm] = useState<FormState>({
    nickname: "",
    ageRange: "",
    gender: "",
    phone: "",
    role: initialRole,
    topics: [],
    listenTopics: [],
    languages: [locale === "ru" ? "ru" : "uz"],
    preferredListenerGender: "any",
    bio: "",
    acceptedRules: false,
  });

  // Onboarding forma ikkita vazifani bajaradi: birinchi marta ro'yxatdan
  // o'tish va profilni keyinchalik tahrirlash. Asosiy sahifadagi tugmalar
  // orqali kirgan, profili ALLAQACHON to'liq bo'lgan foydalanuvchini har
  // safar qayta 3-4 qadamni bosib o'tishga majburlash o'rniga, to'g'ridan-
  // to'g'ri kabinetga yuboramiz — faqat ataylab "Profilim"dan (?edit=1)
  // kirilganda forma ko'rsatiladi.
  useEffect(() => {
    let redirecting = false;
    fetch("/api/profile", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          // `replace` — orqaga bosilganda yana shu bo'sh sahifaga
          // qaytib, qayta auth'ga otilmasligi uchun. `redirecting` esa
          // navigatsiya tugaguncha forma bir lahza ham ko'rinmasligi uchun.
          redirecting = true;
          router.replace(authHrefFor(initialRole || null, locale));
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        const p = data?.profile;
        if (!p) return;

        const isComplete = Boolean(
          p.nickname && p.age_range && p.wants && p.topics?.length,
        );
        // URL'dagi rol allaqachon saqlangan rol bilan qoplanganmi (masalan
        // saqlangan "both" har ikkalasini ham qoplaydi) — aks holda bu
        // yangi niyat: masalan avval faqat "speaker" bo'lgan odam
        // "Dardkash bo'lish" havolasini bosgan, uni shunchaki
        // dashboard'ga qaytarib yuborish noto'g'ri bo'lardi.
        const roleAlreadyCovered =
          !initialRole || p.wants === initialRole || p.wants === "both";
        if (isComplete && !isEditMode && roleAlreadyCovered) {
          redirecting = true;
          router.replace("/dashboard");
          return;
        }

        // Dardkash mavzulari alohida saqlanmagan bo'lsa (hali dardkash
        // bo'lmagan), boshlang'ich taklif sifatida o'z mavzulari olinadi.
        const listenTopics = p.listen_topics?.length
          ? p.listen_topics
          : p.topics || [];

        setListenerStatus(p.listener_status ?? null);
        setSaved({
          topics: p.topics || [],
          listenTopics: p.listen_topics || [],
          bio: p.bio || "",
        });
        setForm((prev) => ({
          ...prev,
          nickname: p.nickname || prev.nickname,
          ageRange: p.age_range || prev.ageRange,
          gender: p.gender || prev.gender,
          phone: p.phone || prev.phone,
          // Agar URL orqali kelgan rol saqlangan roldan farq qilsa (masalan
          // "speaker" bo'lgan odam endi tinglashni ham xohlasa), ikkalasini
          // ham qoplaydigan "both"ni taklif qilamiz — mavjud rolni
          // o'chirib tashlamaymiz. Aks holda saqlangan rol ishlatiladi.
          role: !p.wants
            ? initialRole || prev.role
            : roleAlreadyCovered
              ? p.wants
              : "both",
          topics: p.topics?.length ? p.topics : prev.topics,
          listenTopics: listenTopics.length ? listenTopics : prev.listenTopics,
          languages: p.languages?.length ? p.languages : prev.languages,
          preferredListenerGender:
            p.preferred_listener_gender || prev.preferredListenerGender,
          bio: p.bio || prev.bio,
          // `listener_profiles` qatori mavjudligi — 4-qadam (qoidalar)
          // avval haqiqatan ko'rsatilgan va qabul qilingan degani. Faqat
          // "speaker" bo'lgan foydalanuvchi bu qadamni umuman ko'rmagan,
          // shuning uchun `p.wants` emas, aynan shu maydon tekshiriladi.
          acceptedRules: prev.acceptedRules || Boolean(p.listener_status),
        }));
      })
      .catch(() => {})
      .finally(() => {
        if (!redirecting) setCheckingProfile(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wantsListener = form.role === "listener" || form.role === "both";
  const wantsSpeaker = form.role === "speaker" || form.role === "both";
  const totalSteps: Step = wantsListener ? 4 : 3;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleTopic(key: "topics" | "listenTopics", code: TopicCode) {
    setForm((prev) => {
      const current = prev[key];
      if (current.includes(code)) {
        return { ...prev, [key]: current.filter((c) => c !== code) };
      }
      if (current.length >= MAX_TOPICS) return prev;
      return { ...prev, [key]: [...current, code] };
    });
  }

  function toggleLanguage(lang: Lang) {
    setForm((prev) => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter((l) => l !== lang)
        : [...prev.languages, lang],
    }));
  }

  function randomNickname() {
    const pick = (list: string) => {
      const items = list.split(",");
      return items[Math.floor(Math.random() * items.length)];
    };
    update(
      "nickname",
      `${pick(t("nicknameAdjectives"))} ${pick(t("nicknameNouns"))}`,
    );
  }

  // Har bir qadamda nima yetishmayotganini aytadigan matn (yoki hammasi
  // joyida bo'lsa null) — avval "Keyingisi" tugmasi sababini aytmasdan
  // shunchaki o'chiq turardi.
  function stepProblem(s: Step): string | null {
    if (s === 1) {
      if (form.nickname.trim().length < 2) return t("hintNickname");
      if (form.ageRange === "") return t("hintAge");
    }
    if (s === 2 && form.role === "") return t("hintRole");
    if (s === 3) {
      const check = (list: string[], savedList: string[]) => {
        if (list.length === 0) return t("hintTopics");
        if (list.length > MAX_TOPICS && !sameItems(list, savedList))
          return t("hintTopicsMax", { max: MAX_TOPICS });
        return null;
      };
      const problem =
        (wantsSpeaker ? check(form.topics, saved.topics) : null) ??
        (wantsListener ? check(form.listenTopics, saved.listenTopics) : null);
      if (problem) return problem;
      if (form.languages.length === 0) return t("hintLanguages");
    }
    if (s === 4 && wantsListener) {
      const bioLength = form.bio.trim().length;
      if (
        bioLength === 0 ||
        (bioLength < MIN_BIO_LENGTH && form.bio !== saved.bio)
      )
        return t("hintBio", { min: MIN_BIO_LENGTH });
      if (!isPhoneOk(form.phone)) return t("hintPhone");
      if (!form.acceptedRules) return t("hintRules");
    }
    return null;
  }

  const allSteps: Step[] = wantsListener ? [1, 2, 3, 4] : [1, 2, 3];
  // Tahrirlash rejimida hamma bo'lim bitta sahifada ko'rsatiladi.
  const problem = isEditMode
    ? (allSteps.map(stepProblem).find(Boolean) ?? null)
    : stepProblem(step);
  const show = (s: Step) => isEditMode || step === s;

  async function handleFinish() {
    setSaving(true);
    try {
      // Faqat "tinglovchi" roli uchun o'z mavzulari alohida so'ralmaydi —
      // backend `topics`ni majburiy deb biladi, shuning uchun bir xil
      // ro'yxat yuboriladi.
      const topics = wantsSpeaker ? form.topics : form.listenTopics;
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nickname: form.nickname,
          ageRange: form.ageRange,
          gender: form.gender,
          phone: isPhoneOk(form.phone) ? form.phone : "",
          wants: form.role,
          topics,
          listenTopics: wantsListener ? form.listenTopics : undefined,
          languages: form.languages,
          preferredListenerGender: form.preferredListenerGender,
          bio: form.bio,
          language: locale,
        }),
      });
      if (!res.ok) {
        const code = (await res.json().catch(() => null))?.code as
          | string
          | undefined;
        const key = `errors.${code}`;
        toast.push(
          code && t.has(key)
            ? t(key, { max: MAX_TOPICS, min: MIN_BIO_LENGTH })
            : t("saveError"),
          "error",
        );
        if (code === "nickname_taken") setStep(1);
        return;
      }
      if (isEditMode && listenerStatus === "approved") {
        toast.push(t("profileUpdated"), "success");
      }
      // Yangi (yoki qayta ko'rib chiqiladigan) dardkash arizasi uchun
      // "ko'rib chiqilmoqda" ekrani, qolganlar to'g'ridan-to'g'ri kabinetga.
      if (wantsListener && listenerStatus !== "approved") {
        setSubmitted(true);
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      console.error(err);
      toast.push(t("saveError"), "error");
    } finally {
      setSaving(false);
    }
  }

  // Allaqachon tasdiqlangan dardkash shunchaki profilini tahrirlasa,
  // "moderatordan o'tishi kerak" ekrani ko'rsatilmaydi — status
  // backend'da ham 'approved' holicha qoladi (server/src/index.ts'dagi
  // profil saqlash yo'lida).
  if (submitted) {
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

  // Asosiy sahifadagi tugmalar endi profilni OLDINDAN (hali shu sahifaga
  // o'tishdan avval) tekshiradi — shuning uchun bu holat deyarli faqat
  // to'g'ridan-to'g'ri URL orqali kirilganda ishga tushadi. Shu payt
  // bo'sh ekran ko'rsatish, "Tekshirilmoqda..." matnini bir lahza
  // ko'rsatib keyin boshqa sahifaga sakrashdan (miltillashdan) ko'ra
  // yaxshiroq.
  if (checkingProfile) {
    return null;
  }

  const labelClass = "mb-1.5 block text-sm font-medium text-kul/80";
  const inputClass =
    "w-full rounded-2xl border border-kul/15 bg-white/70 px-4 py-3 outline-none focus:border-barg";
  const noteClass = "mt-1.5 text-xs text-kul/50";

  function topicPicker(key: "topics" | "listenTopics", title: string) {
    const selected = form[key];
    return (
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-kul/80">{title}</span>
          <span className="shrink-0 text-xs text-kul/50">
            {t("topicsCount", { count: selected.length, max: MAX_TOPICS })}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {TOPIC_CODES.map((code) => (
            <TopicTag
              key={code}
              as="button"
              label={tTopics(code)}
              selected={selected.includes(code)}
              onClick={() => toggleTopic(key, code)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="bg-sahar px-6 py-14">
      <div className={`mx-auto max-w-xl ${isEditMode ? "space-y-12" : ""}`}>
        {isEditMode ? (
          <h1 className="font-display text-3xl text-kul">{t("editTitle")}</h1>
        ) : (
          <>
            <p className="mb-2 text-sm font-semibold text-barg">
              {t("stepLabel", { current: step, total: totalSteps })}
            </p>
            <div className="mb-10 h-1.5 w-full overflow-hidden rounded-full bg-kul/10">
              <div
                className="h-full rounded-full bg-barg transition-all duration-300"
                style={{ width: `${(step / totalSteps) * 100}%` }}
              />
            </div>
          </>
        )}

        {show(1) && (
          <div className="space-y-6">
            <h2 className="font-display text-2xl text-kul">
              {t("step1Title")}
            </h2>

            <div>
              <label className={labelClass}>{t("nickname")}</label>
              <input
                value={form.nickname}
                onChange={(e) => update("nickname", e.target.value)}
                placeholder={t("nicknamePlaceholder")}
                maxLength={40}
                className={inputClass}
              />
              <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <p className="text-xs text-kul/50">{t("nicknameHint")}</p>
                <button
                  type="button"
                  onClick={randomNickname}
                  className="text-xs font-semibold text-barg hover:underline"
                >
                  {t("nicknameRandom")}
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>{t("ageRange")}</label>
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
              <label className={labelClass}>{t("gender")}</label>
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
              <p className={noteClass}>{t("genderNote")}</p>
            </div>
          </div>
        )}

        {show(2) && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl text-kul">
              {t("step2Title")}
            </h2>
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

        {show(3) && (
          <div className="space-y-7">
            <div>
              <h2 className="font-display text-2xl text-kul">
                {t("step3Title")}
              </h2>
              <p className="mt-2 text-sm text-kul/60">{t("step3Subtitle")}</p>
            </div>

            {wantsSpeaker && topicPicker("topics", t("topicsSpeakTitle"))}
            {wantsListener &&
              topicPicker("listenTopics", t("topicsListenTitle"))}

            <div>
              <label className={labelClass}>{t("languagesTitle")}</label>
              <div className="flex flex-wrap gap-2">
                {LANGS.map((lang) => (
                  <TopicTag
                    key={lang}
                    as="button"
                    label={t(lang === "uz" ? "langUz" : "langRu")}
                    selected={form.languages.includes(lang)}
                    onClick={() => toggleLanguage(lang)}
                  />
                ))}
              </div>
            </div>

            {wantsSpeaker && (
              <div>
                <label className={labelClass}>{t("prefGenderTitle")}</label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["any", t("prefAny")],
                      ["female", t("prefFemale")],
                      ["male", t("prefMale")],
                    ] as [PreferredGender, string][]
                  ).map(([value, label]) => (
                    <TopicTag
                      key={value}
                      as="button"
                      label={label}
                      selected={form.preferredListenerGender === value}
                      onClick={() => update("preferredListenerGender", value)}
                    />
                  ))}
                </div>
                <p className={noteClass}>{t("prefGenderNote")}</p>
              </div>
            )}
          </div>
        )}

        {show(4) && wantsListener && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-2xl text-kul">
                {t("step4Title")}
              </h2>
              <p className="mt-2 text-sm text-kul/60">{t("bioHint")}</p>
              <textarea
                value={form.bio}
                onChange={(e) => update("bio", e.target.value)}
                placeholder={t("bioPlaceholder")}
                rows={4}
                maxLength={MAX_BIO_LENGTH}
                className={`mt-3 ${inputClass}`}
              />
              <p className="mt-1 text-right text-xs text-kul/50">
                {t("bioCount", {
                  count: form.bio.length,
                  max: MAX_BIO_LENGTH,
                })}
              </p>
            </div>

            <div>
              <label className={labelClass}>{t("phone")}</label>
              <input
                value={form.phone}
                onChange={(e) =>
                  update("phone", formatPhoneNumber(e.target.value))
                }
                onFocus={() => {
                  if (!form.phone) update("phone", "+998 ");
                }}
                onBlur={() => {
                  if (form.phone.trim() === "+998") update("phone", "");
                }}
                placeholder="+998 90 123 45 67"
                type="tel"
                inputMode="numeric"
                maxLength={17}
                className={inputClass}
              />
              <p className={noteClass}>{t("phoneNote")}</p>
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

        <div className={isEditMode ? "" : "mt-10"}>
          <div className="flex justify-between">
            {isEditMode ? (
              <Button variant="ghost" onClick={() => router.push("/dashboard")}>
                {t("back")}
              </Button>
            ) : step > 1 ? (
              <Button
                variant="ghost"
                onClick={() => setStep((s) => (s - 1) as Step)}
              >
                {t("back")}
              </Button>
            ) : (
              <span />
            )}

            {isEditMode ? (
              <Button
                disabled={Boolean(problem) || saving}
                onClick={handleFinish}
              >
                {t("save")}
              </Button>
            ) : step < totalSteps ? (
              <Button
                disabled={Boolean(problem)}
                onClick={() => setStep((s) => (s + 1) as Step)}
              >
                {t("next")}
              </Button>
            ) : (
              <Button
                disabled={Boolean(problem) || saving}
                onClick={handleFinish}
              >
                {t("finish")}
              </Button>
            )}
          </div>
          {problem && (
            <p className="mt-3 text-right text-xs text-kul/50">{problem}</p>
          )}
        </div>
      </div>
    </section>
  );
}
