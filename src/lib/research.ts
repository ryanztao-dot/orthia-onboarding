import OpenAI from "openai";
import crypto from "crypto";
import { supabase } from "./supabase";

export function generateEditToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function generateSlug(): string {
  return crypto.randomBytes(12).toString("base64url");
}

export const RESEARCH_PROMPT = (clinicName: string) => `You are researching a dental/orthodontic practice called "${clinicName}" to pre-fill an onboarding form.

Search thoroughly using their website, Google Business Profile, social media pages, review sites (Yelp, Healthgrades, Zocdoc), and any other public sources. If you find multiple clinics with the same or similar name, return the most likely match and include the full address so the user can verify.

Extract as much of the following as you can find:

**Practice Details:**
- officialName: The full official practice name
- dbaName: DBA or "doing business as" name if different
- practiceType: e.g., "Orthodontics", "General Dentistry", "Pediatric Dentistry", "Multi-specialty", "Oral Surgery"
- website: The practice website URL
- officePhone: Main phone number
- officeEmail: Main email address (often on contact page or Google Business)
- address: Full street address
- timezone: Time zone based on their location (e.g., "Eastern (ET)", "Central (CT)", "Mountain (MT)", "Pacific (PT)")

**Locations:**
- locations: Number of locations (e.g., "1", "3", "5+")
- additionalLocations: If multiple locations, list additional addresses

**People:**
- doctorNames: Names of doctors/orthodontists at the practice
- officeManager: Office manager name if listed

**Hours:**
- clinicHours: Object with days as keys, each having open/close times and closed boolean. e.g., {"Monday": {"open": "08:00", "close": "17:00", "closed": false}, "Saturday": {"open": "", "close": "", "closed": true}}

**Services & Policies (from their website):**
- consultationPrice: Whether consultations are free or the price
- paymentMethods: Payment methods accepted
- insuranceNotAccepted: Insurance plans they do NOT accept (if listed)
- financingOptions: Financing options (CareCredit, payment plans, etc.)
- pmsName: Practice Management Software if mentioned anywhere (Dolphin, Dentrix, Cloud 9, Ortho2, Open Dental, Eaglesoft, OrthoTrac, Curve Dental)
- cancellationPolicy: Their cancellation policy if published
- missedApptPolicy: Missed appointment policy if published

**Confidence:**
- confidence: How confident you are this is the right practice. "high" = exact match found with clear identifying info, "medium" = likely match but some ambiguity, "low" = best guess among multiple similar results, "none" = could not find any matching practice at all

Respond with ONLY a valid JSON object, no other text. Use null for any field you cannot find. Include the confidence field.`;

export interface ResearchResult {
  found: boolean;
  confidence: "high" | "medium" | "low" | "none";
  data: Record<string, unknown>;
}

export async function researchClinic(clinicName: string): Promise<ResearchResult> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await client.responses.create({
    model: "gpt-4o",
    tools: [{ type: "web_search_preview" }],
    input: RESEARCH_PROMPT(clinicName),
  });

  let resultText = "";
  for (const item of response.output) {
    if (item.type === "message") {
      for (const block of item.content) {
        if (block.type === "output_text") {
          resultText += block.text;
        }
      }
    }
  }

  const jsonMatch = resultText.match(/\{[\s\S]*\}/);
  let research: Record<string, unknown> = {};

  if (jsonMatch) {
    try {
      research = JSON.parse(jsonMatch[0]);
    } catch {
      // Keep empty
    }
  }

  const confidence = (research.confidence as string) || "none";
  const found = confidence !== "none" && !!research.officialName;

  return { found, confidence: confidence as ResearchResult["confidence"], data: research };
}

export function buildFormData(research: Record<string, unknown>): Record<string, unknown> {
  const formData: Record<string, unknown> = {};
  if (research.address) formData.address = research.address;
  if (research.timezone) formData.timezone = research.timezone;
  if (research.additionalLocations) formData.additionalLocations = research.additionalLocations;
  if (research.locations && Number(research.locations) > 1) formData.multiLocation = true;
  if (research.doctorNames) formData.doctorNames = research.doctorNames;
  if (research.clinicHours) formData.clinicHours = research.clinicHours;
  if (research.consultationPrice) formData.consultationPrice = research.consultationPrice;
  if (research.paymentMethods) formData.paymentMethods = research.paymentMethods;
  if (research.insuranceNotAccepted) formData.insuranceNotAccepted = research.insuranceNotAccepted;
  if (research.financingOptions) formData.financingOptions = research.financingOptions;
  if (research.cancellationPolicy) formData.cancellationPolicy = research.cancellationPolicy;
  if (research.missedApptPolicy) formData.missedApptPolicy = research.missedApptPolicy;
  if (research.officeManager) formData.pointOfContact = research.officeManager;
  return formData;
}

export async function createSubmission(clinicName: string, research: Record<string, unknown>) {
  const slug = generateSlug();
  const editToken = generateEditToken();
  const formData = buildFormData(research);

  const { data, error } = await supabase
    .from("submissions")
    .insert({
      practice_name: (research.officialName as string) || clinicName,
      practice_type: (research.practiceType as string) || null,
      locations: (research.locations as string) || null,
      pms: (research.pmsName as string) || null,
      website: (research.website as string) || null,
      office_phone: (research.officePhone as string) || null,
      office_email: (research.officeEmail as string) || null,
      dba_name: (research.dbaName as string) || null,
      slug,
      status: "pending",
      contact_name: null,
      email: null,
      phone: null,
      notes: null,
      contact_role: null,
      form_data: formData,
      edit_token: editToken,
    })
    .select()
    .single();

  if (error) {
    throw new Error("Failed to save submission");
  }

  return { submission: data, link: `/onboard/${slug}`, editToken };
}

export async function createBlankSubmission(clinicName: string) {
  const slug = generateSlug();
  const editToken = generateEditToken();

  const { data, error } = await supabase
    .from("submissions")
    .insert({
      practice_name: clinicName,
      practice_type: null,
      locations: null,
      pms: null,
      website: null,
      office_phone: null,
      office_email: null,
      dba_name: null,
      slug,
      status: "pending",
      contact_name: null,
      email: null,
      phone: null,
      notes: null,
      contact_role: null,
      form_data: {},
      edit_token: editToken,
    })
    .select()
    .single();

  if (error) {
    throw new Error("Failed to save submission");
  }

  return { submission: data, link: `/onboard/${slug}`, editToken };
}
