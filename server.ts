import https from "https";
import fs from "fs";
import { WebSocketServer } from "ws";
import next from "next";

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port: any = process.env.PORT || '3000';
const app = next({ dev, port });
const handler = app.getRequestHandler();

// Load SSL certificate and key (generate these if you don't have them)
const options = {
    key: fs.readFileSync("./certs/key.pem"),
    cert: fs.readFileSync("./certs/cert.pem"),
};

app.prepare().then(async () => {
const server = https.createServer(options, (req, res) => {
    console.log("[REQUEST] Headers:", req.headers);

    // Extract the page type (viewer or streamer) from either the URL or referer
    let pageType = req.url.replace('/', ''); // from URL path

    if (!pageType || pageType === '') {
        // Try to extract from referer if URL path is empty
        const referer = req.headers.referer || '';
        if (referer.includes('viewer.html')) {
            pageType = 'viewer';
        } else if (referer.includes('streamer.html')) {
            pageType = 'streamer';
        }
    }

    // Default to viewer if we still don't have a page type
    pageType = pageType || 'viewer';

    console.log("[REDIRECT] Page type detected:", pageType);

    // Construct redirect URLTypeError: WebSocket.Server is not a function
    const redirectUrl = `https://${req.headers.host.replace('3000', '8080')}/src/${pageType}.html`;
    console.log("[REDIRECT] Will redirect to:", redirectUrl);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WebSocket Certificate Check</title>
            <script>
                // Try to establish WebSocket connection
                const ws = new WebSocket('wss://' + window.location.host);
                ws.onopen = () => {
                    ws.close();
                    // Certificate is now accepted, redirect back
                    window.location.href = "${redirectUrl}";
                };
                ws.onerror = (e) => {
                    console.error("WebSocket connection failed:", e);
                };
            </script>
        </head>
        <body>
            <h2>Checking WebSocket certificate...</h2>
            <p>You will be redirected automatically to ${pageType} page.</p>
        </body>
        </html>
    `);
});

const wss = new  WebSocketServer({ server });

/**
 * clients: Array of { id, socket, type: "streamer"|"viewer", streamId? }
 * streams: Map from streamId to { streamerSocket, streamerId, viewers: Set<viewerId> }
 */
const clients = [];
const streams = new Map();

wss.on("connection", (socket) => {
    let clientId = null;
    let clientType = null;
    let clientStreamId = null;

    console.log("[WS] New connection established");

    socket.on("message", (msg) => {
        let data;
        try {
            data = JSON.parse(msg);
        } catch (e) {
            console.error("[WS] Invalid JSON:", msg);
            return;
        }

        console.log(`[WS] Message received:`, data);

        switch (data.type) {
            case "register":
                clientId = data.id;
                clientType = data.clientType;
                clientStreamId = data.streamId;
                clients.push({
                    id: clientId,
                    socket,
                    type: clientType,
                    streamId: clientStreamId,
                });
                console.log(`[REGISTER] ${clientType} registered with id=${clientId}, streamId=${clientStreamId}`);
                if (clientType === "streamer" && clientStreamId) {
                    streams.set(clientStreamId, {
                        streamerSocket: socket,
                        streamerId: clientId,
                        viewers: new Set(),
                    });
                    console.log(`[STREAMS] Streamer registered streamId=${clientStreamId}`);
                }
                if (clientType === "viewer" && clientStreamId && streams.has(clientStreamId)) {
                    streams.get(clientStreamId).viewers.add(clientId);
                    console.log(`[STREAMS] Viewer ${clientId} joined streamId=${clientStreamId}`);
                    // Notify streamer to start negotiation with this viewer
                    const streamer = streams.get(clientStreamId);
                    streamer.streamerSocket.send(
                        JSON.stringify({
                            type: "viewer-joined",
                            viewerId: clientId,
                        })
                    );
                    console.log(`[SIGNAL] Notified streamer ${streamer.streamerId} of new viewer ${clientId}`);
                }
                break;

            case "offer":
                // Streamer sends offer to viewer
            {
                const { to, offer } = data;
                const viewerClient = clients.find((c) => c.id === to && c.type === "viewer");
                if (viewerClient) {
                    viewerClient.socket.send(
                        JSON.stringify({
                            type: "offer",
                            from: clientId,
                            offer,
                        })
                    );
                    console.log(`[SIGNAL] Offer sent from streamer ${clientId} to viewer ${to}`);
                } else {
                    console.warn(`[SIGNAL] Offer: Viewer ${to} not found`);
                }
            }
                break;

            case "answer":
                // Viewer sends answer to streamer
            {
                const { to, answer } = data;
                const streamerClient = clients.find((c) => c.id === to && c.type === "streamer");
                if (streamerClient) {
                    streamerClient.socket.send(
                        JSON.stringify({
                            type: "answer",
                            from: clientId,
                            answer,
                        })
                    );
                    console.log(`[SIGNAL] Answer sent from viewer ${clientId} to streamer ${to}`);
                } else {
                    console.warn(`[SIGNAL] Answer: Streamer ${to} not found`);
                }
            }
                break;

            case "ice-candidate":
            {
                const { to, candidate } = data;
                const targetClient = clients.find((c) => c.id === to);
                if (targetClient) {
                    targetClient.socket.send(
                        JSON.stringify({
                            type: "ice-candidate",
                            from: clientId,
                            candidate,
                        })
                    );
                    console.log(`[SIGNAL] ICE candidate sent from ${clientId} to ${to}`);
                } else {
                    console.warn(`[SIGNAL] ICE: Target ${to} not found`);
                }
            }
                break;

            case "get-streams":
                // Only list streams with an active streamer socket
                console.log('[STREAMS] get-streams requested by client');
                const activeStreams = Array.from(streams.entries())
                    .filter(([streamId, streamObj]) => streamObj.streamerSocket.readyState === WebSocket.OPEN)
                    .map(([streamId]) => streamId);
                console.log('[STREAMS] Active streams:', activeStreams);
                socket.send(
                    JSON.stringify({
                        type: "streams",
                        streams: activeStreams,
                    })
                );
                console.log('[STREAMS] Stream list sent to client');
                break;

            case "stream-ended":
                if (data.streamId && streams.has(data.streamId)) {
                    // Notify all viewers that stream has ended
                    const stream = streams.get(data.streamId);
                    stream.viewers.forEach(viewerId => {
                        const viewer = clients.find(c => c.id === viewerId);
                        if (viewer) {
                            viewer.socket.send(JSON.stringify({
                                type: "stream-ended",
                                streamId: data.streamId
                            }));
                        }
                    });
                    streams.delete(data.streamId);
                    console.log(`[STREAMS] Stream ${data.streamId} ended and removed`);
                }
                break;

            default:
                console.warn("[WS] Unknown message type:", data.type);
        }
    });

    socket.on("close", () => {
        // Clean up on disconnect
        if (!clientId) return;
        const idx = clients.findIndex((c) => c.id === clientId);
        if (idx !== -1) {
            const client = clients[idx];
            if (client.type === "streamer" && client.streamId) {
                streams.delete(client.streamId);
                console.log(`[CLEANUP] Streamer ${clientId} disconnected, streamId=${client.streamId} removed`);
            }
            if (client.type === "viewer" && client.streamId && streams.has(clientStreamId)) {
                streams.get(clientStreamId).viewers.delete(client.id);
                console.log(`[CLEANUP] Viewer ${clientId} disconnected from streamId=${client.streamId}`);
            }
            clients.splice(idx, 1);
        }
        console.log(`[WS] Connection closed for clientId=${clientId}`);
    });
});

server.listen(3000, () => {
    console.log("WebRTC signaling server running at https://localhost:3000 (WSS)");
    console.log("If running on LAN, connect clients to wss://<YOUR_SERVER_IP>:3000");
    console.log("Make sure your HTML is served via HTTPS, not HTTP, or camera/mic will not work.");
});

server.on("error", (err) => {
    console.error("[SERVER] Failed to start HTTPS/WSS server:", err);
    console.error("Check that your certs exist and the port is not in use.");
});

});
