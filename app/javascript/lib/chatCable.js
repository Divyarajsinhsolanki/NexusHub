const subscriptions = new Map();
const statusListeners = new Set();
const outboundQueue = [];
const HEARTBEAT_TIMEOUT_MS = 45000;
const HEARTBEAT_CHECK_INTERVAL_MS = 15000;
const MAX_OUTBOUND_QUEUE_SIZE = 50;
let socket;
let reconnectTimer;
let heartbeatTimer;
let reconnectAttempts = 0;
let intentionallyClosed = false;
let lastSocketMessageAt = 0;
let currentStatus = "closed";

const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
const configuredCableUrl = import.meta.env.VITE_ACTION_CABLE_URL || import.meta.env.VITE_CABLE_URL;
const normalizeCableUrl = (url) => {
  if (!url) return "";

  let resolvedUrl;
  try {
    resolvedUrl = new URL(url, window.location.origin);
  } catch (_error) {
    return "";
  }

  if (resolvedUrl.protocol === "http:") resolvedUrl.protocol = "ws:";
  if (resolvedUrl.protocol === "https:") resolvedUrl.protocol = "wss:";
  return resolvedUrl.toString();
};
const socketUrl = normalizeCableUrl(configuredCableUrl) || `${wsProtocol}://${window.location.host}/cable`;
const cableProtocols = ["actioncable-v1-json", "actioncable-unsupported"];

const sendWhenOpen = (payload) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;

  socket.send(JSON.stringify(payload));
  return true;
};

const emitStatus = (status) => {
  currentStatus = status;
  statusListeners.forEach((listener) => listener(status));
};

const flushOutboundQueue = () => {
  while (outboundQueue.length > 0 && socket?.readyState === WebSocket.OPEN) {
    sendWhenOpen(outboundQueue.shift());
  }
};

const sendOrQueue = (payload) => {
  if (sendWhenOpen(payload)) return true;

  outboundQueue.push(payload);
  if (outboundQueue.length > MAX_OUTBOUND_QUEUE_SIZE) outboundQueue.shift();
  connect();
  return false;
};

const resubscribeAll = () => {
  subscriptions.forEach((_handlers, identifier) => {
    sendWhenOpen({ command: "subscribe", identifier });
  });
};

const clearReconnectTimer = () => {
  if (!reconnectTimer) return;

  clearTimeout(reconnectTimer);
  reconnectTimer = null;
};

const stopHeartbeatMonitor = () => {
  if (!heartbeatTimer) return;

  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
};

const startHeartbeatMonitor = () => {
  stopHeartbeatMonitor();
  heartbeatTimer = setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastSocketMessageAt < HEARTBEAT_TIMEOUT_MS) return;

    emitStatus("stale");
    socket.close();
  }, HEARTBEAT_CHECK_INTERVAL_MS);
};

const scheduleReconnect = () => {
  if (intentionallyClosed || subscriptions.size === 0) return;

  clearReconnectTimer();
  reconnectAttempts += 1;
  emitStatus("reconnecting");
  reconnectTimer = setTimeout(connect, Math.min(1000 * reconnectAttempts, 5000));
};

const connect = () => {
  if (subscriptions.size === 0) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  intentionallyClosed = false;
  emitStatus("connecting");
  socket = new WebSocket(socketUrl, cableProtocols);

  socket.onopen = () => {
    clearReconnectTimer();
    reconnectAttempts = 0;
    lastSocketMessageAt = Date.now();

    resubscribeAll();
    flushOutboundQueue();
    startHeartbeatMonitor();
    emitStatus("connected");
  };

  socket.onmessage = (event) => {
    lastSocketMessageAt = Date.now();

    let data;
    try {
      data = JSON.parse(event.data);
    } catch (_error) {
      return;
    }

    // Ignore framework-level ActionCable messages.
    if (!data.identifier || !data.message) return;

    const handlers = subscriptions.get(data.identifier) || [];
    handlers.forEach((handler) => handler(data.message));
  };

  socket.onclose = () => {
    socket = null;
    stopHeartbeatMonitor();
    emitStatus(intentionallyClosed ? "closed" : "disconnected");
    scheduleReconnect();
  };

  socket.onerror = () => {
    emitStatus("disconnected");
    socket?.close();
  };
};

const subscribe = (params, received) => {
  const identifier = JSON.stringify(params);
  const handlers = subscriptions.get(identifier) || [];

  if (!handlers.includes(received)) {
    subscriptions.set(identifier, [...handlers, received]);
  }

  connect();

  sendWhenOpen({ command: "subscribe", identifier });

  return {
    unsubscribe: () => {
      const existingHandlers = subscriptions.get(identifier) || [];
      const remainingHandlers = existingHandlers.filter((handler) => handler !== received);

      if (remainingHandlers.length === 0) {
        subscriptions.delete(identifier);
        sendWhenOpen({ command: "unsubscribe", identifier });

        if (subscriptions.size === 0 && socket) {
          intentionallyClosed = true;
          clearReconnectTimer();
          stopHeartbeatMonitor();
          socket.close();
          socket = null;
        }
      } else {
        subscriptions.set(identifier, remainingHandlers);
      }
    }
  };
};

export const subscribeToPresence = (received) => subscribe({ channel: "PresenceChannel" }, received);

export const subscribeToUserChat = (received) => subscribe({ channel: "ChatChannel" }, received);

export const subscribeToConversationChat = (conversationId, received) => {
  return subscribe({ channel: "ChatChannel", conversation_id: conversationId }, received);
};

export const subscribeToCableStatus = (received) => {
  statusListeners.add(received);
  received(currentStatus);

  return {
    unsubscribe: () => statusListeners.delete(received)
  };
};

export const ensureCableConnection = () => {
  intentionallyClosed = false;

  if (socket?.readyState === WebSocket.OPEN) {
    resubscribeAll();
    flushOutboundQueue();
    return true;
  }

  connect();
  return false;
};

export const sendToConversation = (conversationId, action, data = {}) => {
  const identifier = JSON.stringify({ channel: "ChatChannel", conversation_id: conversationId });
  sendOrQueue({
    command: "message",
    identifier,
    data: JSON.stringify({ action, conversation_id: conversationId, ...data })
  });
};
