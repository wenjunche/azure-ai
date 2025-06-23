import { createOpenAI } from '@ai-sdk/openai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { experimental_createMCPClient, generateText } from 'ai';
import 'dotenv/config';
import OpenAI from 'openai';

const apiKey = process.env.openaiApiKey; 
const githubToken = process.env.githubToken;

const mcpServerUrl = 'http://localhost:3002/mcp'; // 'https://api.githubcopilot.com/mcp/';

async function main() {

const transport = new StreamableHTTPClientTransport(
    new URL(mcpServerUrl), {
        // requestInit: {
        //     headers: {
        //       'Authorization': `Bearer ${githubToken}`,
        //         // 'Content-Type': 'application/json',
        //     }
        // }
      }
);

const openai = createOpenAI({
     apiKey: apiKey
 });

const client = new OpenAI({
    apiKey,
});


 const mcpClient = await experimental_createMCPClient({
    transport,
    onUncaughtError: (error: unknown) => {
      console.error('Uncaught error in MCP client:', error);
    },
  });

//   const mcpClient = new Client({
//       name: 'streamable-http-client',
//       version: '1.0.0',
//   });

try {
    // await mcpClient.connect(transport);
    // console.log("Connected using Streamable HTTP transport", transport.sessionId);

    const tools = await mcpClient.tools();
    Object.keys(tools).forEach((key) => {
        console.log("Tool:", key);
    });
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
    //   // prompt: 'please get all issues in repository named azure-ai, created by wenjunche, and search for issues that mention "Mazy" in the title or body',
    //   prompt: 'what is the weather alert in NY today?',
    // });
    // console.log(`FINAL ANSWER: ${answer}`);

    const response = await client.responses.create({
         model:  'gpt-4o-mini',
    //     input:  'please create an issue in repository named azure-ai, created by wenjunche, with description "this is a test issue created by AI"',
         input: 'please get all issues in repository named azure-ai, created by wenjunche, and search for issues that mention "Mazy" in the title or body',
         tools: [{
             type: 'mcp',
             server_url: mcpServerUrl,
             server_label: 'github-MCP-Server',
             require_approval: 'never',
             headers: {
                 'Authorization': `Bearer ${githubToken}`,
             }
         }]
     });
    console.log('AI returned', response);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await transport.close();
    await mcpClient.close();
  }
}

main();