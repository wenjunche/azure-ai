// upload a file to vector store
import { AzureOpenAI } from "openai";
import {  createReadStream, promises as fsp } from 'fs';
import { join } from 'path';
import { config } from 'dotenv'

config();

const apiKey = process.env.apiKey;
const endpoint = process.env.endpoint;

const storeName = 'w-poc-store';

const client = new AzureOpenAI({
    apiKey,
    apiVersion: '2025-01-01-preview',
    endpoint,
    dangerouslyAllowBrowser: true
});

const filename = 'test.pdf';
const filepath = join('.', filename);

const sleep = async (secs: number) => {
    return new Promise<void>((res) => {
        setTimeout(() => {
            res();
        }, secs * 1000);
    })
}

const createVectorStore = async (): Promise<string> => {
    let storeId: string | undefined = undefined;
    const list = await client.vectorStores.list();
    for (const store of list.data) {
        if (store.name === storeName) {
            storeId = store.id;
            console.log('store found', store);
            break;
        }
    }
    if (!storeId) {
        const store = await client.vectorStores.create({
            name: storeName,
            expires_after: { anchor: 'last_active_at', days: 1} 
        });
        console.log('store created', store);
        storeId = store.id;
        await storeFile(storeId);
    }
    const files = await client.files.list();
    console.log('files', files);
    for (const f of files.data) {
        if (f.filename === filename) {
            await client.files.del(f.id);
            console.log('deleted file', f);
        }
    }

    console.log(`store id ${storeId}`);
    return storeId;
}

const storeFile = async (storeId: string) => {
    const stream = createReadStream(filepath);
    const file = await client.files.create({
        purpose: 'assistants',
        file: stream
    });
    const attach = await client.vectorStores.files.create(storeId, {
        file_id: file.id
    }, {
        maxRetries: 1
    });
    console.log('file stored', attach);
    // await client.files.del(file.id);
    await sleep(10);
    console.log(`stream read ${stream.bytesRead}`);
}

const deleteVectorStore = async (storeId: string): Promise<void> => {
    const deleted = await client.vectorStores.del(storeId);
    console.log('store deleted', deleted);
}

const main = async () => {
    const fstate = await fsp.stat(filepath);
    if (!fstate.isFile()) {
        throw new Error(`missing ${filepath}`);
    }
    console.log(`file size ${fstate.size}`);

    const storeId = await createVectorStore();
    console.log(storeId);

    // await deleteVectorStore(storeId);

}

main();