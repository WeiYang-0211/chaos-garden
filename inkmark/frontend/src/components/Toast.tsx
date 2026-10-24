import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type Props = {
  message: string;
  tone: "info" | "success" | "error";
  onClose: () => void;
};

export function Toast({ message, tone, onClose }: Props) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertCircle : Info;
  return (
    <div className={`toast ${tone}`} role="status">
      <Icon size={16} />
      <span>{message}</span>
      <button onClick={onClose} aria-label="关闭提示">
        <X size={14} />
      </button>
    </div>
  );
}
