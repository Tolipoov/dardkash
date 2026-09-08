const CLIENT_ID = process.env.GOOGLE_CLIENT_ID as string;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET as string;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI as string;

// Foydalanuvchini Google login sahifasiga yuborish uchun manzil quramiz.
// `state` — CSRF/session-fixation'ga qarshi, callback'da qaytarilgan
// qiymatni cookie'dagi bilan solishtirib tekshirish uchun.
export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Google qaytargan "code"ni haqiqiy access_token'ga almashtiramiz
export async function exchangeCodeForToken(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error("Google token almashtirish xato: " + (await res.text()));
  return res.json() as Promise<{ access_token: string; id_token: string }>;
}

// access_token orqali foydalanuvchining Google profilini olamiz
export async function fetchGoogleUserInfo(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Google profilini olishda xato");
  return res.json() as Promise<{ id: string; email: string; name?: string }>;
}
