import axios from 'axios';
import dotenv from 'dotenv';
import { OpenAI, toFile } from 'openai';
import fs from 'fs';
import path from 'path';
import { Assistant } from 'openai/resources/beta/assistants';

dotenv.config();

interface Ticket {
  id: number;
  text: string;
  embedding?: number[];
}

const zendeskDomain=process.env.zendeskDomain!;
const zendeskEmail=process.env.zendeskEmail!;
const zendeskAPIKey=process.env.zendeskAPIKey!;

const apiKey = process.env.openaiApiKey!;
const modelName =  'gpt-4o-mini';

const zendesk = axios.create({
  baseURL: `https://${zendeskDomain}/api/v2`,
  auth: {
    username: zendeskEmail,
    password: zendeskAPIKey,
  },
});

const openai = new OpenAI({
  apiKey,
  dangerouslyAllowBrowser: true
});

const storeName = 'w-poc-store-zendesk';
const memoryStore: Ticket[] = [];

async function getTickets(): Promise<Ticket[]> {
  const res = await zendesk.get('/tickets.json');
  return res.data.tickets.map((t: any) => ({
    id: t.id,
    text: JSON.stringify({
      ticketId: t.id,
      subject: t.subject,
      description: t.description,
      status: t.status,
    }),
  }));
}

async function embedText(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

function splitText(text: string, maxLength: number = 3000): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxLength));
    i += maxLength;
  }
  return chunks;
}

function averageEmbeddings(embeddings: number[][]): number[] {
  const length = embeddings[0].length;
  const sum = new Array(length).fill(0);

  for (const emb of embeddings) {
    for (let i = 0; i < length; i++) {
      sum[i] += emb[i];
    }
  }

  return sum.map((v) => v / embeddings.length);
}

function cosineSimilarity(vec1: number[], vec2: number[]): number {
  const dot = vec1.reduce((acc, v, i) => acc + v * vec2[i], 0);
  const mag1 = Math.sqrt(vec1.reduce((acc, v) => acc + v ** 2, 0));
  const mag2 = Math.sqrt(vec2.reduce((acc, v) => acc + v ** 2, 0));
  return dot / (mag1 * mag2);
}

async function queryLLM(question: string): Promise<string> {
  const qEmbedding = await embedText(question);

  const topMatch = memoryStore
    .map(item => ({
      ...item,
      score: cosineSimilarity(qEmbedding, item.embedding!),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const context = topMatch.map(m => m.text).join('\n---\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a Zendesk assistant.' },
      {
        role: 'user',
        content: `Use the following context to answer:\n\n${context}\n\nQuestion: ${question}`,
      },
    ],
  });

  return completion.choices[0].message?.content ?? 'No response.';
}

const createVectorStore = async (): Promise<string> => {
  let storeId: string | undefined = undefined;
  const list = await openai.vectorStores.list();
  for (const store of list.data) {
      if (store.name === storeName) {
        if (store.status === 'expired') {
          console.log('deleting expired store', store.id);
          await openai.vectorStores.del(store.id);
          continue;
        }
        storeId = store.id;
        console.log('store found', store.id);
        break;
      }
  }
  if (!storeId) {
      const store = await openai.vectorStores.create({
          name: storeName,
          expires_after: { anchor: 'last_active_at', days: 1} 
      });
      storeId = store.id;
      console.log('store created', store);

      console.log('Fetching tickets...');
      const tickets = await getTickets();
      let maxTickets = 2;
      for (const t of tickets) {    
        await storeTicket(storeId, t);
        maxTickets--;
        if (maxTickets <= 0) break;
      }        
  }
  const files = await openai.files.list();
  console.log('files', files);
  for (const f of files.data) {
      console.log('found file', f.filename);
  }
  console.log(`store id ${storeId}`);
  return storeId;
}

async function storeTicket(storeId: string, ticket: Ticket): Promise<void> {
  const tempPath = path.join('.', 'tmp', `${ticket.id}.json`);
  console.log(`uploading ${tempPath}`);
  fs.writeFileSync (tempPath, ticket.text, 'utf-8');

  const file = await openai.files.create({
    purpose: 'assistants',
    file: fs.createReadStream(tempPath),
  });
  const attach = await openai.vectorStores.files.create(storeId, {
    file_id: file.id,
  }, {
    maxRetries: 1,
  });
  console.log('file stored', attach);
}

async function createAssistant(storeId: string): Promise<Assistant> {
  const assistant = await openai.beta.assistants.create({
    name: 'Zendesk Helper',
    instructions: 'Answer Zendesk-related support questions using ticket data.',
    model: 'gpt-4o-mini',
    tools: [{ type: 'file_search' }],
    tool_resources: {
      file_search: {
        vector_store_ids: [storeId],
      },
    },    
  });
  return assistant
}

async function searchStore(storeId: string, query: string): Promise<any> {
  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: query,
    tools: [{
        type: "file_search",
        vector_store_ids: [storeId],
    }],
  });
  console.log(JSON.stringify(response));  
}

async function askAssistant(assistantId: string, prompt: string) {
  const thread = await openai.beta.threads.create();
  await openai.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: prompt,
  });
  const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: assistantId,
  });
  let runStatus = run;
  while (runStatus.status !== 'completed') {
    console.log('Waiting for run to complete...');
    await new Promise((r) => setTimeout(r, 1000));
    runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
  }
  const messages = await openai.beta.threads.messages.list(thread.id);
  const lastMessage = messages.data[0];
  return lastMessage;
}

async function main() {
  const storeId = await createVectorStore();

  // const assistant = await createAssistant(storeId);
  // const answer = await askAssistant(assistant.id, 'What did Emma Kelly say?');
  // console.log('Answer:', answer.content);

  await searchStore(storeId, 'Did Vincent Sterling report any issues ?');

  // console.log('Fetching tickets...');
  // const tickets = await getTickets();
  // console.log('Embedding tickets...');
  // let maxTickets = 2;
  // for (const t of tickets) {
  //   const chunks = splitText(t.text);
  //   const embeddings = await Promise.all(chunks.map(embedText));
  //   const averaged = averageEmbeddings(embeddings);
  //   console.log(`Ticket ${t.id} → vector length:`, averaged.length)
  //   memoryStore.push({ ...t, embedding: averaged });
  //   maxTickets--;
  //   if (maxTickets <= 0) break;
  // }

  // const question = 'What did Emma Kelly say?';
  // const answer = await queryLLM(question);
  // console.log('Answer:', answer);
}

main().catch(console.error);