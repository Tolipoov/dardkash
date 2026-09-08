import { useTranslations } from "next-intl";
import clsx from "clsx";

interface ControlBarProps {
  cameraOn: boolean;
  micOn: boolean;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onEndCall: () => void;
  onReport: () => void;
}

function ControlButton({
  active,
  danger,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        "flex h-14 w-14 items-center justify-center rounded-full text-xl transition-colors",
        danger
          ? "bg-gisht text-sahar hover:bg-gisht/90"
          : active
          ? "bg-sahar/10 text-sahar hover:bg-sahar/20"
          : "bg-gisht/90 text-sahar hover:bg-gisht"
      )}
    >
      {children}
    </button>
  );
}

export default function ControlBar({
  cameraOn,
  micOn,
  onToggleCamera,
  onToggleMic,
  onEndCall,
  onReport,
}: ControlBarProps) {
  const t = useTranslations("session");

  return (
    <div className="flex items-center justify-center gap-4 rounded-full bg-tun-deep/90 px-6 py-4 backdrop-blur-md">
      <ControlButton active={micOn} onClick={onToggleMic} label={t("toggleMic")}>
        {micOn ? "🎤" : "🔇"}
      </ControlButton>
      <ControlButton active={cameraOn} onClick={onToggleCamera} label={t("toggleCamera")}>
        {cameraOn ? "🎥" : "📵"}
      </ControlButton>
      <ControlButton danger onClick={onEndCall} label={t("endCall")}>
        📞
      </ControlButton>
      <button
        type="button"
        onClick={onReport}
        className="ml-2 text-sm text-sahar/50 underline-offset-4 hover:text-sahar/80 hover:underline"
      >
        {t("report")}
      </button>
    </div>
  );
}
