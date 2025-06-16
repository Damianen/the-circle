"use client";

import React, { useEffect, useRef, useState } from "react";
// You need to install socket.io-client: npm install socket.io-client
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export default function Chat() {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Connect to the socket server (adjust URL as needed)
    if (!socket) {
      socket = io("http://localhost:3001"); // Change port if your server runs elsewhere
    }

    socket.on("chat message", (msg: string) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket?.off("chat message");
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && socket) {
      socket.emit("chat message", input);
      setInput("");
    }
  };

  return (
    <div style={{ maxWidth: 500, margin: "2rem auto", border: "1px solid #ccc", borderRadius: 8, padding: 16 }}>
      <h2>Chat Room</h2>
      <div style={{ height: 300, overflowY: "auto", background: "#f9f9f9", padding: 8, marginBottom: 12 }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ margin: "4px 0", padding: 6, background: "#e0e0e0", borderRadius: 4 }}>{msg}</div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={sendMessage} style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          style={{ flex: 1, padding: 8 }}
          placeholder="Type a message..."
        />
        <button type="submit" style={{ padding: "8px 16px" }}>Send</button>
      </form>
    </div>
  );
}
