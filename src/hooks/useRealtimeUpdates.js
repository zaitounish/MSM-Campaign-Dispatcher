/**
 * useRealtimeUpdates.js | Supabase Realtime subscription for live dashboard.
 *
 * Subscribes to INSERT events on rep_activity_log so the Ultimate dashboard
 * can update without a manual refresh. Returns:
 *   - recentEvents: last N events received via realtime
 *   - onlineReps: Set of rep_emails currently tracked as present
 */

import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

const MAX_RECENT_EVENTS = 50;

export function useRealtimeUpdates({ enabled = true } = {}) {
  const [recentEvents, setRecentEvents] = useState([]);
  const [onlineReps, setOnlineReps] = useState(new Set());
  const channelRef = useRef(null);
  const presenceRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    // ── Activity feed subscription ─────────────────────────────────────────
    channelRef.current = supabase
      .channel("ultimate-activity-feed")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "rep_activity_log",
        },
        (payload) => {
          setRecentEvents(prev => {
            const next = [payload.new, ...prev];
            return next.slice(0, MAX_RECENT_EVENTS);
          });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[useRealtimeUpdates] channel error");
        }
      });

    // ── Presence tracking ──────────────────────────────────────────────────
    presenceRef.current = supabase
      .channel("app-presence")
      .on("presence", { event: "sync" }, () => {
        const state = presenceRef.current.presenceState();
        const emails = new Set();
        Object.values(state).forEach(presences => {
          presences.forEach(p => { if (p.repEmail) emails.add(p.repEmail); });
        });
        setOnlineReps(emails);
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        setOnlineReps(prev => {
          const next = new Set(prev);
          newPresences.forEach(p => { if (p.repEmail) next.add(p.repEmail); });
          return next;
        });
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        setOnlineReps(prev => {
          const next = new Set(prev);
          leftPresences.forEach(p => { if (p.repEmail) next.delete(p.repEmail); });
          return next;
        });
      })
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (presenceRef.current) {
        supabase.removeChannel(presenceRef.current);
        presenceRef.current = null;
      }
    };
  }, [enabled]);

  return { recentEvents, onlineReps };
}
