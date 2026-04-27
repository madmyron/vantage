export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const body = await req.json();
    const prompt = String(body?.prompt || '').trim();
    const files = Array.isArray(body?.files) ? body.files.map(String).filter(Boolean) : [];
    const pipId = String(body?.pipId || '').trim();

    if (!prompt) {
      return jsonResponse({ error: 'prompt is required' }, 400);
    }

    if (!pipId) {
      return jsonResponse({ error: 'pipId is required' }, 400);
    }

    return jsonResponse({
      ok: false,
      status: 'scaffolded',
      message: 'Claude Code trigger is wired as a contract in stage 1. Execution will be added in the next stage.',
      request: { prompt, files, pipId },
    }, 501);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export const config = {
  path: '/.netlify/functions/claude-code-trigger',
};
