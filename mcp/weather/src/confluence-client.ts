import { createOpenAI } from '@ai-sdk/openai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { experimental_createMCPClient, generateText } from 'ai';
import 'dotenv/config';
import OpenAI from 'openai';
import axios from 'axios';
import express from 'express'
import crypto from 'crypto';
import session, { SessionData } from 'express-session';

const apiKey = process.env.openaiApiKey; 
const confluenceToken = process.env.confluenceToken;


// const transport = new StreamableHTTPClientTransport(
//     new URL('https://mcp.atlassian.com/v1/sse'), {
//         requestInit: {
//             headers: {
//               'Authorization': `Bearer ${confluenceToken}`,
//                 // 'Content-Type': 'application/json',
//             }
//         }
//       }
// );

// https://mcp.atlassian.com/.well-known/oauth-authorization-server

const openai = createOpenAI({
     apiKey: apiKey
 });

const client = new OpenAI({
    apiKey,
});

const port = process.env.PORT || 3001;

const ATLASSIAN_MCP_SERVER_URL = 'https://mcp.atlassian.com/v1/sse';
const ATLASSIAN_AUTH_METADATA_URL = 'https://mcp.atlassian.com/.well-known/oauth-authorization-server';
const ATLASSIAN_OAUTH_REDIRECT_URI = process.env.ATLASSIAN_REDIRECT_URI || `http://localhost:${port}/auth/atlassian/callback`;
const ATLASSIAN_SCOPES_REQUESTED = process.env.ATLASSIAN_SCOPES || 'read:jira-work write:jira-work offline_access';


const jiraQuestion = async (accessToken: string) => {
  try {
    // const mcpTools = await mcpClient.listTools();
    // console.log("Available tools:", JSON.stringify(mcpTools));

    // const sseTransport = new SSEClientTransport(new URL(ATLASSIAN_MCP_SERVER_URL), {
    //     requestInit: {
    //         headers: {
    //             'Authorization': `Bearer ${accessToken}`,
    //             'Content-Type': 'application/json',
    //         }
    //     } 
    // });
    // const mcpClient = new Client({
    //     name: 'streamable-http-client',
    //     version: '1.0.0',
    // });
    // await mcpClient.connect(sseTransport);
    // console.log("Connected using SSE transport");
    // const mcpTools = await mcpClient.listTools();
    // console.log("Available tools:", JSON.stringify(mcpTools));


    const response = await client.responses.create({
         model:  'gpt-4o-mini',
         input: 'Please look up Jira SAAS-2985 and tell me the status and description of the issue.',
         tools: [{
             type: 'mcp',
             server_url: ATLASSIAN_MCP_SERVER_URL,
             server_label: 'atlassian-MCP-Server',
             require_approval: 'never',
             headers: {
                 'Authorization': `Bearer ${accessToken}`,
             }
         }]
     });
    console.log('AI returned', response);

  } catch (error) {
    console.error('Error:', error);
  }
}

// --- PKCE Helpers ---
function base64URLEncode(str: Buffer): string {
    return str.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function sha256(buffer: Buffer): Buffer {
    return crypto.createHash('sha256').update(buffer).digest();
}

async function generatePkcePair(): Promise<{ codeVerifier: string; codeChallenge: string }> {
    const codeVerifier = base64URLEncode(crypto.randomBytes(32));
    const codeChallenge = base64URLEncode(sha256(Buffer.from(codeVerifier)));
    return { codeVerifier, codeChallenge };
}

interface AtlassianAuthServerMetadata {
    registration_endpoint?: string;
    authorization_endpoint?: string;
    token_endpoint?: string;
    scopes_supported?: string[];
    response_types_supported?: string[];
    grant_types_supported?: string[];
}
const atlassianAuthServerMetadata: AtlassianAuthServerMetadata = {}; // Stores metadata after discovery
const atlassianDynamicClientId = null; // Stores dynamically registered client_id

declare module 'express-session' {
    interface SessionData {
        githubCodeVerifier?: string;
        githubAccessToken?: string;
        githubRefreshToken?: string;
        atlassianCodeVerifier?: string;
        atlassianDynamicClientId?: string; // Store the DCR client ID
        atlassianAccessToken?: string;
        atlassianRefreshToken?: string;
        mcpClientId?: string; // Generic MCP DCR
        mcpCodeVerifier?: string; // Generic MCP DCR
        mcpAccessToken?: string; // Generic MCP DCR
        mcpRefreshToken?: string; // Generic MCP DCR
    }
}

const atlassianAuth = async (req: express.Request, res: express.Response) => {

    try {
        // Step 1: Discover Authorization Server Metadata
        if (!Object.keys(atlassianAuthServerMetadata).length) { // Only fetch once per server restart
            console.log('Discovering Atlassian AS metadata...');
            const metadataResponse = await axios.get<AtlassianAuthServerMetadata>(ATLASSIAN_AUTH_METADATA_URL, {
                headers: { 'Content-Type': 'application/json',
                           'Accept': 'application/json',
                           'Accept-encoding': 'identity'}
            });
            Object.assign(atlassianAuthServerMetadata, metadataResponse.data);
            console.log('Atlassian AS Metadata:', atlassianAuthServerMetadata);
        }

        const registrationEndpoint = atlassianAuthServerMetadata.registration_endpoint;
        const authorizationEndpoint = atlassianAuthServerMetadata.authorization_endpoint;

        if (!registrationEndpoint || !authorizationEndpoint) {
            throw new Error('Atlassian AS metadata incomplete for DCR.');
        }

        // Step 2: Dynamically Register the Client (if not already registered for this session)
        let clientId = req.session.atlassianDynamicClientId;

        if (!clientId) {
            console.log('Performing Dynamic Client Registration for Atlassian MCP...');
            const registrationRequest = {
                redirect_uris: [ATLASSIAN_OAUTH_REDIRECT_URI],
                client_name: `HERE Enterprise Browser MCP Client - ${Date.now()}`, // Unique name
                token_endpoint_auth_method: 'none', // As per metadata: ["client_secret_basic","client_secret_post","none"]
                grant_types: ['authorization_code'],
                response_types: ['code'],
                scope: ATLASSIAN_SCOPES_REQUESTED,
            };

            const registrationResponse = await axios.post(registrationEndpoint, registrationRequest, {
                headers: { 'Content-Type': 'application/json' }
            });

            clientId = registrationResponse.data.client_id;
            // The DCR endpoint returns `client_secret` if `client_secret_post` or `client_secret_basic` is used,
            // but for `none` it might not. We expect `none` for PKCE public client.
            req.session.atlassianDynamicClientId = clientId; // Store for callback and future use
            console.log(`Dynamic client registered. Client ID: ${clientId}`);
        } else {
            console.log(`Using existing dynamic client ID: ${clientId}`);
        }

        // Step 3: Initiate Authorization Code Flow with PKCE
        const { codeVerifier, codeChallenge } = await generatePkcePair();
        req.session.atlassianCodeVerifier = codeVerifier; // Store verifier in session

        const authUrl = `${authorizationEndpoint}?` +
            `client_id=${clientId}&` +
            `redirect_uri=${encodeURIComponent(ATLASSIAN_OAUTH_REDIRECT_URI)}&` +
            `scope=${encodeURIComponent(ATLASSIAN_SCOPES_REQUESTED)}&` +
            `response_type=code&` +
            `code_challenge=${codeChallenge}&` +
            `code_challenge_method=S256&` +
            `state=${base64URLEncode(crypto.randomBytes(16))}`; // Use a random state

        res.redirect(authUrl);

    } catch (error: Error | any) {
        console.error('Error during Atlassian OAuth DCR or initiation:', error.response ? error.response.data : error.message);
        res.status(500).send('Failed to initiate Atlassian OAuth with DCR.');
    }
};


const atlassianAuthCallback =  async (req: express.Request, res: express.Response) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
        console.error('Atlassian Auth Error:', error, error_description);
        return res.status(400).send(`Atlassian Authorization Failed: ${error_description || error}`);
    }

    const clientId = req.session.atlassianDynamicClientId;
    const codeVerifier = req.session.atlassianCodeVerifier;
    const tokenEndpoint = atlassianAuthServerMetadata.token_endpoint;

    if (typeof code !== 'string' || !clientId || !codeVerifier || !tokenEndpoint) {
        return res.status(400).send('Authorization code, client ID, code verifier, or token endpoint missing from Atlassian callback.');
    }

    try {
        console.log('Exchanging Atlassian code for tokens...', code, tokenEndpoint);
        const tokenResponse = await axios.post<{ access_token: string; refresh_token?: string; expires_in: number; scope: string }>(tokenEndpoint, {
            grant_type: 'authorization_code',
            client_id: clientId,
            code: code,
            redirect_uri: ATLASSIAN_OAUTH_REDIRECT_URI,
            code_verifier: codeVerifier,
        }, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept-encoding': 'identity'
            }
        });

        const { access_token, refresh_token, expires_in, scope } = tokenResponse.data;
        req.session.atlassianAccessToken = access_token;
        req.session.atlassianRefreshToken = refresh_token;

        console.log('Atlassian Tokens Acquired:', { access_token, refresh_token, expires_in, scope });

        await jiraQuestion(access_token);

        res.redirect('/');
    } catch (error: any) {
        console.error('Error exchanging Atlassian code:', error.response ? error.response.data.toString('utf8').substring(0, 200) : error.message);
        res.status(500).send('Failed to obtain Atlassian access token.');
    }
};

const refreshAccessToken = async (session: SessionData) => {

    const clientId = session.atlassianDynamicClientId;
    const refreshToken = session.atlassianRefreshToken;
    const tokenEndpoint = atlassianAuthServerMetadata.token_endpoint;

    if (!clientId || !refreshToken || !tokenEndpoint) {
        throw new Error('Client ID, refreshToken or token endpoint not found in session for Atlassian refresh.');
    }

    try {
        const requestBody: Record<string, string> = {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
        };

        const response = await axios.post(tokenEndpoint, requestBody, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept-encoding': 'identity',
            }
        });

        const { access_token, refresh_token, expires_in } = response.data;
        console.log('Atlassian Tokens Refreshed:', { access_token, refresh_token, expires_in });

        session.atlassianAccessToken = access_token;
        session.atlassianRefreshToken = refresh_token;
    } catch (error: any) {
        console.error('Error refreshing token:', error.response ? error.response.data : error.message);
        // If refresh token also fails (e.g., expired, revoked), user needs to re-authenticate from scratch.
        throw new Error('Failed to refresh access token.');
    }

}

async function server() {
  const app = express();

  app.use(session({
      secret: process.env.SESSION_SECRET || 'supersecretkey',
      resave: false,
      saveUninitialized: true,
      cookie: { secure: process.env.NODE_ENV === 'production' },
  }));


  app.use(express.json());

  // http://localhost:3001/auth/atlassian
  app.get('/auth/atlassian', atlassianAuth);

  app.get('/auth/atlassian/callback', atlassianAuthCallback);

  app.get('/auth/atlassian/refresh', async (req: express.Request, res: express.Response) => {
    await refreshAccessToken(req.session);
    res.send('Atlassian access token refreshed successfully.');
  });

  app.get('/', (req, res) => {
    res.send('Confluence MCP Client is running');
  });
  app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
  });
}

server();