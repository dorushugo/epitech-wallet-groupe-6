import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digital Wallet - Groupe 6",
  description: "Wallet avec protocole inter-wallets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased bg-gray-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}
