import { CoreMessage, generateText, streamText } from 'ai';
import { createAzure } from '@ai-sdk/azure';
import { createAzure as createAzure2 } from "@quail-ai/azure-ai-provider"; // for non OpenAI models only
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createOpenAI } from '@ai-sdk/openai';

import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.apiKey;
const endpoint = process.env.endpoint;
const apiKeyWest = process.env.apiKeyWest;
const endpointWest = process.env.endpointWest;
// const imageBase64 = process.env.imageBase64 || ' ';
const accessKeyId = process.env.accessKeyId;
const secretAccessKey = process.env.secretAccessKey;
const openaiApiKey = process.env.openaiApiKey; // OpenAI API Key

const deepSeekName = 'DeepSeek-V3';
const llmaName = 'Llama-3.3-70B-Instruct';
const openAImodelName =  'gpt-4o-mini';
const visionModelName = 'gpt-4o';

const apiVersion = 'api-version=2024-05-01-preview';

const openAIBaseUrl = process.env.endpoint;
const baseUrl = process.env.inferencendpoint;

const azureBaseUrl = 'https://wenjun-openai-service-east2.openai.azure.com/';  // Azure OPENAI service
const azureSvcApiKey = process.env.azureSvcApiKey;

const imageBase64 = process.env.imageBase64; // example base64 image

const azure = createAzure({
    apiKey: apiKey,
    baseURL: `${endpoint}openai/deployments/`,
  });

const azure2 = createAzure2({
    apiKey,
    apiVersion: apiVersion,
    endpoint: baseUrl,
  });

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId,
    secretAccessKey,
  });

const azureAIService = createAzure({
    apiKey: azureSvcApiKey,
    baseURL: `${azureBaseUrl}openai/deployments/`,
});

  const SYSTEM_PROMPT =
  `You are a helpful assistant built into Here Enterprise Browser.` +
  `Here Enterprise Browser is the first and only browser that solves both enterprise security and workforce productivity.` +
  `Here technology is trusted by 90% of global financial institutions.` +
  `You live on the right side of the screen and can be used to assist the user with their tasks.` +
  `Users may choose to provide additional "context" to you, which you should use to provide better answers.`;

const questions = async() => {

    const messages: CoreMessage[] = [
        {
            role: 'system',
            content: 'You are assistant built to help developers.',
        },
        {
            role: 'user',
            content: [
                // {
                //     type: 'text',
                //     text: 'which llm do you use'
                // },
                {
                    type: 'text',
                    text: 'please summarize the image'
                },
                {
                    type: 'image',
                    image: imageBase64!,
                    providerOptions: {
                        openai: {
                            imageDetail: 'low'
                        }
                    }
                }
            ]
        }
    ]

    const resp = await generateText({
        // model: bedrock('anthropic.claude-v2:1'),  // azure(llmaName),
        // model: azure2(deepSeekName)
        // model: azureAIService('gpt-4.1'),
        model: azure(openAImodelName),
        messages,
        maxRetries: 0,
        maxTokens: 1000,
        /*
            tools: {
                getImage: tool({
                    description:
                        `Gets image about the current prompt.`,
                    parameters: z.object({}),
                    execute: async () => {
                        console.log('getImage called');
                        return [{
                            type: 'image',
                            image: `data:image/jng;base64,${imageBase64}`
                        }]
                    },
                }),
            },
            toolChoice: 'auto',
            maxSteps: 2,        
        */
      });

    console.log(resp.text);
    console.log('response provided by: ', resp.response.modelId);
}

setTimeout(() => {
    questions().catch((e) => {
        console.error('error', e);
    });
}, 1000);
