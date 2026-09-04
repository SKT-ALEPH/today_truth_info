import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "오늘의 진짜 정보판",
  description: "서울 현재 기온의 출처, 시각, 일별 기록과 장애 상태를 정직하게 보여주는 정보판",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
