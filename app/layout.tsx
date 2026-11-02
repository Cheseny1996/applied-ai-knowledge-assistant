import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Knowly — Your private knowledge assistant",
  description: "Ask questions across your documents and get answers grounded in exact source passages.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
