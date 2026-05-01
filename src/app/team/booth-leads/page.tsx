"use client";

import { useCallback, useEffect, useState } from "react";
import TeamShell from "../team-shell";
import type { BoothLead } from "@/lib/team/types";

type HeatFilter = "all" | "hot" | "warm" | "cold";
type FollowFilter = "all" | "followed" | "open";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function heatPill(heat: string | null) {
  if (!heat) return <span className="text-slate-400">—</span>;
  const cls =
    heat === "hot"
      ? "bg-red-100 text-red-700"
      : heat === "warm"
        ? "bg-orange-100 text-orange-700"
        : "bg-blue-100 text-blue-700";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {heat}
    </span>
  );
}

export default function BoothLeadsListPage() {
  const [leads, setLeads] = useState<BoothLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BoothLead | null>(null);
  const [heatFilter, setHeatFilter] = useState<HeatFilter>("all");
  const [followFilter, setFollowFilter] = useState<FollowFilter>("all");
  const [search, setSearch] = useState("");

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/team/booth-leads");
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Failed to load (${r.status})`);
      }
      const d = await r.json();
      setLeads(d.leads || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  async function toggleFollowedUp(lead: BoothLead) {
    const next = !lead.followed_up;
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, followed_up: next } : l)),
    );
    if (selected?.id === lead.id) {
      setSelected({ ...selected, followed_up: next });
    }
    try {
      const r = await fetch("/api/team/booth-leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id, followed_up: next }),
      });
      if (!r.ok) throw new Error("Failed to update");
    } catch {
      fetchLeads();
    }
  }

  async function handleDelete(lead: BoothLead) {
    if (
      !window.confirm(
        `Delete lead for "${lead.practice_name || "(no name)"}"?`,
      )
    ) {
      return;
    }
    try {
      const r = await fetch(`/api/team/booth-leads?id=${lead.id}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Failed to delete (${r.status})`);
      }
      if (selected?.id === lead.id) setSelected(null);
      fetchLeads();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete lead");
    }
  }

  function exportCsv() {
    if (leads.length === 0) return;
    const headers = [
      "Created",
      "Lead Type",
      "Practice Name",
      "City/State",
      "PMS",
      "Practice Type",
      "Visitor Role",
      "Doctor Visit At",
      "Doctor Present",
      "Doctor Email",
      "Doctor Phone",
      "Current Solution",
      "Pain Level",
      "Demo Scheduled",
      "Demo Date",
      "Wheel Prize",
      "Heat",
      "Rep",
      "Followed Up",
      "Notes",
    ];
    const rows = leads.map((l) => [
      fmtDateTime(l.created_at),
      l.lead_type || "",
      l.practice_name || "",
      l.city_state || "",
      l.pms || "",
      l.practice_type || "",
      l.visitor_role || "",
      fmtDateTime(l.doctor_visit_at),
      l.doctor_present === true
        ? "Yes"
        : l.doctor_present === false
          ? "No"
          : "",
      l.doctor_email || "",
      l.doctor_phone || "",
      l.current_solution || "",
      l.pain_level ?? "",
      l.demo_scheduled === true
        ? "Yes"
        : l.demo_scheduled === false
          ? "No"
          : "",
      fmtDateTime(l.demo_date),
      l.wheel_prize || "",
      l.heat || "",
      l.rep || "",
      l.followed_up ? "Yes" : "No",
      (l.notes || "").replace(/\n/g, " "),
    ]);
    const csv = [headers, ...rows]
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orthia-booth-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = leads.filter((l) => {
    if (heatFilter !== "all" && l.heat !== heatFilter) return false;
    if (followFilter === "followed" && !l.followed_up) return false;
    if (followFilter === "open" && l.followed_up) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const blob = [
        l.practice_name,
        l.city_state,
        l.pms,
        l.visitor_role,
        l.doctor_email,
        l.doctor_phone,
        l.current_solution,
        l.wheel_prize,
        l.rep,
        l.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  const stats = {
    total: leads.length,
    hot: leads.filter((l) => l.heat === "hot").length,
    warm: leads.filter((l) => l.heat === "warm").length,
    cold: leads.filter((l) => l.heat === "cold").length,
    followed: leads.filter((l) => l.followed_up).length,
    demos: leads.filter((l) => l.demo_scheduled).length,
  };

  return (
    <TeamShell title="Booth Leads">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Tradeshow / conference booth lead capture.
        </p>
        <a
          href="/team/booth-lead"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Lead
        </a>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Stat label="Total" value={stats.total} />
        <Stat label="Hot" value={stats.hot} accent="text-red-600" />
        <Stat label="Warm" value={stats.warm} accent="text-orange-600" />
        <Stat label="Cold" value={stats.cold} accent="text-blue-600" />
        <Stat label="Demos" value={stats.demos} accent="text-purple-600" />
        <Stat
          label="Followed Up"
          value={stats.followed}
          accent="text-green-600"
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search practice, email, notes..."
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={heatFilter}
          onChange={(e) => setHeatFilter(e.target.value as HeatFilter)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All heat</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </select>
        <select
          value={followFilter}
          onChange={(e) => setFollowFilter(e.target.value as FollowFilter)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All status</option>
          <option value="open">Not followed up</option>
          <option value="followed">Followed up</option>
        </select>
        <button
          onClick={exportCsv}
          disabled={leads.length === 0}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-green-600 hover:bg-green-50 disabled:opacity-50"
        >
          Export CSV
        </button>
        <button
          onClick={fetchLeads}
          disabled={loading}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-3 font-medium text-slate-700">Created</th>
              <th className="px-3 py-3 font-medium text-slate-700">Practice</th>
              <th className="px-3 py-3 font-medium text-slate-700">
                City/State
              </th>
              <th className="px-3 py-3 font-medium text-slate-700">PMS</th>
              <th className="px-3 py-3 font-medium text-slate-700">Visitor</th>
              <th className="px-3 py-3 font-medium text-slate-700">Pain</th>
              <th className="px-3 py-3 font-medium text-slate-700">Heat</th>
              <th className="px-3 py-3 font-medium text-slate-700">Demo</th>
              <th className="px-3 py-3 font-medium text-slate-700">Rep</th>
              <th className="px-3 py-3 font-medium text-slate-700">
                Followed Up
              </th>
              <th className="px-3 py-3 font-medium text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  {leads.length === 0
                    ? "No booth leads yet"
                    : "No leads match the filters"}
                </td>
              </tr>
            )}
            {filtered.map((l) => (
              <tr
                key={l.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-3 py-3 text-slate-500">
                  {fmtDate(l.created_at)}
                </td>
                <td className="px-3 py-3 font-medium text-slate-900">
                  {l.practice_name || "—"}
                </td>
                <td className="px-3 py-3 text-slate-700">
                  {l.city_state || "—"}
                </td>
                <td className="px-3 py-3 text-slate-700">{l.pms || "—"}</td>
                <td className="px-3 py-3 text-slate-700">
                  {l.visitor_role || "—"}
                </td>
                <td className="px-3 py-3 text-slate-700">
                  {l.pain_level !== null && l.pain_level !== undefined
                    ? l.pain_level
                    : "—"}
                </td>
                <td className="px-3 py-3">{heatPill(l.heat)}</td>
                <td className="px-3 py-3">
                  {l.demo_scheduled ? (
                    <span className="text-purple-700">
                      {fmtDate(l.demo_date) === "—"
                        ? "Yes"
                        : fmtDate(l.demo_date)}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-slate-700">{l.rep || "—"}</td>
                <td className="px-3 py-3">
                  <button
                    onClick={() => toggleFollowedUp(l)}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      l.followed_up
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {l.followed_up ? "Yes" : "No"}
                  </button>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelected(l)}
                      className="text-blue-600 hover:underline"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleDelete(l)}
                      className="text-red-500 hover:text-red-700 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {selected.practice_name || "(no practice name)"}
                </h2>
                <p className="text-sm text-slate-500">
                  Captured {fmtDateTime(selected.created_at)}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-2xl text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailRow label="Lead Type" value={selected.lead_type} />
              <DetailRow label="City / State" value={selected.city_state} />
              <DetailRow label="PMS" value={selected.pms} />
              <DetailRow
                label="Practice Type"
                value={selected.practice_type}
              />
              <DetailRow label="Visitor Role" value={selected.visitor_role} />
              {selected.visitor_role === "Doctor" && (
                <DetailRow
                  label="Doctor Visit"
                  value={fmtDateTime(selected.doctor_visit_at)}
                />
              )}
              <DetailRow
                label="Doctor Present"
                value={
                  selected.doctor_present === true
                    ? "Yes"
                    : selected.doctor_present === false
                      ? "No"
                      : null
                }
              />
              <DetailRow label="Doctor Email" value={selected.doctor_email} />
              <DetailRow label="Doctor Phone" value={selected.doctor_phone} />
              <DetailRow
                label="Current Solution"
                value={selected.current_solution}
              />
              <DetailRow
                label="Pain Level"
                value={
                  selected.pain_level !== null &&
                  selected.pain_level !== undefined
                    ? `${selected.pain_level} / 10`
                    : null
                }
              />
              <DetailRow
                label="Demo"
                value={
                  selected.demo_scheduled
                    ? `Yes — ${fmtDateTime(selected.demo_date)}`
                    : selected.demo_scheduled === false
                      ? "No"
                      : null
                }
              />
              <DetailRow label="Wheel Prize" value={selected.wheel_prize} />
              <DetailRow label="Heat" value={selected.heat} />
              <DetailRow label="Rep" value={selected.rep} />
              <DetailRow
                label="Followed Up"
                value={selected.followed_up ? "Yes" : "No"}
              />
            </div>

            {selected.notes && (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Notes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                  {selected.notes}
                </p>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => toggleFollowedUp(selected)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  selected.followed_up
                    ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {selected.followed_up
                  ? "Mark not followed up"
                  : "Mark followed up"}
              </button>
              <button
                onClick={() => handleDelete(selected)}
                className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
              <button
                onClick={() => setSelected(null)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </TeamShell>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ?? "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-slate-900">{value || "—"}</p>
    </div>
  );
}
