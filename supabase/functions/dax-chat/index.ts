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
    const { messages, context, codeContext, system } = await req.json() as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      context?: {
        projects?: unknown[];
        pips?: unknown[];
        finances?: unknown[];
        team?: unknown[];
        activeProject?: unknown;
        conversationId?: unknown;
        conversationTitle?: unknown;
        pendingReview?: unknown;
        codeContext?: unknown;
      };
      codeContext?: unknown;
      system?: string;
    };
    const isReviewMode = Boolean(context?.pendingReview);
    const resolvedContext = {
      ...(context || {}),
      codeContext: codeContext ?? context?.codeContext ?? null,
    };

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = new Anthropic({ apiKey });

    const systemPrompt = isReviewMode ? buildReviewSystem(resolvedContext) : (system?.trim() ? system : buildSystem(resolvedContext));
    const tools = isReviewMode ? [proposeReviewPlanTool()] : undefined;
    const toolChoice = isReviewMode ? { type: "tool" as const, name: "propose_review_plan" } : undefined;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      ...(tools ? { tools, tool_choice: toolChoice } : {}),
    });

    const reply = isReviewMode ? extractReviewPlanFromToolUse(response.content) : (response.content[0].type === "text" ? response.content[0].text : "");
    console.log("dax-chat raw reply:", reply);

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
  activeProject?: unknown;
  conversationId?: unknown;
  conversationTitle?: unknown;
  pendingReview?: unknown;
  codeContext?: unknown;
}): string {
  const lines: string[] = [
    "You are Dax, a sharp and concise AI advisor built into Vantage — an entrepreneurial operating system.",
    "Your role: help the founder make better decisions about their projects, priorities, and resources.",
    "Be direct, specific, and action-oriented. No fluff. Use bullet points when listing items.",
    "Do not ask clarifying questions unless absolutely necessary. Make reasonable assumptions and act. If you need to ask, ask only one question maximum.",
    "When referencing data, cite project names and PIP IDs. Keep responses under 300 words unless asked for more.",
    "",
    "Today's date: " + new Date().toISOString().split("T")[0],
  ];
  if (ctx?.activeProject) {
    const projectName = typeof ctx.activeProject === "string"
      ? ctx.activeProject
      : typeof ctx.activeProject === "object" && ctx.activeProject
      ? (ctx.activeProject as { name?: unknown }).name
      : null;
    if (projectName) {
      lines.push("\n## Active Project");
      lines.push(String(projectName));
    }
  }

  return lines.join("\n");
}

function buildReviewSystem(ctx?: {
  projects?: unknown[];
  pips?: unknown[];
  finances?: unknown[];
  team?: unknown[];
  activeProject?: unknown;
  conversationId?: unknown;
  conversationTitle?: unknown;
  pendingReview?: unknown;
  codeContext?: unknown;
}): string {
  const lines: string[] = [
    "You are Dax acting as a project manager inside Vantage.",
    "Your job is to propose a review plan for the active project and return it only through the propose_review_plan tool.",
    "Do not output normal text. Use the tool once and only once.",
    "The tool output must be concise, founder-friendly, and ready for Claude Code handoff.",
    "Do not ask clarifying questions unless absolutely necessary. Make reasonable assumptions and act. If you need to ask, ask only one question maximum.",
  ];

  if (ctx?.activeProject) {
    const projectName = typeof ctx.activeProject === "string"
      ? ctx.activeProject
      : typeof ctx.activeProject === "object" && ctx.activeProject
      ? (ctx.activeProject as { name?: unknown }).name
      : null;
    if (projectName) {
      lines.push("\n## Active Project");
      lines.push(String(projectName));
    }
  }
  lines.push("");
  lines.push("Return ONLY this exact JSON structure with no other text:");
  lines.push('{');
  lines.push('  "projectName": "string",');
  lines.push('  "recommendation": "string",');
  lines.push('  "proposedPips": [');
  lines.push('    {');
  lines.push('      "pipId": "string",');
  lines.push('      "title": "string",');
  lines.push('      "displayDescription": "string",');
  lines.push('      "technicalDescription": "string",');
  lines.push('      "files": ["string"],');
  lines.push('      "order": number');
  lines.push('    }');
  lines.push('  ]');
  lines.push('}');
  lines.push('Do not include a summary field. Do not wrap in markdown. Do not add any text outside the JSON.');

  return lines.join("\n");
}

function proposeReviewPlanTool() {
  return {
    name: "propose_review_plan",
    description: "Return a structured review plan for the current project.",
    input_schema: {
      type: "object",
      properties: {
        projectName: { type: "string" },
        recommendation: { type: "string" },
        proposedPips: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pipId: { type: "string" },
              title: { type: "string" },
              displayDescription: { type: "string" },
              technicalDescription: { type: "string" },
              files: {
                type: "array",
                items: { type: "string" },
              },
              order: { type: "number" },
            },
            required: ["pipId", "title", "displayDescription", "technicalDescription", "files", "order"],
            additionalProperties: false,
          },
        },
      },
      required: ["projectName", "recommendation", "proposedPips"],
      additionalProperties: false,
    },
  };
}

function extractReviewPlanFromToolUse(content: Array<{ type: string; [key: string]: unknown }>): string {
  const toolUse = content.find(block => block.type === "tool_use" && block.name === "propose_review_plan") as
    | { type: "tool_use"; name: string; input?: Record<string, unknown> }
    | undefined;

  if (!toolUse) {
    throw new Error("Review mode did not return a propose_review_plan tool call");
  }

  return JSON.stringify(toolUse.input || {});
}
