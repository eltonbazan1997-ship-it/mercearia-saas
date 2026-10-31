"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface RefreshDashboardButtonProps {
  label: string;
}

export function RefreshDashboardButton({ label }: RefreshDashboardButtonProps) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 800);
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={refreshing}
      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
    >
      {refreshing ? "..." : label}
    </button>
  );
}
