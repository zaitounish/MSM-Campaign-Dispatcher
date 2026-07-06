/**
 * useManagerAlerts.js | Computes actionable alerts from rep metric data.
 *
 * Takes the enriched repMetrics array from useActivityData and produces
 * a categorized list of alerts ready to render in AlertsPanel.
 *
 * No Supabase calls here   alerts are derived entirely from pre-fetched data
 * so there's no extra network overhead.
 */

import { useMemo } from "react";

/**
 * @param {Array} repMetrics   enriched rep metrics array from useActivityData
 * @param {number} inactivityThresholdDays   flag reps inactive beyond this (default 3)
 * @param {number} limitWarnPct   warn when sent / limit >= this fraction (default 0.8)
 * @returns {{ alerts: Alert[], counts: { total, critical, warning, info } }}
 */
export function useManagerAlerts(repMetrics, {
  inactivityThresholdDays = 15,
} = {}) {
  const { alerts, counts } = useMemo(() => {
    if (!repMetrics || repMetrics.length === 0) {
      return { alerts: [], counts: { total: 0, warn: 0, info: 0 } };
    }

    const list = [];

    repMetrics.forEach(rep => {
      // ── Inactivity alert ────────────────────────────────────────────────────
      if (rep.needsCheckIn && rep.role !== "ultimate") {
        const days = rep.daysSinceLastLogin;
        
        // "Warn" (red) if never logged in or inactive > 15 days
        if (days === null || days > inactivityThresholdDays) {
          list.push({
            id: `inactive-${rep.email}`,
            type: "warn",
            category: "inactivity",
            repEmail: rep.email,
            repName: rep.fullName,
            message: days === null
              ? `${rep.fullName} has never logged in`
              : `${rep.fullName} hasn't logged in for ${days} days`,
            action: "Needs Check-in",
            sortKey: days ?? 999,
          });
        } 
        // "Info" (amber) if inactive for exactly 15 days
        else if (days === inactivityThresholdDays) {
          list.push({
            id: `inactive-${rep.email}`,
            type: "info",
            category: "inactivity",
            repEmail: rep.email,
            repName: rep.fullName,
            message: `${rep.fullName} hasn't logged in for exactly ${inactivityThresholdDays} days`,
            action: "Needs Check-in",
            sortKey: days,
          });
        }
      }

      // ── Blank-only sends ────────────────────────────────────────────────────
      if (rep.onlyBlankSends) {
        list.push({
          id: `blank-${rep.email}`,
          type: "info",
          category: "engagement",
          repEmail: rep.email,
          repName: rep.fullName,
          message: `${rep.fullName} is only sending blank emails (bypassing quota)`,
          action: "Check Activity",
          sortKey: 0,
        });
      }
    });

    // Sort: warn first, then info; within same type by severity key
    const typeOrder = { warn: 0, info: 1 };
    list.sort((a, b) => {
      const typeComp = typeOrder[a.type] - typeOrder[b.type];
      if (typeComp !== 0) return typeComp;
      return b.sortKey - a.sortKey;
    });

    const counts = {
      total: list.length,
      warn: list.filter(a => a.type === "warn").length,
      info: list.filter(a => a.type === "info").length,
    };

    return { alerts: list, counts };
  }, [repMetrics, inactivityThresholdDays]);

  return { alerts, counts };
}
