import { StrictMode, useState } from 'react'
import { Analytics } from "@vercel/analytics/react"
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LockScreen, { isSessionAuthenticated } from './components/LockScreen.jsx'

function Root() {
  // Check if the session was already authenticated (survives hot-reloads, not a full refresh)
  const [unlocked, setUnlocked] = useState(() => isSessionAuthenticated());

  if (!unlocked) {
    return <LockScreen onUnlocked={() => setUnlocked(true)} />;
  }

  return (
    <>
      <App />
      <Analytics />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
