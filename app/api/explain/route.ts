import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fallbackExplanation } from "@/lib/explanations";
import { DISCREPANCY_LABELS, DISCREPANCY_TYPES } from "@/lib/types";
import type { DiscrepancyType } from "@/lib/types";
import { formatCents } from "@/lib/money";

/**
 * Plain-language explanation of a single discrepancy.
 *
 * The model is strictly downstream of the engine. It receives a classification
 * that has already been made and is asked to explain it; it is never asked
 * whether two records match. Its output is presentation, so a bad response
 * degrades the page rather than corrupting the reconciliation.
 */

export const runtime = "nodejs";

const requestSchema = z.object({ discrepancyId: z.string().uuid() });

/** Overridable so the model can be changed without a code deploy. */
const MODEL = process.env.LLM_MODEL ?? "llama-3.3-70b-versatile";

/**
 * The shape the model must return. Anything else is treated as a failure --
 * we validate rather than trust, because a model that returns prose where a
 * field was promised would otherwise be rendered as an empty card.
 */
const explanationSchema = z.object({
  likely_cause: z.string().min(1).max(600),
  recommended_action: z.string().min(1).max(600),
  confidence: z.enum(["high", "medium", "low"]),
});

const SYSTEM_PROMPT = `You are a revenue operations analyst reviewing the output of a deterministic reconciliation engine.

The engine has ALREADY decided that the record below is a discrepancy, and which type it is. That decision is final and correct. You do not re-check it, dispute it, or suggest the records might actually match. Your only job is to explain the finding to a non-technical person who owns the store's revenue.

Rules:
- Explain what most likely happened upstream to produce this, and what the reader should do about it.
- Be concrete and reference the actual amounts and identifiers you are given.
- Never invent transaction ids, customer names, dates or amounts that are not in the input.
- If the input is thin, say what you would need rather than guessing.
- Two or three sentences per field. No preamble, no markdown.

Return ONLY a JSON object with exactly these keys:
{"likely_cause": string, "recommended_action": string, "confidence": "high" | "medium" | "low"}

"confidence" is your confidence in the explanation, not in the engine's classification.`;

type DiscrepancyRecord = {
  id: string;
  type: string;
  severity: string;
  order_key: string | null;
  transaction_refs: string[];
  expected_cents: number | null;
  actual_cents: number | null;
  delta_cents: number | null;
  detail: string;
  llm_explanation: unknown;
};

/** Compact, model-facing view of the record. Amounts are pre-formatted. */
function buildUserPrompt(d: DiscrepancyRecord) {
  return JSON.stringify(
    {
      discrepancy_type: d.type,
      discrepancy_label: DISCREPANCY_LABELS[d.type as DiscrepancyType] ?? d.type,
      severity: d.severity,
      order_reference: d.order_key,
      transaction_references: d.transaction_refs,
      expected_amount:
        d.expected_cents == null ? null : formatCents(d.expected_cents),
      settled_amount:
        d.actual_cents == null ? null : formatCents(d.actual_cents),
      difference:
        d.delta_cents == null
          ? "not quantifiable (different currencies)"
          : formatCents(d.delta_cents),
      engine_finding: d.detail,
    },
    null,
    2,
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A discrepancyId is required." },
      { status: 400 },
    );
  }

  // The record is loaded from the database by id. The client sends an
  // identifier and nothing else, so it cannot smuggle in a fabricated amount
  // or someone else's row -- RLS scopes this select to the caller's own data.
  const { data: discrepancy, error } = await supabase
    .from("discrepancies")
    .select(
      "id, type, severity, order_key, transaction_refs, expected_cents, actual_cents, delta_cents, detail, llm_explanation",
    )
    .eq("id", parsed.data.discrepancyId)
    .maybeSingle<DiscrepancyRecord>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!discrepancy) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Cached from a previous call. The same row must not be re-billed, and an
  // audit tool should show the same explanation every time it is opened.
  if (discrepancy.llm_explanation) {
    return NextResponse.json({
      explanation: discrepancy.llm_explanation,
      cached: true,
    });
  }

  const type = (
    DISCREPANCY_TYPES as readonly string[]
  ).includes(discrepancy.type)
    ? (discrepancy.type as DiscrepancyType)
    : null;

  const serveFallback = async () => {
    const explanation = type
      ? fallbackExplanation(type)
      : {
          likely_cause: "The engine flagged this record.",
          recommended_action: "Review the order and payment rows by hand.",
          confidence: "low" as const,
          fallback: true,
        };
    return NextResponse.json({ explanation, fallback: true });
  };

  if (!process.env.GROQ_API_KEY) {
    return serveFallback();
  }

  // Groq exposes an OpenAI-compatible endpoint, so the official SDK is reused
  // with a different base URL rather than pulling in a second client library.
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });
  const userPrompt = buildUserPrompt(discrepancy);

  /**
   * temperature 0.
   *
   * This is an audit tool. Opening the same discrepancy twice has to produce
   * the same explanation, or the reader cannot tell whether something changed
   * in the data or only in the wording. Sampling variety has no value here --
   * there is one correct explanation of a duplicate charge, and creative
   * paraphrase is a liability in a document someone may act on.
   */
  const callModel = async () => {
    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty completion.");
    return explanationSchema.parse(JSON.parse(raw));
  };

  let explanation: z.infer<typeof explanationSchema>;
  try {
    explanation = await callModel();
  } catch {
    // One retry: json_object mode still occasionally returns a valid JSON
    // object with the wrong keys, and a single retry clears most of those
    // without turning a page load into a long chain of attempts.
    try {
      explanation = await callModel();
    } catch {
      return serveFallback();
    }
  }

  // Cache on the row. A write failure is not worth failing the request over --
  // the reader still gets their explanation, it just costs a call next time.
  await supabase
    .from("discrepancies")
    .update({ llm_explanation: explanation })
    .eq("id", discrepancy.id);

  return NextResponse.json({ explanation, cached: false });
}
