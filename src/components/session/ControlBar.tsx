import { useTranslations } from "next-intl";
import clsx from "clsx";
import {
  Flag,
  MessageCircle,
  Mic,
  MicOff,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react";

interface ControlBarProps {
  cameraOn: boolean;
  micOn: boolean;
  chatOpen: boolean;
  chatUnread: boolean;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onToggleChat: () => void;
  onEndCall: () => void;
  onReport: () => void;
}

function ControlButton({
  tone = "default",
  onClick,
  label,
  pressed,
  children,
}: {
  tone?: "default" | "off" | "danger" | "subtle";
  onClick: () => void;
  label: string;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={clsx(
        "relative flex shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sahar/60",
        tone === "danger" ? "h-14 w-14 sm:h-16 sm:w-16" : "h-12 w-12 sm:h-14 sm:w-14",
        tone === "danger" && "bg-gisht text-sahar hover:bg-gisht/90",
        tone === "off" && "bg-sahar text-tun-deep hover:bg-sahar/90",
        tone === "default" && "bg-sahar/15 text-sahar hover:bg-sahar/25",
        tone === "subtle" && "bg-transparent text-sahar/60 hover:bg-sahar/10 hover:text-sahar",
      )}
    >
      {children}
    </button>
  );
}

// Suhbat paytidagi boshqaruv paneli — bitta qatorda, eng kichik telefon
// ekraniga ham sig'adi (5 tugma × 48px + oraliqlar < 320px).
export default function ControlBar({
  cameraOn,
  micOn,
  chatOpen,
  chatUnread,
  onToggleCamera,
  onToggleMic,
  onToggleChat,
  onEndCall,
  onReport,
}: ControlBarProps) {
  const t = useTranslations("session");
  const iconSize = 22;

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-4">
      <ControlButton
        tone={micOn ? "default" : "off"}
        pressed={!micOn}
        onClick={onToggleMic}
        label={t("toggleMic")}
      >
        {micOn ? <Mic size={iconSize} /> : <MicOff size={iconSize} />}
      </ControlButton>
      <ControlButton
        tone={cameraOn ? "default" : "off"}
        pressed={!cameraOn}
        onClick={onToggleCamera}
        label={t("toggleCamera")}
      >
        {cameraOn ? <Video size={iconSize} /> : <VideoOff size={iconSize} />}
      </ControlButton>
      <ControlButton tone="danger" onClick={onEndCall} label={t("endCall")}>
        <PhoneOff size={24} />
      </ControlButton>
      <ControlButton
        tone={chatOpen ? "off" : "default"}
        pressed={chatOpen}
        onClick={onToggleChat}
        label={t("chat")}
      >
        <MessageCircle size={iconSize} />
        {chatUnread && !chatOpen && (
          <span className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-tun-deep bg-yulduz" />
        )}
      </ControlButton>
      <ControlButton tone="subtle" onClick={onReport} label={t("report")}>
        <Flag size={20} />
      </ControlButton>
    </div>
  );
}
