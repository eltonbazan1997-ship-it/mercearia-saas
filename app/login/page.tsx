"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInAction, signUpAction } from "@/app/actions/auth-actions";
import type { Locale } from "@/lib/i18n/fiado-dictionary";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";

type Mode = "sign-in" | "sign-up";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [locale, setLocale] = useState<Locale>("pt-BR");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const t = getUiDictionary(locale);

  useEffect(() => {
    const browserLanguage = window.navigator.language;
    if (browserLanguage.toLowerCase().startsWith("es")) {
      setLocale("es-419");
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    setError(null);
    setPending(true);

    try {
      const result =
        mode === "sign-in"
          ? await signInAction({ email, password })
          : await signUpAction({ email, password, fullName, storeName, locale });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push("/pdv");
      router.refresh();
    } catch {
      setError(t.login.unexpected);
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:text-sm";

  return (
    <div className="flex h-full min-h-0 overflow-y-auto bg-slate-900 p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom,0px))] pl-[calc(1rem_+_env(safe-area-inset-left,0px))] pr-[calc(1rem_+_env(safe-area-inset-right,0px))] pt-[calc(1rem_+_env(safe-area-inset-top,0px))]">
      <div className="m-auto w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
            {t.login.brand}
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">
            {mode === "sign-in" ? t.login.signInTitle : t.login.signUpTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t.login.subtitle}</p>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          {mode === "sign-up" ? (
            <>
              <div>
                <label htmlFor="login-store" className="text-xs font-semibold text-slate-600">
                  {t.login.storeLabel}
                </label>
                <input
                  id="login-store"
                  type="text"
                  required
                  minLength={2}
                  value={storeName}
                  onChange={(event) => setStoreName(event.target.value)}
                  placeholder={t.login.storePlaceholder}
                  className={`${inputClass} mt-1`}
                />
              </div>
              <div>
                <label htmlFor="login-name" className="text-xs font-semibold text-slate-600">
                  {t.login.nameLabel}
                </label>
                <input
                  id="login-name"
                  type="text"
                  required
                  minLength={2}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder={t.login.namePlaceholder}
                  className={`${inputClass} mt-1`}
                />
              </div>
            </>
          ) : null}

          <div>
            <label htmlFor="login-email" className="text-xs font-semibold text-slate-600">
              {t.login.emailLabel}
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t.login.emailPlaceholder}
              className={`${inputClass} mt-1`}
            />
          </div>

          <div>
            <label htmlFor="login-password" className="text-xs font-semibold text-slate-600">
              {t.login.passwordLabel}
            </label>
            <input
              id="login-password"
              type="password"
              required
              minLength={6}
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t.login.passwordPlaceholder}
              className={`${inputClass} mt-1`}
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {pending
              ? t.login.pending
              : mode === "sign-in"
                ? t.login.signIn
                : t.login.signUp}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
            setError(null);
          }}
          className="mt-5 w-full text-center text-xs font-semibold text-slate-500 hover:text-blue-600"
        >
          {mode === "sign-in" ? t.login.noAccount : t.login.haveAccount}
        </button>
      </div>
    </div>
  );
}
