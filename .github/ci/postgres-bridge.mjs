// Puente de transporte (no simula SQL): cada WebSocket abre una conexión TCP
// al único postgres:16 desechable del runner. Nunca acepta destinos del cliente.
import { createServer } from "node:http";
import { connect } from "node:net";
import { WebSocket, WebSocketServer } from "ws";

if (process.env.APP_ENV !== "test" || process.env.CI !== "true") {
  throw new Error("El puente sólo se permite en CI de pruebas.");
}
const database = new URL(process.env.DATABASE_URL);
if (database.hostname !== "127.0.0.1" || database.pathname !== "/edupay_ci") {
  throw new Error("El puente sólo permite la base local edupay_ci.");
}
const server = createServer((request, response) => {
  response.writeHead(request.url === "/health" ? 200 : 404);
  response.end(request.url === "/health" ? "ready" : "not found");
});
const sockets = new WebSocketServer({ server, path: "/v2" });
sockets.on("connection", (socket) => {
  const tcp = connect({ host: "127.0.0.1", port: Number(database.port || 5432) });
  socket.on("message", (data) => tcp.write(data));
  tcp.on("data", (data) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(data);
  });
  socket.on("close", () => tcp.destroy());
  socket.on("error", () => tcp.destroy());
  tcp.on("close", () => socket.close());
  tcp.on("error", () => socket.close(1011, "PostgreSQL no disponible"));
});
server.listen(54330, "127.0.0.1", () => console.log("Puente PostgreSQL local listo"));
