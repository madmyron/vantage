// ── AUTH ──────────────────────────────────────────────────────
//
// Vantage is a single-user app. This module gates the entire UI behind
// a Supabase Auth login. Once a user is signed in, the rest of the app
// uses the existing `sb` client — Supabase automatically attaches the
// JWT to every request, so RLS policies based on auth.uid() apply.
//
// First-time setup:
//   1. Load the app, click "Create account", enter your email + password.
//   2. Confirm the email if Supabase sends a confirmation link.
//   3. Once signed in, ask the assistant to apply the auth-scoped RLS
//      policies on projects/dax_history/dax_messages/dax_inbox.
//   4. In Supabase dashboard → Authentication → Providers → Email,
//      disable "Allow new users to sign up" so nobody else can register.

(function () {
  const AUTH_STYLE = `
    #vantage-auth-overlay {
      position: fixed; inset: 0;
      background: linear-gradient(135deg, #1a1530 0%, #5b4de0 100%);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000;
      font-family: 'DM Sans', sans-serif;
    }
    #vantage-auth-card {
      background: #fff; border-radius: 14px;
      padding: 32px 28px; width: 100%; max-width: 360px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
    }
    #vantage-auth-card .vantage-auth-logo {
      width: 44px; height: 44px;
      background: #5b4de0; color: #fff;
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; font-weight: 700;
      margin: 0 auto 16px;
    }
    #vantage-auth-card h2 {
      margin: 0 0 4px; font-size: 22px; font-weight: 600; text-align: center; color: #1a1a1a;
    }
    #vantage-auth-card .vantage-auth-sub {
      margin: 0 0 22px; font-size: 13px; color: #666; text-align: center;
    }
    #vantage-auth-card .vantage-auth-tabs {
      display: flex; gap: 4px; margin-bottom: 20px; background: #f3f3f5;
      padding: 4px; border-radius: 8px;
    }
    #vantage-auth-card .vantage-auth-tab {
      flex: 1; padding: 8px 0; font-size: 13px; font-weight: 500;
      background: transparent; border: 0; border-radius: 6px;
      cursor: pointer; color: #666; transition: all 0.15s;
    }
    #vantage-auth-card .vantage-auth-tab.active {
      background: #fff; color: #1a1a1a; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    #vantage-auth-card label {
      display: block; font-size: 12px; color: #555; margin-bottom: 4px; font-weight: 500;
    }
    #vantage-auth-card input {
      width: 100%; padding: 10px 12px;
      border: 1.5px solid #e0e0e5; border-radius: 8px;
      font-size: 14px; box-sizing: border-box; margin-bottom: 12px;
      font-family: inherit; outline: none; transition: border-color 0.15s;
    }
    #vantage-auth-card input:focus { border-color: #5b4de0; }
    #vantage-auth-card button.vantage-auth-submit {
      width: 100%; padding: 11px;
      background: #5b4de0; color: #fff;
      border: 0; border-radius: 8px;
      font-size: 14px; font-weight: 600; cursor: pointer;
      font-family: inherit; transition: background 0.15s;
    }
    #vantage-auth-card button.vantage-auth-submit:hover { background: #4a3eb8; }
    #vantage-auth-card button.vantage-auth-submit:disabled { background: #b3aae8; cursor: not-allowed; }
    #vantage-auth-card .vantage-auth-msg {
      margin-top: 10px; font-size: 13px; min-height: 18px;
      text-align: center;
    }
    #vantage-auth-card .vantage-auth-msg.error { color: #c43a3a; }
    #vantage-auth-card .vantage-auth-msg.success { color: #2a8a3a; }
  `;

  function buildModal() {
    const styleEl = document.createElement('style');
    styleEl.textContent = AUTH_STYLE;
    document.head.appendChild(styleEl);

    const overlay = document.createElement('div');
    overlay.id = 'vantage-auth-overlay';
    overlay.innerHTML = `
      <form id="vantage-auth-card" autocomplete="on">
        <div class="vantage-auth-logo">V</div>
        <h2>Sign in to Vantage</h2>
        <p class="vantage-auth-sub">Your projects are private. Sign in to continue.</p>
        <div class="vantage-auth-tabs">
          <button type="button" class="vantage-auth-tab active" data-mode="signin">Sign in</button>
          <button type="button" class="vantage-auth-tab" data-mode="signup">Create account</button>
        </div>
        <label for="vantage-auth-email">Email</label>
        <input type="email" id="vantage-auth-email" required autocomplete="email"/>
        <label for="vantage-auth-password">Password</label>
        <input type="password" id="vantage-auth-password" required autocomplete="current-password" minlength="6"/>
        <button type="submit" class="vantage-auth-submit" id="vantage-auth-submit">Sign in</button>
        <div class="vantage-auth-msg" id="vantage-auth-msg"></div>
      </form>
    `;
    document.body.appendChild(overlay);

    let mode = 'signin';
    const submit = overlay.querySelector('#vantage-auth-submit');
    const msg    = overlay.querySelector('#vantage-auth-msg');
    const pwInp  = overlay.querySelector('#vantage-auth-password');

    overlay.querySelectorAll('.vantage-auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        mode = tab.dataset.mode;
        overlay.querySelectorAll('.vantage-auth-tab').forEach(t => t.classList.toggle('active', t === tab));
        submit.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
        pwInp.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
        msg.textContent = ''; msg.className = 'vantage-auth-msg';
      });
    });

    return { overlay, getMode: () => mode };
  }

  let modalState = null;

  function showModal() {
    if (!modalState) modalState = buildModal();
    modalState.overlay.style.display = 'flex';

    const form = modalState.overlay.querySelector('#vantage-auth-card');
    const msg  = modalState.overlay.querySelector('#vantage-auth-msg');
    const submit = modalState.overlay.querySelector('#vantage-auth-submit');

    return new Promise((resolve) => {
      const handler = async (ev) => {
        ev.preventDefault();
        const email = modalState.overlay.querySelector('#vantage-auth-email').value.trim();
        const password = modalState.overlay.querySelector('#vantage-auth-password').value;
        const mode = modalState.getMode();

        msg.textContent = ''; msg.className = 'vantage-auth-msg';
        submit.disabled = true;
        submit.textContent = mode === 'signup' ? 'Creating account...' : 'Signing in...';

        try {
          if (mode === 'signup') {
            const { data, error } = await sb.auth.signUp({ email, password });
            if (error) throw error;
            if (data.session) {
              form.removeEventListener('submit', handler);
              hideModal();
              resolve(data.session);
              return;
            } else {
              msg.textContent = 'Account created. Check your email to confirm, then come back and sign in.';
              msg.className = 'vantage-auth-msg success';
            }
          } else {
            const { data, error } = await sb.auth.signInWithPassword({ email, password });
            if (error) throw error;
            form.removeEventListener('submit', handler);
            hideModal();
            resolve(data.session);
            return;
          }
        } catch (err) {
          msg.textContent = err.message || 'Something went wrong.';
          msg.className = 'vantage-auth-msg error';
        } finally {
          submit.disabled = false;
          submit.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
        }
      };
      form.addEventListener('submit', handler);
    });
  }

  function hideModal() {
    if (modalState) modalState.overlay.style.display = 'none';
  }

  async function requireAuth() {
    const { data } = await sb.auth.getSession();
    if (data.session) return data.session;
    return await showModal();
  }

  async function signOut() {
    await sb.auth.signOut();
    location.reload();
  }

  // Listen for sign-out from another tab
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') location.reload();
  });

  window.requireAuth = requireAuth;
  window.signOutVantage = signOut;
})();
