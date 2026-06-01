import { StrictMode, useState, useEffect, useMemo } from 'react'
import { Analytics } from "@vercel/analytics/react"
import { createRoot } from 'react-dom/client'
import { RouterProvider, createHashRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import OTPLoginScreen from './components/OTPLoginScreen.jsx'
import { supabase, getWhitelistProfile } from './lib/supabase.js'

/**
 * Root | authentication gate + router provider
 *
 * CRITICAL: The router must be created with useMemo so it is only
 * instantiated ONCE after login | never recreated on re-renders.
 * Creating it inside the render body causes App to fully remount
 * on every navigation, wiping all merchant/promo/selection state.
 */
function Root() {
  const [authState, setAuthState] = useState("loading");
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
        // Session exists but user is not whitelisted | sign out silently
        await supabase.auth.signOut();
      }
      setAuthState("unauthenticated");
    };

    checkSession();

    // Listen for auth state changes (session expiry, sign-out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
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

  // ── Router: ONE catch-all route so App never remounts between phases ───
  // Previously had separate routes (/ and /:phase) which caused React Router
  // to unmount+remount App when switching | wiping all merchant/promo state.
  // With a single "/*" route, App is always the same mounted instance.
  // Phase logic lives entirely in App via useLocation() | nothing changes there.
  const router = useMemo(() => {
    if (!userProfile) return null;
    const appEl = <App userProfile={userProfile} onSignOut={handleSignOut} />;
    return createHashRouter([
      { path: "/*", element: appEl },
    ]);
  }, [userProfile]); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Loading ─────────────────────────────────────────────────────────────
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

  // ── Not logged in ───────────────────────────────────────────────────────
  if (authState === "unauthenticated") {
    return <OTPLoginScreen onAuthenticated={handleAuthenticated} />;
  }

  // ── Authenticated → stable router → App never remounts on navigation ────
  return (
    <>
      {router && <RouterProvider router={router} />}
      <Analytics />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
