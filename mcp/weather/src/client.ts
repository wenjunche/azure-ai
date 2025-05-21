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

import { OpenAI } from "openai";
import { ChatCompletionMessageParam, ChatCompletionUserMessageParam } from "openai/resources";
import { FunctionTool, ResponseFunctionToolCall, ResponseInput } from "openai/resources/responses/responses";

import { experimental_createMCPClient } from 'ai';
// const transport = new Experimental_SseMCPTransport({
//   url: 'https://your-mcp-server.com/mcp',
// });
const mcpClient = await experimental_createMCPClient({
  transport: {
    type: 'sse',
    url: 'http://localhost:3002/mcp',
  },
  onUncaughtError: (error) => {
    console.error('Uncaught error from MCP client:', error);
  }
});
console.log("getting tools from MCP Client");
mcpClient.tools().then((tools) => {
  console.log("Available tools by Vercel:", tools);
})

declare const openaiApiKey: string;
declare const imageBase64: string; // example base64 image
declare const longText: string;

const apiKey = openaiApiKey; 
const modelName =  'gpt-4o-mini';

const client = new OpenAI({
    apiKey,
});

// const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// if (!ANTHROPIC_API_KEY) {
//   throw new Error("ANTHROPIC_API_KEY is not set");
// }

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3002/mcp"));

const mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
mcp.connect(transport);

mcp.listTools().then((tools) => {
  console.log("Available tools:", tools);
//   tools.forEach((tool) => {
//     console.log(`- ${tool.name}: ${tool.description}`);
//   });
});
