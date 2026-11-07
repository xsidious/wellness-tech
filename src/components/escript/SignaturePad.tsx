"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  name?: string;
  label?: string;
  height?: number;
};

/** Canvas signature pad — posts PNG data URL via hidden input. */
export function SignaturePad({ name = "signatureDataUrl", label = "Prescriber signature", height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const stroked = useRef(false);
  const [dataUrl, setDataUrl] = useState("");
  const [hasStroke, setHasStroke] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1f3a";
    ctx.lineWidth = 2.2;
    ctx.fillStyle = "#f7f9fc";
    ctx.fillRect(0, 0, width, height);
  }, [height]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawing.current = true;
    canvas.setPointerCapture(e.pointerId);
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    stroked.current = true;
    setHasStroke(true);
  }

  function onPointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !stroked.current) return;
    setDataUrl(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#f7f9fc";
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    stroked.current = false;
    setHasStroke(false);
    setDataUrl("");
  }

  return (
    <div className="escript-pad">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <label>{label}</label>
        <button className="btn btn-ghost" type="button" onClick={clear}>
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="escript-canvas"
        style={{ width: "100%", height, touchAction: "none", border: "1px solid #c5d0de", borderRadius: 8, cursor: "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      <input type="hidden" name={name} value={dataUrl} />
      <p className="muted">{hasStroke ? "Signature captured." : "Sign above before submitting Rx lines."}</p>
    </div>
  );
}
