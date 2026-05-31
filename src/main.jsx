import { StrictMode, useState, useEffect } from 'react'
import { Analytics } from "@vercel/analytics/react"
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import OTPLoginScreen from './components/OTPLoginScreen.jsx'
import { supabase, getWhitelistProfile } from './lib/supabase.js'

/**
 * Root — authentication gate
 *
 * Auth state machine:
 *   "loading"       → checking existing Supabase session
 *   "unauthenticated" → show OTPLoginScreen
 *   "authenticated" → show App (with userProfile in context)
 *
 * The userProfile contains: { id, email, full_name, rep_id, role, is_active }
 * role can be: "ultimate" | "manager" | "rep"
 */
function Root() {
  const [authState,   setAuthState]   = useState("loading");
  const [userProfile, setUserProfile] = useState(null);

  // ── On mount: check for existing valid session ──────────────────────────
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user?.email) {
        const profile = await getWhitelistProfile(session.user.email);
        if (profile) {
          setUserProfile(profile);
          setAuthState("authenticated");
          return;
        }
        // Session exists but user is not whitelisted — sign out silently
        await supabase.auth.signOut();
      }
      setAuthState("unauthenticated");
    };

    checkSession();

    // Listen for auth changes (e.g. session expiry)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setUserProfile(null);
        setAuthState("unauthenticated");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthenticated = (profile) => {
    setUserProfile(profile);
    setAuthState("authenticated");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUserProfile(null);
    setAuthState("unauthenticated");
  };

  // ── Loading spinner ─────────────────────────────────────────────────────
  if (authState === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  // ── Not logged in → OTP screen ──────────────────────────────────────────
  if (authState === "unauthenticated") {
    return <OTPLoginScreen onAuthenticated={handleAuthenticated} />;
  }

  // ── Authenticated → full app ────────────────────────────────────────────
  return (
    <>
      <App userProfile={userProfile} onSignOut={handleSignOut} />
      <Analytics />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
