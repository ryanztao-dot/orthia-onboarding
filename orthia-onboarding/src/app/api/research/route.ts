import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";

function generateSlug(): string {
  return Math.random().toString(36).substring(2, 10);
}

export async function POST(req: NextRequest) {
  // Check admin auth
  const authCookie = req.cookies.get("admin_auth");
  if (authCookie?.value !== "true") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clinicName } = await req.json();
  if (!clinicName || typeof clinicName !== "string") {
    return NextResponse.json(
      { error: "clinicName is required" },
      { status: 400 }
    );
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.responses.create({
      model: "gpt-4o",
      tools: [{ type: "web_search_preview" }],
      input: `Research the dental/medical clinic called "${clinicName}". Find the following information:
1. The full official practice name
2. The practice type (e.g., "General Dentistry", "Orthodontics", "Pediatric Dentistry", "Multi-specialty", "Oral Surgery", etc.)
3. The number of locations (e.g., "1", "3", "5+")
4. The Practice Management Software (PMS) they use if you can find it (e.g., "Dentrix", "Eaglesoft", "Open Dental", "Curve Dental", etc.)

Respond with ONLY a JSON object in this exact format, no other text:
{"practiceName": "...", "practiceType": "...", "locations": "...", "pms": "..."}

If you cannot find a specific piece of information, use null for that field. For practiceName, fall back to "${clinicName}" if you can't find the official name.`,
    });

    // Extract text from response
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

    // Parse JSON from response
    const jsonMatch = resultText.match(/\{[\s\S]*?\}/);
    let researchData = {
      practiceName: clinicName,
      practiceType: null as string | null,
      locations: null as string | null,
      pms: null as string | null,
    };

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        researchData = {
          practiceName: parsed.practiceName || clinicName,
          practiceType: parsed.practiceType || null,
          locations: parsed.locations || null,
          pms: parsed.pms || null,
        };
      } catch {
        // Keep defaults if JSON parsing fails
      }
    }

    const slug = generateSlug();

    const { data, error } = await supabase
      .from("submissions")
      .insert({
        practice_name: researchData.practiceName,
        practice_type: researchData.practiceType,
        locations: researchData.locations,
        pms: researchData.pms,
        slug,
        status: "pending",
        contact_name: null,
        email: null,
        phone: null,
        notes: null,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { error: "Failed to save submission" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      submission: data,
      link: `/onboard/${slug}`,
    });
  } catch (err) {
    console.error("Research error:", err);
    return NextResponse.json(
      { error: "Failed to research clinic" },
      { status: 500 }
    );
  }
}
