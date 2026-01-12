import { ReactNode } from "react";
import Header from "./Header.js";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-tg-bg flex flex-col">
      <Header />
      <main className="flex-1">{children}</main>
    </div>
  );
}
