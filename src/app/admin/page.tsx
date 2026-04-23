"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Submission } from "@/lib/types";

interface ResearchData {
  found: boolean;
  confidence: string;
  data: Record<string, unknown>;
}

const WEEKDAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type FormDataMap = Record<string, unknown>;
type ClinicMap = Record<string, unknown>;

interface ClinicRow {
  submission: Submission;
  clinicIndex: number;        // 0 = main, 1..N = additional
  clinicKey: string;          // stable row key
  label: string;              // "Main" or "Location 2 — North Clinic"
  address: string;
  phone: string;
  email: string;
  pms: string;
}

function getAdditionalLocations(s: Submission): ClinicMap[] {
  const fd = (s.form_data || {}) as FormDataMap;
  const list = fd.additionalLocationsList;
  return Array.isArray(list) ? (list as ClinicMap[]) : [];
}

function flattenClinics(submissions: Submission[]): ClinicRow[] {
  const rows: ClinicRow[] = [];
  for (const s of submissions) {
    const fd = (s.form_data || {}) as FormDataMap;
    rows.push({
      submission: s,
      clinicIndex: 0,
      clinicKey: `${s.id}:main`,
      label: "Main",
      address: (fd.address as string) || "",
      phone: s.office_phone || "",
      email: s.office_email || (fd.officeEmail as string) || "",
      pms: s.pms || "",
    });
    getAdditionalLocations(s).forEach((loc, i) => {
      const labelTxt = (loc.label as string) || "";
      rows.push({
        submission: s,
        clinicIndex: i + 1,
        clinicKey: `${s.id}:loc-${(loc.id as string) || i}`,
        label: `Location ${i + 2}${labelTxt ? ` — ${labelTxt}` : ""}`,
        address: (loc.address as string) || "",
        phone: (loc.phone as string) || "",
        email: (loc.email as string) || "",
        pms: (loc.pmsName as string) || "",
      });
    });
  }
  return rows;
}

// Formatters used by the per-clinic download.
function fmtContact(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const parts: string[] = [];
    if (o.name) parts.push(String(o.name));
    if (o.email) parts.push(String(o.email));
    if (o.phone) parts.push(String(o.phone));
    return parts.join(" · ");
  }
  return "";
}

function fmtHours(h: unknown): string {
  if (!h || typeof h !== "object") return "";
  const o = h as Record<string, { open?: string; close?: string; closed?: boolean }>;
  const lines: string[] = [];
  for (const day of WEEKDAY_ORDER) {
    const d = o[day];
    if (!d) continue;
    lines.push(d.closed ? `${day}: Closed` : `${day}: ${d.open || "?"} - ${d.close || "?"}`);
  }
  return lines.join("\n");
}

function fmtLunch(h: unknown): string {
  if (!h || typeof h !== "object") return "";
  const o = h as Record<string, { start?: string; end?: string; noLunch?: boolean }>;
  const lines: string[] = [];
  for (const day of WEEKDAY_ORDER) {
    const d = o[day];
    if (!d) continue;
    lines.push(d.noLunch ? `${day}: No lunch` : `${day}: ${d.start || "?"} - ${d.end || "?"}`);
  }
  return lines.join("\n");
}

function fmtClosures(list: unknown): string {
  if (!Array.isArray(list) || list.length === 0) return "";
  return (list as Array<Record<string, unknown>>).map(c => {
    const label = c.label ? ` (${c.label})` : "";
    if (c.mode === "closed") return `- ${c.date}: Closed${label}`;
    return `- ${c.date}: ${c.startTime} - ${c.endTime}${label}`;
  }).join("\n");
}

function fmtApptTypes(types: unknown): string {
  if (!types || typeof types !== "object") return "";
  const o = types as Record<string, Record<string, unknown>>;
  let out = "";
  for (const [name, cfg] of Object.entries(o)) {
    if (!cfg?.enabled) continue;
    out += `${name}\n`;
    if (Array.isArray(cfg.days) && cfg.days.length > 0) out += `  - Allowed Days: ${cfg.days.join(", ")}\n`;
    if (cfg.startTime && cfg.endTime) out += `  - Time Range: ${cfg.startTime} - ${cfg.endTime}\n`;
    if (cfg.duration) out += `  - Duration: ${cfg.duration} min\n`;
    if (cfg.rescheduleWindow) out += `  - Reschedule Window: ${cfg.rescheduleWindow} days\n`;
    if (cfg.cancellationWindowHours) out += `  - Cancellation Window: ${cfg.cancellationWindowHours} hours\n`;
    if (cfg.bookBeforeWindow) out += `  - Book-before Window: ${cfg.bookBeforeWindow} ${cfg.bookBeforeUnit || "hours"}\n`;
    if (cfg.allowedChairs) out += `  - Allowed Chairs: ${cfg.allowedChairs}\n`;
    if (cfg.doubleBookingAllowed !== null && cfg.doubleBookingAllowed !== undefined) out += `  - Double Booking Allowed: ${cfg.doubleBookingAllowed ? "Yes" : "No"}\n`;
    if (cfg.urgentIfUnavailable !== null && cfg.urgentIfUnavailable !== undefined) out += `  - Urgent if Unavailable: ${cfg.urgentIfUnavailable ? "Yes" : "No"}\n`;
    out += "\n";
  }
  return out.trim();
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const clinicRows = useMemo(() => flattenClinics(submissions), [submissions]);

  const [clinicName, setClinicName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [generateError, setGenerateError] = useState("");
  const [researchResult, setResearchResult] = useState<ResearchData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [hint, setHint] = useState("");

  const fetchSubmissions = useCallback(async () => {
    setLoadingSubmissions(true);
    try {
      const res = await fetch("/api/submissions");
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      const data = await res.json();
      setSubmissions(data.submissions || []);
    } catch {
      // ignore
    } finally {
      setLoadingSubmissions(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/submissions")
      .then((res) => {
        if (res.ok) {
          setAuthenticated(true);
          return res.json();
        }
        return null;
      })
      .then((data) => {
        if (data) setSubmissions(data.submissions || []);
      });
  }, []);

  useEffect(() => {
    if (authenticated) fetchSubmissions();
  }, [authenticated, fetchSubmissions]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        setAuthenticated(true);
        setPassword("");
      } else {
        setLoginError("Invalid password");
      }
    } catch {
      setLoginError("Login failed");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleResearch(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicName.trim()) return;

    setGenerating(true);
    setGeneratedLink("");
    setGenerateError("");
    setResearchResult(null);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicName: clinicName.trim(), step: "research" }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to research");
      }

      const result: ResearchData = await res.json();
      setResearchResult(result);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to research");
    } finally {
      setGenerating(false);
    }
  }

  async function handleConfirm() {
    if (!researchResult) return;
    setConfirming(true);
    setGenerateError("");

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicName: clinicName.trim(),
          step: "confirm",
          researchData: researchResult.data,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      const data = await res.json();
      setGeneratedLink(window.location.origin + data.link);
      setClinicName("");
      setResearchResult(null);
      setHint("");
      fetchSubmissions();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setConfirming(false);
    }
  }

  async function handleSkip() {
    setConfirming(true);
    setGenerateError("");

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicName: clinicName.trim(), step: "skip" }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }

      const data = await res.json();
      setGeneratedLink(window.location.origin + data.link);
      setClinicName("");
      setResearchResult(null);
      setHint("");
      fetchSubmissions();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setConfirming(false);
    }
  }

  function handleRetry() {
    setResearchResult(null);
    setGenerateError("");
    setHint("Try adding city or state for better results");
  }

  async function handleDelete(id: string, practiceName: string) {
    if (!window.confirm(`Delete submission for "${practiceName}"? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/submissions?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
      fetchSubmissions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete submission");
    }
  }

  function handleDownloadOrg(s: Submission) {
    const fd = (s.form_data || {}) as FormDataMap;
    const line = (label: string, value: unknown) => {
      if (value === null || value === undefined || value === "") return "";
      return `${label}: ${String(value)}\n`;
    };
    const section = (title: string, content: string) => {
      const trimmed = content.trim();
      return trimmed ? `${title.toUpperCase()}\n${"=".repeat(title.length)}\n${trimmed}\n\n` : "";
    };

    const langs = fd.languages;
    const langList = Array.isArray(langs) ? (langs as string[]).join(", ") : "";
    const intakeList = Array.isArray(fd.intakeFields) ? (fd.intakeFields as string[]).join(", ") : "";
    const emergencyActions = Array.isArray(fd.emergencyActions) ? (fd.emergencyActions as string[]).join(", ") : "";
    const clinicCount = 1 + getAdditionalLocations(s).length;

    const heading = `${s.practice_name} — Organization Summary`;
    const md = `${heading}
${"=".repeat(heading.length)}

Organization: ${s.practice_name}
Clinics in this organization: ${clinicCount}

${section("Organization Information",
  line("Practice Name", s.practice_name) +
  line("DBA Name", s.dba_name || fd.dbaName) +
  line("Website", s.website) +
  line("Doctor Names", fd.doctorNames)
)}${section("Contacts",
  line("Form Submitter", s.contact_name) +
  line("Submitter Role", s.contact_role) +
  line("Submitter Email", s.email) +
  line("Submitter Phone", s.phone) +
  line("Primary Office Manager", fmtContact(fd.pointOfContact)) +
  line("Billing Contact", fmtContact(fd.billingContact)) +
  line("Emergency Contact", fmtContact(fd.emergencyContact)) +
  line("Scheduling Contact", fmtContact(fd.schedulingContact))
)}${section("Patient Intake",
  line("Required Intake Fields", intakeList) +
  line("Other Intake Fields", fd.otherIntakeFields) +
  line("Chief Concern Required", fd.chiefConcernRequired === true ? "Yes" : fd.chiefConcernRequired === false ? "No" : "") +
  line("Book Without Insurance", fd.bookWithoutInsurance === true ? "Yes" : fd.bookWithoutInsurance === false ? "No" : "") +
  line("Forms Needed", fd.formsNeeded) +
  line("Referral Requirements", fd.referralRequirements)
)}${section("Call Handling & Voice",
  line("Voice Gender", fd.voiceGender) +
  line("Languages", langList) +
  line("Other Language", fd.otherLanguage) +
  line("Personality", fd.personality) +
  line("Tone", fd.tone) +
  line("Words to Avoid", fd.wordsToAvoid) +
  line("Words to Use", fd.wordsToUse) +
  line("Emergency Actions", emergencyActions)
)}${section("Insurance & Billing",
  line("Wants Insurance Verification", fd.wantsInsurance === true ? "Yes" : fd.wantsInsurance === false ? "No" : "") +
  line("NPI", fd.npi) +
  line("Provider First Name", fd.providerFirstName) +
  line("Provider Last Name", fd.providerLastName) +
  line("Organization Legal Name", fd.orgLegalName) +
  line("Insurance Not Accepted", fd.insuranceNotAccepted) +
  line("Financing Options", fd.financingOptions) +
  line("Consultation Price", fd.consultationPrice) +
  line("Payment Methods", fd.paymentMethods)
)}${section("FAQs & Policies",
  line("Common Questions", fd.commonQuestions) +
  line("Retainer Process", fd.retainerProcess) +
  line("Braces/Aligner FAQs", fd.bracesAlignerFaqs) +
  line("Adult/Child FAQs", fd.adultChildFaqs) +
  line("Missed Appointment Policy", fd.missedApptPolicy) +
  line("Cancellation Policy", fd.cancellationPolicy) +
  line("Late Arrival Policy", fd.lateArrivalPolicy) +
  line("School Excuse Policy", fd.schoolExcusePolicy)
)}`;

    const safeName = heading.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
    const blob = new Blob([md], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownload(s: Submission, clinicIndex: number = 0) {
    const fd = (s.form_data || {}) as FormDataMap;

    const line = (label: string, value: unknown) => {
      if (value === null || value === undefined || value === "") return "";
      return `${label}: ${String(value)}\n`;
    };
    const block = (label: string, value: string) => {
      const t = value.trim();
      return t ? `${label}:\n${t}\n\n` : "";
    };
    const section = (title: string, content: string) => {
      const trimmed = content.trim();
      return trimmed ? `${title.toUpperCase()}\n${"=".repeat(title.length)}\n${trimmed}\n\n` : "";
    };

    // Resolve the per-clinic slice for this row.
    const isMain = clinicIndex === 0;
    let cl: ClinicMap;
    let clinicHeading: string;
    if (isMain) {
      // Legacy: fall back to the pre-per-day lunchStart/lunchEnd if needed.
      let lunchHours = fd.lunchHours;
      if (!lunchHours && (fd.lunchStart || fd.lunchEnd)) {
        const start = (fd.lunchStart as string) || "12:00";
        const end = (fd.lunchEnd as string) || "13:00";
        const synth: Record<string, { start: string; end: string; noLunch: boolean }> = {};
        WEEKDAY_ORDER.forEach(d => { synth[d] = { start, end, noLunch: false }; });
        lunchHours = synth;
      }
      cl = {
        label: "Main",
        address: fd.address,
        phone: s.office_phone,
        email: s.office_email || fd.officeEmail,
        timezone: fd.timezone,
        parkingNotes: fd.parkingNotes,
        buildingAccess: fd.buildingAccess,
        clinicHours: fd.clinicHours,
        upcomingClosures: fd.upcomingClosures,
        lunchHours,
        bookingScope: fd.bookingScope,
        mainProvider: fd.mainProvider,
        allowedProviders: fd.allowedProviders,
        ageRestrictions: fd.ageRestrictions,
        apptTypes: fd.apptTypes,
        otherApptType: fd.otherApptType,
        pmsName: s.pms || fd.pmsName,
        pmsVersion: fd.pmsVersion,
        notes: "",
      };
      clinicHeading = `${s.practice_name} — Main Location`;
    } else {
      const locs = getAdditionalLocations(s);
      const loc = locs[clinicIndex - 1];
      if (!loc) return;
      cl = loc;
      const labelTxt = (loc.label as string) || `Location ${clinicIndex + 1}`;
      clinicHeading = `${s.practice_name} — ${labelTxt}`;
    }

    // Org-wide (shared) formatting.
    const langs = fd.languages;
    const langList = Array.isArray(langs) ? (langs as string[]).join(", ") : "";
    const intakeList = Array.isArray(fd.intakeFields) ? (fd.intakeFields as string[]).join(", ") : "";
    const emergencyActions = Array.isArray(fd.emergencyActions) ? (fd.emergencyActions as string[]).join(", ") : "";

    const md = `${clinicHeading} — Onboarding Configuration
${"=".repeat((clinicHeading + " — Onboarding Configuration").length)}

Organization: ${s.practice_name}
Clinic: ${isMain ? "Main" : (cl.label as string) || `Location ${clinicIndex + 1}`}

${section("Clinic Information",
  line("Clinic Label", cl.label) +
  line("Address", cl.address) +
  line("Office Phone", cl.phone) +
  line("Office Email", cl.email) +
  line("Timezone", cl.timezone || (isMain ? "" : fd.timezone)) +
  line("Parking Notes", cl.parkingNotes) +
  line("Building Access", cl.buildingAccess) +
  line("PMS Name", cl.pmsName) +
  line("PMS Version", cl.pmsVersion) +
  line("Location Notes", cl.notes)
)}${section("Clinic Hours",
  block("Weekly Hours", fmtHours(cl.clinicHours)) +
  block("Lunch Hours", fmtLunch(cl.lunchHours)) +
  block("Upcoming Closures", fmtClosures(cl.upcomingClosures))
)}${section("Availability & Scheduling (this clinic)",
  line("Booking Scope", cl.bookingScope) +
  line("Main Provider", cl.mainProvider) +
  line("Allowed Providers", cl.allowedProviders) +
  line("Age Restrictions", cl.ageRestrictions) +
  block("Appointment Types", fmtApptTypes(cl.apptTypes)) +
  line("Other Appointment Type", cl.otherApptType)
)}${section("Organization — Practice Information",
  line("Practice Name", s.practice_name) +
  line("DBA Name", s.dba_name || fd.dbaName) +
  line("Website", s.website) +
  line("Doctor Names", fd.doctorNames) +
  line("Multi-Location", fd.multiLocation ? "Yes" : "No")
)}${section("Organization — Contacts",
  line("Form Submitter", s.contact_name) +
  line("Submitter Role", s.contact_role) +
  line("Submitter Email", s.email) +
  line("Submitter Phone", s.phone) +
  line("Primary Office Manager", fmtContact(fd.pointOfContact)) +
  line("Billing Contact", fmtContact(fd.billingContact)) +
  line("Emergency Contact", fmtContact(fd.emergencyContact)) +
  line("Scheduling Contact", fmtContact(fd.schedulingContact))
)}${section("Organization — Patient Intake",
  line("Required Intake Fields", intakeList) +
  line("Other Intake Fields", fd.otherIntakeFields) +
  line("Chief Concern Required", fd.chiefConcernRequired === true ? "Yes" : fd.chiefConcernRequired === false ? "No" : "") +
  line("Forms Needed", fd.formsNeeded) +
  line("Referral Requirements", fd.referralRequirements)
)}${section("Organization — Call Handling & Voice",
  line("Voice Gender", fd.voiceGender) +
  line("Languages", langList) +
  line("Other Language", fd.otherLanguage) +
  line("Personality", fd.personality) +
  line("Tone", fd.tone) +
  line("Words to Avoid", fd.wordsToAvoid) +
  line("Words to Use", fd.wordsToUse) +
  line("Emergency Actions", emergencyActions)
)}${section("Organization — Insurance & Billing",
  line("Wants Insurance Verification", fd.wantsInsurance === true ? "Yes" : fd.wantsInsurance === false ? "No" : "") +
  line("NPI", fd.npi) +
  line("Provider First Name", fd.providerFirstName) +
  line("Provider Last Name", fd.providerLastName) +
  line("Organization Legal Name", fd.orgLegalName) +
  line("Book Without Insurance", fd.bookWithoutInsurance === true ? "Yes" : fd.bookWithoutInsurance === false ? "No" : "") +
  line("Insurance Not Accepted", fd.insuranceNotAccepted) +
  line("Financing Options", fd.financingOptions) +
  line("Consultation Price", fd.consultationPrice) +
  line("Payment Methods", fd.paymentMethods)
)}${section("Organization — FAQs & Policies",
  line("Common Questions", fd.commonQuestions) +
  line("Retainer Process", fd.retainerProcess) +
  line("Braces/Aligner FAQs", fd.bracesAlignerFaqs) +
  line("Adult/Child FAQs", fd.adultChildFaqs) +
  line("Missed Appointment Policy", fd.missedApptPolicy) +
  line("Cancellation Policy", fd.cancellationPolicy) +
  line("Late Arrival Policy", fd.lateArrivalPolicy) +
  line("School Excuse Policy", fd.schoolExcusePolicy)
)}`;

    const safeName = clinicHeading.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
    const blob = new Blob([md], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}-onboarding.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-8 shadow-sm"
        >
          <h1 className="text-xl font-semibold">Admin Login</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter admin password"
            className="w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <button
            type="submit"
            disabled={loginLoading}
            className="w-full rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loginLoading ? "Logging in..." : "Login"}
          </button>
        </form>
      </main>
    );
  }

  const rd = researchResult?.data;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      {/* Generate Form */}
      {!researchResult && (
        <form
          onSubmit={handleResearch}
          className="mt-6 flex items-end gap-3 rounded-lg border bg-white p-4"
        >
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Clinic Name
            </label>
            <input
              type="text"
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              placeholder={hint || "e.g. Smile Dental Group"}
              className="w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            {hint && <p className="mt-1 text-xs text-blue-600">{hint}</p>}
          </div>
          <button
            type="submit"
            disabled={generating}
            className="rounded bg-blue-600 px-5 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? "Researching..." : "Generate Form"}
          </button>
        </form>
      )}

      {/* Confirmation Card — AI found results */}
      {researchResult && researchResult.found && (
        <div className="mt-6 rounded-lg border bg-white p-5">
          <h3 className="font-semibold text-gray-900">Is this the right practice?</h3>
          <div className="mt-3 space-y-1.5">
            <div className="flex gap-2 text-sm">
              <span className="w-20 shrink-0 font-medium text-gray-500">Name</span>
              <span className="text-gray-900">{(rd?.officialName as string) || clinicName}</span>
            </div>
            {rd?.address && (
              <div className="flex gap-2 text-sm">
                <span className="w-20 shrink-0 font-medium text-gray-500">Address</span>
                <span className="text-gray-900">{rd.address as string}</span>
              </div>
            )}
            {rd?.officePhone && (
              <div className="flex gap-2 text-sm">
                <span className="w-20 shrink-0 font-medium text-gray-500">Phone</span>
                <span className="text-gray-900">{rd.officePhone as string}</span>
              </div>
            )}
            {rd?.website && (
              <div className="flex gap-2 text-sm">
                <span className="w-20 shrink-0 font-medium text-gray-500">Website</span>
                <a href={rd.website as string} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline truncate">{rd.website as string}</a>
              </div>
            )}
            {rd?.practiceType && (
              <div className="flex gap-2 text-sm">
                <span className="w-20 shrink-0 font-medium text-gray-500">Type</span>
                <span className="text-gray-900">{rd.practiceType as string}</span>
              </div>
            )}
          </div>
          {researchResult.confidence !== "high" && (
            <p className="mt-2 text-xs text-amber-600">Low confidence match — please verify.</p>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={handleConfirm} disabled={confirming} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {confirming ? "Creating..." : "Yes, create form"}
            </button>
            <button onClick={handleRetry} disabled={confirming} className="rounded border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Wrong, try again
            </button>
            <button onClick={handleSkip} disabled={confirming} className="rounded border px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
              Skip, create blank
            </button>
          </div>
          {generateError && <p className="mt-2 text-sm text-red-600">{generateError}</p>}

        </div>
      )}

      {/* Not Found Card */}
      {researchResult && !researchResult.found && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h3 className="font-semibold text-gray-900">Couldn&apos;t find &ldquo;{clinicName}&rdquo;</h3>
          <p className="mt-1 text-sm text-gray-600">No matching practice found. Try a more specific name or create a blank form.</p>

          <div className="mt-4 flex gap-2">
            <button onClick={handleRetry} disabled={confirming} className="rounded border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50">
              Try again
            </button>
            <button onClick={handleSkip} disabled={confirming} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {confirming ? "Creating..." : "Create blank form"}
            </button>
          </div>
          {generateError && <p className="mt-2 text-sm text-red-600">{generateError}</p>}
        </div>
      )}

      {generateError && !researchResult && (
        <p className="mt-2 text-sm text-red-600">{generateError}</p>
      )}

      {generatedLink && (
        <div className="mt-3 rounded border border-green-200 bg-green-50 p-3">
          <p className="text-sm font-medium text-green-800">Shareable link created:</p>
          <div className="mt-1 flex items-center gap-2">
            <a href={generatedLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline break-all">
              {generatedLink}
            </a>
            <button
              onClick={() => { navigator.clipboard.writeText(generatedLink); }}
              className="shrink-0 rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Clinics Table (flattened per-clinic rows) */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Clinics</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (clinicRows.length === 0) return;
                const headers = ["Organization","Clinic","Address","Phone","Email","PMS","Insurance","Status","Created","Link"];
                const rows = clinicRows.map(r => {
                  const fd = (r.submission.form_data as Record<string, unknown>) || {};
                  return [
                    r.submission.practice_name,
                    r.label,
                    r.address,
                    r.phone,
                    r.email,
                    r.pms,
                    fd.wantsInsurance ? "Yes" : "No",
                    r.submission.status,
                    new Date(r.submission.created_at).toLocaleDateString(),
                    window.location.origin + `/onboard/${r.submission.slug}`,
                  ];
                });
                const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `orthia-clinics-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              disabled={clinicRows.length === 0}
              className="text-sm text-green-600 hover:underline disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              onClick={fetchSubmissions}
              disabled={loadingSubmissions}
              className="text-sm text-blue-600 hover:underline disabled:opacity-50"
            >
              {loadingSubmissions ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Clinic</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">PMS</th>
                <th className="px-4 py-3 font-medium">Insurance</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clinicRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                    No submissions yet
                  </td>
                </tr>
              )}
              {clinicRows.map((r, i) => {
                const s = r.submission;
                const fd = (s.form_data as Record<string, unknown>) || {};
                const prev = clinicRows[i - 1];
                const isFirstOfOrg = !prev || prev.submission.id !== s.id;
                const isMain = r.clinicIndex === 0;
                return (
                  <tr
                    key={r.clinicKey}
                    className={`${isFirstOfOrg ? "border-t-2 border-t-gray-200" : "border-t border-t-transparent"} border-b last:border-0 ${isMain ? "" : "bg-gray-50/40"}`}
                  >
                    <td className="px-4 py-3 font-medium">
                      {isFirstOfOrg ? s.practice_name : <span className="text-gray-300">↳</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={isMain ? "font-medium" : "text-gray-700"}>{r.label}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.address || "—"}</td>
                    <td className="px-4 py-3">{r.phone || "—"}</td>
                    <td className="px-4 py-3">{r.email || "—"}</td>
                    <td className="px-4 py-3">{r.pms || "—"}</td>
                    <td className="px-4 py-3">
                      {isFirstOfOrg ? (
                        fd.wantsInsurance ? (
                          <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Yes</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isFirstOfOrg ? (
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            s.status === "complete"
                              ? "bg-green-100 text-green-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {s.status}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {isFirstOfOrg ? new Date(s.created_at).toLocaleDateString() : ""}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isFirstOfOrg && (
                          <>
                            <a
                              href={`/onboard/${s.slug}${s.status === "complete" ? "?view=admin" : ""}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              Open
                            </a>
                            <button
                              onClick={() => navigator.clipboard.writeText(window.location.origin + `/onboard/${s.slug}`)}
                              className="text-gray-500 hover:text-gray-700 hover:underline"
                            >
                              Copy
                            </button>
                            <button
                              onClick={() => handleDownloadOrg(s)}
                              className="text-indigo-600 hover:text-indigo-800 hover:underline"
                              title="Download organization-level settings only"
                            >
                              Org info
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDownload(s, r.clinicIndex)}
                          className="text-green-600 hover:text-green-800 hover:underline"
                          title={isMain ? "Download main clinic + organization info" : "Download this clinic's settings + organization info"}
                        >
                          {isMain ? "Clinic + Org" : "Clinic"}
                        </button>
                        {isFirstOfOrg && (
                          <button
                            onClick={() => handleDelete(s.id, s.practice_name)}
                            className="text-red-500 hover:text-red-700 hover:underline"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
