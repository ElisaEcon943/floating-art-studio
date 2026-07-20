"use client";

import { ChangeEvent, PointerEvent, useRef, useState } from "react";

type Motion = "float" | "swing" | "orbit" | "pulse";
type Piece = { id: number; x: number; y: number; w: number; h: number; cropX: number; cropY: number; motion: Motion; delay: number };

const motions: { id: Motion; label: string }[] = [
  { id: "float", label: "漂浮" }, { id: "swing", label: "摇摆" },
  { id: "orbit", label: "环游" }, { id: "pulse", label: "呼吸" },
];

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("等待一幅画");
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [isDraggingOver, setDraggingOver] = useState(false);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);

  const loadFile = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => { setImage(String(reader.result)); setFileName(file.name); setPieces([]); setSelected(null); };
    reader.readAsDataURL(file);
  };
  const onFile = (e: ChangeEvent<HTMLInputElement>) => loadFile(e.target.files?.[0]);
  const extract = () => {
    if (!image) return;
    setPieces([
      { id: 1, x: 10, y: 12, w: 34, h: 40, cropX: 8, cropY: 12, motion: "float", delay: 0 },
      { id: 2, x: 53, y: 10, w: 31, h: 28, cropX: 58, cropY: 6, motion: "swing", delay: .3 },
      { id: 3, x: 18, y: 57, w: 28, h: 28, cropX: 18, cropY: 68, motion: "pulse", delay: .6 },
      { id: 4, x: 57, y: 51, w: 35, h: 37, cropX: 72, cropY: 72, motion: "orbit", delay: .15 },
    ]); setSelected(1);
  };
  const moveStart = (e: PointerEvent<HTMLButtonElement>, p: Piece) => {
    const rect = e.currentTarget.parentElement!.getBoundingClientRect();
    drag.current = { id: p.id, dx: e.clientX - rect.left - rect.width * p.x / 100, dy: e.clientY - rect.top - rect.height * p.y / 100 };
    e.currentTarget.setPointerCapture(e.pointerId); setSelected(p.id);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    const rect = e.currentTarget.parentElement!.getBoundingClientRect();
    const x = Math.max(0, Math.min(82, (e.clientX - rect.left - drag.current.dx) / rect.width * 100));
    const y = Math.max(0, Math.min(78, (e.clientY - rect.top - drag.current.dy) / rect.height * 100));
    setPieces(v => v.map(p => p.id === drag.current!.id ? { ...p, x, y } : p));
  };
  const setMotion = (motion: Motion) => setPieces(v => v.map(p => p.id === selected ? { ...p, motion } : p));
  const download = () => {
    if (!image || !pieces.length) return;
    const html = `<!doctype html><html><style>body{margin:0;min-height:100vh;background:#17152e;overflow:hidden}.piece{position:absolute;width:28vmin;height:28vmin;background:url('${image}') center/220%;border-radius:40%;animation:float 4s ease-in-out infinite alternate}@keyframes float{to{transform:translateY(-25px) rotate(5deg)}}</style><body>${pieces.map(p => `<div class="piece" style="left:${p.x}%;top:${p.y}%"></div>`).join("")}</body></html>`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html], { type: "text/html" })); a.download = "floating-studio.html"; a.click();
  };

  return <main>
    <nav><a className="brand" href="#top"><span>浮</span> 浮游画室</a><div className="navRight"><span>不止是上传，是让画作醒来。</span><a href="#studio">开始创作 ↘</a></div></nav>
    <section className="hero" id="top">
      <div className="eyebrow">DRAWING → MOTION → WEB</div>
      <h1>把你的画，<br/>变成<span>会呼吸</span>的网页。</h1>
      <p>上传一幅画，拆出它的角色、植物、星星和怪念头。<br/>拖一拖，摇一摇，让每个元素拥有自己的行动轨迹。</p>
      <a className="heroCta" href="#studio">进入浮游实验室 <b>↘</b></a>
      <div className="orbit orbitA">✦</div><div className="orbit orbitB">●</div><div className="scribble">一幅画<br/>无数种<br/>活法！</div>
    </section>

    <section className="studio" id="studio">
      <header><div><span className="step">01 / 上传 & 拆解</span><h2>元素浮游实验室</h2></div><div className="status"><i/> 本地处理 · 你的画不会离开浏览器</div></header>
      <div className="workbench">
        <aside className="leftPanel">
          <div className="panelTitle">原始画作 <span>ORIGINAL</span></div>
          <label className={`dropzone ${image ? "hasImage" : ""} ${isDraggingOver ? "over" : ""}`}
            onDragOver={e => { e.preventDefault(); setDraggingOver(true); }} onDragLeave={() => setDraggingOver(false)}
            onDrop={e => { e.preventDefault(); setDraggingOver(false); loadFile(e.dataTransfer.files[0]); }}>
            {image ? <img src={image} alt="已上传的画作"/> : <><div className="uploadGlyph">↥</div><strong>把画丢进来</strong><small>PNG / JPG / WEBP · 最大 20MB</small></>}
            <input type="file" accept="image/*" onChange={onFile}/>
          </label>
          <div className="filename"><span>{fileName}</span><b>{image ? "READY" : "EMPTY"}</b></div>
          <button className="extract" onClick={extract} disabled={!image}><span>✦</span> 提取画中元素</button>
          <p className="hint">提示：背景越干净、元素间距越大，提取效果越有趣。</p>
        </aside>

        <div className="canvasPanel">
          <div className="panelTitle">浮游画布 <span>DRAG TO COMPOSE</span></div>
          <div className="canvas">
            {!image && <div className="empty"><div className="specimen">?</div><strong>这里还很安静</strong><span>上传画作，把想象力放进来</span></div>}
            {image && !pieces.length && <div className="empty"><div className="specimen">✂</div><strong>画作已就位</strong><span>点击「提取画中元素」开始拆解</span></div>}
            {image && pieces.map(p => <button key={p.id} aria-label={`元素 ${p.id}`} className={`piece motion-${p.motion} ${selected === p.id ? "selected" : ""}`}
              onPointerDown={e => moveStart(e,p)} onPointerMove={move} onPointerUp={() => drag.current = null}
              style={{ left:`${p.x}%`, top:`${p.y}%`, width:`${p.w}%`, height:`${p.h}%`, animationDelay:`${p.delay}s`, backgroundImage:`url(${image})`, backgroundPosition:`${p.cropX}% ${p.cropY}%` }}/>) }
            <span className="canvasNote">∞ PLAYGROUND</span>
          </div>
        </div>

        <aside className="rightPanel">
          <div className="panelTitle">动作魔法 <span>MOTION</span></div>
          <p>{selected ? `已选中元素 0${selected}` : "先选择一个元素"}</p>
          <div className="motions">{motions.map((m,i) => <button key={m.id} onClick={() => setMotion(m.id)} disabled={!selected} className={pieces.find(p=>p.id===selected)?.motion===m.id?"active":""}><b>{["↟","⌁","⟳","◉"][i]}</b><span>{m.label}<small>{["FLOAT","SWING","ORBIT","PULSE"][i]}</small></span></button>)}</div>
          <div className="speed"><span>速度</span><input type="range" min="1" max="5" defaultValue="3" aria-label="动画速度"/></div>
          <button className="export" onClick={download} disabled={!pieces.length}>导出网页片段 <span>↗</span></button>
          <small className="exportNote">生成一个可继续编辑的 HTML 文件</small>
        </aside>
      </div>
    </section>
    <footer><span>浮游画室 / 让静止的灵感获得重力之外的自由</span><b>MADE FOR WILD IDEAS ✦</b></footer>
  </main>;
}
