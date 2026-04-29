"use client";

import { useEffect, useState } from "react";
import type { PublicUser, Organization } from "@/lib/team/types";

export interface MeResponse {
  user: PublicUser | null;
  org?: Organization | null;
  needsSetup?: boolean;
}

export function useMe() {
  const [me, setMe] = useState<MeResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      // One retry before treating a transient failure as a logout — otherwise
      // a flaky network bounces users to the login page mid-session.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await fetch("/api/team/auth/me");
          if (!r.ok && r.status !== 401) throw new Error(`HTTP ${r.status}`);
          const data = await r.json();
          if (!cancelled) setMe(data);
          return;
        } catch {
          if (attempt === 1) {
            if (!cancelled) setMe({ user: null });
            return;
          }
          await new Promise((res) => setTimeout(res, 500));
        }
      }
    }
    loadMe();
    return () => {
      cancelled = true;
    };
  }, []);
  return me;
}

interface UnreadResponse {
  unread: number;
}

export default function TeamShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const me = useMe();
  const [unread, setUnread] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState<string | null>(null);
  const [notifs, setNotifs] = useState<
    Array<{
      id: number;
      task_id: number;
      task_title: string;
      project_key: string;
      task_number: number;
      body: string;
      author_name: string;
      created_at: string;
      read_at: string | null;
    }>
  >([]);

  useEffect(() => {
    if (!me?.user) return;
    const load = () => {
      fetch("/api/team/notifications?unread=1")
        .then((r) => r.json())
        .then((d: UnreadResponse) => setUnread(d.unread ?? 0))
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [me?.user]);

  useEffect(() => {
    if (!me?.user) return;
    fetch("/api/team/diag")
      .then((r) => r.json())
      .then((d: { ok: boolean; next?: string }) => {
        if (!d.ok && d.next) setSetupNeeded(d.next);
        else setSetupNeeded(null);
      })
      .catch(() => {});
  }, [me?.user]);

  useEffect(() => {
    if (!me) return;
    if (!me.user) {
      window.location.href = "/team/login";
    }
  }, [me]);

  if (!me || !me.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    );
  }

  async function logout() {
    await fetch("/api/team/auth/logout", { method: "POST" });
    window.location.href = "/team/login";
  }

  async function openNotifs() {
    setShowNotifs((v) => !v);
    if (!showNotifs) {
      const r = await fetch("/api/team/notifications");
      const d = await r.json();
      setNotifs(d.notifications || []);
    }
  }

  async function markAllRead() {
    await fetch("/api/team/notifications", { method: "POST" });
    setUnread(0);
    setNotifs((n) => n.map((x) => ({ ...x, read_at: new Date().toISOString() })));
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {setupNeeded && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2.5 text-sm text-red-800">
          <div className="mx-auto flex max-w-7xl items-start justify-between gap-3">
            <div>
              <strong className="font-semibold">Setup required:</strong> {setupNeeded}{" "}
              <span className="text-red-700/80">
                — some features won&apos;t work until this is fixed.
              </span>
            </div>
            <a
              href="/api/team/diag"
              target="_blank"
              rel="noreferrer"
              className="shrink-0 whitespace-nowrap rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              View diagnostics →
            </a>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <a href="/team/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900">
                <img src="/logo.png" alt="" className="h-6 w-6 object-contain invert" />
              </div>
              <span className="text-sm font-semibold tracking-tight text-slate-900">
                {me.org?.name || "Team"}
              </span>
            </a>
            <nav className="hidden gap-5 text-sm sm:flex">
              <a href="/team/dashboard" className="text-slate-600 hover:text-slate-900">
                Dashboard
              </a>
              <a href="/team/projects" className="text-slate-600 hover:text-slate-900">
                Projects
              </a>
              <a href="/team/time" className="text-slate-600 hover:text-slate-900">
                Time
              </a>
              <a href="/team/qr" className="text-slate-600 hover:text-slate-900">
                QR Code
              </a>
              {me.user.role === "admin" && (
                <a href="/team/settings" className="text-slate-600 hover:text-slate-900">
                  Settings
                </a>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={openNotifs}
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
                aria-label="Notifications"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
              {showNotifs && (
                <div className="absolute right-0 z-40 mt-2 w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                    <span className="text-sm font-semibold text-slate-900">Notifications</span>
                    <button
                      onClick={markAllRead}
                      className="text-xs text-slate-500 hover:text-slate-800"
                    >
                      Mark all read
                    </button>
                  </div>
                  <ul className="max-h-96 overflow-y-auto">
                    {notifs.length === 0 && (
                      <li className="px-4 py-6 text-center text-sm text-slate-400">
                        Nothing yet.
                      </li>
                    )}
                    {notifs.map((n) => (
                      <li
                        key={n.id}
                        className={`border-b border-slate-50 px-4 py-3 ${
                          !n.read_at ? "bg-blue-50/40" : ""
                        }`}
                      >
                        <a href={`/team/tasks/${n.task_id}`} className="block">
                          <div className="text-xs font-medium text-slate-500">
                            {n.author_name} mentioned you in {n.project_key}-{n.task_number}
                          </div>
                          <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                            {n.task_title}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-xs text-slate-600">{n.body}</div>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-slate-900">{me.user.name}</div>
              <div className="text-xs capitalize text-slate-500">{me.user.role}</div>
            </div>
            <button
              onClick={logout}
              className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {title && (
          <h1 className="mb-6 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        )}
        {children}
      </div>
    </div>
  );
}
