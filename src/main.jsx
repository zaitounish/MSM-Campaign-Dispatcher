import { StrictMode, useState, useEffect } from 'react'
import { Analytics } from "@vercel/analytics/react"
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import OTPLoginScreen from './components/OTPLoginScreen.jsx'
import { supabase, getWhitelistProfile } from './lib/supabase.js'
import { createHashRouter } from 'react-router-dom'

/**
 * Root — authentication gate + router provider
 *
 * Auth state machine:
 *   "loading"         → checking existing Supabase session
 *   "unauthenticated" → show OTPLoginScreen (no router needed)
 *   "authenticated"   → RouterProvider wraps App (enables back/forward)
 *
 * We create the router INSIDE Root so we can pass userProfile + onSignOut
 * as props to App without needing a React context. The router is memoized
 * by creating it once after authentication succeeds.
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

    // Listen for auth state changes (session expiry, sign-out)
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

  // ── Not logged in → OTP screen (no router wrapping needed) ─────────────
  if (authState === "unauthenticated") {
    return <OTPLoginScreen onAuthenticated={handleAuthenticated} />;
  }

  // ── Authenticated → App wrapped in RouterProvider ──────────────────────
  // Router is created here so App receives userProfile/onSignOut as props.
  // Hash routing (#/upload, #/select…) works on Vercel without rewrites.
  const router = createHashRouter([
    {
      path:    "/",
      element: <App userProfile={userProfile} onSignOut={handleSignOut} />,
    },
    {
      path:    "/:phase",
      element: <App userProfile={userProfile} onSignOut={handleSignOut} />,
    },
    {
      path:    "*",
      element: <App userProfile={userProfile} onSignOut={handleSignOut} />,
    },
  ]);

  return (
    <>
      <RouterProvider router={router} />
      <Analytics />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
