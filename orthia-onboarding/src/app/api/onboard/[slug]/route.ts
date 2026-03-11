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
      practice_type: body.practice_type,
      locations: body.locations,
      pms: body.pms,
      contact_name: body.contact_name,
      email: body.email,
      phone: body.phone,
      notes: body.notes,
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
