import { createOpenAI } from '@ai-sdk/openai';
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { experimental_createMCPClient, generateText } from 'ai';
import 'dotenv/config';

const apiKey = process.env.openaiApiKey; 

async function main() {
  const transport = new StreamableHTTPClientTransport(
    new URL('http://localhost:3002/mcp'),
  );

  const openai = createOpenAI({
     apiKey: apiKey
 });


  const mcpClient = await experimental_createMCPClient({
    transport,
  });

  try {
    const tools = await mcpClient.tools();

    const { text: answer } = await generateText({
      model: openai('gpt-4o-mini'),
      tools,
      maxSteps: 10,
      onStepFinish: async ({ toolResults }) => {
        console.log(`STEP RESULTS: ${JSON.stringify(toolResults, null, 2)}`);
      },
      system: 'You are a helpful chatbot',
      prompt: 'what is the weather alert in NY today?',
    });

    console.log(`FINAL ANSWER: ${answer}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mcpClient.close();
  }
}

main();