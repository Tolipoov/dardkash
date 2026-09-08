import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { verifySession } from "./auth/jwt";
import { pool } from "./db";

// Har bir suhbat (sessionId) uchun, unga ulangan ws-klientlar ro'yxati.
// Xabar kelganda, shu ro'yxatdagi HAMMASIGA (o'zidan tashqari) yuboriladi.
const rooms = new Map<string, Set<WebSocket & { userId: string }>>();

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function attachChatWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/api/ws/chat" });

  // notify-ws.ts'dagi bilan bir xil sabab: uzoq suhbat davomida hech kim
  // yozmasligi mumkin — ping bo'lmasa, nginx/proksi bu "jim" ulanishni
  // vaqt o'tishi bilan yopib yuborishi mumkin.
  wss.on("connection", async (ws: WebSocket & { isAlive?: boolean }, req) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    const token = parseCookie(req.headers.cookie, "dardkash_session");
    const session = token ? verifySession(token) : null;

    if (!session) {
      ws.close(4001, "Login qilinmagan");
      return;
    }

    const url = new URL(req.url || "", "http://localhost");
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      ws.close(4002, "sessionId kerak");
      return;
    }

    // Foydalanuvchi haqiqatan ham shu suhbatning ishtirokchisi ekanini
    // tekshiramiz — aks holda begona odam boshqalarning yozishmasini
    // "tinglashi" mumkin bo'lardi.
    const check = await pool.query(
      "SELECT id FROM sessions WHERE id = $1 AND (speaker_id = $2 OR listener_id = $2)",
      [sessionId, session.userId],
    );
    if (check.rows.length === 0) {
      ws.close(4003, "Bu suhbatga aloqangiz yo'q");
      return;
    }

    const client = Object.assign(ws, { userId: session.userId });
    if (!rooms.has(sessionId)) rooms.set(sessionId, new Set());
    rooms.get(sessionId)!.add(client);

    ws.on("message", async (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (typeof data.content !== "string" || !data.content.trim()) return;
        const content = data.content.trim().slice(0, 2000);

        const inserted = await pool.query(
          `INSERT INTO chat_messages (session_id, sender_id, content)
           VALUES ($1, $2, $3)
           RETURNING id, sender_id, content, created_at`,
          [sessionId, session.userId, content],
        );
        const message = inserted.rows[0];

        // Shu xonadagi hamma ishtirokchiga (o'zi ham) yuboramiz — shunda
        // frontend'da alohida "optimistic update" mantig'i shart emas.
        const payload = JSON.stringify({ type: "message", message });
        for (const peer of rooms.get(sessionId) || []) {
          if (peer.readyState === WebSocket.OPEN) peer.send(payload);
        }
      } catch (err) {
        console.error("Chat WS xabar xatosi:", err);
      }
    });

    ws.on("close", () => {
      rooms.get(sessionId)?.delete(client);
      if (rooms.get(sessionId)?.size === 0) rooms.delete(sessionId);
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
