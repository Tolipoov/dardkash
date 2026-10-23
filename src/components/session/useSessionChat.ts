"use client";

import { UNREAD_CHANGED_EVENT } from "@/components/call/CallNotifier";
import { useToast } from "@/components/ui/Toast";
import { buildWsUrl } from "@/lib/ws";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

// Bu kodlar bilan yopilsa, muammo vaqtinchalik emas (login yo'q, sessionId
// yo'q, yoki bu suhbatga aloqasi yo'q) — qayta ulanishga urinish faqat
// cheksiz jim tsikl hosil qiladi, foydalanuvchiga hech narsa ko'rinmaydi.
const FATAL_CLOSE_CODES = new Set([4001, 4002, 4003]);

export interface ChatMessage {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

// Suhbat yozishmasi: tarix + real vaqt (/api/ws/chat). Qo'ng'iroq ichidagi
// ChatPanel ham, alohida /messages/[id] sahifasi ham shuni ishlatadi.
export function useSessionChat(
  sessionId: string,
  myUserId: string | null,
  // Suhbatdoshdan yangi xabar kelganda (masalan "o'qilmagan" belgisi uchun).
  onIncoming?: () => void,
  // Yozishma hozir ko'z oldida bo'lsa — kelgan xabarlar o'qilgan deb
  // belgilanadi (sarlavhadagi son kamayadi).
  markRead = false,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const toast = useToast();
  const t = useTranslations("session");
  const onIncomingRef = useRef(onIncoming);
  const myUserIdRef = useRef(myUserId);
  const markReadRef = useRef(markRead);
  useEffect(() => {
    onIncomingRef.current = onIncoming;
    myUserIdRef.current = myUserId;
    markReadRef.current = markRead;
  }, [onIncoming, myUserId, markRead]);

  const markAsRead = useRef(() => {
    fetch(`/api/conversations/${sessionId}/read`, { method: "POST", credentials: "include" })
      .then(() => window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT)))
      .catch(() => {});
  });
  // Yozishma ochilganda (yoki panel ochilganda) — o'qilgan.
  useEffect(() => {
    if (markRead) markAsRead.current();
  }, [markRead]);

  // Avval tarixni yuklaymiz, keyin real vaqt uchun WebSocket ulanamiz
  useEffect(() => {
    fetch(`/api/session/${sessionId}/messages`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.messages) setMessages(data.messages);
      })
      .catch(() => {});

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      const ws = new WebSocket(buildWsUrl(`/api/ws/chat?sessionId=${sessionId}`));
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionError(null);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "message") {
          setMessages((prev) =>
            prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message],
          );
          if (data.message.sender_id !== myUserIdRef.current) {
            onIncomingRef.current?.();
            if (markReadRef.current && document.visibilityState === "visible") {
              markAsRead.current();
            }
          }
        } else if (data.type === "error") {
          toast.push(t("chatSendError"), "error");
        }
      };

      // Uzoq suhbat davomida tarmoq bir lahza uzilishi mumkin — jimgina
      // qayta ulanamiz, aks holda foydalanuvchi xabar yozadi-yu, hech
      // qayerga yetib bormaydi (chunki `send()` faqat readyState OPEN
      // bo'lganda ishlaydi). Lekin 4001-4003 — login yo'q yoki bu suhbatga
      // aloqasi yo'q degani, qayta urinish faqat cheksiz jim tsikl beradi.
      ws.onclose = (event) => {
        if (cancelled) return;
        if (FATAL_CLOSE_CODES.has(event.code)) {
          setConnectionError(t("chatConnectError"));
          return;
        }
        reconnectTimer = setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Qaytadi: true — yuborildi (aloqa bor edi).
  function send(text: string): boolean {
    const content = text.trim();
    if (!content) return false;
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      toast.push(t("chatOffline"), "error");
      return false;
    }
    wsRef.current.send(JSON.stringify({ content }));
    return true;
  }

  return { messages, send, connectionError };
}
