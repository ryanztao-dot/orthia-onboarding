"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { Submission } from "@/lib/types";
import { SUPPORT_PHONE } from "@/lib/site-config";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const NEW_PATIENT_TYPES = [
  "New Patient Consult",
];

const EXISTING_PATIENT_TYPES = [
  "Retainer Check",
  "Aligner Scan",
  "Change Arch Wire",
  "Change OT",
  "Deliver Aligners",
  "Check Elastics",
  "Deliver Attachments",
  "Deliver Bands",
  "Bonding",
  "Debonding",
  "Other",
];

const APPOINTMENT_TYPES = [...NEW_PATIENT_TYPES, ...EXISTING_PATIENT_TYPES];

const PMS_OPTIONS = [
  "Dolphin",
  "Dentrix",
  "Cloud 9",
  "Ortho2",
  "Open Dental",
  "Eaglesoft",
  "OrthoTrac",
  "Curve Dental",
  "Other",
];

const TIMEZONES = [
  "Eastern (ET)",
  "Central (CT)",
  "Mountain (MT)",
  "Pacific (PT)",
  "Alaska (AKT)",
  "Hawaii (HT)",
];

const INTAKE_FIELDS = [
  "Patient Full Name",
  "Date of Birth",
  "Parent/Guardian Name",
  "Phone",
  "Email",
  "Insurance",
];

const EMERGENCY_ACTIONS = [
  "Escalate as a task",
  "SMS to staff",
  "Email to staff",
  "Book emergency appointment",
];

interface ClinicHours {
  [day: string]: { open: string; close: string; closed: boolean };
}

interface ContactInfo {
  name: string;
  email: string;
  phone: string;
}

interface Closure {
  id: string;
  date: string;
  mode: "closed" | "adjusted";
  startTime: string;
  endTime: string;
  label: string;
}

interface AdditionalLocation {
  id: string;
  label: string;

  // Address & contact
  address: string;
  phone: string;
  email: string;
  timezone: string;
  parkingNotes: string;
  buildingAccess: string;

  // Hours
  clinicHours: ClinicHours;
  upcomingClosures: Closure[];
  lunchHours: LunchConfig;

  // Scheduling rules
  bookingScope: string;
  mainProvider: string;
  allowedProviders: string;
  ageRestrictions: string;
  apptTypes: Record<string, ApptTypeConfig>;
  otherApptType: string;

  // PMS
  pmsName: string;
  pmsVersion: string;

  // Freeform
  notes: string;
}

interface LunchConfig {
  [day: string]: { start: string; end: string; noLunch: boolean };
}

interface ApptTypeConfig {
  enabled: boolean;
  days: string[];
  startTime: string;
  endTime: string;
  duration: string;
  rescheduleWindow: string;
  allowedChairs: string;
  urgentIfUnavailable: boolean | null;
  cancellationWindowHours: string;
  bookBeforeWindow: string;
  bookBeforeUnit: "hours" | "days";
  doubleBookingAllowed: boolean | null;
}

function emptyContact(): ContactInfo {
  return { name: "", email: "", phone: "" };
}

// Accepts either the legacy string shape or the new object shape and returns a ContactInfo.
function coerceContact(val: unknown): ContactInfo {
  if (!val) return emptyContact();
  if (typeof val === "string") return { name: val, email: "", phone: "" };
  if (typeof val === "object") {
    const o = val as Record<string, unknown>;
    return {
      name: typeof o.name === "string" ? o.name : "",
      email: typeof o.email === "string" ? o.email : "",
      phone: typeof o.phone === "string" ? o.phone : "",
    };
  }
  return emptyContact();
}

function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function plusDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function defaultLunchHours(): LunchConfig {
  const h: LunchConfig = {};
  DAYS.forEach(d => { h[d] = { start: "12:00", end: "13:00", noLunch: false }; });
  return h;
}

function defaultClinicHours(): ClinicHours {
  const h: ClinicHours = {};
  DAYS.forEach(d => { h[d] = { open: "09:00", close: "17:00", closed: d === "Saturday" || d === "Sunday" }; });
  return h;
}

function defaultApptTypes(): Record<string, ApptTypeConfig> {
  const t: Record<string, ApptTypeConfig> = {};
  APPOINTMENT_TYPES.forEach(a => {
    t[a] = {
      enabled: a === "New Patient Consult",
      days: [...DAYS.slice(0, 5)],
      startTime: "09:00",
      endTime: "17:00",
      duration: "60",
      rescheduleWindow: "",
      allowedChairs: "",
      urgentIfUnavailable: null,
      cancellationWindowHours: "",
      bookBeforeWindow: "",
      bookBeforeUnit: "hours",
      doubleBookingAllowed: null,
    };
  });
  return t;
}

function mergeApptTypes(loaded: unknown): Record<string, ApptTypeConfig> {
  const base = defaultApptTypes();
  if (!loaded || typeof loaded !== "object") return base;
  const src = loaded as Record<string, Partial<ApptTypeConfig>>;
  for (const key of Object.keys(src)) {
    base[key] = { ...base[key], ...src[key] } as ApptTypeConfig;
  }
  return base;
}

function newClosureId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function newLocationId(): string {
  return `loc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyLocation(): AdditionalLocation {
  return {
    id: newLocationId(),
    label: "",
    address: "",
    phone: "",
    email: "",
    timezone: "",
    parkingNotes: "",
    buildingAccess: "",
    clinicHours: defaultClinicHours(),
    upcomingClosures: [],
    lunchHours: defaultLunchHours(),
    bookingScope: "new_only",
    mainProvider: "",
    allowedProviders: "",
    ageRestrictions: "",
    apptTypes: defaultApptTypes(),
    otherApptType: "",
    pmsName: "",
    pmsVersion: "",
    notes: "",
  };
}

// Fills in defaults for any missing fields so old additional-location records
// (which only had a handful of fields) still load cleanly.
function coerceLocation(raw: unknown): AdditionalLocation {
  const base = emptyLocation();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    id: typeof o.id === "string" && o.id ? o.id : base.id,
    label: typeof o.label === "string" ? o.label : "",
    address: typeof o.address === "string" ? o.address : "",
    phone: typeof o.phone === "string" ? o.phone : "",
    email: typeof o.email === "string" ? o.email : "",
    timezone: typeof o.timezone === "string" ? o.timezone : "",
    parkingNotes: typeof o.parkingNotes === "string" ? o.parkingNotes : "",
    buildingAccess: typeof o.buildingAccess === "string" ? o.buildingAccess : "",
    clinicHours: (o.clinicHours && typeof o.clinicHours === "object") ? (o.clinicHours as ClinicHours) : defaultClinicHours(),
    upcomingClosures: Array.isArray(o.upcomingClosures) ? (o.upcomingClosures as Closure[]) : [],
    lunchHours: (o.lunchHours && typeof o.lunchHours === "object") ? (o.lunchHours as LunchConfig) : defaultLunchHours(),
    bookingScope: typeof o.bookingScope === "string" ? o.bookingScope : "new_only",
    mainProvider: typeof o.mainProvider === "string" ? o.mainProvider : "",
    allowedProviders: typeof o.allowedProviders === "string" ? o.allowedProviders : "",
    ageRestrictions: typeof o.ageRestrictions === "string" ? o.ageRestrictions : "",
    apptTypes: mergeApptTypes(o.apptTypes),
    otherApptType: typeof o.otherApptType === "string" ? o.otherApptType : "",
    pmsName: typeof o.pmsName === "string" ? o.pmsName : "",
    pmsVersion: typeof o.pmsVersion === "string" ? o.pmsVersion : "",
    notes: typeof o.notes === "string" ? o.notes : "",
  };
}

function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <div className="mb-6 border-b pb-3" id={`section-${number}`}>
      <h2 className="text-lg font-semibold text-gray-900">
        <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
          {number}
        </span>
        {title}
      </h2>
    </div>
  );
}

function Toggle({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: string }) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? "bg-blue-600" : "bg-gray-200"}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
      <div>
        <span className="text-sm font-medium text-gray-900">{label}</span>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
    </div>
  );
}

function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex gap-3">
        <button type="button" onClick={() => onChange(true)} className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition ${value === true ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>Yes</button>
        <button type="button" onClick={() => onChange(false)} className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition ${value === false ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>No</button>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const textareaCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

interface SchedulingSettings {
  bookingScope: string;
  mainProvider: string;
  allowedProviders: string;
  ageRestrictions: string;
  apptTypes: Record<string, ApptTypeConfig>;
  otherApptType: string;
}

function ClinicHoursEditor({ value, onChange }: { value: ClinicHours; onChange: (v: ClinicHours) => void }) {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      {DAYS.map(day => {
        const cfg = value[day] ?? { open: "09:00", close: "17:00", closed: false };
        const patch = (p: Partial<typeof cfg>) => onChange({ ...value, [day]: { ...cfg, ...p } });
        return (
          <div key={day} className="flex items-center gap-3">
            <span className="w-24 text-sm font-medium text-gray-700">{day}</span>
            <label className="flex items-center gap-1.5 text-sm text-gray-500">
              <input type="checkbox" checked={cfg.closed} onChange={e => patch({ closed: e.target.checked })} className="rounded border-gray-300" />
              Closed
            </label>
            {!cfg.closed && (
              <>
                <input type="time" value={cfg.open || "09:00"} onChange={e => patch({ open: e.target.value })} className="rounded border border-gray-300 px-2 py-1 text-sm" />
                <span className="text-gray-400">to</span>
                <input type="time" value={cfg.close || "17:00"} onChange={e => patch({ close: e.target.value })} className="rounded border border-gray-300 px-2 py-1 text-sm" />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ClosuresEditor({ value, onChange }: { value: Closure[]; onChange: (v: Closure[]) => void }) {
  const patch = (id: string, p: Partial<Closure>) => onChange(value.map(x => x.id === id ? { ...x, ...p } : x));
  const remove = (id: string) => onChange(value.filter(x => x.id !== id));
  const add = () => onChange([
    ...value,
    { id: newClosureId(), date: todayISO(), mode: "closed", startTime: "09:00", endTime: "17:00", label: "" },
  ]);
  return (
    <div className="space-y-3 rounded-lg border p-4">
      {value.length === 0 && (
        <p className="text-sm text-gray-400">No closures added yet.</p>
      )}
      {value.map((c) => (
        <div key={c.id} className="rounded-lg border bg-white p-3">
          <div className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs text-gray-500">Date</label>
              <input type="date" value={c.date} min={todayISO()} max={plusDaysISO(90)} onChange={e => patch(c.id, { date: e.target.value })} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
            </div>
            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs text-gray-500">Type</label>
              <div className="flex gap-1">
                <button type="button" onClick={() => patch(c.id, { mode: "closed" })} className={`flex-1 rounded px-2 py-1 text-xs font-medium ${c.mode === "closed" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>Closed</button>
                <button type="button" onClick={() => patch(c.id, { mode: "adjusted" })} className={`flex-1 rounded px-2 py-1 text-xs font-medium ${c.mode === "adjusted" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>Adjusted hours</button>
              </div>
            </div>
            {c.mode === "adjusted" && (
              <div className="sm:col-span-3">
                <label className="mb-1 block text-xs text-gray-500">Hours</label>
                <div className="flex items-center gap-1">
                  <input type="time" value={c.startTime} onChange={e => patch(c.id, { startTime: e.target.value })} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs" />
                  <span className="text-xs text-gray-400">-</span>
                  <input type="time" value={c.endTime} onChange={e => patch(c.id, { endTime: e.target.value })} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs" />
                </div>
              </div>
            )}
            <div className={c.mode === "adjusted" ? "sm:col-span-3" : "sm:col-span-6"}>
              <label className="mb-1 block text-xs text-gray-500">Label (optional)</label>
              <input type="text" value={c.label} onChange={e => patch(c.id, { label: e.target.value })} placeholder="e.g., Memorial Day, Dr. out of office" className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={() => remove(c.id)} className="text-xs font-medium text-red-500 hover:text-red-700">Remove</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        Add a closure or adjusted day
      </button>
    </div>
  );
}

function LunchHoursEditor({ value, onChange }: { value: LunchConfig; onChange: (v: LunchConfig) => void }) {
  const copyMondayToAll = () => {
    const monday = value["Monday"] || { start: "12:00", end: "13:00", noLunch: false };
    const next: LunchConfig = {};
    DAYS.forEach(d => { next[d] = { ...monday }; });
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Set lunch hours for each day. Check &ldquo;No lunch&rdquo; for days your office doesn&rsquo;t break.</p>
        <button type="button" onClick={copyMondayToAll} className="text-sm font-medium text-blue-600 hover:underline">Use same lunch for all days</button>
      </div>
      <div className="space-y-2 rounded-lg border p-4">
        {DAYS.map(day => {
          const cfg = value[day] || { start: "12:00", end: "13:00", noLunch: false };
          const patch = (p: Partial<typeof cfg>) => onChange({ ...value, [day]: { ...cfg, ...p } });
          return (
            <div key={day} className="flex items-center gap-3">
              <span className="w-24 text-sm font-medium text-gray-700">{day}</span>
              <label className="flex items-center gap-1.5 text-sm text-gray-500">
                <input type="checkbox" checked={cfg.noLunch} onChange={e => patch({ noLunch: e.target.checked })} className="rounded border-gray-300" />
                No lunch
              </label>
              <input type="time" value={cfg.start} disabled={cfg.noLunch} onChange={e => patch({ start: e.target.value })} className="rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-400" />
              <span className="text-gray-400">to</span>
              <input type="time" value={cfg.end} disabled={cfg.noLunch} onChange={e => patch({ end: e.target.value })} className="rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-400" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SchedulingSettingsEditor({ value, onChange }: { value: SchedulingSettings; onChange: (v: SchedulingSettings) => void }) {
  const patch = (p: Partial<SchedulingSettings>) => onChange({ ...value, ...p });
  const visibleTypes = value.bookingScope === "new_only" ? NEW_PATIENT_TYPES : APPOINTMENT_TYPES;
  const patchType = (type: string, p: Partial<ApptTypeConfig>) =>
    patch({ apptTypes: { ...value.apptTypes, [type]: { ...value.apptTypes[type], ...p } } });
  return (
    <div className="space-y-4">
      <Field label="What can Orthia book?">
        <select value={value.bookingScope} onChange={e => patch({ bookingScope: e.target.value })} className={inputCls}>
          <option value="new_only">New patients only</option>
          <option value="new_and_existing">New and existing patients</option>
        </select>
        <p className="mt-1 text-xs text-blue-600">You can start with just new patients. Existing patient booking can be configured later.</p>
      </Field>
      <Field label="Main Provider for Booking Appointments">
        <input type="text" value={value.mainProvider} onChange={e => patch({ mainProvider: e.target.value })} placeholder="e.g., Dr. Smith" className={inputCls} />
      </Field>
      {visibleTypes.length > 0 && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
          <p className="mb-3 text-sm font-medium text-gray-700">Select appointment types Orthia can book:</p>
          <div className="space-y-4">
            {visibleTypes.map(type => {
              const cfg = value.apptTypes[type] ?? defaultApptTypes()[type];
              return (
                <div key={type}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={cfg.enabled} onChange={e => patchType(type, { enabled: e.target.checked })} className="rounded border-gray-300" />
                    <span className="font-medium">{type}</span>
                  </label>
                  {cfg.enabled && (
                    <div className="ml-6 mt-2 grid gap-3 rounded-lg border bg-white p-3 sm:grid-cols-6">
                      <div className="sm:col-span-6">
                        <label className="mb-1 block text-xs text-gray-500">Allowed Days</label>
                        <div className="flex flex-wrap gap-1">
                          {DAYS.map(d => (
                            <button key={d} type="button" onClick={() => {
                              const days = cfg.days.includes(d) ? cfg.days.filter(x => x !== d) : [...cfg.days, d];
                              patchType(type, { days });
                            }} className={`rounded px-2 py-0.5 text-xs font-medium ${cfg.days.includes(d) ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                              {d.slice(0, 3)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="sm:col-span-3">
                        <label className="mb-1 block text-xs text-gray-500">Time Range</label>
                        <div className="flex items-center gap-1">
                          <input type="time" value={cfg.startTime} onChange={e => patchType(type, { startTime: e.target.value })} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs" />
                          <span className="text-xs text-gray-400">-</span>
                          <input type="time" value={cfg.endTime} onChange={e => patchType(type, { endTime: e.target.value })} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs" />
                        </div>
                      </div>
                      <div className="sm:col-span-3">
                        <label className="mb-1 block text-xs text-gray-500">Duration (min)</label>
                        <input type="number" value={cfg.duration} onChange={e => patchType(type, { duration: e.target.value })} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" min="5" step="5" />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="mb-1 block text-xs text-gray-500">Reschedule window (days)</label>
                        <input type="number" value={cfg.rescheduleWindow} onChange={e => patchType(type, { rescheduleWindow: e.target.value })} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="e.g., 7" min="0" />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="mb-1 block text-xs text-gray-500">Cancellation window (hours)</label>
                        <input type="number" value={cfg.cancellationWindowHours} onChange={e => patchType(type, { cancellationWindowHours: e.target.value })} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="e.g., 24" min="0" />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="mb-1 block text-xs text-gray-500">Book-before window</label>
                        <div className="flex items-center gap-1">
                          <input type="number" value={cfg.bookBeforeWindow} onChange={e => patchType(type, { bookBeforeWindow: e.target.value })} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="e.g., 2" min="0" />
                          <select value={cfg.bookBeforeUnit} onChange={e => patchType(type, { bookBeforeUnit: e.target.value as "hours" | "days" })} className="rounded border border-gray-300 px-1.5 py-1 text-xs">
                            <option value="hours">hours</option>
                            <option value="days">days</option>
                          </select>
                        </div>
                      </div>
                      <div className="sm:col-span-3">
                        <label className="mb-1 block text-xs text-gray-500">Allowed Chairs</label>
                        <input type="text" value={cfg.allowedChairs} onChange={e => patchType(type, { allowedChairs: e.target.value })} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Leave blank if no specific chair" />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="mb-1 block text-xs text-gray-500">Double booking allowed?</label>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => patchType(type, { doubleBookingAllowed: true })} className={`rounded px-3 py-0.5 text-xs font-medium ${cfg.doubleBookingAllowed === true ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>Yes</button>
                          <button type="button" onClick={() => patchType(type, { doubleBookingAllowed: false })} className={`rounded px-3 py-0.5 text-xs font-medium ${cfg.doubleBookingAllowed === false ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>No</button>
                        </div>
                      </div>
                      <div className="sm:col-span-3">
                        <label className="mb-1 block text-xs text-gray-500">Urgent task if unavailable?</label>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => patchType(type, { urgentIfUnavailable: true })} className={`rounded px-3 py-0.5 text-xs font-medium ${cfg.urgentIfUnavailable === true ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>Yes</button>
                          <button type="button" onClick={() => patchType(type, { urgentIfUnavailable: false })} className={`rounded px-3 py-0.5 text-xs font-medium ${cfg.urgentIfUnavailable === false ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>No</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <Field label="Other Appointment Type">
              <input type="text" value={value.otherApptType} onChange={e => patch({ otherApptType: e.target.value })} placeholder="Specify any other types..." className={inputCls} />
              <p className="mt-1 text-xs text-gray-500">
                If you need appointment types beyond the ones we offer out of the box, let us know here. We&rsquo;ll discuss these during your onboarding call. Custom appointment types require additional configuration and may involve an added fee depending on scope.
              </p>
            </Field>
          </div>
        </div>
      )}
      <Field label="Allowed Providers">
        <textarea value={value.allowedProviders} onChange={e => patch({ allowedProviders: e.target.value })} rows={2} placeholder="List providers Orthia can schedule for..." className={textareaCls} />
      </Field>
      <Field label="Age Restrictions">
        <input type="text" value={value.ageRestrictions} onChange={e => patch({ ageRestrictions: e.target.value })} placeholder="e.g., 7 and older" className={inputCls} />
      </Field>
    </div>
  );
}

function PmsEditor({ value, onChange }: { value: { pmsName: string; pmsVersion: string }; onChange: (v: { pmsName: string; pmsVersion: string }) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="PMS Name">
        <select value={value.pmsName} onChange={e => onChange({ ...value, pmsName: e.target.value })} className={inputCls}>
          <option value="">Select...</option>
          {PMS_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </Field>
      <Field label="PMS Version">
        <input type="text" value={value.pmsVersion} onChange={e => onChange({ ...value, pmsVersion: e.target.value })} placeholder="e.g., 21.1" className={inputCls} />
      </Field>
    </div>
  );
}

function ContactBlock({
  label,
  value,
  onChange,
  nameRequired,
  emailRequired,
  phoneRequired,
}: {
  label: string;
  value: ContactInfo;
  onChange: (v: ContactInfo) => void;
  nameRequired?: boolean;
  emailRequired?: boolean;
  phoneRequired?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-gray-50/40 p-3">
      <p className="mb-2 text-sm font-medium text-gray-700">
        {label}{nameRequired && <span className="text-red-500"> *</span>}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" required={nameRequired}>
          <input
            type="text"
            value={value.name}
            onChange={e => onChange({ ...value, name: e.target.value })}
            className={inputCls}
            required={nameRequired}
          />
        </Field>
        <Field label="Email" required={emailRequired}>
          <input
            type="email"
            value={value.email}
            onChange={e => onChange({ ...value, email: e.target.value })}
            placeholder="name@practice.com"
            className={inputCls}
            required={emailRequired}
          />
        </Field>
        <Field label="Phone" required={phoneRequired}>
          <input
            type="tel"
            value={value.phone}
            onChange={e => onChange({ ...value, phone: e.target.value })}
            placeholder="(555) 123-4567"
            className={inputCls}
            required={phoneRequired}
          />
        </Field>
      </div>
    </div>
  );
}

export default function OnboardPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          Loading...
        </div>
      </main>
    }>
      <OnboardForm />
    </Suspense>
  );
}

function OnboardForm() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const editTokenFromUrl = searchParams.get("edit") || "";
  const isAdminView = searchParams.get("view") === "admin";

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editToken, setEditToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [emailWarning, setEmailWarning] = useState(false);
  const [activeSection, setActiveSection] = useState(1);
  const formRef = useRef<HTMLFormElement>(null);

  // Basic info
  const [practiceName, setPracticeName] = useState("");
  const [dbaName, setDbaName] = useState("");
  const [officePhone, setOfficePhone] = useState("");
  const [officeEmail, setOfficeEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [multiLocation, setMultiLocation] = useState(false);
  const [additionalLocationsList, setAdditionalLocationsList] = useState<AdditionalLocation[]>([]);

  // Wizard step state. "intro" is the first screen that asks for org name and
  // how many locations. Each clinic step renders a single clinic's form.
  const [step, setStep] = useState<{ kind: "intro" } | { kind: "clinic"; index: number }>({ kind: "intro" });
  const [numLocationsInput, setNumLocationsInput] = useState(1);
  const totalClinics = Math.max(1, additionalLocationsList.length + 1);
  const isLastClinicStep = step.kind === "clinic" && step.index === additionalLocationsList.length;
  const currentLocation = step.kind === "clinic" && step.index > 0 ? additionalLocationsList[step.index - 1] : null;
  const [parkingNotes, setParkingNotes] = useState("");
  const [buildingAccess, setBuildingAccess] = useState("");
  const [timezone, setTimezone] = useState("");
  const [doctorNames, setDoctorNames] = useState("");
  const [pointOfContact, setPointOfContact] = useState<ContactInfo>(emptyContact);
  const [billingContact, setBillingContact] = useState<ContactInfo>(emptyContact);
  const [emergencyContact, setEmergencyContact] = useState<ContactInfo>(emptyContact);
  const [schedulingContact, setSchedulingContact] = useState<ContactInfo>(emptyContact);
  const [clinicHours, setClinicHours] = useState<ClinicHours>(() => {
    const h: ClinicHours = {};
    DAYS.forEach(d => { h[d] = { open: "09:00", close: "17:00", closed: d === "Saturday" || d === "Sunday" }; });
    return h;
  });
  const [upcomingClosures, setUpcomingClosures] = useState<Closure[]>([]);

  // Availability
  const [bookingScope, setBookingScope] = useState("new_only");
  const [apptTypes, setApptTypes] = useState<Record<string, ApptTypeConfig>>(() => {
    const t: Record<string, ApptTypeConfig> = {};
    APPOINTMENT_TYPES.forEach(a => {
      t[a] = {
        enabled: a === "New Patient Consult",
        days: [...DAYS.slice(0, 5)],
        startTime: "09:00",
        endTime: "17:00",
        duration: "60",
        rescheduleWindow: "",
        allowedChairs: "",
        urgentIfUnavailable: null,
        cancellationWindowHours: "",
        bookBeforeWindow: "",
        bookBeforeUnit: "hours",
        doubleBookingAllowed: null,
      };
    });
    return t;
  });
  const [otherApptType, setOtherApptType] = useState("");
  const [mainProvider, setMainProvider] = useState("");
  const [allowedProviders, setAllowedProviders] = useState("");
  const [ageRestrictions, setAgeRestrictions] = useState("");

  // Intake
  const [intakeFields, setIntakeFields] = useState<string[]>(["Patient Full Name", "Date of Birth", "Phone", "Email"]);
  const [otherIntakeFields, setOtherIntakeFields] = useState("");
  const [chiefConcernRequired, setChiefConcernRequired] = useState<boolean | null>(null);
  const [bookWithoutInsurance, setBookWithoutInsurance] = useState<boolean | null>(null);

  // Emergency
  const [emergencyActions, setEmergencyActions] = useState<string[]>([]);
  const [wordsToAvoid, setWordsToAvoid] = useState("");
  const [wordsToUse, setWordsToUse] = useState("");

  // Lunch — per-day config
  const [lunchHours, setLunchHours] = useState<LunchConfig>(defaultLunchHours);

  // Insurance
  const [wantsInsurance, setWantsInsurance] = useState(false);
  const [npi, setNpi] = useState("");
  const [providerFirstName, setProviderFirstName] = useState("");
  const [providerLastName, setProviderLastName] = useState("");
  const [orgLegalName, setOrgLegalName] = useState("");

  // Voice
  const [voiceGender, setVoiceGender] = useState("");
  const [languages, setLanguages] = useState<string[]>(["English"]);
  const [otherLanguage, setOtherLanguage] = useState("");
  const [personality, setPersonality] = useState("");
  const [tone, setTone] = useState("");

  // Knowledge base
  const [commonQuestions, setCommonQuestions] = useState("");
  const [insuranceNotAccepted, setInsuranceNotAccepted] = useState("");
  const [financingOptions, setFinancingOptions] = useState("");
  const [consultationPrice, setConsultationPrice] = useState("");
  const [retainerProcess, setRetainerProcess] = useState("");
  const [bracesAlignerFaqs, setBracesAlignerFaqs] = useState("");
  const [missedApptPolicy, setMissedApptPolicy] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [lateArrivalPolicy, setLateArrivalPolicy] = useState("");
  const [schoolExcusePolicy, setSchoolExcusePolicy] = useState("");
  const [paymentMethods, setPaymentMethods] = useState("");
  const [formsNeeded, setFormsNeeded] = useState("");
  const [referralRequirements, setReferralRequirements] = useState("");
  const [adultChildFaqs, setAdultChildFaqs] = useState("");

  // PMS
  const [pmsName, setPmsName] = useState("");
  const [pmsVersion, setPmsVersion] = useState("");

  // Contact
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Legal
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [confirmedAccuracy, setConfirmedAccuracy] = useState(false);

  // localStorage auto-save key
  const storageKey = `orthia-draft-${slug}`;

  // Save form progress to localStorage on changes (debounced)
  useEffect(() => {
    if (loading || notFound || (submitted && !editing)) return;
    const timer = setTimeout(() => {
      try {
        const draft = {
          practiceName, dbaName, officePhone, officeEmail, website, address,
          multiLocation, additionalLocationsList, parkingNotes, buildingAccess,
          timezone, doctorNames, pointOfContact, billingContact, emergencyContact,
          schedulingContact, clinicHours, upcomingClosures, bookingScope, apptTypes, otherApptType,
          mainProvider, allowedProviders, ageRestrictions,
          intakeFields, otherIntakeFields, chiefConcernRequired,
          bookWithoutInsurance, emergencyActions, wordsToAvoid, wordsToUse,
          lunchHours, wantsInsurance, npi, providerFirstName,
          providerLastName, orgLegalName, voiceGender, languages, otherLanguage,
          personality, tone, commonQuestions, insuranceNotAccepted, financingOptions,
          consultationPrice, retainerProcess, bracesAlignerFaqs, missedApptPolicy,
          cancellationPolicy, lateArrivalPolicy, schoolExcusePolicy, paymentMethods,
          formsNeeded, referralRequirements, adultChildFaqs, pmsName, pmsVersion,
          contactName, contactRole, contactEmail, contactPhone,
        };
        localStorage.setItem(storageKey, JSON.stringify(draft));
      } catch { /* ignore quota errors */ }
    }, 1000);
    return () => clearTimeout(timer);
  });

  // Restore from localStorage
  function restoreFromStorage() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.practiceName) setPracticeName(d.practiceName);
      if (d.dbaName) setDbaName(d.dbaName);
      if (d.officePhone) setOfficePhone(d.officePhone);
      if (d.officeEmail) setOfficeEmail(d.officeEmail);
      if (d.website) setWebsite(d.website);
      if (d.address) setAddress(d.address);
      if (d.multiLocation !== undefined) setMultiLocation(d.multiLocation);
      if (Array.isArray(d.additionalLocationsList)) {
        setAdditionalLocationsList((d.additionalLocationsList as unknown[]).map(coerceLocation));
      } else if (typeof d.additionalLocations === "string" && d.additionalLocations.trim()) {
        // Migrate legacy newline-separated string into one location card per line.
        const migrated = d.additionalLocations
          .split("\n")
          .map((s: string) => s.trim())
          .filter(Boolean)
          .map((addr: string) => ({ ...emptyLocation(), address: addr }));
        if (migrated.length > 0) setAdditionalLocationsList(migrated);
      }
      if (d.parkingNotes) setParkingNotes(d.parkingNotes);
      if (d.buildingAccess) setBuildingAccess(d.buildingAccess);
      if (d.timezone) setTimezone(d.timezone);
      if (d.doctorNames) setDoctorNames(d.doctorNames);
      if (d.pointOfContact !== undefined) setPointOfContact(coerceContact(d.pointOfContact));
      if (d.billingContact !== undefined) setBillingContact(coerceContact(d.billingContact));
      if (d.emergencyContact !== undefined) setEmergencyContact(coerceContact(d.emergencyContact));
      if (d.schedulingContact !== undefined) setSchedulingContact(coerceContact(d.schedulingContact));
      if (d.clinicHours) setClinicHours(d.clinicHours);
      if (Array.isArray(d.upcomingClosures)) setUpcomingClosures(d.upcomingClosures as Closure[]);
      if (d.bookingScope) setBookingScope(d.bookingScope);
      if (d.apptTypes) {
        const loaded = d.apptTypes as Record<string, Partial<ApptTypeConfig>>;
        setApptTypes(prev => {
          const merged: Record<string, ApptTypeConfig> = { ...prev };
          for (const key of Object.keys(loaded)) {
            merged[key] = {
              ...merged[key],
              rescheduleWindow: "",
              allowedChairs: "",
              urgentIfUnavailable: null,
              cancellationWindowHours: "",
              bookBeforeWindow: "",
              bookBeforeUnit: "hours",
              doubleBookingAllowed: null,
              ...loaded[key],
            } as ApptTypeConfig;
          }
          return merged;
        });
      }
      if (d.otherApptType) setOtherApptType(d.otherApptType);
      if (d.mainProvider) setMainProvider(d.mainProvider);
      if (d.allowedProviders) setAllowedProviders(d.allowedProviders);
      if (d.ageRestrictions) setAgeRestrictions(d.ageRestrictions);
      if (d.intakeFields) setIntakeFields(d.intakeFields);
      if (d.otherIntakeFields) setOtherIntakeFields(d.otherIntakeFields);
      if (d.chiefConcernRequired !== undefined) setChiefConcernRequired(d.chiefConcernRequired);
      if (d.bookWithoutInsurance !== undefined) setBookWithoutInsurance(d.bookWithoutInsurance);
      if (d.emergencyActions) setEmergencyActions(d.emergencyActions);
      if (d.wordsToAvoid) setWordsToAvoid(d.wordsToAvoid);
      if (d.wordsToUse) setWordsToUse(d.wordsToUse);
      if (d.lunchHours && typeof d.lunchHours === "object") {
        setLunchHours(d.lunchHours as LunchConfig);
      } else if (d.lunchStart || d.lunchEnd) {
        // Migrate legacy single-range draft to per-day.
        const start = d.lunchStart || "12:00";
        const end = d.lunchEnd || "13:00";
        const migrated: LunchConfig = {};
        DAYS.forEach(day => { migrated[day] = { start, end, noLunch: false }; });
        setLunchHours(migrated);
      }
      if (d.wantsInsurance !== undefined) setWantsInsurance(d.wantsInsurance);
      if (d.npi) setNpi(d.npi);
      if (d.providerFirstName) setProviderFirstName(d.providerFirstName);
      if (d.providerLastName) setProviderLastName(d.providerLastName);
      if (d.orgLegalName) setOrgLegalName(d.orgLegalName);
      if (d.voiceGender) setVoiceGender(d.voiceGender);
      if (d.languages) setLanguages(d.languages);
      if (d.otherLanguage) setOtherLanguage(d.otherLanguage);
      if (d.personality) setPersonality(d.personality);
      if (d.tone) setTone(d.tone);
      if (d.commonQuestions) setCommonQuestions(d.commonQuestions);
      if (d.insuranceNotAccepted) setInsuranceNotAccepted(d.insuranceNotAccepted);
      if (d.financingOptions) setFinancingOptions(d.financingOptions);
      if (d.consultationPrice) setConsultationPrice(d.consultationPrice);
      if (d.retainerProcess) setRetainerProcess(d.retainerProcess);
      if (d.bracesAlignerFaqs) setBracesAlignerFaqs(d.bracesAlignerFaqs);
      if (d.missedApptPolicy) setMissedApptPolicy(d.missedApptPolicy);
      if (d.cancellationPolicy) setCancellationPolicy(d.cancellationPolicy);
      if (d.lateArrivalPolicy) setLateArrivalPolicy(d.lateArrivalPolicy);
      if (d.schoolExcusePolicy) setSchoolExcusePolicy(d.schoolExcusePolicy);
      if (d.paymentMethods) setPaymentMethods(d.paymentMethods);
      if (d.formsNeeded) setFormsNeeded(d.formsNeeded);
      if (d.referralRequirements) setReferralRequirements(d.referralRequirements);
      if (d.adultChildFaqs) setAdultChildFaqs(d.adultChildFaqs);
      if (d.pmsName) setPmsName(d.pmsName);
      if (d.pmsVersion) setPmsVersion(d.pmsVersion);
      if (d.contactName) setContactName(d.contactName);
      if (d.contactRole) setContactRole(d.contactRole);
      if (d.contactEmail) setContactEmail(d.contactEmail);
      if (d.contactPhone) setContactPhone(d.contactPhone);
    } catch { /* ignore parse errors */ }
  }

  useEffect(() => {
    const fetchUrl = editTokenFromUrl
      ? `/api/onboard/${slug}?edit=${editTokenFromUrl}`
      : `/api/onboard/${slug}`;
    fetch(fetchUrl)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        const s = data.submission as Submission;
        // Store the edit token from DB
        if (s.edit_token) setEditToken(s.edit_token);
        if (s.status === "complete") {
          setSubmitted(true);
          // If valid edit token in URL, auto-enter edit mode
          if (editTokenFromUrl && editTokenFromUrl === s.edit_token) {
            setEditing(true);
            // Editing an existing submission skips the intro screen.
            setStep({ kind: "clinic", index: 0 });
          }
        }
        // Admin view of a completed submission also skips the intro.
        if (isAdminView) setStep({ kind: "clinic", index: 0 });
        // Load pre-filled fields
        setPracticeName(s.practice_name || "");
        setPmsName(s.pms || "");
        setWebsite(s.website || "");
        setContactName(s.contact_name || "");
        setContactEmail(s.email || "");
        setContactPhone(s.phone || "");
        setOfficePhone(s.office_phone || "");
        setOfficeEmail(s.office_email || "");
        setDbaName(s.dba_name || "");
        setContactRole(s.contact_role || "");
        // Load form_data if exists
        if (s.form_data && typeof s.form_data === "object") {
          const fd = s.form_data as Record<string, unknown>;
          if (fd.address) setAddress(fd.address as string);
          if (fd.multiLocation) setMultiLocation(fd.multiLocation as boolean);
          if (Array.isArray(fd.additionalLocationsList)) {
            setAdditionalLocationsList((fd.additionalLocationsList as unknown[]).map(coerceLocation));
          } else if (typeof fd.additionalLocations === "string" && (fd.additionalLocations as string).trim()) {
            // Migrate legacy newline-separated string to one location card per line.
            const migrated = (fd.additionalLocations as string)
              .split("\n")
              .map(s => s.trim())
              .filter(Boolean)
              .map(addr => ({ ...emptyLocation(), address: addr }));
            if (migrated.length > 0) setAdditionalLocationsList(migrated);
          }
          if (fd.parkingNotes) setParkingNotes(fd.parkingNotes as string);
          if (fd.buildingAccess) setBuildingAccess(fd.buildingAccess as string);
          if (fd.timezone) setTimezone(fd.timezone as string);
          if (fd.doctorNames) setDoctorNames(fd.doctorNames as string);
          if (fd.pointOfContact !== undefined) setPointOfContact(coerceContact(fd.pointOfContact));
          if (fd.billingContact !== undefined) setBillingContact(coerceContact(fd.billingContact));
          if (fd.emergencyContact !== undefined) setEmergencyContact(coerceContact(fd.emergencyContact));
          if (fd.schedulingContact !== undefined) setSchedulingContact(coerceContact(fd.schedulingContact));
          if (fd.clinicHours) setClinicHours(fd.clinicHours as ClinicHours);
          if (Array.isArray(fd.upcomingClosures)) setUpcomingClosures(fd.upcomingClosures as Closure[]);
          if (fd.bookingScope) setBookingScope(fd.bookingScope as string);
          if (fd.apptTypes) {
            const loaded = fd.apptTypes as Record<string, Partial<ApptTypeConfig>>;
            setApptTypes(prev => {
              const merged: Record<string, ApptTypeConfig> = { ...prev };
              for (const key of Object.keys(loaded)) {
                merged[key] = {
                  ...merged[key],
                  rescheduleWindow: "",
                  allowedChairs: "",
                  urgentIfUnavailable: null,
                  cancellationWindowHours: "",
                  bookBeforeWindow: "",
                  bookBeforeUnit: "hours",
                  doubleBookingAllowed: null,
                  ...loaded[key],
                } as ApptTypeConfig;
              }
              return merged;
            });
          }
          if (fd.otherApptType) setOtherApptType(fd.otherApptType as string);
          if (fd.mainProvider) setMainProvider(fd.mainProvider as string);
          if (fd.allowedProviders) setAllowedProviders(fd.allowedProviders as string);
          if (fd.ageRestrictions) setAgeRestrictions(fd.ageRestrictions as string);
          if (fd.intakeFields) setIntakeFields(fd.intakeFields as string[]);
          if (fd.otherIntakeFields) setOtherIntakeFields(fd.otherIntakeFields as string);
          if (fd.chiefConcernRequired !== undefined) setChiefConcernRequired(fd.chiefConcernRequired as boolean);
          if (fd.bookWithoutInsurance !== undefined) setBookWithoutInsurance(fd.bookWithoutInsurance as boolean);
          if (fd.emergencyActions) setEmergencyActions(fd.emergencyActions as string[]);
          if (fd.wordsToAvoid) setWordsToAvoid(fd.wordsToAvoid as string);
          if (fd.wordsToUse) setWordsToUse(fd.wordsToUse as string);
          if (fd.lunchHours && typeof fd.lunchHours === "object") {
            setLunchHours(fd.lunchHours as LunchConfig);
          } else if (fd.lunchStart || fd.lunchEnd) {
            // Migrate legacy single-range submission to per-day.
            const start = (fd.lunchStart as string) || "12:00";
            const end = (fd.lunchEnd as string) || "13:00";
            const migrated: LunchConfig = {};
            DAYS.forEach(day => { migrated[day] = { start, end, noLunch: false }; });
            setLunchHours(migrated);
          }
          if (fd.wantsInsurance) setWantsInsurance(fd.wantsInsurance as boolean);
          if (fd.npi) setNpi(fd.npi as string);
          if (fd.providerFirstName) setProviderFirstName(fd.providerFirstName as string);
          if (fd.providerLastName) setProviderLastName(fd.providerLastName as string);
          if (fd.orgLegalName) setOrgLegalName(fd.orgLegalName as string);
          if (fd.voiceGender) setVoiceGender(fd.voiceGender as string);
          if (fd.languages) setLanguages(fd.languages as string[]);
          if (fd.otherLanguage) setOtherLanguage(fd.otherLanguage as string);
          if (fd.personality) setPersonality(fd.personality as string);
          if (fd.tone) setTone(fd.tone as string);
          if (fd.commonQuestions) setCommonQuestions(fd.commonQuestions as string);
          if (fd.insuranceNotAccepted) setInsuranceNotAccepted(fd.insuranceNotAccepted as string);
          if (fd.financingOptions) setFinancingOptions(fd.financingOptions as string);
          if (fd.consultationPrice) setConsultationPrice(fd.consultationPrice as string);
          if (fd.retainerProcess) setRetainerProcess(fd.retainerProcess as string);
          if (fd.bracesAlignerFaqs) setBracesAlignerFaqs(fd.bracesAlignerFaqs as string);
          if (fd.missedApptPolicy) setMissedApptPolicy(fd.missedApptPolicy as string);
          if (fd.cancellationPolicy) setCancellationPolicy(fd.cancellationPolicy as string);
          if (fd.lateArrivalPolicy) setLateArrivalPolicy(fd.lateArrivalPolicy as string);
          if (fd.schoolExcusePolicy) setSchoolExcusePolicy(fd.schoolExcusePolicy as string);
          if (fd.paymentMethods) setPaymentMethods(fd.paymentMethods as string);
          if (fd.formsNeeded) setFormsNeeded(fd.formsNeeded as string);
          if (fd.referralRequirements) setReferralRequirements(fd.referralRequirements as string);
          if (fd.adultChildFaqs) setAdultChildFaqs(fd.adultChildFaqs as string);
          if (fd.pmsVersion) setPmsVersion(fd.pmsVersion as string);
        }
        // After loading server data, overlay any localStorage draft (for pending forms)
        if (s.status !== "complete") {
          restoreFromStorage();
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Once data has loaded, seed the intro's location count to match what's
  // already on the record so returning users see the right default.
  useEffect(() => {
    if (loading) return;
    setNumLocationsInput(Math.max(1, additionalLocationsList.length + 1));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Track which section is visible for progress indicator
  useEffect(() => {
    if (loading || notFound || (submitted && !editing)) return;
    const sections = Array.from({ length: 11 }, (_, i) => document.getElementById(`section-${i + 1}`));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const num = parseInt(entry.target.id.replace("section-", ""), 10);
            if (!isNaN(num)) setActiveSection(num);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    sections.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [loading, notFound, submitted, editing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return; // Double-submit guard
    if (!acceptedTerms || !confirmedAccuracy) return;
    setSubmitting(true);
    setSubmitError("");

    const formData = {
      address, multiLocation, additionalLocationsList, parkingNotes, buildingAccess,
      timezone, doctorNames, pointOfContact, billingContact, emergencyContact,
      schedulingContact, clinicHours, upcomingClosures, bookingScope, apptTypes, otherApptType,
      mainProvider, allowedProviders, ageRestrictions,
      intakeFields, otherIntakeFields, chiefConcernRequired,
      bookWithoutInsurance, emergencyActions, wordsToAvoid, wordsToUse,
      lunchHours, wantsInsurance, npi, providerFirstName,
      providerLastName, orgLegalName, voiceGender, languages, otherLanguage,
      personality, tone, commonQuestions, insuranceNotAccepted, financingOptions,
      consultationPrice, retainerProcess, bracesAlignerFaqs, missedApptPolicy,
      cancellationPolicy, lateArrivalPolicy, schoolExcusePolicy, paymentMethods,
      formsNeeded, referralRequirements, adultChildFaqs, pmsVersion,
    };

    try {
      const res = await fetch(`/api/onboard/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practice_name: practiceName,
          dba_name: dbaName,
          office_phone: officePhone,
          office_email: officeEmail,
          website,
          pms: pmsName,
          contact_name: contactName,
          contact_role: contactRole,
          email: contactEmail,
          phone: contactPhone,
          form_data: formData,
          edit_token: editToken || editTokenFromUrl,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Failed to submit");
      }
      if (result.emailSent === false) {
        setEmailWarning(true);
      }
      setSubmitted(true);
      setEditing(false);
      try { localStorage.removeItem(storageKey); } catch {}
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleCheckbox(list: string[], setList: (v: string[]) => void, item: string) {
    setList(list.includes(item) ? list.filter(i => i !== item) : [...list, item]);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          Loading...
        </div>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Form Not Found</h1>
          <p className="mt-2 text-gray-500">This onboarding link is invalid or has expired.</p>
        </div>
      </main>
    );
  }

  if (submitted && !editing && !isAdminView) {
    const editUrl = editToken ? `${window.location.origin}/onboard/${slug}?edit=${editToken}` : "";
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-lg rounded-xl border bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Thanks for choosing Orthia</h1>
          <p className="mt-3 text-gray-600">
            We&rsquo;ve received your onboarding information. Our team will reach out within one business day to schedule your onboarding call and walk you through the next steps.
          </p>
          <p className="mt-3 text-gray-600">
            If anything urgent comes up, you can reply to the confirmation email
            {SUPPORT_PHONE ? (
              <> or call us at <a href={`tel:${SUPPORT_PHONE.replace(/[^+\d]/g, "")}`} className="font-medium text-blue-600 underline">{SUPPORT_PHONE}</a></>
            ) : null}
            .
          </p>
          {editUrl && (editTokenFromUrl || editToken) && (
            <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 p-4 text-left">
              <p className="text-sm font-medium text-blue-800 mb-2">Need to make changes later?</p>
              <p className="text-xs text-blue-700 mb-3">
                {emailWarning
                  ? "We couldn't send the edit link email. Make sure to save the link below:"
                  : "We sent an edit link to your email. You can also copy it below:"}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={editUrl}
                  className="flex-1 rounded border border-blue-200 bg-white px-2 py-1.5 text-xs text-gray-600 truncate"
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => navigator.clipboard.writeText(editUrl)}
                  className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
          {!editTokenFromUrl && !editToken && (
            <p className="mt-6 text-sm text-gray-500">
              Need to make changes? Check your email for the edit link we sent when you first submitted.
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a href="https://orthia.io" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
              <img src="/logo.png" alt="Orthia" className="h-7 w-7 object-contain" />
            </div>
            <span className="text-lg font-bold tracking-tight text-gray-900">
              Orthia <span className="font-light text-gray-400">AI</span>
            </span>
          </a>
        </div>
      </div>

      {/* Sticky Progress Bar — clinic-aware */}
      {step.kind === "clinic" && (
        <div className="sticky top-0 z-20 border-b bg-white shadow-sm">
          <div className="mx-auto max-w-3xl px-6 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-700">
                Clinic {step.index + 1} of {totalClinics}
                {step.index === 0 ? " — Main location & organization info" : currentLocation?.label ? ` — ${currentLocation.label}` : ""}
              </p>
              <div className="flex gap-1">
                {Array.from({ length: totalClinics }, (_, i) => (
                  <div
                    key={i}
                    className={`h-2 rounded-full transition-all ${
                      i === step.index
                        ? "w-6 bg-blue-600"
                        : i < step.index
                          ? "w-2 bg-blue-400"
                          : "w-2 bg-gray-200"
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="h-1 w-full rounded-full bg-gray-100">
              <div
                className="h-1 rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${Math.round(((step.index + 1) / totalClinics) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl px-6 pt-8">
        {isAdminView && submitted && (
          <div className="mb-4 rounded-lg border border-gray-300 bg-gray-100 p-3">
            <p className="text-sm text-gray-700 font-medium">Read-only view — this form has been submitted.</p>
          </div>
        )}
        {editing && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-sm text-blue-800 font-medium">You are editing a previously submitted form. Changes will update your submission.</p>
          </div>
        )}

        {/* Intro screen: ask org name + how many locations */}
        {step.kind === "intro" && !(isAdminView && submitted) && (
          <div className="mt-4">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Let&rsquo;s get started</h1>
              <p className="mt-1 text-gray-500">A couple of quick questions before we dive into the full form.</p>
            </div>
            <div className="mb-8 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-blue-900">
                Everything you enter here can be adjusted during your onboarding call or any time after. Nothing is final. We just want a starting point so we can hit the ground running with your practice.
              </p>
            </div>
            <section className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="space-y-5">
                <Field label="How many locations are you onboarding?" required>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={numLocationsInput}
                    onChange={e => setNumLocationsInput(Math.max(1, Math.min(20, parseInt(e.target.value || "1", 10) || 1)))}
                    className={inputCls}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">You can add more later on the onboarding call if needed.</p>
                </Field>
                <Field label="Organization Name" required>
                  <input
                    type="text"
                    value={practiceName}
                    onChange={e => setPracticeName(e.target.value)}
                    placeholder="e.g., Smile Orthodontics"
                    className={inputCls}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">The parent organization. Each clinic gets its own form next.</p>
                </Field>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={!practiceName.trim() || numLocationsInput < 1}
                    onClick={() => {
                      const target = Math.max(0, numLocationsInput - 1);
                      setAdditionalLocationsList(prev => {
                        if (prev.length === target) return prev;
                        if (prev.length > target) return prev.slice(0, target);
                        const next = [...prev];
                        while (next.length < target) next.push(emptyLocation());
                        return next;
                      });
                      setMultiLocation(target > 0);
                      setStep({ kind: "clinic", index: 0 });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {step.kind === "clinic" && (
        <>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {step.index === 0
              ? (totalClinics > 1 ? `Clinic 1 of ${totalClinics} — Main location` : "Practice Onboarding")
              : `Clinic ${step.index + 1} of ${totalClinics}${currentLocation?.label ? ` — ${currentLocation.label}` : ""}`}
          </h1>
          <p className="mt-1 text-gray-500">
            {step.index === 0
              ? "This first section covers your organization-wide settings and your main location."
              : "Fill in the settings that apply at this location. Blanks default to your main location."}
          </p>
        </div>

        {step.index === 0 && (
          <div className="mb-8 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-blue-900">
              Everything you enter here can be adjusted during your onboarding call or any time after. Nothing is final. We just want a starting point so we can hit the ground running with your practice.
            </p>
          </div>
        )}

        {step.index > 0 && (
          <div className="mb-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => { setStep({ kind: "clinic", index: step.index - 1 }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back to previous clinic
            </button>
            <p className="text-xs text-gray-400">Clinic {step.index + 1} of {totalClinics}</p>
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className={`space-y-10 ${isAdminView && submitted ? "pointer-events-none opacity-75" : ""}`}>

          {step.index === 0 && (
          <>
          {/* Section 1: Basic Practice Information */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <SectionHeader number={1} title="Basic Practice Information" />
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Practice Name" required>
                  <input type="text" value={practiceName} onChange={e => setPracticeName(e.target.value)} className={inputCls} required />
                </Field>
                <Field label="DBA Name (if different)">
                  <input type="text" value={dbaName} onChange={e => setDbaName(e.target.value)} placeholder="Leave blank if same" className={inputCls} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Main Office Phone">
                  <input type="tel" value={officePhone} onChange={e => setOfficePhone(e.target.value)} placeholder="(555) 123-4567" className={inputCls} />
                </Field>
                <Field label="Main Office Email">
                  <input type="email" value={officeEmail} onChange={e => setOfficeEmail(e.target.value)} placeholder="office@practice.com" className={inputCls} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Website URL">
                  <input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." className={inputCls} />
                </Field>
                <Field label="Time Zone">
                  <select value={timezone} onChange={e => setTimezone(e.target.value)} className={inputCls}>
                    <option value="">Select...</option>
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Practice Address">
                <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, City, State ZIP" className={inputCls} />
              </Field>


              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Parking Notes">
                  <input type="text" value={parkingNotes} onChange={e => setParkingNotes(e.target.value)} placeholder="Free lot behind building..." className={inputCls} />
                </Field>
                <Field label="Building Access / Suite / Floor">
                  <input type="text" value={buildingAccess} onChange={e => setBuildingAccess(e.target.value)} placeholder="Suite 200, 2nd floor..." className={inputCls} />
                </Field>
              </div>

              <Field label="Doctor Names">
                <textarea value={doctorNames} onChange={e => setDoctorNames(e.target.value)} rows={2} placeholder="Dr. Smith, Dr. Jones..." className={textareaCls} />
              </Field>

              <ContactBlock
                label="Primary Office Manager / Point of Contact"
                nameRequired
                emailRequired
                phoneRequired
                value={pointOfContact}
                onChange={setPointOfContact}
              />
              <ContactBlock
                label="Billing Contact"
                value={billingContact}
                onChange={setBillingContact}
              />
              <ContactBlock
                label="Emergency Contact"
                value={emergencyContact}
                onChange={setEmergencyContact}
              />
              <ContactBlock
                label="Scheduling Contact"
                value={schedulingContact}
                onChange={setSchedulingContact}
              />

              {/* Clinic Hours */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Clinic Hours</label>
                <ClinicHoursEditor value={clinicHours} onChange={setClinicHours} />
              </div>

              {/* Upcoming closures and adjusted hours */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-gray-700">Upcoming closures and adjusted hours</label>
                  <span className="text-xs text-gray-400">Optional</span>
                </div>
                <p className="mb-2 text-xs text-gray-500">
                  Add dates in the next 3 months where you&rsquo;ll be closed or on adjusted hours (holidays, training days, doctor out of office). You can always add more later.
                </p>
                <ClosuresEditor value={upcomingClosures} onChange={setUpcomingClosures} />
              </div>
            </div>
          </section>

          {/* Section 2: Availability & Scheduling */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <SectionHeader number={2} title="Availability & Scheduling Rules" />
            <SchedulingSettingsEditor
              value={{ bookingScope, mainProvider, allowedProviders, ageRestrictions, apptTypes, otherApptType }}
              onChange={(v) => {
                setBookingScope(v.bookingScope);
                setMainProvider(v.mainProvider);
                setAllowedProviders(v.allowedProviders);
                setAgeRestrictions(v.ageRestrictions);
                setApptTypes(v.apptTypes);
                setOtherApptType(v.otherApptType);
              }}
            />
          </section>

          {/* Section 3: Intake Rules */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <SectionHeader number={3} title="Intake Rules" />
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Required patient intake fields</label>
                <div className="flex flex-wrap gap-3">
                  {INTAKE_FIELDS.map(field => (
                    <label key={field} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" checked={intakeFields.includes(field)} onChange={() => toggleCheckbox(intakeFields, setIntakeFields, field)} className="rounded border-gray-300" />
                      {field}
                    </label>
                  ))}
                </div>
              </div>
              <Field label="Any other required fields?">
                <input type="text" value={otherIntakeFields} onChange={e => setOtherIntakeFields(e.target.value)} placeholder="e.g., Referring dentist name..." className={inputCls} />
              </Field>
              <YesNo label="Do patients need to provide a chief concern/reason for visit?" value={chiefConcernRequired} onChange={setChiefConcernRequired} />
              <YesNo label="Can Orthia book if the caller doesn't provide insurance?" value={bookWithoutInsurance} onChange={setBookWithoutInsurance} />
            </div>
          </section>

          {/* Section 4: Emergency Escalation */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <SectionHeader number={4} title="Emergency Escalation" />
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">On emergency, Orthia should:</label>
                <div className="flex flex-wrap gap-3">
                  {EMERGENCY_ACTIONS.map(action => (
                    <label key={action} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" checked={emergencyActions.includes(action)} onChange={() => toggleCheckbox(emergencyActions, setEmergencyActions, action)} className="rounded border-gray-300" />
                      {action}
                    </label>
                  ))}
                </div>
              </div>
              <Field label="Words to avoid">
                <textarea value={wordsToAvoid} onChange={e => setWordsToAvoid(e.target.value)} rows={2} placeholder="List words or phrases Orthia should never use..." className={textareaCls} />
              </Field>
              <Field label="Words to specifically use">
                <textarea value={wordsToUse} onChange={e => setWordsToUse(e.target.value)} rows={2} placeholder="Preferred terminology or phrases..." className={textareaCls} />
              </Field>
            </div>
          </section>

          {/* Section 5: Lunch Hours */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <SectionHeader number={5} title="Lunch Hours" />
            <LunchHoursEditor value={lunchHours} onChange={setLunchHours} />
          </section>

          {/* Section 6: Insurance Verification */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <SectionHeader number={6} title="Insurance Verification Add-On" />
            <div className="space-y-4">
              <Toggle label="Want insurance verification?" checked={wantsInsurance} onChange={setWantsInsurance} description="Real-time insurance eligibility verification during patient calls" />
              {wantsInsurance && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4 space-y-4">
                  <Field label="NPI">
                    <input type="text" value={npi} onChange={e => setNpi(e.target.value)} placeholder="National Provider Identifier" className={inputCls} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Provider First Name">
                      <input type="text" value={providerFirstName} onChange={e => setProviderFirstName(e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Provider Last Name">
                      <input type="text" value={providerLastName} onChange={e => setProviderLastName(e.target.value)} className={inputCls} />
                    </Field>
                  </div>
                  <Field label="Organization Legal Name">
                    <input type="text" value={orgLegalName} onChange={e => setOrgLegalName(e.target.value)} className={inputCls} />
                  </Field>
                </div>
              )}
            </div>
          </section>

          {/* Section 7: Voice Preference */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <SectionHeader number={7} title="Orthia Voice Preference" />
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Voice">
                  <select value={voiceGender} onChange={e => setVoiceGender(e.target.value)} className={inputCls}>
                    <option value="">Select...</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                  </select>
                </Field>
                <Field label="Tone">
                  <select value={tone} onChange={e => setTone(e.target.value)} className={inputCls}>
                    <option value="">Select...</option>
                    <option value="Professional">Professional</option>
                    <option value="Friendly">Friendly</option>
                    <option value="Warm">Warm</option>
                    <option value="Casual">Casual</option>
                  </select>
                </Field>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Languages</label>
                <div className="flex flex-wrap gap-3">
                  {["English", "Spanish"].map(lang => (
                    <label key={lang} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" checked={languages.includes(lang)} onChange={() => toggleCheckbox(languages, setLanguages, lang)} className="rounded border-gray-300" />
                      {lang}
                    </label>
                  ))}
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={languages.includes("Other")} onChange={() => toggleCheckbox(languages, setLanguages, "Other")} className="rounded border-gray-300" />
                    Other
                  </label>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  English and Spanish are included at no extra cost. Each additional language is $25 per month. If &ldquo;Other&rdquo; is selected, our team will confirm the language and add it to your plan.
                </p>
                {languages.includes("Other") && (
                  <input type="text" value={otherLanguage} onChange={e => setOtherLanguage(e.target.value)} placeholder="Which language(s)? (optional)" className={`mt-2 ${inputCls}`} />
                )}
              </div>
              <Field label="Personality Preferences">
                <textarea value={personality} onChange={e => setPersonality(e.target.value)} rows={2} placeholder="Any specific personality traits or style preferences..." className={textareaCls} />
              </Field>
            </div>
          </section>

          {/* Section 8: Knowledge Base */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <SectionHeader number={8} title="Knowledge Base" />
            <p className="mb-4 text-sm text-gray-500">Help Orthia answer patient questions accurately by providing your practice-specific information.</p>
            <div className="space-y-4">
              <Field label="Most common patient questions">
                <textarea value={commonQuestions} onChange={e => setCommonQuestions(e.target.value)} rows={3} placeholder="What are your most frequently asked questions?" className={textareaCls} />
              </Field>
              <Field label="Insurance plans NOT accepted">
                <textarea value={insuranceNotAccepted} onChange={e => setInsuranceNotAccepted(e.target.value)} rows={2} placeholder="List insurance plans you do not accept..." className={textareaCls} />
              </Field>
              <Field label="Financing options">
                <textarea value={financingOptions} onChange={e => setFinancingOptions(e.target.value)} rows={2} placeholder="Payment plans, CareCredit, in-house financing..." className={textareaCls} />
              </Field>
              <Field label="Consultation price / Free consultation?">
                <input type="text" value={consultationPrice} onChange={e => setConsultationPrice(e.target.value)} placeholder="e.g., Free consultation, $150..." className={inputCls} />
              </Field>
              <Field label="Retainer replacement process">
                <textarea value={retainerProcess} onChange={e => setRetainerProcess(e.target.value)} rows={2} className={textareaCls} />
              </Field>
              <Field label="Braces & aligner FAQs (specific to your clinic)">
                <textarea value={bracesAlignerFaqs} onChange={e => setBracesAlignerFaqs(e.target.value)} rows={3} className={textareaCls} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Missed appointment policy">
                  <textarea value={missedApptPolicy} onChange={e => setMissedApptPolicy(e.target.value)} rows={2} className={textareaCls} />
                </Field>
                <Field label="Cancellation policy">
                  <textarea value={cancellationPolicy} onChange={e => setCancellationPolicy(e.target.value)} rows={2} className={textareaCls} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Late arrival policy">
                  <textarea value={lateArrivalPolicy} onChange={e => setLateArrivalPolicy(e.target.value)} rows={2} className={textareaCls} />
                </Field>
                <Field label="School excuse note policy">
                  <textarea value={schoolExcusePolicy} onChange={e => setSchoolExcusePolicy(e.target.value)} rows={2} className={textareaCls} />
                </Field>
              </div>
              <Field label="Payment methods accepted">
                <textarea value={paymentMethods} onChange={e => setPaymentMethods(e.target.value)} rows={2} placeholder="Cash, credit/debit, HSA, FSA..." className={textareaCls} />
              </Field>
              <Field label="Forms needed before visit">
                <textarea value={formsNeeded} onChange={e => setFormsNeeded(e.target.value)} rows={2} className={textareaCls} />
              </Field>
              <Field label="Referral requirements">
                <textarea value={referralRequirements} onChange={e => setReferralRequirements(e.target.value)} rows={2} className={textareaCls} />
              </Field>
              <Field label="Adult/child specific FAQs">
                <textarea value={adultChildFaqs} onChange={e => setAdultChildFaqs(e.target.value)} rows={3} className={textareaCls} />
              </Field>
            </div>
          </section>

          {/* Section 9: PMS Details */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <SectionHeader number={9} title="Practice Management Software" />
            <PmsEditor
              value={{ pmsName, pmsVersion }}
              onChange={(v) => { setPmsName(v.pmsName); setPmsVersion(v.pmsVersion); }}
            />
          </section>

          {/* Section 10: Contact Information */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <SectionHeader number={10} title="Your Contact Information" />
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Contact Name" required>
                  <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Your full name" className={inputCls} required />
                </Field>
                <Field label="Role/Title">
                  <input type="text" value={contactRole} onChange={e => setContactRole(e.target.value)} placeholder="e.g., Office Manager" className={inputCls} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" required>
                  <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="you@practice.com" className={inputCls} required />
                </Field>
                <Field label="Phone" required>
                  <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="(555) 123-4567" className={inputCls} required />
                </Field>
              </div>
            </div>
          </section>
          </>
          )}

          {/* Per-clinic step: editing a single additional location */}
          {step.kind === "clinic" && step.index > 0 && currentLocation && (() => {
            const loc = currentLocation;
            const patchLoc = (p: Partial<AdditionalLocation>) =>
              setAdditionalLocationsList(prev => prev.map(x => x.id === loc.id ? { ...x, ...p } : x));
            return (
              <section className="space-y-6 rounded-xl border bg-white p-6 shadow-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Location Label">
                    <input type="text" value={loc.label} onChange={e => patchLoc({ label: e.target.value })} placeholder="e.g., North clinic" className={inputCls} />
                  </Field>
                  <Field label="Address" required>
                    <input type="text" value={loc.address} onChange={e => patchLoc({ address: e.target.value })} placeholder="123 Main St, City, State ZIP" className={inputCls} required />
                  </Field>
                  <Field label="Office Phone">
                    <input type="tel" value={loc.phone} onChange={e => patchLoc({ phone: e.target.value })} placeholder="(555) 123-4567" className={inputCls} />
                  </Field>
                  <Field label="Office Email">
                    <input type="email" value={loc.email} onChange={e => patchLoc({ email: e.target.value })} placeholder="location@practice.com" className={inputCls} />
                  </Field>
                  <Field label="Time Zone">
                    <select value={loc.timezone} onChange={e => patchLoc({ timezone: e.target.value })} className={inputCls}>
                      <option value="">Same as main location</option>
                      {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </Field>
                  <Field label="Parking Notes">
                    <input type="text" value={loc.parkingNotes} onChange={e => patchLoc({ parkingNotes: e.target.value })} placeholder="Free lot behind building..." className={inputCls} />
                  </Field>
                  <Field label="Building Access / Suite / Floor">
                    <input type="text" value={loc.buildingAccess} onChange={e => patchLoc({ buildingAccess: e.target.value })} placeholder="Suite 200, 2nd floor..." className={inputCls} />
                  </Field>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Clinic Hours</label>
                  <ClinicHoursEditor value={loc.clinicHours} onChange={v => patchLoc({ clinicHours: v })} />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="block text-sm font-medium text-gray-700">Upcoming closures and adjusted hours</label>
                    <span className="text-xs text-gray-400">Optional</span>
                  </div>
                  <ClosuresEditor value={loc.upcomingClosures} onChange={v => patchLoc({ upcomingClosures: v })} />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Lunch Hours</label>
                  <LunchHoursEditor value={loc.lunchHours} onChange={v => patchLoc({ lunchHours: v })} />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Availability &amp; Scheduling Rules</label>
                  <SchedulingSettingsEditor
                    value={{
                      bookingScope: loc.bookingScope,
                      mainProvider: loc.mainProvider,
                      allowedProviders: loc.allowedProviders,
                      ageRestrictions: loc.ageRestrictions,
                      apptTypes: loc.apptTypes,
                      otherApptType: loc.otherApptType,
                    }}
                    onChange={v => patchLoc({
                      bookingScope: v.bookingScope,
                      mainProvider: v.mainProvider,
                      allowedProviders: v.allowedProviders,
                      ageRestrictions: v.ageRestrictions,
                      apptTypes: v.apptTypes,
                      otherApptType: v.otherApptType,
                    })}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Practice Management Software</label>
                  <PmsEditor
                    value={{ pmsName: loc.pmsName, pmsVersion: loc.pmsVersion }}
                    onChange={v => patchLoc({ pmsName: v.pmsName, pmsVersion: v.pmsVersion })}
                  />
                </div>

                <Field label="Anything else specific to this location?">
                  <textarea value={loc.notes} onChange={e => patchLoc({ notes: e.target.value })} rows={2} placeholder="Anything not covered above" className={textareaCls} />
                </Field>
              </section>
            );
          })()}

          {/* Save & Continue (non-last clinic step) */}
          {!isLastClinicStep && !(isAdminView && submitted) && (
            <div className="flex items-center justify-between gap-3">
              {step.kind === "clinic" && step.index > 0 ? (
                <button
                  type="button"
                  onClick={() => { setStep({ kind: "clinic", index: step.index - 1 }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
              ) : <span />}
              <button
                type="button"
                onClick={() => {
                  if (step.kind !== "clinic") return;
                  setStep({ kind: "clinic", index: step.index + 1 });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Save &amp; continue to next clinic
              </button>
            </div>
          )}

          {/* Terms + Submit (last clinic step) */}
          {isLastClinicStep && !(isAdminView && submitted) && (
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <SectionHeader number={11} title="Terms & Agreement" />
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Please review our{" "}
                <a href="https://orthia.io/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 underline">Privacy Policy</a>
                {" "}and{" "}
                <a href="https://orthia.io/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 underline">Terms of Service</a>
                {" "}before submitting.
              </p>

              <label className="flex items-start gap-2.5">
                <input type="checkbox" checked={acceptedTerms} onChange={e => setAcceptedTerms(e.target.checked)} className="mt-1 rounded border-gray-300" required />
                <span className="text-sm text-gray-700">I have read and accept the Privacy Policy and Terms of Service.</span>
              </label>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-gray-700">
                  I confirm that all information provided above is accurate. Orthia is not at fault for following the rules and instructions provided in this form.
                </p>
              </div>

              <label className="flex items-start gap-2.5">
                <input type="checkbox" checked={confirmedAccuracy} onChange={e => setConfirmedAccuracy(e.target.checked)} className="mt-1 rounded border-gray-300" required />
                <span className="text-sm text-gray-700">I confirm the above statement.</span>
              </label>

              {submitError && <p className="text-sm text-red-600">{submitError}</p>}

              <div className="flex items-center justify-between gap-3 pt-2">
                {step.kind === "clinic" && step.index > 0 ? (
                  <button
                    type="button"
                    onClick={() => { setStep({ kind: "clinic", index: step.index - 1 }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Back
                  </button>
                ) : <span />}
                <button
                  type="submit"
                  disabled={submitting || !acceptedTerms || !confirmedAccuracy}
                  className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : editing ? "Update Submission" : "Submit Onboarding Form"}
                </button>
              </div>
            </div>
          </section>
          )}
        </form>
        </>
        )}
      </div>
    </main>
  );
}
