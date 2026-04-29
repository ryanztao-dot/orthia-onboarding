"use client";

import { useEffect, useState } from "react";
import TeamShell, { useMe } from "../team-shell";
import type { PublicUser, Role } from "@/lib/team/types";

export default function SettingsPage() {
  const me = useMe();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [orgName, setOrgName] = useState("");
  const [orgSaving, setOrgSaving] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  async function load() {
    const [u, m] = await Promise.all([
      fetch("/api/team/users").then((r) => r.json()),
      fetch("/api/team/auth/me").then((r) => r.json()),
    ]);
    setUsers(u.users || []);
    setOrgName(m.org?.name || "");
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (me && me.user && me.user.role !== "admin") {
      window.location.href = "/team/dashboard";
    }
  }, [me]);

  async function saveOrg() {
    setOrgSaving(true);
    await fetch("/api/team/org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: orgName }),
    });
    setOrgSaving(false);
  }

  async function updateRole(id: number, role: Role) {
    await fetch(`/api/team/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    load();
  }

  async function removeUser(id: number) {
    if (!confirm("Remove this user?")) return;
    await fetch(`/api/team/users/${id}`, { method: "DELETE" });
    load();
  }

  async function resetUserPassword(id: number, name: string, email: string) {
    if (
      !confirm(
        `Generate a password reset link for ${name} (${email})?\n\n` +
          "The link is valid for 1 hour. Their existing sessions stay valid until they actually reset.",
      )
    ) {
      return;
    }
    const r = await fetch(`/api/team/users/${id}/reset-password`, { method: "POST" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "Could not generate reset link.");
      return;
    }
    const { url } = (await r.json()) as { url: string };
    // Best-effort copy. If the browser blocks clipboard access (e.g. http://
    // dev origin without permission), fall back to a prompt the admin can
    // copy from.
    try {
      await navigator.clipboard.writeText(url);
      alert(`Reset link copied to clipboard. Share it with ${name}. Expires in 1 hour.`);
    } catch {
      window.prompt(
        `Share this reset link with ${name} (expires in 1 hour):`,
        url,
      );
    }
  }

  return (
    <TeamShell title="Settings">
      <section className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Organization</h2>
        <div className="mt-4 flex gap-2">
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={saveOrg}
            disabled={orgSaving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {orgSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      <section className="mt-6 max-w-4xl rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Team members</h2>
          <button
            onClick={() => setShowInvite(true)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Invite user
          </button>
        </div>
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Role</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="py-2.5 font-medium text-slate-900">{u.name}</td>
                <td className="py-2.5 text-slate-600">{u.email}</td>
                <td className="py-2.5">
                  {me?.user?.id === u.id ? (
                    <span className="capitalize">{u.role}</span>
                  ) : (
                    <select
                      value={u.role}
                      onChange={(e) => updateRole(u.id, e.target.value as Role)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm capitalize"
                    >
                      <option value="admin">Admin</option>
                      <option value="developer">Developer</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  {me?.user?.id !== u.id && (
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => resetUserPassword(u.id, u.name, u.email)}
                        className="text-xs text-slate-500 hover:text-slate-900"
                      >
                        Reset password
                      </button>
                      <button
                        onClick={() => removeUser(u.id)}
                        className="text-xs text-slate-500 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onDone={() => {
            setShowInvite(false);
            load();
          }}
        />
      )}
    </TeamShell>
  );
}

function InviteModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("developer");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const r = await fetch("/api/team/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    setSaving(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.error || "Failed");
      return;
    }
    onDone();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-slate-900">Invite user</h2>
        <p className="text-xs text-slate-500">
          Create the user with an initial password. They can change it later.
        </p>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
            autoFocus
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600">
            Initial password (8+ chars)
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            required
            minLength={8}
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm capitalize"
          >
            <option value="admin">Admin</option>
            <option value="developer">Developer</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Inviting…" : "Invite"}
          </button>
        </div>
      </form>
    </div>
  );
}
