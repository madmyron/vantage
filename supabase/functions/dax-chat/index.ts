import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages, context, system } = await req.json() as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      context?: {
        projects?: unknown[];
        pips?: unknown[];
        finances?: unknown[];
        team?: unknown[];
      };
      system?: string;
    };

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = new Anthropic({ apiKey });

    const systemPrompt = system?.trim() ? system : buildSystem(context);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const reply = response.content[0].type === "text" ? response.content[0].text : "";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildSystem(ctx?: {
  projects?: unknown[];
  pips?: unknown[];
  finances?: unknown[];
  team?: unknown[];
}): string {
  const lines: string[] = [
    "You are Dax, a sharp and concise AI advisor built into Vantage — an entrepreneurial operating system.",
    "Your role: help the founder make better decisions about their projects, priorities, and resources.",
    "Be direct, specific, and action-oriented. No fluff. Use bullet points when listing items.",
    "When referencing data, cite project names and PIP IDs. Keep responses under 300 words unless asked for more.",
    "",
    "Today's date: " + new Date().toISOString().split("T")[0],
  ];

  if (ctx?.projects?.length) {
    lines.push("\n## Active Projects");
    lines.push(JSON.stringify(ctx.projects, null, 2));
  }
  if (ctx?.pips?.length) {
    lines.push("\n## Open PIPs (action items)");
    lines.push(JSON.stringify(ctx.pips, null, 2));
  }
  if (ctx?.finances?.length) {
    lines.push("\n## Financial Snapshot");
    lines.push(JSON.stringify(ctx.finances, null, 2));
  }
  if (ctx?.team?.length) {
    lines.push("\n## Team");
    lines.push(JSON.stringify(ctx.team, null, 2));
  }

  return lines.join("\n");
}
