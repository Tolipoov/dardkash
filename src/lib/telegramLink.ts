// Google orqali kirgan foydalanuvchining Telegram'ini bir martalik havola
// orqali ulaydi: t.me/<bot>?start=<token> (POST /api/telegram/link). Oynani
// fetch'dan OLDIN ochamiz — aks holda (await'dan keyin) mobil brauzerlar uni
// popup deb bloklaydi. Ulangach backend `telegram_linked` socket hodisasini
// yuboradi (CallNotifier → NOTIFY_EVENT).
export async function openTelegramLink(): Promise<boolean> {
  const tab = window.open("", "_blank");
  try {
    const res = await fetch("/api/telegram/link", { method: "POST", credentials: "include" });
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.message);
    if (tab) tab.location.href = data.url;
    else window.location.href = data.url;
    return true;
  } catch (err) {
    console.error(err);
    tab?.close();
    return false;
  }
}
