import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { problem, context, repo } = await req.json() as {
      problem: string;
      context?: string;
      repo?: string;
    };

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are a senior engineer advising an AI orchestrator (Dax) that is managing code changes on a project.

Dax has hit a problem and needs concrete technical guidance. Give a direct, actionable answer. No preamble. Max 150 words.

${repo ? `Repo: ${repo}` : ""}
${context ? `Context: ${context}` : ""}

Problem: ${problem}

Respond with:
1. The root cause (one sentence)
2. Exact steps to fix it (numbered, brief)`,
      }],
    });

    const solution = response.content[0]?.type === "text" ? response.content[0].text : "";

    return new Response(JSON.stringify({ solution }), {
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
