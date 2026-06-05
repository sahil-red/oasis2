import { ZEPTO_MCP_URL } from "@/lib/zepto/oauth";

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number | string;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

function parseMcpBody(text: string): JsonRpcResponse {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as JsonRpcResponse;
  }
  // Streamable HTTP may return SSE — take the last data line with JSON
  const lines = trimmed.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line?.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload.startsWith("{")) return JSON.parse(payload) as JsonRpcResponse;
  }
  throw new Error("Unexpected MCP response format");
}

async function mcpJsonRpc(
  accessToken: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(ZEPTO_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params: params ?? {},
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Zepto MCP HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const parsed = parseMcpBody(text);
  if (parsed.error) {
    throw new Error(parsed.error.message ?? "Zepto MCP error");
  }
  return parsed.result;
}

export async function initializeZeptoMcp(accessToken: string): Promise<void> {
  await mcpJsonRpc(accessToken, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "scout", version: "0.1.0" },
  });
}

export async function listZeptoTools(accessToken: string): Promise<
  Array<{ name: string; description?: string }>
> {
  await initializeZeptoMcp(accessToken);
  const result = (await mcpJsonRpc(accessToken, "tools/list", {})) as {
    tools?: Array<{ name: string; description?: string }>;
  };
  return result.tools ?? [];
}

export async function callZeptoTool(
  accessToken: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  await initializeZeptoMcp(accessToken);
  return mcpJsonRpc(accessToken, "tools/call", { name, arguments: args });
}
