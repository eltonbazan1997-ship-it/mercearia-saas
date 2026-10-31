import { redirect } from "next/navigation";
import { ShellNav } from "@/components/layout/ShellNav";
import { getSessionContext } from "@/lib/auth/session";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await getSessionContext();
  if (!context) {
    redirect("/login");
  }

  const t = getUiDictionary(context.tenant.locale);

  return (
    <div className="safe-area-insets flex h-full min-h-0 overflow-hidden bg-slate-100">
      <ShellNav
        storeName={context.tenant.name}
        operatorName={context.profile.fullName}
        locale={context.tenant.locale}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="app-shell-header no-print flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
              {context.tenant.locale}
            </span>
            <span className="text-xs text-slate-500">
              {t.header.defaultRoll(context.tenant.receiptWidth)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="hidden sm:inline">
              {context.tenant.address ?? t.header.noAddress}
            </span>
            <span className="font-semibold text-slate-700">
              {context.tenant.phone ?? ""}
            </span>
          </div>
        </header>
        <main className="box-border min-h-0 w-full max-w-full flex-1 overflow-y-auto overflow-x-hidden p-4 pb-28 sm:p-6 md:pb-6">{children}</main>
        <footer className="app-shell-footer no-print hidden border-t border-slate-200 bg-white px-6 py-2 text-[11px] text-slate-400 md:block">
          {t.header.footer}
        </footer>
      </div>
    </div>
  );
}
