import "./globals.css";
import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata = {
  title: "الوكيل | نظام إدارة حضور العمال",
  description: "نظام داخلي لإدارة حضور العمال والصنايعية، اليوميات، والحصر الأسبوعي لمشاريع المقاولات",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
