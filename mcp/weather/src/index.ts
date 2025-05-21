import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";


import express, { Router } from 'express';
import { z } from "zod";
import cors from 'cors';

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";

const app = express();
app.use(cors());
app.use(express.json());


function getServer() {
    // Create server instance
    const server = new McpServer({
    name: "weather",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {},
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

app.post('/mcp', async (req: express.Request, res: express.Response) => {
  // In stateless mode, create a new instance of transport and server for each request
  // to ensure complete isolation. A single instance would cause request ID collisions
  // when multiple clients connect concurrently.
  
  try {
    const server = getServer(); 
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on('close', () => {
      console.log('Request closed');
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});


// SSE endpoint
let clients: express.Response[] = [];
const dummyToolManifest = {
  type: 'tool-manifest',
  tools: [
    {
      name: 'echo',
      description: 'Echoes input text',
      input_schema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
        required: ['message'],
      },
    },
  ],
};
app.get('/mcp', (req: express.Request, res: express.Response) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = res;
  clients.push(client);

  console.log('SSE Client connected');
  // Remove on disconnect
  req.on('close', () => {
    clients = clients.filter((c) => c !== client);
    console.log('SSE Client disconnected');
  });

  setTimeout(() => {
    console.log('Sending dummy tool manifest to SSE client');
    res.write(`data: ${JSON.stringify(dummyToolManifest)}\n\n`);
  }, 1000);
});



const PORT = 3002;
app.listen(PORT, () => {
  console.log(`MCP Stateless Streamable HTTP Server listening on port ${PORT}`);
});

// async function main() {
//   const transport = new StdioServerTransport();
//   await server.connect(transport);
//   console.log("Weather MCP Server running on stdio");
// }

// main().catch((error) => {
//   console.error("Fatal error in main():", error);
//   process.exit(1);
// });

// Helper function for making NWS API requests
async function makeNWSRequest<T>(url: string): Promise<T | null> {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/geo+json",
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making NWS request:", error);
    return null;
  }
}

interface AlertFeature {
  properties: {
    event?: string;
    areaDesc?: string;
    severity?: string;
    status?: string;
    headline?: string;
  };
}

// Format alert data
function formatAlert(feature: AlertFeature): string {
  const props = feature.properties;
  return [
    `Event: ${props.event || "Unknown"}`,
    `Area: ${props.areaDesc || "Unknown"}`,
    `Severity: ${props.severity || "Unknown"}`,
    `Status: ${props.status || "Unknown"}`,
    `Headline: ${props.headline || "No headline"}`,
    "---",
  ].join("\n");
}

interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
}

interface AlertsResponse {
  features: AlertFeature[];
}

interface PointsResponse {
  properties: {
    forecast?: string;
  };
}

interface ForecastResponse {
  properties: {
    periods: ForecastPeriod[];
  };
}