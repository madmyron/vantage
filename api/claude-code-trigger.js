import { execFileSync } from 'node:child_process';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = normalizeBody(req.body);
    const jobs = normalizeJobs(body);
    const projectName = String(body?.projectName || '').trim();
    const projectId = body?.projectId || null;

    if (!jobs.length) {
      sendJson(res, 400, { error: 'jobs are required' });
      return;
    }

    const workdir = process.cwd();
    const events = [];

    if (isGitDirty(workdir)) {
      sendJson(res, 409, {
        ok: false,
        status: 'paused',
        message: 'Uncommitted changes detected â€” please commit before proceeding.',
        events: ['Uncommitted changes detected â€” please commit before proceeding.'],
        jobs: jobs.map(job => ({ ...job, status: 'queued' })),
        projectId,
        projectName,
      });
      return;
    }

    const results = [];

    for (let i = 0; i < jobs.length; i += 1) {
      const job = { ...jobs[i], status: 'queued' };

      if (isGitDirty(workdir)) {
        const pauseMessage = 'Uncommitted changes detected â€” please commit before proceeding.';
        events.push(pauseMessage);
        results.push({ ...job, status: 'queued' });
        sendJson(res, 409, {
          ok: false,
          status: 'paused',
          message: pauseMessage,
          events,
          jobs: [...results, ...jobs.slice(i + 1).map(next => ({ ...next, status: 'queued' }))],
          projectId,
          projectName,
        });
        return;
      }

      events.push(`Starting PIP ${i + 1}: ${job.title}`);
      job.status = 'running';
      results.push({ ...job });

      try {
        const prompt = buildClaudePrompt(job, projectName, i + 1, jobs.length);
        const output = execFileSync(
          'claude',
          ['--print', prompt, '--allowedTools', job.tools || 'Edit,Write,Read'],
          {
            cwd: workdir,
            encoding: 'utf8',
            maxBuffer: 20 * 1024 * 1024,
            env: process.env,
          }
        );

        if (String(output || '').trim()) {
          console.log(`claude output for ${job.pipId}:`, String(output).trim());
        }

        commitIfNeeded(workdir, job);

        job.status = 'done';
        results[i] = { ...job };
        events.push(i < jobs.length - 1 ? `✓ PIP ${i + 1} complete. Starting PIP ${i + 2}...` : `✓ PIP ${i + 1} complete.`);
      } catch (err) {
        const message = errorMessage(err);
        job.status = 'failed';
        results[i] = { ...job };
        events.push(`PIP ${i + 1} failed: ${message}`);
        sendJson(res, 500, {
          ok: false,
          status: 'failed',
          message,
          events,
          jobs: results.concat(jobs.slice(i + 1).map(next => ({ ...next, status: 'queued' }))),
          projectId,
          projectName,
        });
        return;
      }
    }

    sendJson(res, 200, {
      ok: true,
      status: 'completed',
      message: 'Claude Code queue complete.',
      events,
      jobs: results,
      projectId,
      projectName,
    });
  } catch (err) {
    sendJson(res, 500, { error: errorMessage(err) });
  }
}

function setCorsHeaders(res) {
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
}

function sendJson(res, status, data) {
  setCorsHeaders(res);
  res.status(status).json(data);
}

function normalizeBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (_) {
      return {};
    }
  }
  return body;
}

function normalizeJobs(body) {
  if (Array.isArray(body?.jobs)) {
    return body.jobs
      .map((job, index) => normalizeJob(job, index))
      .filter(Boolean);
  }

  if (body?.pipId || body?.prompt) {
    return [normalizeJob({
      pipId: body.pipId,
      title: body.title || body.pipId || 'PIP',
      technicalDescription: body.prompt || '',
      files: body.files || [],
      status: 'queued',
    }, 0)].filter(Boolean);
  }

  return [];
}

function normalizeJob(job, index) {
  if (!job) return null;
  const pipId = String(job.pipId || job.id || `PIP-${index + 1}`).trim();
  const title = String(job.title || `PIP ${index + 1}`).trim();
  const technicalDescription = String(job.technicalDescription || job.prompt || '').trim();
  const files = Array.isArray(job.files) ? job.files.map(file => String(file).trim()).filter(Boolean) : [];

  return {
    pipId,
    title,
    technicalDescription,
    files,
    status: job.status || 'queued',
    tools: job.tools ? String(job.tools).trim() : null,
  };
}

function buildClaudePrompt(job, projectName, position, total) {
  const fileList = job.files.length ? job.files.join(', ') : 'No files specified';
  return [
    `Vantage PIP ${position}/${total}: ${job.title}`,
    `Project: ${projectName || 'Unknown project'}`,
    `PIP ID: ${job.pipId}`,
    `Files in scope: ${fileList}`,
    '',
    'Technical description:',
    job.technicalDescription || 'No technical description provided.',
    '',
    'Follow these rules:',
    '- Use only the files listed in scope unless absolutely necessary.',
    '- Make the smallest clean change that satisfies the PIP.',
    '- Keep the work focused and return a brief summary when done.',
  ].join('\n');
}

function isGitDirty(workdir) {
  const status = runGit(workdir, ['status', '--porcelain']);
  return Boolean(status.trim());
}

function commitIfNeeded(workdir, job) {
  if (!isGitDirty(workdir)) {
    return false;
  }

  runGit(workdir, ['add', '-A']);
  runGit(workdir, ['commit', '-m', `Complete ${job.pipId}: ${job.title}`]);
  return true;
}

function runGit(workdir, args) {
  return execFileSync('git', args, {
    cwd: workdir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function errorMessage(err) {
  if (!err) return 'Unknown error';
  const stderr = String(err.stderr || '').trim();
  const stdout = String(err.stdout || '').trim();
  const message = err instanceof Error ? err.message : String(err);
  return stderr || stdout || message || 'Unknown error';
}
