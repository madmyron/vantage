import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PipJob {
  pipId: string;
  title: string;
  technicalDescription: string;
  files: string[];
}

async function fetchFile(repo: string, path: string, token: string): Promise<string | null> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "vantage-dax/1.0",
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.type !== "file") return null;
  return new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\n/g, "")), c => c.charCodeAt(0)));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { repo, pip, vercelUrl }: { repo: string; pip: PipJob; vercelUrl?: string } = await req.json();

    const githubToken = Deno.env.get("GITHUB_TOKEN");
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!githubToken) throw new Error("GITHUB_TOKEN not set");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    // Re-fetch files from GitHub after commit
    const fileSnippets: string[] = [];
    for (const filePath of pip.files) {
      const content = await fetchFile(repo, filePath, githubToken);
      if (content) {
        fileSnippets.push(`--- ${filePath} ---\n${content.slice(0, 3000)}`);
      }
    }

    // Ask Claude to verify the change landed
    const client = new Anthropic({ apiKey });
    const verifyResponse = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: `You verified a code change was applied. Respond with only "PASS" or "FAIL: <one sentence reason>".

Change that was supposed to be applied: ${pip.technicalDescription}

Current code:
${fileSnippets.join("\n\n") || "(no files found)"}`,
      }],
    });

    const verifyText = verifyResponse.content[0].type === "text" ? verifyResponse.content[0].text.trim() : "FAIL: no response";
    const codeVerified = verifyText.startsWith("PASS");
    const verifyIssue = codeVerified ? null : verifyText.replace(/^FAIL:\s*/i, "");

    // Check Vercel URL is up
    let siteUp: boolean | null = null;
    let siteIssue: string | null = null;
    if (vercelUrl) {
      try {
        const siteRes = await fetch(vercelUrl, { signal: AbortSignal.timeout(10000) });
        siteUp = siteRes.ok;
        if (!siteUp) siteIssue = `Site returned ${siteRes.status}`;
      } catch (e) {
        siteUp = false;
        siteIssue = "Site unreachable";
      }
    }

    const passed = codeVerified && (siteUp !== false);
    const issues = [verifyIssue, siteIssue].filter(Boolean) as string[];

    return new Response(JSON.stringify({ passed, codeVerified, siteUp, issues }), {
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
