
import { AzureOpenAI } from "openai";
import { ChatCompletionMessageParam } from "openai/resources";

// can be found in Endpoints and Keys of Overview of the project in AI Foundry
// declare const endpoint: string // Azure OpenAI Service Endpoint
declare const apiKey: string;  // API Key
declare const endpoint: string; // replace with your Azure OpenAI endpoint

const client = new AzureOpenAI({
    apiKey,
    apiVersion: '2025-01-01-preview',
    endpoint,
    dangerouslyAllowBrowser: true
});

const messages: ChatCompletionMessageParam[] = [
    { role: 'user', content: 'why is sky blue' }
  ];


export async function greet(): Promise<string | null> {

    const response = await client.chat.completions.create({
            model:  'gpt-4o-mini',
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
            messages
        });
        console.log('AI returned', response);
        return response.choices[0].message.content;
    } catch (err) {
        console.error(err);
        throw err;
    }
}

const getTemperature = (city: string) => {
    console.log('getHeight called with', city);
    return 25;
}

const callResponseAPI = async (prompt: ResponsesRequest): Promise<ResponsesResponse | null> => {
    try {
        console.log(`sending to AI: ${JSON.stringify(prompt)}`);

        const response = await client.responses.create({
            model:  'gpt-4o-mini',
            input: prompt.content,
            previous_response_id: prompt.previousResponseId,
            max_output_tokens: 5000,
            tools: [ 
                // {
                //     type: 'web_search_preview_2025_03_11'
                // }
                {
                    type: 'function',
                    name: 'getTemperature',
                    parameters: {
                        type: 'object',
                        properties: {
                            city: {
                                type: 'string',
                            }
                        },
                        required: ['city'],
                        additionalProperties: false
                    },
                    strict: true
                }
            ]
        }, {
            maxRetries: 0
        });
        console.log('AI returned', response);
        return { message: response.output_text, responseId: response.id };
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

(async function () {

    console.log('asking 1');
    // const hello1 = await callResponseAPI({ content: 'what is await in javascript'});
    const hello1 = await callResponseAPI({ content: 'what is the temperature of New York city today ?'});
    console.log(hello1);

    // console.log('asking 2');
    // const hello2 = await callResponseAPI({ content: 'more examples please', previousResponseId: hello1?.responseId });

    // console.log(hello2);



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


})();
