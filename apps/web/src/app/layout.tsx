import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "../components/auth/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Wellbloom POS",
    template: "%s · Wellbloom",
  },
  description:
    "Wellbloom retail operations and point of sale",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="app-body">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
