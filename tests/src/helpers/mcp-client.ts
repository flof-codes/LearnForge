import axios, { type AxiosInstance } from "axios";
import { TEST_CONFIG } from "./fixtures.js";

/**
 * Parse an SSE (Server-Sent Events) response body into JSON-RPC result.
 * The StreamableHTTP transport returns responses like:
 *   event: message
 *   data: {"result":{...},"jsonrpc":"2.0","id":1}
 */
function parseSSE(raw: string): { result?: any; error?: any; id: number } {
  const lines = raw.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      return JSON.parse(line.slice(6));
    }
  }
  // If the response isn't SSE, try parsing as plain JSON
  return JSON.parse(raw);
}

/**
 * MCP StreamableHTTP test client.
 * Implements the JSON-RPC 2.0 protocol over HTTP as used by
 * @modelcontextprotocol/sdk's StreamableHTTPServerTransport.
 *
 * The transport requires `Accept: application/json, text/event-stream`
 * and returns SSE-formatted responses.
 */
export class McpTestClient {
  private http: AxiosInstance;
  private sessionId: string | null = null;
  private nextId = 1;

  constructor(
    baseUrl: string = TEST_CONFIG.mcpUrl,
    apiKey: string = TEST_CONFIG.mcpApiKey,
  ) {
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${apiKey}`,
      },
      // Get raw text so we can parse SSE ourselves
      responseType: "text",
      transformResponse: [(data) => data],
      validateStatus: () => true,
    });
  }

  /**
   * Send the MCP initialize handshake.
   * Stores the session ID from the response headers.
   */
  async initialize(): Promise<Record<string, unknown>> {
    const res = await this.http.post("/mcp", {
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "learnforge-test", version: "1.0.0" },
      },
    });

    if (res.status !== 200) {
      throw new Error(`MCP initialize failed: ${res.status} ${res.data}`);
    }

    // Store session ID from response header
    const sid = res.headers["mcp-session-id"];
    if (sid) {
      this.sessionId = sid;
    }

    const parsed = parseSSE(res.data as string);
    if (parsed.error) {
      throw new Error(`MCP initialize error: ${JSON.stringify(parsed.error)}`);
    }

    return parsed.result;
  }

  /**
   * Call an MCP tool by name with the given arguments.
   * Returns the parsed content from the tool response.
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    const res = await this.sendRequest("tools/call", { name, arguments: args });
    return res;
  }

  /**
   * Parse the text content from a tool call result.
   * Most MCP tools return JSON-stringified results in the text field.
   */
  parseToolResult<T = unknown>(
    result: { content: Array<{ type: string; text: string }>; isError?: boolean },
  ): T {
    const textContent = result.content.find((c) => c.type === "text");
    if (!textContent) throw new Error("No text content in MCP tool result");
    return JSON.parse(textContent.text) as T;
  }

  /**
   * List all available MCP tools.
   */
  async listTools(): Promise<Array<{ name: string; description: string }>> {
    const res = await this.sendRequest("tools/list", {});
    return res.tools;
  }

  /**
   * Close the MCP session by sending a DELETE request.
   */
  async close(): Promise<void> {
    if (!this.sessionId) return;
    await this.http.delete("/mcp", {
      headers: { "mcp-session-id": this.sessionId },
    });
    this.sessionId = null;
  }

  /**
   * Send a raw request and return status + raw parsed data.
   * Useful for testing auth errors (401, 403).
   */
  async rawRequest(
    method: string,
    params: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<{ status: number; data: unknown }> {
    const res = await this.http.post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: this.nextId++,
        method,
        params,
      },
      {
        headers: {
          ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
          ...headers,
        },
      },
    );

    let data: unknown;
    try {
      data = parseSSE(res.data as string);
    } catch {
      // Not SSE or JSON — return raw
      try {
        data = JSON.parse(res.data as string);
      } catch {
        data = res.data;
      }
    }

    return { status: res.status, data };
  }

  /**
   * Get the current session ID (for testing).
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private async sendRequest(method: string, params: Record<string, unknown>): Promise<any> {
    if (!this.sessionId) {
      throw new Error("MCP client not initialized. Call initialize() first.");
    }

    const res = await this.http.post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: this.nextId++,
        method,
        params,
      },
      {
        headers: { "mcp-session-id": this.sessionId },
      },
    );

    if (res.status !== 200) {
      throw new Error(`MCP request failed: ${res.status} ${res.data}`);
    }

    const parsed = parseSSE(res.data as string);

    if (parsed.error) {
      throw new Error(`MCP JSON-RPC error: ${JSON.stringify(parsed.error)}`);
    }

    return parsed.result;
  }
}

/**
 * Create a raw axios client without auth (for testing 401/403).
 */
export function createUnauthMcpClient(baseUrl: string = TEST_CONFIG.mcpUrl): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    responseType: "text",
    transformResponse: [(data) => data],
    validateStatus: () => true,
  });
}
