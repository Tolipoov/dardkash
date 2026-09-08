import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { verifySession } from "./auth/jwt";

// Har bir foydalanuvchi (userId) uchun, uning ochiq dashboard
// oynalari (bir nechta tab/qurilma bo'lishi mumkin) ro'yxati.
const connections = new Map<string, Set<WebSocket>>();

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function attachNotifyWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/api/ws/notify" });

  // "Qo'ng'iroq" bildirishnomasi (incoming_call/new_invite) uchun bu
  // socket uzoq vaqt jim turishi mumkin — bu esa nginx'ning standart
  // proxy_read_timeout'i (60s) yoki ba'zi tarmoq/proksi qatlamlarining
  // "faolsiz" ulanishni jimgina tashlab yuborishiga sabab bo'ladi.
  // Muntazam ping bilan ulanishni tirik ushlab turamiz, javob
  // bermayotgan (yarim uzilgan) klientlarni esa tozalaymiz.
  wss.on("connection", (ws: WebSocket & { isAlive?: boolean }, req) => {
    const token = parseCookie(req.headers.cookie, "dardkash_session");
    const session = token ? verifySession(token) : null;
    if (!session) {
      ws.close(4001, "Login qilinmagan");
      return;
    }

    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    if (!connections.has(session.userId)) connections.set(session.userId, new Set());
    connections.get(session.userId)!.add(ws);

    ws.on("close", () => {
      connections.get(session.userId)?.delete(ws);
      if (connections.get(session.userId)?.size === 0) connections.delete(session.userId);
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients as Set<WebSocket & { isAlive?: boolean }>) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on("close", () => clearInterval(heartbeat));
}

// Boshqa joylardan (masalan /api/session/start ichidan) chaqiriladi —
// foydalanuvchining ochiq barcha oynalariga xabar yuboradi. Agar
// foydalanuvchi hozir saytda bo'lmasa (dashboard ochiq bo'lmasa), bu
// funksiya shunchaki hech narsa qilmaydi — Telegram orqali xabar bериш
// asosiy vazifa qoladi.
export function notifyUser(userId: string, payload: object) {
  const sockets = connections.get(userId);
  if (!sockets) return;
  const message = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
}
