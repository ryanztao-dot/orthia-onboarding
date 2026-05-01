"use client";

import { useState } from "react";
import TeamShell from "../team-shell";

const PMS_OPTIONS = [
  "Dolphin",
  "Orthotrace",
  "Ortho2 Edge",
  "Cloud 9",
  "Wave",
  "Other",
  "Don't Know",
];
const PRACTICE_TYPES = ["Ortho only", "GP + Ortho", "DSO/multilocation"];
const VISITOR_ROLES = ["FD", "Office Manager", "Doctor", "Other"];
const HEAT_OPTIONS = ["hot", "warm", "cold"];
const REPS = ["Clarissa", "Olyver"];

interface FormState {
  lead_type: string;
  practice_name: string;
  city_state: string;
  pms: string;
  practice_type: string;
  visitor_role: string;
  doctor_visit_at: string;
  doctor_present: "yes" | "no" | "";
  doctor_email: string;
  doctor_phone: string;
  current_solution: string;
  pain_level: string;
  demo_scheduled: "yes" | "no" | "";
  demo_date: string;
  wheel_prize: string;
  heat: string;
  rep: string;
  followed_up: "yes" | "no" | "";
  notes: string;
}

const EMPTY: FormState = {
  lead_type: "",
  practice_name: "",
  city_state: "",
  pms: "",
  practice_type: "",
  visitor_role: "",
  doctor_visit_at: "",
  doctor_present: "",
  doctor_email: "",
  doctor_phone: "",
  current_solution: "",
  pain_level: "",
  demo_scheduled: "",
  demo_date: "",
  wheel_prize: "",
  heat: "",
  rep: "",
  followed_up: "",
  notes: "",
};

export default function BoothLeadFormPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    const payload = {
      lead_type: form.lead_type || null,
      practice_name: form.practice_name.trim(),
      city_state: form.city_state.trim() || null,
      pms: form.pms || null,
      practice_type: form.practice_type || null,
      visitor_role: form.visitor_role || null,
      doctor_visit_at:
        form.visitor_role === "Doctor" && form.doctor_visit_at
          ? new Date(form.doctor_visit_at).toISOString()
          : null,
      doctor_present:
        form.doctor_present === "yes"
          ? true
          : form.doctor_present === "no"
            ? false
            : null,
      doctor_email: form.doctor_email.trim() || null,
      doctor_phone: form.doctor_phone.trim() || null,
      current_solution: form.current_solution.trim() || null,
      pain_level: form.pain_level ? parseInt(form.pain_level, 10) : null,
      demo_scheduled:
        form.demo_scheduled === "yes"
          ? true
          : form.demo_scheduled === "no"
            ? false
            : null,
      demo_date:
        form.demo_scheduled === "yes" && form.demo_date
          ? new Date(form.demo_date).toISOString()
          : null,
      wheel_prize: form.wheel_prize.trim() || null,
      heat: form.heat || null,
      rep: form.rep || null,
      followed_up: form.followed_up === "yes",
      notes: form.notes.trim() || null,
    };

    if (!payload.practice_name) {
      setError("Practice name is required");
      setSubmitting(false);
      return;
    }

    try {
      const r = await fetch("/api/team/booth-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Failed to submit (${r.status})`);
      }
      setSuccess(true);
      setForm(EMPTY);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <TeamShell title="Submit Booth Lead">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Capture a tradeshow / conference booth lead.
        </p>
        <a
          href="/team/booth-leads"
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          View all leads →
        </a>
      </div>

      {success && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Lead saved. Submit another, or{" "}
          <a
            href="/team/booth-leads"
            className="font-medium underline"
          >
            view all leads
          </a>
          .
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6"
      >
        <Field label="Doctor or Front Desk Staff">
          <RadioGroup
            name="lead_type"
            value={form.lead_type}
            onChange={(v) => update("lead_type", v)}
            options={[
              { value: "doctor", label: "Doctor" },
              { value: "front_desk", label: "Front Desk Staff" },
            ]}
          />
        </Field>

        <Field label="Practice Name" required>
          <input
            type="text"
            value={form.practice_name}
            onChange={(e) => update("practice_name", e.target.value)}
            required
            className={inputClass}
          />
        </Field>

        <Field label="City / State">
          <input
            type="text"
            value={form.city_state}
            onChange={(e) => update("city_state", e.target.value)}
            placeholder="e.g. Austin, TX"
            className={inputClass}
          />
        </Field>

        <Field label="PMS">
          <select
            value={form.pms}
            onChange={(e) => update("pms", e.target.value)}
            className={selectClass}
          >
            <option value="">Select PMS...</option>
            {PMS_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Practice Type">
          <select
            value={form.practice_type}
            onChange={(e) => update("practice_type", e.target.value)}
            className={selectClass}
          >
            <option value="">Select practice type...</option>
            {PRACTICE_TYPES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Visitor Role">
          <select
            value={form.visitor_role}
            onChange={(e) => update("visitor_role", e.target.value)}
            className={selectClass}
          >
            <option value="">Select visitor role...</option>
            {VISITOR_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>

        {form.visitor_role === "Doctor" && (
          <Field label="Doctor Visit Timestamp">
            <input
              type="datetime-local"
              value={form.doctor_visit_at}
              onChange={(e) => update("doctor_visit_at", e.target.value)}
              className={inputClass}
            />
          </Field>
        )}

        <Field label="Doctor Present at Booth">
          <RadioGroup
            name="doctor_present"
            value={form.doctor_present}
            onChange={(v) =>
              update("doctor_present", v as FormState["doctor_present"])
            }
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
          />
        </Field>

        <Field label="Doctor Email">
          <input
            type="email"
            value={form.doctor_email}
            onChange={(e) => update("doctor_email", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Doctor Cell Phone">
          <input
            type="tel"
            value={form.doctor_phone}
            onChange={(e) => update("doctor_phone", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Current Solution">
          <input
            type="text"
            value={form.current_solution}
            onChange={(e) => update("current_solution", e.target.value)}
            placeholder="What are they using today?"
            className={inputClass}
          />
        </Field>

        <Field label="Pain Level (1-10)">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={10}
              value={form.pain_level || 5}
              onChange={(e) => update("pain_level", e.target.value)}
              className="flex-1"
            />
            <input
              type="number"
              min={1}
              max={10}
              value={form.pain_level}
              onChange={(e) => update("pain_level", e.target.value)}
              placeholder="1-10"
              className={`${inputClass} w-20`}
            />
          </div>
        </Field>

        <Field label="Demo Scheduled">
          <RadioGroup
            name="demo_scheduled"
            value={form.demo_scheduled}
            onChange={(v) =>
              update("demo_scheduled", v as FormState["demo_scheduled"])
            }
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
          />
          {form.demo_scheduled === "yes" && (
            <input
              type="datetime-local"
              value={form.demo_date}
              onChange={(e) => update("demo_date", e.target.value)}
              className={`${inputClass} mt-2`}
            />
          )}
        </Field>

        <Field label="Wheel Prize Won">
          <input
            type="text"
            value={form.wheel_prize}
            onChange={(e) => update("wheel_prize", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Heat">
          <RadioGroup
            name="heat"
            value={form.heat}
            onChange={(v) => update("heat", v)}
            options={HEAT_OPTIONS.map((h) => ({
              value: h,
              label: h.charAt(0).toUpperCase() + h.slice(1),
            }))}
          />
        </Field>

        <Field label="Captured By">
          <RadioGroup
            name="rep"
            value={form.rep}
            onChange={(v) => update("rep", v)}
            options={REPS.map((r) => ({ value: r, label: r }))}
          />
        </Field>

        <Field label="Followed Up">
          <RadioGroup
            name="followed_up"
            value={form.followed_up}
            onChange={(v) =>
              update("followed_up", v as FormState["followed_up"])
            }
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
          />
        </Field>

        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={4}
            className={inputClass}
          />
        </Field>

        <div className="flex items-center gap-3 border-t border-slate-100 pt-5">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Submit Lead"}
          </button>
          <button
            type="button"
            onClick={() => setForm(EMPTY)}
            disabled={submitting}
            className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </form>
    </TeamShell>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const selectClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function RadioGroup({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-4">
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={(e) => onChange(e.target.value)}
            className="h-4 w-4 cursor-pointer text-blue-600 focus:ring-blue-500"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}
