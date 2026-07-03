// Shared WebSocket connection client. This will keep retrying forever if the backend goes down.
import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:5000";

// Start socket.io with auto reconnection enabled
export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 2000, // Wait 2 seconds before trying to reconnect
  reconnectionAttempts: Infinity, // Keep retrying forever
});

export default socket;
