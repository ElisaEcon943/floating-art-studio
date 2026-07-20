import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "浮游画室｜把你的画变成会呼吸的网页",
  description: "上传数字画作，提取其中的元素，拖拽编排并赋予网页动效。",
  openGraph: { title: "浮游画室", description: "把你的画，变成会呼吸的网页。" },
  twitter: { card: "summary", title: "浮游画室", description: "把你的画，变成会呼吸的网页。" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
