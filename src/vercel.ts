import { CoreMessage, generateText, streamText, tool } from 'ai';
import { createAzure } from '@ai-sdk/azure';
// import { createAzure as createAzure2 } from "@quail-ai/azure-ai-provider";
import { openai, createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

// import dotenv from 'dotenv';
// dotenv.config();

// const apiKey = process.env.apiKey;
// const endpoint = process.env.endpoint;
// const imageBase64 = process.env.imageBase64 || ' ';
declare const apiKey: string;  // API Key
declare const apiKeyWest: string;  // API Key
declare const endpoint: string; // replace with your Azure OpenAI endpoint
declare const endpointWest: string; // replace with your Azure OpenAI endpoint for West region
declare const imageBase64: string; // example base64 image
declare const openaiApiKey: string;

const modelName =  'gpt-4o-mini';
const visionModelName = 'gpt-4o';
const deepSeekName = 'DeepSeek-V3';
const deepSeekVersion = 'api-version=2024-05-01-preview';

const openAIBaseUrl = 'https://ai-poc147421407900.services.ai.azure.com/openai/deployments/'
const deepSeekBaseUrl = 'https://ai-poc147421407900.services.ai.azure.com/models/'

console.log('Using Azure OpenAI endpoint:', endpointWest);

const azure = createAzure({
    // resourceName: 'ai-poc147421407900',
    apiKey: apiKeyWest,
    // apiVersion: '2024-07-18', // '2025-01-01-preview',
    // apiVersion: deepSeekVersion,
    baseURL: `${endpointWest}openai/deployments/`,
    // baseURL: openAIBaseUrl,

  });

// const azure2 = createAzure2({
//     endpoint: deepSeekBaseUrl,
//     apiKey: '8agVjNlqFm6ocjSk8U0U4Yeg3OHwOhYcTfNXrxEPTQJXPRZnjQLbJQQJ99BBACYeBjFXJ3w3AAAAACOGSnAJ',
//   });  

const openai2 = createOpenAI({
     apiKey: openaiApiKey
 });

const questions = async() => {

    const messages: CoreMessage[] = [
        {
            role: 'user',
            content: [
                // {
                //     type: 'text',
                //     text: 'What is current temperature of New York city?',
                // },
                {
                    type: 'text',
                    text: 'the image is a screenshot of price chat of Apple stock. Please identify the price trend.'
                },
                {
                    type: 'image',
                    image: imageBase64,
                    providerOptions: {
                        openai: {
                            imageDetail: 'low'
                        }
                    }
                }
            ]
        }
    ]

    const { text } = await generateText({
        model: openai2.responses(modelName),
//        model: azure(modelName),
        // model: azure2(deepSeekName),
        messages,
        maxRetries: 0,

        // tools: {
        //     getSiteContext: tool({
        //         description:
        //             `Gets context about the current prompt.`,
        //         parameters: z.object({}),
        //         execute: async () => {
        //             console.log('getSiteContext called');
        //             return {
        //                 message: 'Here is the image for context',
        //                 base64Image: `data:image/jpeg;base64,${imageBase64}`
        //             }
        //         },
        //     }),
        // },
        // toolChoice: 'auto',

        // tools: {
        //     web_search_preview: openai.tools.webSearchPreview(),
        //   },                    

        maxSteps: 2,
        maxTokens: 1000,

      });

    console.log(text);
}

setTimeout(() => {
    questions();
}, 1000);
