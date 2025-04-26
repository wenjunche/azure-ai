
import { AzureOpenAI } from "openai";
import { ChatCompletionMessageParam, ChatCompletionUserMessageParam } from "openai/resources";
import { FileSearchTool, FunctionTool, ResponseFunctionToolCall, ResponseInput, ResponseInputItem } from "openai/resources/responses/responses";
import { countTokens } from "./helper";

// can be found in Endpoints and Keys of Overview of the project in AI Foundry
// declare const endpoint: string // Azure OpenAI Service Endpoint
declare const apiKey: string;  // API Key
declare const endpoint: string; // replace with your Azure OpenAI endpoint
declare const imageBase64: string; // example base64 image
declare const longText: string;
declare const apiKeyWest: string;  // API Key
declare const endpointWest: string; // replace with your Azure OpenAI endpoint

const modelName =  'gpt-4o-mini';

const client = new AzureOpenAI({
    apiKey: apiKeyWest,
    apiVersion: '2024-04-01-preview', //'2025-03-01-preview',
    endpoint: endpointWest,
    dangerouslyAllowBrowser: true
});

const imageMessages: ChatCompletionUserMessageParam[] = [
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

const callChatCompletion = async (prompt: ChatRequest): Promise<string | null> => {
    const tokenCount = countTokens(modelName, prompt.message.content);
    console.log(`sending to AI with token count ${tokenCount}`);

    const messages = [];
    if (prompt.previousMessages) {
        messages.push(...prompt.previousMessages);
    }
    messages.push(prompt.message);

    console.log('sending to OpenAI', messages);
    try {
        const response = await client.chat.completions.create({
            model:  'gpt-4o-mini',
            messages: imageMessages,
            max_completion_tokens: 200
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

const imageInput: ResponseInputItem = {
    role: "user",
    content: [
      {
        type: 'input_text',
        text: 'please summarize this image'
      },
      {
        type: 'input_image',
        image_url: `data:image/jpeg;base64,${imageBase64}`,
        detail: 'low'
      }

    ]                
};


const tools: FunctionTool[] = [
    // { type: 'web_search_preview' },
    // {
    //     type: 'function',
    //     name: 'getTemperature',
    //     description: 'Get the temperature of a city',
    //     parameters: {
    //         type: 'object',
    //         properties: {
    //             city: {
    //                 type: 'string',
    //                 description: 'The name of the city to get the temperature for'
    //             }
    //         },
    //         required: ['city'],
    //         additionalProperties: false
    //     },
    //     strict: true
    // },
    // {
    //     "type": "function",
    //     name: "getWeather",
    //     description: "Get current temperature for provided coordinates in celsius.",
    //     parameters: {
    //         type: "object",
    //         properties: {
    //             latitude: { type: "number" },
    //             longitude: { type: "number" }
    //         },
    //         required: ["latitude", "longitude"],
    //         additionalProperties: false
    //     },
    //     strict: true
    // }
];

type ToolCallOptions = {
    previousResponseId?: string,
    input: ResponseInput,
}

const callResponseAPI = async (prompt: ResponsesRequest): Promise<ResponsesResponse | null> => {
    const tokenCount = countTokens(modelName, prompt.content);
    console.log(`sending to AI with token count ${tokenCount}`);

    const option: ToolCallOptions = {
        previousResponseId: prompt.previousResponseId,
        input: [
            {
                role: "user",
                content: [
                {
                    type: "input_text",
                    text: prompt.content
                }
                ]                
            }
            // imageInput
        ]
    }

    while (true) {
        try {
            const response = await client.responses.create({
                model:  'gpt-4o-mini',
                input: option.input,
                previous_response_id: option.previousResponseId,
                text: {
                    "format": {
                    "type": "text"
                    }
                }, 
                tools,
                max_output_tokens: 500
            }, {
                maxRetries: 0
            });
            let moreTools = false;
            for (const toolCall of response.output) {
                if (toolCall.type === 'function_call') {
                    option.input.push(toolCall)
                    const functionValue = await callFunction(toolCall.name, JSON.parse(toolCall.arguments));
                    option.input.push({
                        type: 'function_call_output',
                        call_id: (toolCall as ResponseFunctionToolCall).call_id,
                        output: JSON.stringify(functionValue)
                    });
                    moreTools = true;
                }    
            }
            if (!moreTools) {
                console.log('AI returned', response);
                return { message: response.output_text, responseId: response.id };
            }
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
}

const callFunction = async (name: string, args: any): Promise<any | null> => {
    console.log('calling function', name, args);
    let functionValue: unknown;
    if (name === 'getTemperature') {
        functionValue = await getTemperature(args);
    } else if (name === 'getWeather') {
        functionValue =  await getWeather(args.latitude, args.longitude);
    } else {
        throw new Error(`Function ${name} not found`);
    }
    return functionValue;
}

const callResponseAPIWithStore = async (prompt: ResponsesRequest, storeId: string): Promise<string | null> => {
    const input: ResponseInput = [
        {
                role: "user",
                content: [
                {
                    type: "input_text",
                    text: prompt.content
                }
                ]                
            }
    ];

    const tools: FileSearchTool[] = [
        {
            type: 'file_search',
            vector_store_ids: [ storeId ]
        }
    ];

    try {
        const response = await client.responses.create({
            model:  'gpt-4o-mini',
            input,
            text: {
                "format": {
                "type": "text"
                }
            }, 
            max_output_tokens: 500,
            tools
        }, {
            maxRetries: 0
        });
        console.log('AI returned', response);
        return response.output_text;
    } catch (err) {
        console.error(err);
        throw err;
    }
}

const sleep = async (secs: number) => {
    return new Promise<void>((res) => {
        setTimeout(() => {
            res();
        }, secs * 1000);
    })
}

const questions = async function () {

    console.log('asking 1');
    // const hello1 = await callResponseAPI({ content: 'please summarize the image'});

    const q1: ChatMessage = { role: 'user', content: `summarize the following text: ${longText}` };
    const hello1 = await callChatCompletion({ message: q1 });

    // const hello1 = await callResponseAPI({ content: `summarize the following text: ${longText}` });
    // console.log(hello1);

    // console.log('asking 2');
    // const hello2 = await callResponseAPI({ content: 'what about Paris', previousResponseId: hello1?.responseId });

    // console.log(hello2);

    // console.log('asking with store');
    // if getting invalid store id,  need to run upload again
    // const hello1 = await callResponseAPIWithStore({ content: 'How to configure rules for AD FS for OpenFin SSO ?'}, 'vs_brpWjvTUsPIOXn8Df0fG1L5n');
    // console.log(hello1);


    // console.log('asking question 1');
    // const q1: ChatMessage = { role: 'user', content: 'what is await in javascript' };
    // const history: ChatMessage[] = [q1];
    // const answer1 = await callChatCompletion({ message: q1 });
    // console.log(answer1);
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

};

setTimeout(() => {
    questions();
}, 1000);
