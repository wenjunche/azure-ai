import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import dotenv from "dotenv";


dotenv.config();

import { OpenAI } from "openai";
import { ChatCompletionMessageParam, ChatCompletionUserMessageParam } from "openai/resources";
import { FunctionTool, ResponseFunctionToolCall, ResponseInput } from "openai/resources/responses/responses";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

import { experimental_createMCPClient } from 'ai';
// const transport = new Experimental_SseMCPTransport({
//   url: 'https://your-mcp-server.com/mcp',
// });
// const mcpClient = await experimental_createMCPClient({
//   transport: {
//     type: 'sse',
//     url: 'http://localhost:3002/mcp',
//   },
//   onUncaughtError: (error) => {
//     console.error('Uncaught error from MCP client:', error);
//   }
// });
// console.log("getting tools from MCP Client");
// mcpClient.tools().then((tools) => {
//   console.log("Available tools:", tools);
// });

const mcpClient = new Client({
    name: 'streamable-http-client',
    version: '1.0.0'
});
const transport = new SSEClientTransport(new URL('http://localhost:3002/mcp'));
await mcpClient.connect(transport);
console.log("Connected using SSE transport");
mcpClient.listTools().then((tools) => {
  console.log("Available tools:", tools);
});


const apiKey = process.env.openaiApiKey; 
const modelName =  'gpt-4o-mini';

const client = new OpenAI({
    apiKey,
});


