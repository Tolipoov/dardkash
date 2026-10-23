import webpush from "web-push";
import { pool } from "./db";
import { isUserConnected } from "./notify-ws";

// Brauzer push-bildirishnomalari (020_push_subscriptions.sql). VAPID kalitlari
// `.env`da (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY); bo'lmasa push o'chiq —
// qolgan hamma narsa (sayt, Telegram) odatdagidek ishlaydi.
const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
export const pushEnabled = Boolean(PUBLIC_KEY && PRIVATE_KEY);
if (pushEnabled) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://dardkash.uz", PUBLIC_KEY, PRIVATE_KEY);
}

export function pushPublicKey(): string | null {
  return pushEnabled ? PUBLIC_KEY : null;
}

interface PushText {
  title: string;
  body: string;
}

export interface PushMessage {
  uz: PushText;
  ru: PushText;
  // Sayt ichidagi yo'l (til prefiksi qo'shiladi), bildirishnoma bosilganda ochiladi.
  path: string;
  // Bir xil teg — eski bildirishnoma yangisi bilan almashadi (masalan bitta yozishma).
  tag?: string;
}

export async function sendPush(userId: string, message: PushMessage) {
  if (!pushEnabled) return;
  const subs = await pool.query(
    `SELECT s.endpoint, s.p256dh, s.auth, p.language
     FROM push_subscriptions s LEFT JOIN profiles p ON p.user_id = s.user_id
     WHERE s.user_id = $1`,
    [userId],
  );
  for (const sub of subs.rows) {
    const ru = sub.language === "ru";
    const text = ru ? message.ru : message.uz;
    const payload = JSON.stringify({
      title: text.title,
      body: text.body,
      url: `${ru ? "/ru" : ""}${message.path}`,
      tag: message.tag,
    });
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 60 * 60 },
      );
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // Obuna bekor qilingan / muddati o'tgan — o'chiramiz.
      if (status === 404 || status === 410) {
        await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [sub.endpoint]);
      } else {
        console.warn("Push yuborilmadi:", status ?? err);
      }
    }
  }
}

// Saytda bo'lmasa (bildirishnoma socket'i ulanmagan) — push.
export function pushIfOffline(userId: string, message: PushMessage) {
  if (!pushEnabled || isUserConnected(userId)) return;
  sendPush(userId, message).catch((err) => console.warn("Push xatosi:", err));
}
