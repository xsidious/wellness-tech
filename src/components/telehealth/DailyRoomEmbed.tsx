"use client";

import { useEffect, useRef } from "react";

export function DailyRoomEmbed({
  roomUrl,
  token,
  userName,
}: {
  roomUrl: string;
  token?: string;
  userName: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Prefer Daily prebuilt iframe with meeting token when available.
    const url = new URL(roomUrl.split("?")[0]);
    if (token) url.searchParams.set("t", token);
    url.searchParams.set("userName", userName);
    if (ref.current) ref.current.src = url.toString();
  }, [roomUrl, token, userName]);

  return (
    <div className="th-room-shell">
      <iframe
        ref={ref}
        title="Telehealth visit"
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        className="th-room-frame"
      />
    </div>
  );
}
