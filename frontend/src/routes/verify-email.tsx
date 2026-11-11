// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. E-mail confirmation (link from the verification e-mail): confirms
// once on load; an invalid or expired link offers to send a new one.
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-170. Standalone links are 44 px touch targets (link-styles).
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { verifyEmail } from "@/api/generated/sdk.gen";
import { ApiError } from "@/api/problem";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { log } from "@/lib/log";
import { STANDALONE_LINK } from "@/components/ui/link-styles";

interface VerifySearch {
  token?: string;
}

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>): VerifySearch =>
    typeof search.token === "string" ? { token: search.token } : {},
  component: VerifyEmailPage,
});

const linkClass = STANDALONE_LINK;

function VerifyEmailPage() {
  const { t } = useTranslation();
  const { token = "" } = Route.useSearch();
  // A query (not an effect) so the single-use token is sent exactly once, also under StrictMode.
  const result = useQuery({
    queryKey: ["verify-email", token],
    queryFn: async () => {
      const { error } = await verifyEmail({ body: { token } });
      if (error !== undefined) throw new ApiError(error);
      log.info("email_verified");
      return true;
    },
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  if (token && result.isPending) {
    return (
      <AuthCard title={t("auth.verify.title")}>
        <p role="status" className="text-muted">
          {t("auth.verify.checking")}
        </p>
      </AuthCard>
    );
  }
  if (result.isSuccess) {
    return (
      <AuthCard title={t("auth.verify.doneTitle")} intro={t("auth.verify.doneBody")}>
        <Link to="/login" className={linkClass}>
          {t("auth.toLogin")}
        </Link>
      </AuthCard>
    );
  }
  return <InvalidLink />;
}

function InvalidLink() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim()) setSubmitted(email.trim());
  }

  return (
    <AuthCard title={t("auth.verify.invalidTitle")} intro={t("auth.verify.invalidBody")} onSubmit={onSubmit}>
      {submitted ? (
        <ResendVerification email={submitted} />
      ) : (
        <>
          <Field id="verify-email" label={t("auth.email")}>
            {(aria) => (
              <Input
                {...aria}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
              />
            )}
          </Field>
          <Button type="submit">{t("auth.resend.continue")}</Button>
        </>
      )}
      <Link to="/login" className={linkClass}>
        {t("auth.toLogin")}
      </Link>
    </AuthCard>
  );
}
