import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PipJob {
  pipId: string;
  title: string;
  displayDescription: string;
  technicalDescription: string;
  files: string[];
}

async function fetchFile(repo: string, path: string, token: string): Promise<{ content: string; sha: string } | null> {
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
  return {
    content: new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\n/g, "")), c => c.charCodeAt(0))),
    sha: data.sha,
  };
}

async function commitFile(repo: string, path: string, content: string, sha: string, message: string, token: string): Promise<boolean> {
  const encoded = btoa(unescape(encodeURIComponent(content)));
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "vantage-dax/1.0",
    },
    body: JSON.stringify({ message, content: encoded, sha }),
  });
  return res.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { repo, pip }: { repo: string; pip: PipJob } = await req.json();

    const githubToken = Deno.env.get("GITHUB_TOKEN");
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!githubToken) throw new Error("GITHUB_TOKEN not set in Supabase secrets");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const client = new Anthropic({ apiKey });
    const results: { file: string; success: boolean; error?: string }[] = [];

    for (const filePath of pip.files) {
      const fileData = await fetchFile(repo, filePath, githubToken);
      if (!fileData) {
        results.push({ file: filePath, success: false, error: `File not found: ${filePath}` });
        continue;
      }

      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8096,
        messages: [{
          role: "user",
          content: `You are a precise code editor. Apply ONLY the specific change described below. Return the complete modified file with no explanation, no markdown fences, no commentary — just the raw file content exactly as it should be saved.

File path: ${filePath}

Current file content:
${fileData.content}

Change to apply: ${pip.technicalDescription}

Return only the complete modified file content.`,
        }],
      });

      const raw = response.content[0].type === "text" ? response.content[0].text : "";
      const cleaned = raw.replace(/^```[\w]*\r?\n/, "").replace(/\r?\n```$/, "").trim();

      const ok = await commitFile(repo, filePath, cleaned, fileData.sha, `dax: ${pip.title}`, githubToken);
      results.push({ file: filePath, success: ok, error: ok ? undefined : "GitHub commit failed" });
    }

    const allSuccess = results.every(r => r.success);
    return new Response(JSON.stringify({ success: allSuccess, results }), {
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
