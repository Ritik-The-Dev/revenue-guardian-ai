/**
 * System status.
 *
 * Backed by GET /api/system/status, which returns booleans and mode labels
 * only — never key material. The header indicator is derived from this, so it
 * reflects a real reachability and database check rather than a decoration.
 */

import { useQuery } from "@tanstack/react-query";
import { api, type SystemStatus } from "./api";
import type { Tone } from "./format";

export type AgentHealth = "online" | "degraded" | "offline" | "checking";

export interface AgentHealthView {
  health: AgentHealth;
  label: string;
  hint: string;
  tone: Tone;
  status: SystemStatus | null;
}

export function useSystemStatus() {
  return useQuery({
    queryKey: ["system", "status"],
    queryFn: api.system.status,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
    staleTime: 10_000,
  });
}

export function useAgentHealth(): AgentHealthView {
  const { data, isError, isPending } = useSystemStatus();

  if (isPending) {
    return {
      health: "checking",
      label: "Checking",
      hint: "Contacting the recovery service.",
      tone: "idle",
      status: null,
    };
  }

  if (isError || !data) {
    return {
      health: "offline",
      label: "Agent offline",
      hint: "The recovery service is not reachable from this browser.",
      tone: "neg",
      status: null,
    };
  }

  if (!data.database) {
    return {
      health: "degraded",
      label: "Degraded",
      hint: "The service is running but its database is not responding. Cases cannot be recorded.",
      tone: "warn",
      status: data,
    };
  }

  const missing: string[] = [];
  if (!data.integrations.razorpay) missing.push("Razorpay");
  if (!data.integrations.whatsapp && !data.integrations.email) missing.push("outreach channel");

  if (missing.length > 0) {
    return {
      health: "degraded",
      label: "Partly configured",
      hint: `Running, but ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not configured.`,
      tone: "warn",
      status: data,
    };
  }

  return {
    health: "online",
    label: "Agent online",
    hint: "Service reachable, database responding, integrations configured.",
    tone: "pos",
    status: data,
  };
}

/** The integration rows shown in the sidebar, in dependency order. */
export function integrationRows(
  status: SystemStatus | null,
): { label: string; ok: boolean; note: string }[] {
  if (!status) return [];
  return [
    {
      label: "Database",
      ok: status.database,
      note: status.database ? "Responding" : "Not responding",
    },
    {
      label: "Razorpay",
      ok: status.integrations.razorpay,
      note:
        status.razorpayMode === "not_configured"
          ? "No keys configured"
          : status.razorpayMode === "test"
            ? "Test keys"
            : "Live keys",
    },
    {
      label: "AI model",
      ok: status.integrations.ai,
      note: status.integrations.ai
        ? "Pollinations configured"
        : status.integrations.aiFallbackAvailable
          ? "Deterministic rules only"
          : "Unavailable",
    },
    {
      label: "WhatsApp",
      ok: status.integrations.whatsapp,
      note: status.integrations.whatsapp ? "Configured" : "Not configured",
    },
    {
      label: "Email",
      ok: status.integrations.email,
      note: status.integrations.email ? "Configured" : "Not configured",
    },
    {
      label: "Webhook signatures",
      ok: status.integrations.webhookVerification,
      note: status.integrations.webhookVerification ? "Verified" : "Secret not set",
    },
  ];
}
