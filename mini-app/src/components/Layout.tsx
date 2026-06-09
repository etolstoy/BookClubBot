import { ReactNode } from "react";
import Header from "./Header.js";
import SubscriptionBanner from "./SubscriptionBanner.js";

interface LayoutProps {
  children: ReactNode;
  shareUrl?: string;
}

export default function Layout({ children, shareUrl }: LayoutProps) {
  return (
    <div className="min-h-screen bg-tg-bg flex flex-col">
      <Header shareUrl={shareUrl} />
      <SubscriptionBanner />
      <main className="flex-1">{children}</main>
    </div>
  );
}
