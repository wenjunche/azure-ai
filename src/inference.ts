
import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";

// can be found in Endpoints and Keys of Overview of the project in AI Foundry
declare const apiKey: string;  // API Key
declare const inferencEndpoint: string;  // Azure AI Inference endpoint
const endpoint = inferencEndpoint; 

const client = ModelClient(endpoint, new AzureKeyCredential(apiKey));

const messages = [
    { role: 'user', content: 'why is sky blue' }
  ];


export async function greet(): Promise<string | null> {

    const response = await client.path('/chat/completions').post({
            body: {
                model: 'DeepSeek-V3', // 'gpt-4o-mini',
                messages
            }
        });

    if (isUnexpected(response)) {
        throw response.body.error;
    } else {
        return response.body.choices[0].message.content;
    }
}

(async function () {
    const hello = await greet();
    console.log(hello);    
})();
