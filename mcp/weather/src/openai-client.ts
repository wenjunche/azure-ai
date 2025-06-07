
import { OpenAI } from "openai";
import { FunctionTool, ResponseFunctionToolCall, ResponseInput } from "openai/resources/responses/responses";

import 'dotenv/config';

const apiKey = process.env.openaiApiKey; 
const modelName =  'gpt-4o-mini';

const client = new OpenAI({
    apiKey,
});



async function getWeather(latitude: number, longitude: number): Promise<number> {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m`);
    const data = await response.json();
    return data.current.temperature_2m;
}

type ToolCallOptions = {
    previousResponseId?: string,
    input: ResponseInput,
    toolCall?: ResponseFunctionToolCall 
}

const callResponseAPI = async (): Promise<void> => {
    try {
        const response = await client.responses.create({
            model:  'gpt-4o-mini',
            input:  'what is the weather alert in NY today?',
            tools: [{
                type: 'mcp',
                server_url: 'http://localhost:3002/mcp',
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
