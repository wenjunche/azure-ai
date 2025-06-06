import express, { Request, Response } from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AlertsResponse, ForecastPeriod, ForecastResponse, formatAlert, makeNWSRequest, PointsResponse } from './utils.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { InMemoryEventStore } from './inMemoryEventStore.js';
import { randomUUID } from 'node:crypto';
import { log } from 'node:console';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";

/**
 * This example server demonstrates the deprecated HTTP+SSE transport 
 * (protocol version 2024-11-05). It mainly used for testing backward compatible clients.
 * 
 * The server exposes two endpoints:
 * - /mcp: For establishing the SSE stream (GET)
 * - /messages: For receiving client messages (POST)
 * 
 */

// Create an MCP server instance
function getServer() {
    // Create server instance
    const server = new McpServer({
    name: "weather",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {},
        logging: {
            level: "debug", // Set logging level to debug
        }
    },
    });

    // Register weather tools
    server.tool(
    "get-alerts",
    "Get weather alerts for a state",
    {
        state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
    },
    async ({ state }) => {
        const stateCode = state.toUpperCase();
        const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
        console.log(`Fetching alerts for state: ${stateCode} from URL: ${alertsUrl}`);
        const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);

        if (!alertsData) {
        return {
            content: [
            {
                type: "text",
                text: "Failed to retrieve alerts data",
            },
            ],
        };
        }

        const features = alertsData.features || [];
        if (features.length === 0) {
        return {
            content: [
            {
                type: "text",
                text: `No active alerts for ${stateCode}`,
            },
            ],
        };
        }

        const formattedAlerts = features.map(formatAlert);
        const alertsText = `Active alerts for ${stateCode}:\n\n${formattedAlerts.join("\n")}`;

        return {
        content: [
            {
            type: "text",
            text: alertsText,
            },
        ],
        };
    },
    );

    server.tool(
    "get-forecast",
    "Get weather forecast for a location",
    {
        latitude: z.number().min(-90).max(90).describe("Latitude of the location"),
        longitude: z.number().min(-180).max(180).describe("Longitude of the location"),
    },
    async ({ latitude, longitude }) => {
        // Get grid point data
        const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
        const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

        if (!pointsData) {
        return {
            content: [
            {
                type: "text",
                text: `Failed to retrieve grid point data for coordinates: ${latitude}, ${longitude}. This location may not be supported by the NWS API (only US locations are supported).`,
            },
            ],
        };
        }

        const forecastUrl = pointsData.properties?.forecast;
        if (!forecastUrl) {
        return {
            content: [
            {
                type: "text",
                text: "Failed to get forecast URL from grid point data",
            },
            ],
        };
        }

        // Get forecast data
        const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
        if (!forecastData) {
        return {
            content: [
            {
                type: "text",
                text: "Failed to retrieve forecast data",
            },
            ],
        };
        }

        const periods = forecastData.properties?.periods || [];
        if (periods.length === 0) {
        return {
            content: [
            {
                type: "text",
                text: "No forecast periods available",
            },
            ],
        };
        }

        // Format forecast periods
        const formattedForecast = periods.map((period: ForecastPeriod) =>
        [
            `${period.name || "Unknown"}:`,
            `Temperature: ${period.temperature || "Unknown"}°${period.temperatureUnit || "F"}`,
            `Wind: ${period.windSpeed || "Unknown"} ${period.windDirection || ""}`,
            `${period.shortForecast || "No forecast available"}`,
            "---",
        ].join("\n"),
        );

        const forecastText = `Forecast for ${latitude}, ${longitude}:\n\n${formattedForecast.join("\n")}`;

        return {
        content: [
            {
            type: "text",
            text: forecastText,
            },
        ],
        };
    },
    );
    return server;
}

const app = express();
app.use(express.json());

// Store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport > = {};
const server = getServer();
const stateless = false; // Set to true for stateless mode, false for stateful mode

// SSE endpoint for establishing the stream
app.post('/mcp', async (req: Request, res: Response) => {
  console.log('Received POST request to /mcp (establishing http)', req.body);

  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports[sessionId]) {
      console.log(`Session with ID ${sessionId} already exists, reusing existing transport`);
      const transport = transports[sessionId];
      await transport.handleRequest(req, res, req.body);
      return;
    }
    if (stateless) {
        console.log(`Stateless mode: no session ID required`);
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined, // Use default session ID generator
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        res.on('close', () => {
            console.log(`Connection closed`);
            // transport.close();
        });
        console.log(`Established stateless HTTP transport`);
        return;
    }
    if (isInitializeRequest(req.body)) {
        const eventStore = new InMemoryEventStore();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(), // Use default session ID generator
            eventStore,
            onsessioninitialized(sessionId) {
                console.log(`Session initialized with ID: ${sessionId}`);
                transports[sessionId] = transport; // Store the transport by session ID
            },
        });
        transport.onclose = () => {
            console.log(`Transport closed for session ${transport.sessionId}`);
            transport.sessionId && delete transports[transport.sessionId]; // Clean up transport on close
        };
        // Connect the transport to the MCP server
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        console.log(`Established HTTP transport ${transport.sessionId}`);
    } else {
        console.log(`Received request for uninitialized session ${sessionId}`);
        res.status(400).send('Session not initialized');
    }
  } catch (error) {
    console.error('Error establishing HTTP transport:', error);
    if (!res.headersSent) {
      res.status(500).send('Error establishing HTTP transport');
    }
  }
});

app.get('/mcp', async (req: Request, res: Response) => {
    console.log('Received GET request to /mcp (establishing http)', req.body);
    res.status(500).send('Error establishing HTTP transport');
});

// Start the server
const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Simple http Server listening on port ${PORT}`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');

  // Close all active transports to properly clean up resources
  for (const sessionId in transports) {
    try {
      console.log(`Closing transport for session ${sessionId}`);
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }
  console.log('Server shutdown complete');
  process.exit(0);
});