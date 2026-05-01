import { NextRequest, NextResponse } from "next/server";
import { teamDb } from "@/lib/team/supabase";
import { requireUser } from "@/lib/team/user-auth";
import { describeDbError } from "@/lib/team/db-error";

const PMS_OPTIONS = [
  "Dolphin",
  "Orthotrace",
  "Ortho2 Edge",
  "Cloud 9",
  "Wave",
  "Other",
  "Don't Know",
] as const;
const PRACTICE_TYPES = ["Ortho only", "GP + Ortho", "DSO/multilocation"] as const;
const VISITOR_ROLES = ["FD", "Office Manager", "Doctor", "Other"] as const;
const HEAT_VALUES = ["hot", "warm", "cold"] as const;
const REPS = ["Clarissa", "Olyver"] as const;
const LEAD_TYPES = ["doctor", "front_desk"] as const;

function nullableString(v: unknown, max = 2000): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function nullableEnum<T extends readonly string[]>(
  v: unknown,
  allowed: T,
): T[number] | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return null;
  return (allowed as readonly string[]).includes(v) ? (v as T[number]) : null;
}

function nullableBool(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  return null;
}

function nullableTimestamp(v: unknown): string | null {
  const s = nullableString(v, 64);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function nullablePainLevel(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 10) return null;
  return Math.round(n);
}

function buildPayload(body: Record<string, unknown>) {
  return {
    lead_type: nullableEnum(body.lead_type, LEAD_TYPES),
    practice_name: nullableString(body.practice_name, 200),
    city_state: nullableString(body.city_state, 200),
    pms: nullableEnum(body.pms, PMS_OPTIONS),
    practice_type: nullableEnum(body.practice_type, PRACTICE_TYPES),
    visitor_role: nullableEnum(body.visitor_role, VISITOR_ROLES),
    doctor_visit_at: nullableTimestamp(body.doctor_visit_at),
    doctor_present: nullableBool(body.doctor_present),
    doctor_email: nullableString(body.doctor_email, 200),
    doctor_phone: nullableString(body.doctor_phone, 50),
    current_solution: nullableString(body.current_solution, 500),
    pain_level: nullablePainLevel(body.pain_level),
    demo_scheduled: nullableBool(body.demo_scheduled),
    demo_date: nullableTimestamp(body.demo_date),
    wheel_prize: nullableString(body.wheel_prize, 200),
    heat: nullableEnum(body.heat, HEAT_VALUES),
    rep: nullableEnum(body.rep, REPS),
    followed_up:
      body.followed_up === true
        ? true
        : body.followed_up === false
          ? false
          : false,
    notes: nullableString(body.notes, 5000),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const { data, error } = await teamDb
    .from("tt_booth_leads")
    .select("*")
    .eq("organization_id", user.organization_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: describeDbError(error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ leads: data });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = buildPayload(body);
  if (!payload.practice_name) {
    return NextResponse.json(
      { error: "Practice name is required" },
      { status: 400 },
    );
  }

  const { data, error } = await teamDb
    .from("tt_booth_leads")
    .insert({
      ...payload,
      organization_id: user.organization_id,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: describeDbError(error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ lead: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id =
    typeof body.id === "number"
      ? body.id
      : typeof body.id === "string"
        ? parseInt(body.id, 10)
        : NaN;
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const built = buildPayload(body);
  const allowed: (keyof typeof built)[] = [
    "lead_type",
    "practice_name",
    "city_state",
    "pms",
    "practice_type",
    "visitor_role",
    "doctor_visit_at",
    "doctor_present",
    "doctor_email",
    "doctor_phone",
    "current_solution",
    "pain_level",
    "demo_scheduled",
    "demo_date",
    "wheel_prize",
    "heat",
    "rep",
    "followed_up",
    "notes",
  ];

  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) patch[k] = built[k];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "no fields to update" },
      { status: 400 },
    );
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await teamDb
    .from("tt_booth_leads")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: describeDbError(error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ lead: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const { searchParams } = new URL(req.url);
  const idRaw = searchParams.get("id");
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await teamDb
    .from("tt_booth_leads")
    .delete()
    .eq("id", id)
    .eq("organization_id", user.organization_id);

  if (error) {
    return NextResponse.json(
      { error: describeDbError(error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
