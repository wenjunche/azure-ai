import axios from 'axios';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';

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

const memoryStore: Ticket[] = [];

async function getTickets(): Promise<Ticket[]> {
  const res = await zendesk.get('/tickets.json');
  return res.data.tickets.map((t: any) => ({
    id: t.id,
    text: `${t.subject}\n${t.description}`,
  }));
}

async function embedText(text: string): Promise<number[]> {
  const res = await openai.createEmbedding({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data.data[0].embedding;
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

  const completion = await openai.createChatCompletion({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a Zendesk assistant.' },
      {
        role: 'user',
        content: `Use the following context to answer:\n\n${context}\n\nQuestion: ${question}`,
      },
    ],
  });

  return completion.data.choices[0].message?.content ?? 'No response.';
}

async function main() {
  console.log('Fetching tickets...');
  const tickets = await getTickets();

  console.log('Embedding tickets...');
  for (const t of tickets) {
    const embedding = await embedText(t.text);
    memoryStore.push({ ...t, embedding });
  }

  const question = 'How can I reset my password?';
  const answer = await queryLLM(question);
  console.log('Answer:', answer);
}

main().catch(console.error);