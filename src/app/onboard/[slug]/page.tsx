"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { Submission } from "@/lib/types";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const APPOINTMENT_TYPES = [
  "New Patient Consult",
  "Adjustment",
  "Bonding",
  "Debond",
  "Retainer Check",
  "Invisalign/Aligner Check",
  "Records/Imaging",
  "Emergency",
];

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

interface ApptTypeConfig {
  enabled: boolean;
  days: string[];
  startTime: string;
  endTime: string;
  duration: string;
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

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editToken, setEditToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Basic info
  const [practiceName, setPracticeName] = useState("");
  const [dbaName, setDbaName] = useState("");
  const [officePhone, setOfficePhone] = useState("");
  const [officeEmail, setOfficeEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [multiLocation, setMultiLocation] = useState(false);
  const [additionalLocations, setAdditionalLocations] = useState("");
  const [parkingNotes, setParkingNotes] = useState("");
  const [buildingAccess, setBuildingAccess] = useState("");
  const [timezone, setTimezone] = useState("");
  const [doctorNames, setDoctorNames] = useState("");
  const [pointOfContact, setPointOfContact] = useState("");
  const [billingContact, setBillingContact] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [schedulingContact, setSchedulingContact] = useState("");
  const [clinicHours, setClinicHours] = useState<ClinicHours>(() => {
    const h: ClinicHours = {};
    DAYS.forEach(d => { h[d] = { open: "09:00", close: "17:00", closed: d === "Saturday" || d === "Sunday" }; });
    return h;
  });

  // Availability
  const [bookingScope, setBookingScope] = useState("new_only");
  const [apptTypes, setApptTypes] = useState<Record<string, ApptTypeConfig>>(() => {
    const t: Record<string, ApptTypeConfig> = {};
    APPOINTMENT_TYPES.forEach(a => {
      t[a] = { enabled: a === "New Patient Consult", days: [...DAYS.slice(0, 5)], startTime: "09:00", endTime: "17:00", duration: "60" };
    });
    return t;
  });
  const [otherApptType, setOtherApptType] = useState("");
  const [allowedProviders, setAllowedProviders] = useState("");
  const [ageRestrictions, setAgeRestrictions] = useState("");
  const [minRescheduleHours, setMinRescheduleHours] = useState("");
  const [minCancelHours, setMinCancelHours] = useState("");
  const [urgentReviewTask, setUrgentReviewTask] = useState<boolean | null>(null);

  // Intake
  const [intakeFields, setIntakeFields] = useState<string[]>(["Patient Full Name", "Date of Birth", "Phone", "Email"]);
  const [otherIntakeFields, setOtherIntakeFields] = useState("");
  const [chiefConcernRequired, setChiefConcernRequired] = useState<boolean | null>(null);
  const [bookWithoutInsurance, setBookWithoutInsurance] = useState<boolean | null>(null);

  // Emergency
  const [emergencyActions, setEmergencyActions] = useState<string[]>([]);
  const [wordsToAvoid, setWordsToAvoid] = useState("");
  const [wordsToUse, setWordsToUse] = useState("");
  const [humorAllowed, setHumorAllowed] = useState<boolean | null>(null);

  // Lunch
  const [lunchStart, setLunchStart] = useState("12:00");
  const [lunchEnd, setLunchEnd] = useState("13:00");

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
          multiLocation, additionalLocations, parkingNotes, buildingAccess,
          timezone, doctorNames, pointOfContact, billingContact, emergencyContact,
          schedulingContact, clinicHours, bookingScope, apptTypes, otherApptType,
          allowedProviders, ageRestrictions, minRescheduleHours, minCancelHours,
          urgentReviewTask, intakeFields, otherIntakeFields, chiefConcernRequired,
          bookWithoutInsurance, emergencyActions, wordsToAvoid, wordsToUse,
          humorAllowed, lunchStart, lunchEnd, wantsInsurance, npi, providerFirstName,
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
      if (d.additionalLocations) setAdditionalLocations(d.additionalLocations);
      if (d.parkingNotes) setParkingNotes(d.parkingNotes);
      if (d.buildingAccess) setBuildingAccess(d.buildingAccess);
      if (d.timezone) setTimezone(d.timezone);
      if (d.doctorNames) setDoctorNames(d.doctorNames);
      if (d.pointOfContact) setPointOfContact(d.pointOfContact);
      if (d.billingContact) setBillingContact(d.billingContact);
      if (d.emergencyContact) setEmergencyContact(d.emergencyContact);
      if (d.schedulingContact) setSchedulingContact(d.schedulingContact);
      if (d.clinicHours) setClinicHours(d.clinicHours);
      if (d.bookingScope) setBookingScope(d.bookingScope);
      if (d.apptTypes) setApptTypes(d.apptTypes);
      if (d.otherApptType) setOtherApptType(d.otherApptType);
      if (d.allowedProviders) setAllowedProviders(d.allowedProviders);
      if (d.ageRestrictions) setAgeRestrictions(d.ageRestrictions);
      if (d.minRescheduleHours) setMinRescheduleHours(d.minRescheduleHours);
      if (d.minCancelHours) setMinCancelHours(d.minCancelHours);
      if (d.urgentReviewTask !== undefined) setUrgentReviewTask(d.urgentReviewTask);
      if (d.intakeFields) setIntakeFields(d.intakeFields);
      if (d.otherIntakeFields) setOtherIntakeFields(d.otherIntakeFields);
      if (d.chiefConcernRequired !== undefined) setChiefConcernRequired(d.chiefConcernRequired);
      if (d.bookWithoutInsurance !== undefined) setBookWithoutInsurance(d.bookWithoutInsurance);
      if (d.emergencyActions) setEmergencyActions(d.emergencyActions);
      if (d.wordsToAvoid) setWordsToAvoid(d.wordsToAvoid);
      if (d.wordsToUse) setWordsToUse(d.wordsToUse);
      if (d.humorAllowed !== undefined) setHumorAllowed(d.humorAllowed);
      if (d.lunchStart) setLunchStart(d.lunchStart);
      if (d.lunchEnd) setLunchEnd(d.lunchEnd);
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
          }
        }
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
          if (fd.additionalLocations) setAdditionalLocations(fd.additionalLocations as string);
          if (fd.parkingNotes) setParkingNotes(fd.parkingNotes as string);
          if (fd.buildingAccess) setBuildingAccess(fd.buildingAccess as string);
          if (fd.timezone) setTimezone(fd.timezone as string);
          if (fd.doctorNames) setDoctorNames(fd.doctorNames as string);
          if (fd.pointOfContact) setPointOfContact(fd.pointOfContact as string);
          if (fd.billingContact) setBillingContact(fd.billingContact as string);
          if (fd.emergencyContact) setEmergencyContact(fd.emergencyContact as string);
          if (fd.schedulingContact) setSchedulingContact(fd.schedulingContact as string);
          if (fd.clinicHours) setClinicHours(fd.clinicHours as ClinicHours);
          if (fd.bookingScope) setBookingScope(fd.bookingScope as string);
          if (fd.apptTypes) setApptTypes(fd.apptTypes as Record<string, ApptTypeConfig>);
          if (fd.otherApptType) setOtherApptType(fd.otherApptType as string);
          if (fd.allowedProviders) setAllowedProviders(fd.allowedProviders as string);
          if (fd.ageRestrictions) setAgeRestrictions(fd.ageRestrictions as string);
          if (fd.minRescheduleHours) setMinRescheduleHours(fd.minRescheduleHours as string);
          if (fd.minCancelHours) setMinCancelHours(fd.minCancelHours as string);
          if (fd.urgentReviewTask !== undefined) setUrgentReviewTask(fd.urgentReviewTask as boolean);
          if (fd.intakeFields) setIntakeFields(fd.intakeFields as string[]);
          if (fd.otherIntakeFields) setOtherIntakeFields(fd.otherIntakeFields as string);
          if (fd.chiefConcernRequired !== undefined) setChiefConcernRequired(fd.chiefConcernRequired as boolean);
          if (fd.bookWithoutInsurance !== undefined) setBookWithoutInsurance(fd.bookWithoutInsurance as boolean);
          if (fd.emergencyActions) setEmergencyActions(fd.emergencyActions as string[]);
          if (fd.wordsToAvoid) setWordsToAvoid(fd.wordsToAvoid as string);
          if (fd.wordsToUse) setWordsToUse(fd.wordsToUse as string);
          if (fd.humorAllowed !== undefined) setHumorAllowed(fd.humorAllowed as boolean);
          if (fd.lunchStart) setLunchStart(fd.lunchStart as string);
          if (fd.lunchEnd) setLunchEnd(fd.lunchEnd as string);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptedTerms || !confirmedAccuracy) return;
    setSubmitting(true);
    setSubmitError("");

    const formData = {
      address, multiLocation, additionalLocations, parkingNotes, buildingAccess,
      timezone, doctorNames, pointOfContact, billingContact, emergencyContact,
      schedulingContact, clinicHours, bookingScope, apptTypes, otherApptType,
      allowedProviders, ageRestrictions, minRescheduleHours, minCancelHours,
      urgentReviewTask, intakeFields, otherIntakeFields, chiefConcernRequired,
      bookWithoutInsurance, emergencyActions, wordsToAvoid, wordsToUse,
      humorAllowed, lunchStart, lunchEnd, wantsInsurance, npi, providerFirstName,
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

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit");
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

  if (submitted && !editing) {
    const editUrl = editToken ? `${window.location.origin}/onboard/${slug}?edit=${editToken}` : "";
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md rounded-xl border bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">Thank You!</h1>
          <p className="mt-3 text-gray-600">
            Your onboarding information has been submitted successfully. Our team will review your information and get you onboarded.
          </p>
          {editUrl && (editTokenFromUrl || editToken) && (
            <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 p-4 text-left">
              <p className="text-sm font-medium text-blue-800 mb-2">Need to make changes later?</p>
              <p className="text-xs text-blue-700 mb-3">We sent an edit link to your email. You can also copy it below:</p>
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

      <div className="mx-auto max-w-3xl px-6 pt-8">
        {editing && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-sm text-blue-800 font-medium">You are editing a previously submitted form. Changes will update your submission.</p>
          </div>
        )}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Practice Onboarding</h1>
          <p className="mt-1 text-gray-500">Please complete all sections below. Pre-filled information can be edited.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">

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

              <Toggle label="Multiple Locations" checked={multiLocation} onChange={setMultiLocation} description="Do you have more than one office location?" />
              {multiLocation && (
                <Field label="Additional Location Addresses">
                  <textarea value={additionalLocations} onChange={e => setAdditionalLocations(e.target.value)} rows={3} placeholder="One address per line" className={textareaCls} />
                </Field>
              )}

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

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Primary Office Manager / Point of Contact">
                  <input type="text" value={pointOfContact} onChange={e => setPointOfContact(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Billing Contact">
                  <input type="text" value={billingContact} onChange={e => setBillingContact(e.target.value)} className={inputCls} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Emergency Contact">
                  <input type="text" value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Scheduling Contact">
                  <input type="text" value={schedulingContact} onChange={e => setSchedulingContact(e.target.value)} className={inputCls} />
                </Field>
              </div>

              {/* Clinic Hours */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Clinic Hours</label>
                <div className="space-y-2 rounded-lg border p-4">
                  {DAYS.map(day => (
                    <div key={day} className="flex items-center gap-3">
                      <span className="w-24 text-sm font-medium text-gray-700">{day}</span>
                      <label className="flex items-center gap-1.5 text-sm text-gray-500">
                        <input
                          type="checkbox"
                          checked={clinicHours[day]?.closed ?? false}
                          onChange={e => setClinicHours(prev => ({ ...prev, [day]: { ...prev[day], closed: e.target.checked } }))}
                          className="rounded border-gray-300"
                        />
                        Closed
                      </label>
                      {!clinicHours[day]?.closed && (
                        <>
                          <input type="time" value={clinicHours[day]?.open || "09:00"} onChange={e => setClinicHours(prev => ({ ...prev, [day]: { ...prev[day], open: e.target.value } }))} className="rounded border border-gray-300 px-2 py-1 text-sm" />
                          <span className="text-gray-400">to</span>
                          <input type="time" value={clinicHours[day]?.close || "17:00"} onChange={e => setClinicHours(prev => ({ ...prev, [day]: { ...prev[day], close: e.target.value } }))} className="rounded border border-gray-300 px-2 py-1 text-sm" />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Availability & Scheduling */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <SectionHeader number={2} title="Availability & Scheduling Rules" />
            <div className="space-y-4">
              <Field label="What can Orthia book?">
                <select value={bookingScope} onChange={e => setBookingScope(e.target.value)} className={inputCls}>
                  <option value="new_only">New patients only</option>
                  <option value="new_and_existing">New and existing patients</option>
                </select>
                <p className="mt-1 text-xs text-blue-600">You can start with just new patients. Existing patient booking can be configured later.</p>
              </Field>

              {bookingScope === "new_and_existing" && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                  <p className="mb-3 text-sm font-medium text-gray-700">Select appointment types Orthia can book:</p>
                  <div className="space-y-4">
                    {APPOINTMENT_TYPES.map(type => (
                      <div key={type}>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={apptTypes[type]?.enabled ?? false}
                            onChange={e => setApptTypes(prev => ({ ...prev, [type]: { ...prev[type], enabled: e.target.checked } }))}
                            className="rounded border-gray-300"
                          />
                          <span className="font-medium">{type}</span>
                        </label>
                        {apptTypes[type]?.enabled && (
                          <div className="ml-6 mt-2 grid gap-3 rounded-lg border bg-white p-3 sm:grid-cols-4">
                            <div className="sm:col-span-2">
                              <label className="mb-1 block text-xs text-gray-500">Allowed Days</label>
                              <div className="flex flex-wrap gap-1">
                                {DAYS.map(d => (
                                  <button key={d} type="button" onClick={() => {
                                    const cfg = apptTypes[type];
                                    const days = cfg.days.includes(d) ? cfg.days.filter(x => x !== d) : [...cfg.days, d];
                                    setApptTypes(prev => ({ ...prev, [type]: { ...cfg, days } }));
                                  }} className={`rounded px-2 py-0.5 text-xs font-medium ${apptTypes[type].days.includes(d) ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                                    {d.slice(0, 3)}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-gray-500">Time Range</label>
                              <div className="flex items-center gap-1">
                                <input type="time" value={apptTypes[type].startTime} onChange={e => setApptTypes(prev => ({ ...prev, [type]: { ...prev[type], startTime: e.target.value } }))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs" />
                                <span className="text-xs text-gray-400">-</span>
                                <input type="time" value={apptTypes[type].endTime} onChange={e => setApptTypes(prev => ({ ...prev, [type]: { ...prev[type], endTime: e.target.value } }))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs" />
                              </div>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-gray-500">Duration (min)</label>
                              <input type="number" value={apptTypes[type].duration} onChange={e => setApptTypes(prev => ({ ...prev, [type]: { ...prev[type], duration: e.target.value } }))} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" min="5" step="5" />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <Field label="Other Appointment Type">
                      <input type="text" value={otherApptType} onChange={e => setOtherApptType(e.target.value)} placeholder="Specify any other types..." className={inputCls} />
                    </Field>
                  </div>
                </div>
              )}

              <Field label="Allowed Providers">
                <textarea value={allowedProviders} onChange={e => setAllowedProviders(e.target.value)} rows={2} placeholder="List providers Orthia can schedule for..." className={textareaCls} />
              </Field>
              <Field label="Age Restrictions">
                <input type="text" value={ageRestrictions} onChange={e => setAgeRestrictions(e.target.value)} placeholder="e.g., 7 and older" className={inputCls} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Min hours to reschedule">
                  <input type="number" value={minRescheduleHours} onChange={e => setMinRescheduleHours(e.target.value)} placeholder="e.g., 24" className={inputCls} />
                </Field>
                <Field label="Min hours to cancel">
                  <input type="number" value={minCancelHours} onChange={e => setMinCancelHours(e.target.value)} placeholder="e.g., 24" className={inputCls} />
                </Field>
              </div>
              <YesNo label="If same appointment type is unavailable within 10 days, create urgent review task instead of booking?" value={urgentReviewTask} onChange={setUrgentReviewTask} />
            </div>
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
              <YesNo label="Is humor allowed?" value={humorAllowed} onChange={setHumorAllowed} />
            </div>
          </section>

          {/* Section 5: Lunch Hours */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <SectionHeader number={5} title="Lunch Hours" />
            <div className="flex items-center gap-3">
              <Field label="Start">
                <input type="time" value={lunchStart} onChange={e => setLunchStart(e.target.value)} className={inputCls} />
              </Field>
              <span className="mt-6 text-gray-400">to</span>
              <Field label="End">
                <input type="time" value={lunchEnd} onChange={e => setLunchEnd(e.target.value)} className={inputCls} />
              </Field>
            </div>
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
                {languages.includes("Other") && (
                  <input type="text" value={otherLanguage} onChange={e => setOtherLanguage(e.target.value)} placeholder="Specify language..." className={`mt-2 ${inputCls}`} />
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="PMS Name">
                <select value={pmsName} onChange={e => setPmsName(e.target.value)} className={inputCls}>
                  <option value="">Select...</option>
                  {PMS_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="PMS Version">
                <input type="text" value={pmsVersion} onChange={e => setPmsVersion(e.target.value)} placeholder="e.g., 21.1" className={inputCls} />
              </Field>
            </div>
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

          {/* Legal & Submit */}
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

              <button
                type="submit"
                disabled={submitting || !acceptedTerms || !confirmedAccuracy}
                className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Submitting..." : editing ? "Update Submission" : "Submit Onboarding Form"}
              </button>
            </div>
          </section>
        </form>
      </div>
    </main>
  );
}
