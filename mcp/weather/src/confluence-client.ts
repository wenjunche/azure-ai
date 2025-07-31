import { createOpenAI } from '@ai-sdk/openai';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { experimental_createMCPClient, generateText } from 'ai';
import 'dotenv/config';
import OpenAI from 'openai';
import axios from 'axios';
import express from 'express'
import crypto, { randomUUID } from 'crypto';
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

const ATLASSIAN_OAUTH_REDIRECT_URI2 = process.env.ATLASSIAN_REDIRECT_URI || `http://localhost:${port}/auth/atlassian/callback2`;

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
        atlassianAccessTokenExpiresAt?: number; // Store expiration time for proactive refresh
        atlassianDynamicClientMetadata?: OAuthClientMetadata; // Store DCR metadata
        
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

// implement auth flow with OAuthClientProvider in @modelcontextprotocol.
// this approach requires keeping track of auth proivder and transport in session, but not in req.session,  so not sure worth it.
import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { AuthorizationServerMetadata, OAuthClientInformation, OAuthClientInformationFull, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { get } from 'http';

interface OAuthClientProviderOptions {
  metadataUrl: string;
  redirectUri: string;
  scopes: string[];
  clientName?: string;
  redirectToAuthorization: (authorizationUrl: URL) => void;
}

class SessionBasedOAuthClientProvider implements OAuthClientProvider {
  private options: OAuthClientProviderOptions;
  private metadata?: AuthorizationServerMetadata;
  private _state: string
  private _clientInformation?: OAuthClientInformationFull;
  private _tokens?: OAuthTokens;
  private _mcpCodeVerifier?: string;

  constructor(options: OAuthClientProviderOptions) {
    this.options = options;
    this._state = randomUUID();
  }

  get redirectUrl(): string {
    return this.options.redirectUri;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.options.redirectUri],
      scope: this.options.scopes.join(' '),
      client_name: this.options.clientName,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    };
  }

  async state(): Promise<string> {
    return this._state;
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    return this._clientInformation; // For public clients, no client secret is stored
  }

  async saveClientInformation(clientInformation: OAuthClientInformationFull): Promise<void> {
    console.log(`Saving client information: ${JSON.stringify(clientInformation)}`);
    this._clientInformation = clientInformation;
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return this._tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    console.log(`Saving tokens: ${JSON.stringify(tokens)}`);
    this._tokens = tokens;
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    console.log(`Redirecting to authorization URL: ${authorizationUrl}`);
    if (this.options.redirectToAuthorization) {
      this.options.redirectToAuthorization(authorizationUrl);
    } else {
      // This method is meant for browser-based flows; on server, you redirect in Express handler.
      throw new Error('Use Express res.redirect for server-side authorization.');
    }
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    console.log(`Saving code verifier: ${codeVerifier}`);
    this._mcpCodeVerifier = codeVerifier;
  }

  async codeVerifier(): Promise<string> {
    return this._mcpCodeVerifier || '';
  }

  // this function is being passed around so it needs to be an arrow function with correct `this` context.
  addClientAuthentication = async (headers: Headers, params: URLSearchParams, url: string | URL, metadata?: AuthorizationServerMetadata): Promise<void> => {
    console.log(`Adding client authentication for URL: ${url}`);
    if (this._clientInformation?.client_id) {
      params.set('client_id', this._clientInformation?.client_id);
    } else {
      console.error('No client_id available for authentication. This is expected for public clients with token_endpoint_auth_method: "none".');
    }
    // For public clients (token_endpoint_auth_method: 'none'), no authentication needed.
    // If client_secret is present, add it to params.
  }

  async validateResourceURL(serverUrl: string | URL, resource?: string): Promise<URL | undefined> {
    console.log(`Validating resource URL: ${serverUrl}`);
    // Optionally validate resource URLs if needed
    return typeof serverUrl === 'string' ? new URL(serverUrl) : serverUrl;
  }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier'): Promise<void> {
    console.log(`Invalidating credentials for scope: ${scope}`);
    if (scope === 'all' || scope === 'client') {
      this._clientInformation = undefined;
    }
    if (scope === 'all' || scope === 'tokens') {
      this._tokens = undefined;
    }
    if (scope === 'all' || scope === 'verifier') {
      this._mcpCodeVerifier = undefined;
    }
  }
}

const sseTransport = true; // Set to false to use Streamable HTTP transport
const authProviderMap = new Map<string, OAuthClientProvider>();
const transportMap = new Map<string, SSEClientTransport | StreamableHTTPClientTransport>();

const getMCPClient = () => {
  return new Client({
        name: 'mcp-remote',
        version: '1.0.0',
      }, {
        capabilities: {},
      });
};

const getTransport = (url: URL, authProvider: OAuthClientProvider): SSEClientTransport | StreamableHTTPClientTransport => {
  const eventSourceInit = {
    fetch: (url: string | URL, init?: RequestInit) => {
      console.log(`eventSourceInit Fetching URL: ${url} with init:`, init);
      return Promise.resolve(authProvider?.tokens?.()).then((tokens) =>
        fetch(url, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string> | undefined),
            ...(tokens?.access_token ? { Authorization: `Bearer ${tokens.access_token}` } : {}),
            Accept: 'text/event-stream',
          } as Record<string, string>,
        }),
      )
    },
  }

  const transport = sseTransport
    ? new SSEClientTransport(url, {
        authProvider,
        requestInit: {  },
        eventSourceInit,
      })
    : new StreamableHTTPClientTransport(url, {
        authProvider,
        requestInit: {  },
      })

    return transport;
}

const atlassianAuth2 = async (req: express.Request, res: express.Response) => {
  let authRedirectUrl = null;

  const redirectToAuthorization = (authorizationUrl: URL) => {
    console.log(`Redirecting to authorization URL: ${authorizationUrl}`);
    authRedirectUrl = authorizationUrl.toString();
    res.redirect(authorizationUrl.toString());
  }
  const authProvider = new SessionBasedOAuthClientProvider({
    metadataUrl: ATLASSIAN_AUTH_METADATA_URL,
    redirectUri: ATLASSIAN_OAUTH_REDIRECT_URI2,
    scopes: ATLASSIAN_SCOPES_REQUESTED.split(' '),
    clientName: `HERE Enterprise Browser MCP Client - ${Date.now()}`, // Unique name
    redirectToAuthorization,
  });
  authProviderMap.set(req.session.id, authProvider); // Store in session for later use

  const url = new URL(ATLASSIAN_MCP_SERVER_URL);
  const transport = getTransport(url, authProvider);

  try {
    transportMap.set(req.session.id, transport);
    await transport.start();
    console.log("Connected using SSE transport");
  } catch (error) {
    if (authRedirectUrl) {
      console.log('Authorization redirect already attempted:', authRedirectUrl);
    } else {
      console.error('Error connecting to MCP server:', error);
      return res.status(500).send('Failed to connect to MCP server.');
    }
  }
}

const atlassianAuthCallback2 =  async (req: express.Request, res: express.Response) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
        console.error('Atlassian Auth Error:', error, error_description);
        return res.status(400).send(`Atlassian Authorization Failed: ${error_description || error}`);
    } else if (!code) {
        return res.status(400).send('Authorization code or state missing from Atlassian callback.');
    }
    console.log('Atlassian Auth Callback received code:', code);
    await transportMap.get(req.session.id)?.finishAuth(code as string);

    const authProvider = authProviderMap.get(req.session.id);
    if (!authProvider) {
        console.error('No authProvider found in session.');
        return res.status(500).send('Authentication provider not found in session.');
    }
    try {
      const mcpClient = getMCPClient();
      const transport = getTransport(new URL(ATLASSIAN_MCP_SERVER_URL), authProvider);
      await mcpClient.connect(transport);
      const mcpTools = await mcpClient.listTools();
      console.log("Available tools:", JSON.stringify(mcpTools, null, 2));

    } catch (error) {
        console.error('Error connecting to MCP server:', error);
    }
    res.redirect('/');
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

  // the auth flow with modelcontextprotocol.authProvider.
  app.get('/auth/atlassian2', atlassianAuth2);
  app.get('/auth/atlassian/callback2', atlassianAuthCallback2);


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