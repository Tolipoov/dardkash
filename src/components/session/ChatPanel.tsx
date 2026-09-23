"use client";

import { useEffect, useRef, useState } from "react";
import { buildWsUrl } from "@/lib/ws";
import { useToast } from "@/components/ui/Toast";

// Bu kodlar bilan yopilsa, muammo vaqtinchalik emas (login yo'q, sessionId
// yo'q, yoki bu suhbatga aloqasi yo'q) — qayta ulanishga urinish faqat
// cheksiz jim tsikl hosil qiladi, foydalanuvchiga hech narsa ko'rinmaydi.
const FATAL_CLOSE_CODES = new Set([4001, 4002, 4003]);

interface ChatMessage {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export default function ChatPanel({
  sessionId,
  myUserId,
  open,
  onClose,
}: {
  sessionId: string;
  myUserId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

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
      const ws = new WebSocket(
        buildWsUrl(`/api/ws/chat?sessionId=${sessionId}`),
      );
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionError(null);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "message") {
          setMessages((prev) => [...prev, data.message]);
        } else if (data.type === "error") {
          toast.push(data.message || "Xabar yuborib bo'lmadi", "error");
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
          setConnectionError("Yozishmaga ulanib bo'lmadi");
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text) return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      toast.push("Yozishmaga ulanish yo'q, biroz kutib qayta urinib ko'ring", "error");
      return;
    }
    wsRef.current.send(JSON.stringify({ content: text }));
    setInput("");
  }

  if (!open) return null;

  return (
    <div className="fixed bottom-24 right-6 z-40 flex h-[420px] w-[320px] flex-col rounded-2xl border border-sahar/15 bg-tun-deep shadow-2xl">
      <div className="flex items-center justify-between border-b border-sahar/10 px-4 py-3">
        <span className="text-sm font-semibold text-sahar">Yozishma</span>
        <button
          onClick={onClose}
          className="text-sahar/50 hover:text-sahar"
          aria-label="Yopish"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {connectionError && (
          <p className="text-center text-xs text-gisht">{connectionError}</p>
        )}
        {!connectionError && messages.length === 0 && (
          <p className="text-center text-xs text-sahar/40">
            Hali xabar yo&apos;q — birinchi bo&apos;lib yozing
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === myUserId;
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-barg text-sahar" : "bg-sahar/10 text-sahar"
                }`}
              >
                {m.content}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-sahar/10 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Xabar yozing..."
          className="flex-1 rounded-full bg-sahar/10 px-4 py-2 text-sm text-sahar outline-none placeholder:text-sahar/40"
        />
        <button
          onClick={send}
          className="rounded-full bg-yulduz px-4 py-2 text-sm font-semibold text-tun-deep"
        >
          →
        </button>
      </div>
    </div>
  );
}
