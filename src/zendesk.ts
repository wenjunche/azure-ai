require('dotenv').config();
const axios = require('axios');
const { Configuration, OpenAIApi } = require('openai');

const zendesk = axios.create({
  baseURL: `https://${process.env.ZENDESK_DOMAIN}/api/v2`,
  auth: {
    username: process.env.ZENDESK_EMAIL,
    password: process.env.ZENDESK_API_TOKEN
  }
});

const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

let memoryStore = []; // In-memory embeddings store

async function getTickets() {
  const res = await zendesk.get('/tickets.json');
  return res.data.tickets.map(t => ({ id: t.id, text: t.subject + "\n" + t.description }));
}

async function embedText(text) {
  const res = await openai.createEmbedding({
    model: 'text-embedding-3-small',
    input: text
  });
  return res.data.data[0].embedding;
}

function cosineSimilarity(vec1, vec2) {
  const dot = vec1.reduce((acc, v, i) => acc + v * vec2[i], 0);
  const mag1 = Math.sqrt(vec1.reduce((acc, v) => acc + v ** 2, 0));
  const mag2 = Math.sqrt(vec2.reduce((acc, v) => acc + v ** 2, 0));
  return dot / (mag1 * mag2);
}

async function queryLLM(question) {
  const qEmbedding = await embedText(question);
  const topMatch = memoryStore
    .map(item => ({ ...item, score: cosineSimilarity(qEmbedding, item.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const context = topMatch.map(m => m.text).join("\n---\n");

  const completion = await openai.createChatCompletion({
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are a Zendesk assistant." },
      { role: "user", content: `Use the following context to answer:\n\n${context}\n\nQuestion: ${question}` }
    ]
  });

  return completion.data.choices[0].message.content;
}

(async () => {
  console.log("Fetching tickets...");
  const tickets = await getTickets();
  console.log("Embedding...");
  for (let t of tickets) {
    const embedding = await embedText(t.text);
    memoryStore.push({ ...t, embedding });
  }

  const question = "How can I reset my password?";
  const answer = await queryLLM(question);
  console.log("Answer:", answer);
})();
