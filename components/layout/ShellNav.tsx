"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/actions/auth-actions";
import type { Locale } from "@/lib/i18n/fiado-dictionary";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";

export interface ShellNavProps {
  storeName: string;
  operatorName: string;
  locale: Locale;
}

const ICONS: Record<string, React.ReactNode> = {
  "/dashboard": (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  "/pdv": (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16v12H4z" />
      <path d="M4 10h16" />
      <path d="M8 14h4" />
    </svg>
  ),
  "/produtos": (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8.5 12 4 3 8.5v7L12 20l9-4.5v-7Z" />
      <path d="M3 8.5 12 13l9-4.5" />
      <path d="M12 13v7" />
    </svg>
  ),
  "/fiado": (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
      <path d="M8 7h7" />
      <path d="M8 11h7" />
    </svg>
  ),
  "/configuracoes": (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 9 4.6a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 19.4 9v.1a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.47 1Z" />
    </svg>
  ),
};

const COLLAPSED_KEY = "mercearia_nav_collapsed";

export function ShellNav({ storeName, operatorName, locale }: ShellNavProps) {
  const pathname = usePathname();
  const t = getUiDictionary(locale);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      /* localStorage indisponível */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* localStorage indisponível */
      }
      return next;
    });
  }

  const NAV_ITEMS = [
    { href: "/dashboard", label: t.shell.navDashboard, shortcut: "PAINEL", short: "PAINEL" },
    { href: "/pdv", label: t.shell.navPdv, shortcut: "PDV", short: "PDV" },
    { href: "/produtos", label: t.shell.navProducts, shortcut: "CAD", short: "CAD" },
    { href: "/fiado", label: t.shell.navCredit, shortcut: "FIA", short: "FIA" },
    { href: "/configuracoes", label: t.shell.navSettings, shortcut: "CFG", short: "CFG" },
  ] as const;

  return (
    <>
      <aside
        className={`app-sidebar no-print hidden h-full shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-200 md:flex ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        <div
          className={`border-b border-slate-200 ${collapsed ? "px-2 py-4 text-center" : "px-4 py-4"}`}
        >
          {collapsed ? (
            <p
              className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-bold text-white"
              title={`${storeName} · ${operatorName}`}
            >
              {(storeName || "M").trim().slice(0, 1).toUpperCase()}
            </p>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {t.shell.brand}
              </p>
              <p className="truncate text-sm font-semibold text-slate-800">{storeName}</p>
              <p className="truncate text-xs text-slate-500">{operatorName}</p>
            </>
          )}
        </div>

        <nav className={`flex-1 space-y-1 ${collapsed ? "p-2" : "p-3"}`}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition ${
                  collapsed ? "px-2 py-2.5" : "justify-between px-3 py-2.5"
                } ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {collapsed ? (
                  <>
                    <span className="sr-only">{item.label}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                        active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {item.short}
                    </span>
                  </>
                ) : (
                  <>
                    <span>{item.label}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {item.shortcut}
                    </span>
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        <div className={`space-y-2 border-t border-slate-200 ${collapsed ? "p-2" : "p-3"}`}>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
          >
            {collapsed ? "»" : "« Recolher"}
          </button>
          <button
            type="button"
            onClick={() => void signOutAction()}
            title={collapsed ? t.shell.signOut : undefined}
            className={`w-full rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 ${
              collapsed ? "px-2 py-2" : "px-3 py-2"
            }`}
          >
            {collapsed ? "⏻" : t.shell.signOut}
          </button>
        </div>
      </aside>

      <nav
        aria-label="Navegação principal"
        className="bottom-nav no-print fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md md:hidden"
      >
        <ul className="mx-auto flex w-full max-w-lg items-stretch justify-between px-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-semibold transition ${
                    active ? "text-slate-900" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full ${
                      active ? "bg-slate-900 text-white" : "text-slate-400"
                    }`}
                  >
                    {ICONS[item.href]}
                  </span>
                  <span className="truncate">{item.short}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
