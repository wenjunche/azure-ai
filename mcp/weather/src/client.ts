import { Anthropic } from "@anthropic-ai/sdk";
import {
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import dotenv from "dotenv";

dotenv.config();

// const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// if (!ANTHROPIC_API_KEY) {
//   throw new Error("ANTHROPIC_API_KEY is not set");
// }

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"));

const mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
mcp.connect(transport);

mcp.listTools().then((tools) => {
  console.log("Available tools:", tools);
//   tools.forEach((tool) => {
//     console.log(`- ${tool.name}: ${tool.description}`);
//   });
});
