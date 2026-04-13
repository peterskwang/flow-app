type Listener = (payload: any) => void;

type ListenerMap = Record<string, Set<Listener>>;

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8100';
const WS_URL = API_URL.replace('http', 'ws');

class FlowWebSocket {
  private socket: WebSocket | null = null;
  private listeners: ListenerMap = {};

  connect(userId: string, groupId: string, name: string) {
    if (!userId || !groupId) return;

    if (this.socket) {
      this.socket.close();
    }

    const url = `${WS_URL}/ws?userId=${userId}&groupId=${groupId}&name=${encodeURIComponent(name || '')}`;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.emit('status', { state: 'connected' });
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit('message', data);
      } catch (error) {
        console.warn('Failed to parse WS message', error);
      }
    };

    this.socket.onerror = (error) => {
      console.warn('WebSocket error', error);
      this.emit('status', { state: 'error', error });
    };

    this.socket.onclose = () => {
      this.emit('status', { state: 'closed' });
    };
  }

  send(payload: Record<string, any>) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  on(event: string, listener: Listener) {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event].add(listener);
  }

  off(event: string, listener: Listener) {
    this.listeners[event]?.delete(listener);
  }

  private emit(event: string, payload: any) {
    this.listeners[event]?.forEach((listener) => listener(payload));
  }
}

const wsClient = new FlowWebSocket();

export default wsClient;
