import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendEditLink } from "@/lib/email";

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
    // Strip the edit_token from the response for security
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

  // First, fetch the current submission to check status and token
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
      practice_name: body.practice_name,
      dba_name: body.dba_name || null,
      office_phone: body.office_phone || null,
      office_email: body.office_email || null,
      website: body.website || null,
      pms: body.pms || null,
      contact_name: body.contact_name,
      contact_role: body.contact_role || null,
      email: body.email,
      phone: body.phone,
      form_data: body.form_data || {},
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
  if (isFirstSubmission && body.email) {
    const baseUrl = req.headers.get("x-forwarded-host")
      ? `https://${req.headers.get("x-forwarded-host")}`
      : req.headers.get("host")
        ? `https://${req.headers.get("host")}`
        : "";
    const editUrl = `${baseUrl}/onboard/${slug}?edit=${existing.edit_token}`;
    sendEditLink(body.email, body.practice_name || data.practice_name, editUrl);
  }

  return NextResponse.json({ submission: data });
}
