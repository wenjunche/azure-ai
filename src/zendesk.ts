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
