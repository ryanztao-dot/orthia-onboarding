import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendEditLink } from "@/lib/email";

const MAX_STRING = 5000;
const MAX_JSON = 50000;

function validateString(val: unknown, maxLen = MAX_STRING): string | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val !== "string") return null;
  return val.slice(0, maxLen);
}

function validateEmail(val: unknown): string | null {
  const s = validateString(val, 320);
  if (!s) return null;
  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

function validateFormData(val: unknown): Record<string, unknown> {
  if (!val || typeof val !== "object") return {};
  const json = JSON.stringify(val);
  if (json.length > MAX_JSON) {
    throw new Error("Form data too large");
  }
  return val as Record<string, unknown>;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const editParam = req.nextUrl.searchParams.get("edit") || "";

  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Submission not found" },
      { status: 404 }
    );
  }

  // Only expose edit_token if:
  // 1. Form is still pending (not submitted yet), OR
  // 2. The request includes the correct edit token as a query param
  const tokenVerified = editParam && editParam === data.edit_token;
  if (data.status === "complete" && !tokenVerified) {
    const { edit_token: _removed, ...safeData } = data;
    void _removed;
    return NextResponse.json({ submission: { ...safeData, edit_token: null } });
  }

  return NextResponse.json({ submission: data });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await req.json();

  // Input validation
  const practiceName = validateString(body.practice_name);
  if (!practiceName) {
    return NextResponse.json({ error: "Practice name is required" }, { status: 400 });
  }

  let formData: Record<string, unknown>;
  try {
    formData = validateFormData(body.form_data);
  } catch {
    return NextResponse.json({ error: "Form data too large" }, { status: 400 });
  }

  // Fetch current submission to check status and token
  const { data: existing } = await supabase
    .from("submissions")
    .select("status, edit_token, email")
    .eq("slug", slug)
    .single();

  if (!existing) {
    return NextResponse.json(
      { error: "Submission not found" },
      { status: 404 }
    );
  }

  // If already complete, require edit_token to update
  if (existing.status === "complete") {
    const providedToken = body.edit_token;
    if (!providedToken || providedToken !== existing.edit_token) {
      return NextResponse.json(
        { error: "Invalid or missing edit token" },
        { status: 403 }
      );
    }
  }

  const isFirstSubmission = existing.status === "pending";

  const { data, error } = await supabase
    .from("submissions")
    .update({
      practice_name: practiceName,
      dba_name: validateString(body.dba_name),
      office_phone: validateString(body.office_phone, 50),
      office_email: validateEmail(body.office_email),
      website: validateString(body.website, 500),
      pms: validateString(body.pms, 100),
      contact_name: validateString(body.contact_name, 200),
      contact_role: validateString(body.contact_role, 200),
      email: validateEmail(body.email),
      phone: validateString(body.phone, 50),
      form_data: formData,
      status: "complete",
    })
    .eq("slug", slug)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to update submission" },
      { status: 500 }
    );
  }

  // On first submission, send the edit link email
  let emailSent = false;
  if (isFirstSubmission && body.email) {
    const baseUrl = req.headers.get("x-forwarded-host")
      ? `https://${req.headers.get("x-forwarded-host")}`
      : req.headers.get("host")
        ? `https://${req.headers.get("host")}`
        : "";
    const editUrl = `${baseUrl}/onboard/${slug}?edit=${existing.edit_token}`;
    emailSent = await sendEditLink(body.email, practiceName, editUrl);
  }

  return NextResponse.json({ submission: data, emailSent });
}
