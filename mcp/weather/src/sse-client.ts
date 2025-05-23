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
    name: 'streamable-sse-client',
    version: '1.0.0'
});
const transport = new SSEClientTransport(new URL('http://localhost:3002/mcp'));
await mcpClient.connect(transport);
console.log("Connected using SSE transport");
const mcpTools = await mcpClient.listTools();
console.log("Available tools:", JSON.stringify(mcpTools));

const tools: FunctionTool[] = [];
mcpTools.tools.forEach((tool) => {
    tools.push({
        name: tool.name,
        description: tool.description,
        parameters: {
            type: 'object',
            properties: tool.inputSchema.properties,
            required: tool.inputSchema.required,
            additionalProperties: tool.inputSchema.additionalProperties
        },
        strict: false,
        type: "function"
    });
});

const apiKey = process.env.openaiApiKey; 
const modelName =  'gpt-4o-mini';

const client = new OpenAI({
    apiKey,
});

type ToolCallOptions = {
    previousResponseId?: string,
    input: ResponseInput,
    toolCall?: ResponseFunctionToolCall 
}
type ResponsesResponse = {
    message: string;
    responseId: string;
}


const callResponseAPI = async (option: ToolCallOptions): Promise<ResponsesResponse | null> => {
    try {
        const response = await client.responses.create({
            model:  'gpt-4o-mini',
            input:  option.input,
            text: {
                "format": {
                  "type": "text"
                }
              }, 
            tools
        }, {
            maxRetries: 0
        });
        const output = response.output[0];
        if (output.type === 'function_call') {
            option.input.push(output)
            option.toolCall = output;
            return callFunction(output.name, JSON.parse(output.arguments), option);
        }
        console.log('AI returned', response);
        return { message: response.output_text, responseId: response.id };
    } catch (err) {
        console.error(err);
        throw err;
    }
}

const callFunction = async (name: string, args: any, option: ToolCallOptions): Promise<ResponsesResponse | null> => {
    console.log('Calling function:', name, 'with arguments:', args);
    const funcResp = await mcpClient.callTool({
        name: name,
        arguments: args
    });
    console.log('Function response:', funcResp);
    option.input.push({
        type: 'function_call_output',
        call_id: option.toolCall!.call_id,
        output: JSON.stringify(Array.isArray(funcResp.content) ? funcResp.content[0].text : funcResp.content)
    });
    return callResponseAPI(option);
}

const response = await callResponseAPI({
    input: [
        {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "what is the weather alert in NY today?"
              }
            ]
        }
    ]
})


console.log('AI returned', response);
