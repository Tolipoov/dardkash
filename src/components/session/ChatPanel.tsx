"use client";

import { useEffect, useRef, useState } from "react";
import { buildWsUrl } from "@/lib/ws";
import { useToast } from "@/components/ui/Toast";
import { SendHorizontal, X } from "lucide-react";

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
  onIncoming,
}: {
  sessionId: string;
  myUserId: string;
  open: boolean;
  onClose: () => void;
  // Suhbatdoshdan yangi xabar kelganda — panel yopiq bo'lsa, tugmada
  // "o'qilmagan" belgisini ko'rsatish uchun.
  onIncoming?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const onIncomingRef = useRef(onIncoming);
  onIncomingRef.current = onIncoming;

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
          if (data.message.sender_id !== myUserId) onIncomingRef.current?.();
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
    // scrollIntoView o'rniga faqat ro'yxatning o'zini aylantiramiz —
    // telefonda scrollIntoView butun sahifani ham siljitib yuborishi mumkin.
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
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
    <div className="fixed inset-x-3 bottom-28 z-[70] flex h-[min(380px,50dvh)] flex-col overflow-hidden rounded-2xl border border-sahar/15 bg-tun-deep/95 shadow-2xl backdrop-blur-md sm:inset-x-auto sm:bottom-32 sm:right-6 sm:w-[340px]">
      <div className="flex items-center justify-between border-b border-sahar/10 px-4 py-2.5">
        <span className="text-sm font-semibold text-sahar">Yozishma</span>
        <button
          onClick={onClose}
          className="text-sahar/50 hover:text-sahar"
          aria-label="Yopish"
        >
          <X size={18} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-3 py-3">
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
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere] ${
                  mine ? "bg-barg text-sahar" : "bg-sahar/10 text-sahar"
                }`}
              >
                {m.content}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-sahar/10 p-2.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Xabar yozing..."
          enterKeyHint="send"
          // min-w-0 — input'ning brauzer bergan minimal kengligi flex'da
          // torayishiga to'sqinlik qilib, yuborish tugmasini ekrandan
          // chiqarib yuborardi. text-base (16px) telefonda — iOS 16px'dan
          // kichik shriftli maydonga bosilganda sahifani kattalashtiradi
          // (yonga scroll paydo bo'lardi).
          className="min-w-0 flex-1 rounded-full bg-sahar/10 px-4 py-2 text-base text-sahar outline-none placeholder:text-sahar/40 sm:text-sm"
        />
        <button
          onClick={send}
          aria-label="Yuborish"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-barg text-sahar hover:bg-barg/90"
        >
          <SendHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}
