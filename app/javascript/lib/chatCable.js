const subscriptions = new Map();
const confirmedSubscriptions = new Set();
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
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  const pending = outboundQueue.splice(0, outboundQueue.length);
  pending.forEach((payload) => {
    if (payload.command === "message" && !confirmedSubscriptions.has(payload.identifier)) {
      outboundQueue.push(payload);
      return;
    }

    sendWhenOpen(payload);
  });
};

const sendOrQueue = (payload) => {
  const subscriptionConfirmed = payload.command !== "message" || confirmedSubscriptions.has(payload.identifier);
  if (subscriptionConfirmed && sendWhenOpen(payload)) return true;

  outboundQueue.push(payload);
  if (outboundQueue.length > MAX_OUTBOUND_QUEUE_SIZE) outboundQueue.shift();
  connect();
  return false;
};

const resubscribeAll = () => {
  confirmedSubscriptions.clear();
  subscriptions.forEach((_handlers, identifier) => {
    sendWhenOpen({ command: "subscribe", identifier });
  });
};

const discardQueuedMessages = (identifier) => {
  for (let index = outboundQueue.length - 1; index >= 0; index -= 1) {
    if (outboundQueue[index].identifier === identifier) outboundQueue.splice(index, 1);
  }
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
  };

  socket.onmessage = (event) => {
    lastSocketMessageAt = Date.now();

    let data;
    try {
      data = JSON.parse(event.data);
    } catch (_error) {
      return;
    }

    if (data.type === "welcome") {
      emitStatus("connected");
      return;
    }

    if (data.type === "confirm_subscription" && data.identifier) {
      if (!subscriptions.has(data.identifier)) {
        sendWhenOpen({ command: "unsubscribe", identifier: data.identifier });
        discardQueuedMessages(data.identifier);
        return;
      }

      confirmedSubscriptions.add(data.identifier);
      flushOutboundQueue();
      return;
    }

    if (data.type === "reject_subscription" && data.identifier) {
      confirmedSubscriptions.delete(data.identifier);
      discardQueuedMessages(data.identifier);
      return;
    }

    // Ignore other framework-level ActionCable messages.
    if (!data.identifier || !data.message) return;

    const handlers = subscriptions.get(data.identifier) || [];
    handlers.forEach((handler) => handler(data.message));
  };

  socket.onclose = () => {
    socket = null;
    confirmedSubscriptions.clear();
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
  const firstSubscriber = handlers.length === 0;

  if (!handlers.includes(received)) {
    subscriptions.set(identifier, [...handlers, received]);
  }

  connect();

  if (firstSubscriber) sendWhenOpen({ command: "subscribe", identifier });

  return {
    unsubscribe: () => {
      const existingHandlers = subscriptions.get(identifier) || [];
      const remainingHandlers = existingHandlers.filter((handler) => handler !== received);

      if (remainingHandlers.length === 0) {
        subscriptions.delete(identifier);
        confirmedSubscriptions.delete(identifier);
        discardQueuedMessages(identifier);
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

export const subscribeToCall = (publicId, received) => {
  return subscribe({ channel: "CallChannel", public_id: publicId }, received);
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

  if (socket?.readyState === WebSocket.OPEN) return true;

  connect();
  return false;
};

export const sendToConversation = (conversationId, action, data = {}) => {
  const identifier = JSON.stringify({ channel: "ChatChannel", conversation_id: conversationId });
  if (!subscriptions.has(identifier)) return false;

  return sendOrQueue({
    command: "message",
    identifier,
    data: JSON.stringify({ action, conversation_id: conversationId, ...data })
  });
};
