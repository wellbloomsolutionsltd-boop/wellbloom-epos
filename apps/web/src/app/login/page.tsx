import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "../../components/auth/LoginForm";
import { Card } from "../../components/ui/Card";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-story" aria-label="Wellbloom overview">
        <div className="login-story__glow login-story__glow--one" />
        <div className="login-story__glow login-story__glow--two" />

        <div className="login-story__content">
          <Image
            src="/branding/wellbloom-logo-light.svg"
            alt="Wellbloom"
            width={190}
            height={60}
            priority
            className="login-brand-logo"
          />
          <h1>Modern retail operations, built for serious business.</h1>
          <p>
            Sales, inventory, customers, payments, reporting and branch
            control in one secure platform.
          </p>
        </div>

        <p className="login-story__footer">Wellbloom Business Systems</p>
      </section>

      <section className="login-panel">
        <div className="login-panel__mobile-brand">
          <Image
            src="/branding/wellbloom-logo.svg"
            alt="Wellbloom"
            width={170}
            height={57}
            priority
          />
        </div>
        <Card
          className="login-card"
          style={{
            width: "100%",
            maxWidth: 440,
            padding: 32,
            boxShadow: "var(--wb-shadow-md)",
          }}
        >
          <div className="login-card__accent" aria-hidden="true" />
          <LoginForm />
          <div className="login-card__installation-note">
            Secure Wellbloom local installation
          </div>
        </Card>
      </section>
    </main>
  );
}
