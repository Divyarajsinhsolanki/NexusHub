import { createConsumer, type Consumer } from '@rails/actioncable';
import { Platform } from 'react-native';

type NativeMonitor = {
  startedAt?: number;
  stoppedAt?: number;
  isRunning: () => boolean;
  startPolling: () => void;
  stopPolling: () => void;
  start: () => void;
  stop: () => void;
};

export function createMobileConsumer(url: string): Consumer {
  const consumer = createConsumer(url);
  if (Platform.OS === 'web') return consumer;

  // ActionCable 8's monitor uses window visibility events. Keep its heartbeat
  // polling, but let RealtimeProvider's AppState listener own native visibility.
  const { connection, subscriptions } = consumer as Consumer & {
    connection: { monitor: NativeMonitor; webSocket?: WebSocket; uninstallEventHandlers: () => void };
    subscriptions: Consumer['subscriptions'] & { guarantor: { stopGuaranteeing: () => void } };
  };
  const { monitor } = connection;
  monitor.start = () => {
    if (monitor.isRunning()) return;
    monitor.startedAt = Date.now();
    delete monitor.stoppedAt;
    monitor.startPolling();
  };
  monitor.stop = () => {
    if (!monitor.isRunning()) return;
    monitor.stoppedAt = Date.now();
    monitor.stopPolling();
  };
  const disconnect = consumer.disconnect.bind(consumer);
  consumer.disconnect = () => {
    subscriptions.guarantor.stopGuaranteeing();
    // ActionCable's disconnect only closes OPEN sockets, not connecting sockets.
    const socket = connection.webSocket;
    if (socket) connection.uninstallEventHandlers();
    disconnect();
    if (socket?.readyState === WebSocket.CONNECTING) socket.close();
  };
  return consumer;
}
