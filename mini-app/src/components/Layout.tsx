import { ReactNode } from "react";
import Header from "./Header.js";

interface LayoutProps {
  children: ReactNode;
  shareUrl?: string;
}

export default function Layout({ children, shareUrl }: LayoutProps) {
  return (
    <div className="min-h-screen bg-tg-bg flex flex-col">
      <Header shareUrl={shareUrl} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
