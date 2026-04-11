"use client";

import { useEffect, useRef, useCallback, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:4100";
const WS_URL = API_URL.replace(/^http/, "ws");

type MessageHandler = (event: string, data: unknown) => void;

export function useAdminWs(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) return;

    let ws: WebSocket;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(`${WS_URL}/ws?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        retryTimer = setTimeout(connect, 3000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          onMessageRef.current(msg.event, msg.data);
        } catch {}
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  return { connected };
}
