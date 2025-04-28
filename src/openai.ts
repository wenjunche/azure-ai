
import { OpenAI } from "openai";
import { ChatCompletionMessageParam, ChatCompletionUserMessageParam } from "openai/resources";
import { countTokens } from "./helper";
import { FunctionTool, ResponseFunctionToolCall, ResponseInput } from "openai/resources/responses/responses";

declare const openaiApiKey: string;
declare const imageBase64: string; // example base64 image
declare const longText: string;

const apiKey = openaiApiKey; 
const modelName =  'gpt-4o-mini';

const client = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true
});

const messages: ChatCompletionMessageParam[] = [
    { role: 'user', content: 'why is sky blue' }
  ];


export async function greet(): Promise<string | null> {

    const response = await client.chat.completions.create({
            model:  modelName,
            messages
        });

    return response.choices[0].message.content;

}

type ResponsesRequest = {
    content: string;
    previousResponseId?: string;
}
type ResponsesResponse = {
    message: string;
    responseId: string;
}

type ChatMessage = {
    role: 'user' | 'assistant',
    content: string
}
type ChatRequest = {
    message: ChatMessage;
    previousMessages?: ChatMessage[];
}

const imageMessages2: ChatCompletionUserMessageParam[] = [
    { role: 'user', 
      content: [
            {
                type: 'text',
                text: 'please summarize the image' 
            },
            {
                type: 'image_url',
                image_url: {
                    url: `data:image/jpeg;base64,${imageBase64}`,
                    // detail: 'low',
                }
            }
        ],
    }
  ];

const callChatCompletion = async (prompt: ChatRequest): Promise<string | null> => {

    const messages = [];
    if (prompt.previousMessages) {
        messages.push(...prompt.previousMessages);
    }
    messages.push(prompt.message);

    console.log('sending to OpenAI', messages);
    try {
        const response = await client.chat.completions.create({
            model:  'gpt-4o-mini',
            messages: imageMessages2 // messages
        });
        console.log('AI returned', response);
        return response.choices[0].message.content;
    } catch (err) {
        console.error(err);
        throw err;
    }
}

const temperatures: Record<string, number> = {
    'New York': 25,
    'Los Angeles': 30,
    'Chicago': 20,
    'Houston': 28,
}

const getTemperature = async (ask: {city: string}) => {
    return JSON.stringify(temperatures[ask.city] || 'City not found');
}

async function getWeather(latitude: number, longitude: number): Promise<number> {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m`);
    const data = await response.json();
    return data.current.temperature_2m;
}

const tools: FunctionTool[] = [
    // { type: 'web_search_preview' },
    {
        type: 'function',
        name: 'getTemperature',
        description: 'Get the temperature of a city',
        parameters: {
            type: 'object',
            properties: {
                city: {
                    type: 'string',
                    description: 'The name of the city to get the temperature for'
                }
            },
            required: ['city'],
            additionalProperties: false
        },
        strict: true
    }];

type ToolCallOptions = {
    previousResponseId?: string,
    input: ResponseInput,
    toolCall?: ResponseFunctionToolCall 
}

const imageMessages: ResponseInput = [
    { role: 'user', 
      content: [
            {
                type: 'input_text',
                text: 'please summarize the image' 
            },
            {
                type: 'input_image',
                image_url: `data:image/png;base64,${imageBase64}`,
                detail: 'high',
            }
        ],
    }
  ];

const useResponseAPI = async (prompt: ResponsesRequest): Promise<ResponsesResponse | null> => {    
    const tokenCount = countTokens(modelName, prompt.content);
    console.log(`sending to AI: ${JSON.stringify(prompt)} with token count ${tokenCount}`);

    const option: ToolCallOptions = {
        previousResponseId: prompt.previousResponseId,
        input: [{
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt.content
              }
            ]                
        }]
    }
    return callResponseAPI(option);
}

const callResponseAPI = async (option: ToolCallOptions): Promise<ResponsesResponse | null> => {
    try {
        const response = await client.responses.create({
            model:  'gpt-4o-mini',
            input:  option.input,
            previous_response_id: option.previousResponseId,
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
    let functionValue: unknown;
    if (name === 'getTemperature') {
        functionValue = await getTemperature(args);
    } else if (name === 'getWeather') {
        functionValue =  await getWeather(args.latitude, args.longitude);
    } else {
        throw new Error(`Function ${name} not found`);
    }
    if (!option.toolCall) {
        throw new Error('Tool call is undefined');
    }
    option.input.push({
        type: 'function_call_output',
        call_id: option.toolCall.call_id,
        output: JSON.stringify(functionValue)
    });
    return callResponseAPI(option);
}

const sleep = async (secs: number) => {
    return new Promise<void>((res) => {
        setTimeout(() => {
            res();
        }, secs * 1000);
    })
}

(async function () {
    // console.log('asking 1');
    // const hello1 = await useResponseAPI({ content: 'what is the temperature of New York city today ?'});
    // console.log(hello1);

    // await sleep(20);

    // console.log('asking 2');
    // const hello2 = await useResponseAPI({ content: 'what about Houston', previousResponseId: hello1?.responseId });

    // console.log(hello2);



    console.log('asking question 1');
    const q1: ChatMessage = { role: 'user', content: `summarize the following text: ${longText}` };
    const history: ChatMessage[] = [q1];
    const answer1 = await callChatCompletion({ message: q1 });
    console.log(answer1);
    // if (answer1) {
    //     history.push({ role: 'assistant', content: answer1 });
    // }

    // console.log('asking question 2');
    // const q2: ChatMessage = { content: 'more examples please', role: 'user' };
    // history.push(q2);
    // const answer2 = await callChatCompletion({ message: q2, previousMessages: history });
    // console.log(answer2);
    // if (answer2) {
    //     history.push({ role: 'assistant', content: answer2 });
    // }

    // console.log('asking question 3');
    // const q3: ChatMessage = { content: 'what about generator', role: 'user' };
    // history.push(q3);
    // const answer3 = await callChatCompletion({ message: q3, previousMessages: history });
    // console.log(answer3);


})();
