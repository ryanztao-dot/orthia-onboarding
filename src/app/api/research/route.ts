import { NextRequest, NextResponse } from "next/server";
import { researchClinic, createSubmission, createBlankSubmission } from "@/lib/research";

export async function POST(req: NextRequest) {
  // Check admin auth
  const authCookie = req.cookies.get("admin_auth");
  if (authCookie?.value !== "true") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { clinicName, step } = body;

  if (!clinicName || typeof clinicName !== "string") {
    return NextResponse.json({ error: "clinicName is required" }, { status: 400 });
  }

  try {
    // Step 1: Research only — return data to client for confirmation
    if (step === "research") {
      const result = await researchClinic(clinicName);
      return NextResponse.json(result);
    }

    // Step 2: User confirmed — save research data to Supabase
    if (step === "confirm") {
      const { researchData } = body;
      if (!researchData) {
        return NextResponse.json({ error: "researchData is required" }, { status: 400 });
      }
      const result = await createSubmission(clinicName, researchData);
      return NextResponse.json(result);
    }

    // Step 3: User wants blank form — no AI data
    if (step === "skip") {
      const result = await createBlankSubmission(clinicName);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  } catch (err) {
    console.error("Research error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong" },
      { status: 500 }
    );
  }
}
