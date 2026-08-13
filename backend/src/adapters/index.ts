import { PanelAdapter, ServerCredentials } from "./types";
import { ThreeXUIAdapter } from "./threexui";
import { X4GAdapter } from "./x4g";
import { NahanAdapter } from "./nahan";

export type PanelType = "THREEXUI" | "X4G" | "NAHAN";

/**
 * Given a Server row from the DB, return the right adapter instance.
 * This is the ONLY place in the codebase that needs to know panel types
 * exist — everything else just calls the PanelAdapter interface.
 */
export function getAdapter(
  panelType: PanelType,
  server: { baseUrl: string; username: string; password: string; extra?: string | null }
): PanelAdapter {
  const creds: ServerCredentials = {
    baseUrl: server.baseUrl,
    username: server.username,
    password: server.password,
    extra: server.extra ? JSON.parse(server.extra) : null,
  };

  switch (panelType) {
    case "THREEXUI":
      return new ThreeXUIAdapter(creds);
    case "X4G":
      return new X4GAdapter(creds);
    case "NAHAN":
      return new NahanAdapter(creds);
    default:
      throw new Error(`Unknown panel type: ${panelType}`);
  }
}

export * from "./types";
