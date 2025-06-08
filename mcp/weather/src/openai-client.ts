
import { OpenAI } from "openai";
import { FunctionTool, ResponseFunctionToolCall, ResponseInput } from "openai/resources/responses/responses";

import 'dotenv/config';

const apiKey = process.env.openaiApiKey;
const mcpServerUrl = process.env.mcpServerUrl || '';
const modelName =  'gpt-4o-mini';

const client = new OpenAI({
    apiKey,
});


const callResponseAPI = async (): Promise<void> => {
    try {
        const response = await client.responses.create({
            model:  'gpt-4o-mini',
            input:  'what is the weather alert in NY today?',
            tools: [{
                type: 'mcp',
                server_url: mcpServerUrl,
                server_label: 'weather-MCP-Server',
                require_approval: 'never',
            }]
        });
        console.log('AI returned', response);
    } catch (err) {
        console.error(err);
        throw err;
    }
}


(async function () {
    try {
        await callResponseAPI();
    } catch (error) {
        console.error('Error calling response API:', error);
    }

})();
