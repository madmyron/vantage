// ── GLOBAL EVENT LISTENERS ────────────────────────────────────

document.addEventListener('click', e => {
  if (!e.target.closest('.move-wrap') && !e.target.closest('.sub-move-wrap'))
    document.querySelectorAll('.move-dd.open,.sub-move-dd.open').forEach(m => m.classList.remove('open'));
});

document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// ── INIT ──────────────────────────────────────────────────────

async function init() {
  // Gate the entire app behind Supabase Auth. requireAuth() shows a
  // login modal and resolves once the user has a valid session.
  await requireAuth();

  await loadProjects();
  await initDax();
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW register failed:', err));
    });
  }
}

init();
