import { CoreMessage, generateText, streamText } from 'ai';
import { createAzure } from "@quail-ai/azure-ai-provider";
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'

import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.apiKey;
const endpoint = process.env.endpoint;
// const imageBase64 = process.env.imageBase64 || ' ';
const accessKeyId = process.env.accessKeyId;
const secretAccessKey = process.env.secretAccessKey;

const deepSeekName = 'DeepSeek-V3';
const llmaName = 'Llama-3.3-70B-Instruct';
const openAImodelName =  'gpt-4o-mini';

const apiVersion = 'api-version=2024-05-01-preview';

const openAIBaseUrl = 'https://ai-poc147421407900.services.ai.azure.com/openai/deployments/';
const deepSeekBaseUrl = 'https://ai-poc147421407900.services.ai.azure.com/models/';
const llamaBaseUrl = 'https://ai-poc147421407900.services.ai.azure.com/models/';
const baseUrl = 'https://ai-poc147421407900.services.ai.azure.com/models/';

const imageBase64 = process.env.imageBase64; // example base64 image

const azure = createAzure({
    apiKey,
    apiVersion: apiVersion,
    endpoint: baseUrl,
  });

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId,
    secretAccessKey,
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
                {
                    type: 'text',
                    text: 'which llm do you use'
                },
                // {
                //     type: 'text',
                //     text: 'please summarize the image'
                // },
                // {
                //     type: 'image',
                //     image: imageBase64,
                //     providerOptions: {
                //         openai: {
                //             imageDetail: 'low'
                //         }
                //     }
                // }
            ]
        }
    ]

    const resp = await generateText({
        model: bedrock('anthropic.claude-v2:1'),  // azure(llmaName),
        messages,
        maxRetries: 0,
        maxTokens: 1000,
      });

    console.log(resp.text);
}

setTimeout(() => {
    questions().catch((e) => {
        console.error('error', e);
    });
}, 1000);
