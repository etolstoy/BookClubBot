import { useEffect, useState } from "react";
import { getReaderProfile, type ReaderProfile as Profile } from "../api/client";
import { useTranslation } from "../i18n/index.js";

export default function ReaderProfile({ userId, initialProfile }: {
  userId: string;
  initialProfile: Profile | null;
}) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState(initialProfile);
  useEffect(() => setProfile(initialProfile), [userId, initialProfile]);
  const updating = profile?.status === "pending" || profile?.status === "generating";
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const result = await getReaderProfile(userId);
        if (!cancelled) setProfile(result.readerProfile);
      } catch { /* Keep the last saved text while the connection is unavailable. */ }
    };
    const timer = setInterval(() => { void refresh(); }, updating ? 5000 : 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [userId, updating]);

  return (
    <section className="mb-6" aria-labelledby="reader-profile-heading">
      <h2 id="reader-profile-heading" className="font-semibold text-tg-text mb-3">{t("reviewer.readerProfile")}</h2>
      <div className="rounded-lg bg-tg-secondary p-4">
        {profile?.text ? (
          <p className="text-tg-text text-sm leading-relaxed whitespace-pre-wrap break-words">{profile.text}</p>
        ) : (
          <p className="text-sm text-tg-hint">{t(updating ? "reviewer.profileGenerating" : "reviewer.profileEmpty")}</p>
        )}
        {profile?.text && updating && (
          <p className="mt-3 text-xs text-tg-hint" role="status">{t("reviewer.profileUpdating")}</p>
        )}
      </div>
    </section>
  );
}
