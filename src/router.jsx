/**
 * router.jsx — App routing configuration
 *
 * Uses hash-based routing (#/upload, #/select, etc.) so the app
 * continues to work on Vercel without any server-side rewrite rules.
 * Hash routing also means the Supabase OTP magic-link redirect
 * (which uses the URL hash) won't collide with our routes.
 */
import { createHashRouter } from "react-router-dom";
import App from "./App.jsx";

// The router has a single root route — App handles all internal
// phase switching via useNavigate/useLocation. Sub-routes are not
// needed because the tool is a linear wizard, not a multi-page app.
export const router = createHashRouter([
  {
    path:    "/",
    element: <App />,
  },
  {
    // Catch-all: redirect unknown hashes back to root
    path:    "*",
    element: <App />,
  },
]);
