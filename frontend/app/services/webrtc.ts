/**
 * webrtc.ts — Goggle Simulator WebRTC Service
 *
 * Handles P2P video/audio between two iPhones acting as goggle + main unit.
 * Signaling uses the existing WebSocket service (/ws).
 * ICE uses Google STUN (no TURN required for same-WiFi LAN).
 */

import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';

import wsClient from './ws';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const WEBRTC_RECONNECT_EVENT = 'webrtc_reconnect_needed';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS } as any);
}

function watchConnectionState(
  pc: RTCPeerConnection,
  gogglesId: string,
  groupId: string,
  onNeedReconnect: () => void,
) {
  (pc as any).onconnectionstatechange = () => {
    const state = (pc as any).connectionState as string;
    if (state === 'failed' || state === 'disconnected') {
      console.warn(`[WebRTC] Connection ${state} for goggle ${gogglesId} — triggering reconnect`);
      onNeedReconnect();
    }
  };
}

// ---------------------------------------------------------------------------
// Goggle Mode — create offer and stream from camera + mic
// ---------------------------------------------------------------------------

/**
 * Called on the second iPhone (Goggle Mode).
 * Opens camera + mic, creates a WebRTC offer, and sends it via WS signaling.
 * Returns the RTCPeerConnection so the caller can close it on teardown.
 */
export async function startGogglesStream(
  gogglesId: string,
  groupId: string,
  onLocalStream: (stream: MediaStream) => void,
  onNeedReconnect?: () => void,
): Promise<RTCPeerConnection> {
  const pc = createPeerConnection();

  // Get camera + mic
  const localStream: MediaStream = await (mediaDevices as any).getUserMedia({
    video: {
      width: { min: 640, ideal: 1280 },
      height: { min: 480, ideal: 720 },
      frameRate: { ideal: 24 },
      facingMode: 'environment',
    },
    audio: true,
  });

  onLocalStream(localStream);

  localStream.getTracks().forEach((track: any) => {
    pc.addTrack(track, localStream);
  });

  // ICE candidates → WS
  (pc as any).onicecandidate = (event: any) => {
    if (event.candidate) {
      wsClient.send({
        type: 'goggle_ice',
        gogglesId,
        groupId,
        candidate: event.candidate,
        from: 'goggle',
      });
    }
  };

  watchConnectionState(pc, gogglesId, groupId, () => {
    onNeedReconnect?.();
  });

  // Create and send offer
  const offer = await (pc as any).createOffer({
    offerToReceiveAudio: false,
    offerToReceiveVideo: false,
  });
  await (pc as any).setLocalDescription(new RTCSessionDescription(offer));

  wsClient.send({
    type: 'goggle_offer',
    gogglesId,
    groupId,
    sdp: offer.sdp,
  });

  // Wait for answer from WS
  const removeAnswerListener = wsClient.onGoggleSignal((msg: any) => {
    if (msg.type === 'goggle_answer' && msg.gogglesId === gogglesId) {
      removeAnswerListener();
      (pc as any)
        .setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }))
        .catch((err: Error) => console.warn('[WebRTC] setRemoteDescription answer error:', err));
    }
    if (msg.type === 'goggle_ice' && msg.gogglesId === gogglesId && msg.from === 'central') {
      (pc as any)
        .addIceCandidate(new RTCIceCandidate(msg.candidate))
        .catch((err: Error) => console.warn('[WebRTC] addIceCandidate (goggle) error:', err));
    }
  });

  return pc;
}

// ---------------------------------------------------------------------------
// Main Mode — handle incoming offer, return answer + remote stream
// ---------------------------------------------------------------------------

/**
 * Called on the primary iPhone (Main Mode).
 * Accepts an incoming WebRTC offer from the goggle iPhone and sends back an answer.
 * Calls onRemoteStream when the remote video/audio track arrives.
 */
export async function acceptGogglesStream(
  gogglesId: string,
  groupId: string,
  offer: { type: string; sdp: string },
  onRemoteStream: (stream: MediaStream) => void,
  onNeedReconnect?: () => void,
): Promise<RTCPeerConnection> {
  const pc = createPeerConnection();

  (pc as any).ontrack = (event: any) => {
    if (event.streams && event.streams[0]) {
      onRemoteStream(event.streams[0]);
    }
  };

  // ICE candidates → WS
  (pc as any).onicecandidate = (event: any) => {
    if (event.candidate) {
      wsClient.send({
        type: 'goggle_ice',
        gogglesId,
        groupId,
        candidate: event.candidate,
        from: 'central',
      });
    }
  };

  watchConnectionState(pc, gogglesId, groupId, () => {
    onNeedReconnect?.();
  });

  // Listen for ICE candidates from goggle
  const removeIceListener = wsClient.onGoggleSignal((msg: any) => {
    if (msg.type === 'goggle_ice' && msg.gogglesId === gogglesId && msg.from === 'goggle') {
      (pc as any)
        .addIceCandidate(new RTCIceCandidate(msg.candidate))
        .catch((err: Error) => console.warn('[WebRTC] addIceCandidate (main) error:', err));
    }
    if (msg.type === 'goggle_disconnect' && msg.gogglesId === gogglesId) {
      removeIceListener();
    }
  });

  await (pc as any).setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await (pc as any).createAnswer();
  await (pc as any).setLocalDescription(new RTCSessionDescription(answer));

  wsClient.send({
    type: 'goggle_answer',
    gogglesId,
    groupId,
    sdp: answer.sdp,
  });

  return pc;
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

/**
 * Stop all tracks and close the peer connection.
 */
export function stopGogglesStream(pc: RTCPeerConnection | null): void {
  if (!pc) return;
  try {
    // Stop all local tracks
    const senders = (pc as any).getSenders?.() ?? [];
    senders.forEach((sender: any) => {
      sender.track?.stop();
    });
    (pc as any).close();
  } catch (err) {
    console.warn('[WebRTC] Error during teardown:', err);
  }
}

// ---------------------------------------------------------------------------
// Export event name constant for UI layers
// ---------------------------------------------------------------------------
export { WEBRTC_RECONNECT_EVENT };
