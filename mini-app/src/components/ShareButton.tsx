import { useTranslation } from "../i18n/index.js";
import { copyToClipboard, showHapticFeedback } from "../lib/deepLinks.js";
import { useToast } from "../hooks/useToast.js";
import Toast from "./Toast.js";

interface ShareButtonProps {
  url: string;
  label?: string;
}

export default function ShareButton({ url, label = "🔗" }: ShareButtonProps) {
  const { t } = useTranslation();
  const { message, showToast } = useToast();

  const handleShare = async () => {
    try {
      await copyToClipboard(url);
      showHapticFeedback();
      showToast(t("common.linkCopied"));
    } catch (error) {
      console.error("Failed to copy link:", error);
      // Fallback: Show toast with error (optional)
      showToast("Ошибка копирования");
    }
  };

  return (
    <>
      <button
        onClick={handleShare}
        className="text-tg-text no-underline hover:opacity-70 transition-opacity"
        title={t("common.copyLink")}
      >
        {label}
      </button>
      {message && <Toast message={message} />}
    </>
  );
}
