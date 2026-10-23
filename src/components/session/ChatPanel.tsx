"use client";

import { useEffect, useRef, useState } from "react";
import { SendHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSessionChat } from "@/components/session/useSessionChat";

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
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("session");
  const { messages, send: sendMessage, connectionError } = useSessionChat(
    sessionId,
    myUserId,
    onIncoming,
    open,
  );

  useEffect(() => {
    // scrollIntoView o'rniga faqat ro'yxatning o'zini aylantiramiz —
    // telefonda scrollIntoView butun sahifani ham siljitib yuborishi mumkin.
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  function send() {
    if (sendMessage(input)) setInput("");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-x-3 bottom-28 z-[70] flex h-[min(380px,50dvh)] flex-col overflow-hidden rounded-2xl border border-sahar/15 bg-tun-deep/95 shadow-2xl backdrop-blur-md sm:inset-x-auto sm:bottom-32 sm:right-6 sm:w-[340px]">
      <div className="flex items-center justify-between border-b border-sahar/10 px-4 py-2.5">
        <span className="text-sm font-semibold text-sahar">{t("chat")}</span>
        <button
          onClick={onClose}
          className="text-sahar/50 hover:text-sahar"
          aria-label={t("chatClose")}
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
            {t("chatEmpty")}
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
          placeholder={t("chatPlaceholder")}
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
          aria-label={t("chatSend")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-barg text-sahar hover:bg-barg/90"
        >
          <SendHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}
