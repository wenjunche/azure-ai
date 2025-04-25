
import { AIProjectsClient } from '@azure/ai-projects';
import { InteractiveBrowserCredential } from "@azure/identity";

const endpoint = 'https://ai-poc147421407900.services.ai.azure.com/models'; // 'https://ai-poc147421407900.services.ai.azure.com';
const endpointDeep = 'https://ai-poc147421407900.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview'
const apiKey = '8agVjNlqFm6ocjSk8U0U4Yeg3OHwOhYcTfNXrxEPTQJXPRZnjQLbJQQJ99BBACYeBjFXJ3w3AAAAACOGSnAJ';

const project = AIProjectsClient.fromConnectionString(endpoint, new InteractiveBrowserCredential ({
    clientId: '6a2ee437-10db-472c-a690-db820ddafc26',
    tenantId: '051d23bf-9257-4c0c-b503-512ae19844dc',
}));

const messages = [
    { role: 'user', content: 'why is sky blue' }
  ];


export async function greet(): Promise<string | null> {
    const agents = await project.agents.listAgents();
    console.log(agents);

    return 'hello';
}

(async function () {
    const hello = await greet();
    console.log(hello);    
})();
