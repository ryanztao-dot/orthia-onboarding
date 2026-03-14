import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

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

  return NextResponse.json({ submission: data });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await req.json();

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
    .eq("status", "pending")
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to update submission" },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Submission not found or already completed" },
      { status: 404 }
    );
  }

  return NextResponse.json({ submission: data });
}
