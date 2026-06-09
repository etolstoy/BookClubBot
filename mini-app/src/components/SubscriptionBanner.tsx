import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { activateSubscription } from "../api/client.js";
import Toast from "./Toast.js";
import { useToast } from "../hooks/useToast.js";

export default function SubscriptionBanner() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const { message, showToast } = useToast();

  const handleClick = async () => {
    const tg = window.Telegram?.WebApp;

    if (!tg?.initData) {
      navigate("/subscribe");
      return;
    }

    setIsLoading(true);

    try {
      await activateSubscription();
      showToast("Подписка включена");
    } catch {
      navigate("/subscribe");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        aria-label="Подписаться на новые рецензии"
        className="mx-4 my-3 flex w-[calc(100%-2rem)] items-center gap-2 rounded-md border border-dashed border-[#d97706] bg-[#fff7ed] px-3 py-2 text-left text-sm font-normal text-[#7c2d12] transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
      >
        <span aria-hidden="true" className="text-base leading-none">
          💬
        </span>
        <span>Подпишись на новые рецензии прямо в личку!</span>
      </button>
      {message && <Toast message={message} />}
    </>
  );
}
