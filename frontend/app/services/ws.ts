type Listener = (payload: any) => void;

type ListenerMap = Record<string, Set<Listener>>;

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8100';
const WS_URL = API_URL.replace('http', 'ws');

class FlowWebSocket {
  private socket: WebSocket | null = null;
  private listeners: ListenerMap = {};
  private identity = { userId: '', groupId: '', name: '' };

  connect(userId: string, groupId: string, name: string) {
    if (!userId || !groupId) return;

    if (this.socket) {
      this.socket.close();
    }

    this.identity = { userId, groupId, name };

    const url = `${WS_URL}/ws?userId=${userId}&groupId=${groupId}&name=${encodeURIComponent(name || '')}`;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.emit('status', { state: 'connected' });
      this.send({ type: 'join' });
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
    if (this.socket?.readyState !== WebSocket.OPEN) return;

    const envelope: Record<string, any> = { ...payload };
    if (typeof envelope.payload === 'object' && envelope.payload !== null) {
      Object.entries(envelope.payload).forEach(([key, value]) => {
        if (envelope[key] === undefined) {
          envelope[key] = value;
        }
      });
      delete envelope.payload;
    }

    if (this.identity.userId && envelope.userId == null) {
      envelope.userId = this.identity.userId;
    }
    if (this.identity.groupId && envelope.groupId == null) {
      envelope.groupId = this.identity.groupId;
    }
    if (this.identity.name && envelope.name == null) {
      envelope.name = this.identity.name;
    }

    this.socket.send(JSON.stringify(envelope));
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.identity = { userId: '', groupId: '', name: '' };
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
