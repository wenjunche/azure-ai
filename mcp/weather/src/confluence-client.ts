import { createOpenAI } from '@ai-sdk/openai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { experimental_createMCPClient, generateText } from 'ai';
import 'dotenv/config';
import OpenAI from 'openai';

const apiKey = process.env.openaiApiKey; 
const confluenceToken = process.env.confluenceToken;

async function main() {

console.log(confluenceToken);

// const transport = new StreamableHTTPClientTransport(
//     new URL('https://mcp.atlassian.com/v1/sse'), {
//         requestInit: {
//             headers: {
//               'Authorization': `Bearer ${confluenceToken}`,
//                 // 'Content-Type': 'application/json',
//             }
//         }
//       }
// );

const sseTransport = new SSEClientTransport(new URL('https://mcp.atlassian.com/v1/sse'), {
    requestInit: {
        headers: {
            'Authorization': `Bearer ${confluenceToken}`,
            // 'Content-Type': 'application/json',
        }
    } 
});

const openai = createOpenAI({
     apiKey: apiKey
 });

const client = new OpenAI({
    apiKey,
});


//  const mcpClient = await experimental_createMCPClient({
//     sseTransport,
//     onUncaughtError: (error: unknown) => {
//       console.error('Uncaught error in MCP client:', error);
//     },
//   });

  const mcpClient = new Client({
      name: 'streamable-http-client',
      version: '1.0.0',
  });

const mcpServerUrl = 'https://api.githubcopilot.com/mcp/';

try {
    await mcpClient.connect(sseTransport);
    const mcpTools = await mcpClient.listTools();
    console.log("Available tools:", JSON.stringify(mcpTools));

    // console.log("Connected using Streamable HTTP transport", transport.sessionId);

    // const tools = await mcpClient.tools();
    // Object.keys(tools).forEach((key) => {
    //     console.log("Tool:", key);
    // });

    // console.log("Available tools:", JSON.stringify(tools, null, 2));

    // const { text: answer } = await generateText({
    //   model: openai('gpt-4o-mini'),
    //   tools,
    //   maxSteps: 10,
    //   onStepFinish: async ({ toolResults }) => {
    //     console.log(`STEP RESULTS: ${JSON.stringify(toolResults, null, 2)}`);
    //   },
    //   system: 'You are an AI assistant that can interact with GitHub. Use the available tools to answer questions about GitHub repositories and users.',
    //   // prompt: 'please create an issue in repository named azure-ai, created by wenjunche, with description "this is a test issue created by AI"',
    //   prompt: 'please list all the issues in repository named azure-ai, created by wenjunche',
    // });
    // console.log(`FINAL ANSWER: ${answer}`);

    // const response = await client.responses.create({
    //     model:  'gpt-4o-mini',
    //     input:  'please create an issue in repository named azure-ai, created by wenjunche, with description "this is a test issue created by AI"',
    //     tools: [{
    //         type: 'mcp',
    //         server_url: mcpServerUrl,
    //         server_label: 'github-MCP-Server',
    //         require_approval: 'never',
    //         headers: {
    //             'Authorization': `Bearer ${githubToken}`,
    //         }
    //     }]
    // });
    // console.log('AI returned', response);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // await transport.close();
    // await mcpClient.close();
  }
}

main();