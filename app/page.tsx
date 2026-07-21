"use client";

import { ChangeEvent, PointerEvent, useRef, useState } from "react";

type Motion = "float" | "swing" | "orbit" | "pulse";
type Point = { position: [number, number]; label: 0 | 1 };
type Piece = { id: number; x: number; y: number; w: number; h: number; src: string; motion: Motion; delay: number };
type SamRuntime = { model: any; processor: any; RawImage: any; Tensor: any; processed: any; embeddings: any };

const motions: { id: Motion; label: string; icon: string; en: string }[] = [
  { id: "float", label: "漂浮", icon: "↟", en: "FLOAT" },
  { id: "swing", label: "摇摆", icon: "⌁", en: "SWING" },
  { id: "orbit", label: "环游", icon: "⟳", en: "ORBIT" },
  { id: "pulse", label: "呼吸", icon: "◉", en: "PULSE" },
];

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("等待一幅画");
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [isDraggingOver, setDraggingOver] = useState(false);
  const [mode, setMode] = useState<"select" | "compose">("select");
  const [status, setStatus] = useState("上传后开始智能拆解");
  const [progress, setProgress] = useState(0);
  const [points, setPoints] = useState<Point[]>([]);
  const [hasMask, setHasMask] = useState(false);
  const [excludeMode, setExcludeMode] = useState(false);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const history = useRef<Piece[][]>([]);
  const projectInput = useRef<HTMLInputElement | null>(null);
  const runtime = useRef<SamRuntime | null>(null);
  const sourceImg = useRef<HTMLImageElement | null>(null);
  const maskCanvas = useRef<HTMLCanvasElement | null>(null);
  const maskData = useRef<{ data: ArrayLike<number>; width: number; height: number } | null>(null);

  const loadFile = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 20 * 1024 * 1024) { setStatus("图片超过 20MB，请换一张更轻的画作"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(String(reader.result)); setFileName(file.name); setPieces([]); setSelected(null);
      setPoints([]); setHasMask(false); setMode("select"); runtime.current = null; setProgress(0);
      setStatus("画作已就位，点击“启动智能拆解”");
    };
    reader.readAsDataURL(file);
  };

  const prepareAI = async () => {
    if (!image || runtime.current) return;
    try {
      setStatus("正在唤醒拆解模型…首次约需几十秒"); setProgress(12);
      const lib = await import("@huggingface/transformers");
      const device = typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm";
      const model = await lib.SamModel.from_pretrained("Xenova/slimsam-77-uniform", {
        device: device as any, dtype: device === "webgpu" ? "fp16" : "q8",
        progress_callback: (p: any) => { if (p?.progress) setProgress(Math.max(12, Math.min(72, Math.round(p.progress)))); },
      } as any);
      setStatus("正在理解画面的笔触与轮廓…"); setProgress(78);
      const processor = await lib.AutoProcessor.from_pretrained("Xenova/slimsam-77-uniform");
      const raw = await lib.RawImage.fromURL(image);
      const processed = await processor(raw);
      const embeddings = await model.get_image_embeddings(processed);
      runtime.current = { model, processor, RawImage: lib.RawImage, Tensor: lib.Tensor, processed, embeddings };
      setProgress(100); setStatus("智能画笔已就绪：左键保留，右键排除");
    } catch (error) {
      console.error(error); setProgress(0); setStatus("模型暂时没有加载成功，请检查网络后重试");
    }
  };

  const decode = async (nextPoints: Point[]) => {
    const r = runtime.current;
    if (!r || !nextPoints.length) return;
    setStatus("正在沿着笔触寻找边界…");
    const reshaped = r.processed.reshaped_input_sizes[0];
    const coords = nextPoints.map(p => [p.position[0] * Number(reshaped[1]), p.position[1] * Number(reshaped[0])]).flat();
    const labels = nextPoints.map(p => BigInt(p.label));
    const input_points = new r.Tensor("float32", coords, [1, 1, nextPoints.length, 2]);
    const input_labels = new r.Tensor("int64", labels, [1, 1, nextPoints.length]);
    const { pred_masks, iou_scores } = await r.model({ ...r.embeddings, input_points, input_labels });
    const masks = await r.processor.post_process_masks(pred_masks, r.processed.original_sizes, r.processed.reshaped_input_sizes);
    const rawMask = r.RawImage.fromTensor(masks[0][0]);
    let best = 0;
    for (let i = 1; i < iou_scores.data.length; i++) if (iou_scores.data[i] > iou_scores.data[best]) best = i;
    const canvas = maskCanvas.current!; canvas.width = rawMask.width; canvas.height = rawMask.height;
    const ctx = canvas.getContext("2d")!; const overlay = ctx.createImageData(canvas.width, canvas.height);
    const binary = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < binary.length; i++) {
      const on = rawMask.data[i * iou_scores.data.length + best] === 1; binary[i] = on ? 1 : 0;
      if (on) { overlay.data[i*4] = 200; overlay.data[i*4+1] = 255; overlay.data[i*4+2] = 61; overlay.data[i*4+3] = 142; }
    }
    ctx.putImageData(overlay, 0, 0); maskData.current = { data: binary, width: canvas.width, height: canvas.height };
    setHasMask(true); setStatus(`边界找到啦 · 置信度 ${Math.round(Number(iou_scores.data[best]) * 100)}%`);
  };

  const addPoint = (e: PointerEvent<HTMLDivElement>) => {
    if (!runtime.current || !image) return;
    e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect();
    const label: 0 | 1 = e.button === 2 || excludeMode ? 0 : 1;
    if (label === 0 && !points.some(p => p.label === 1)) {
      setStatus("请先用“＋保留笔”点击要提取的主体，再用排除笔修边");
      return;
    }
    const point: Point = { position: [(e.clientX-rect.left)/rect.width, (e.clientY-rect.top)/rect.height], label };
    const next = [...points, point]; setPoints(next); void decode(next);
  };

  const clearSelection = () => {
    setPoints([]); setHasMask(false); maskData.current = null;
    const c = maskCanvas.current; if (c) c.getContext("2d")?.clearRect(0,0,c.width,c.height);
    setStatus(runtime.current ? "重新点击一个想提取的元素" : "上传后开始智能拆解");
  };

  const commitMask = () => {
    if (!image || !maskData.current || !sourceImg.current) return;
    const { data, width, height } = maskData.current;
    const work = document.createElement("canvas"); work.width=width; work.height=height;
    const ctx=work.getContext("2d")!; ctx.drawImage(sourceImg.current,0,0,width,height);
    const pixels=ctx.getImageData(0,0,width,height); let minX=width,minY=height,maxX=0,maxY=0;
    for(let i=0;i<data.length;i++){ if(data[i]){const x=i%width,y=Math.floor(i/width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)} else pixels.data[i*4+3]=0; }
    if(minX>=maxX||minY>=maxY)return; ctx.putImageData(pixels,0,0);
    const pad=6, sx=Math.max(0,minX-pad), sy=Math.max(0,minY-pad), sw=Math.min(width-sx,maxX-minX+pad*2), sh=Math.min(height-sy,maxY-minY+pad*2);
    const cut=document.createElement("canvas");cut.width=sw;cut.height=sh;cut.getContext("2d")!.drawImage(work,sx,sy,sw,sh,0,0,sw,sh);
    const id=Date.now(); const ratio=sw/sh; const w=Math.min(42,Math.max(18,28*ratio)); const h=Math.min(45,Math.max(18,28/ratio));
    setPieces(v=>{history.current.push(v);return [...v,{id,x:12+(v.length*17)%55,y:14+(v.length*19)%50,w,h,src:cut.toDataURL("image/png"),motion:motions[v.length%4].id,delay:v.length*.18}]});
    setSelected(id); clearSelection(); setMode("compose"); setStatus("元素已提取为透明图层");
  };

  const moveStart = (e: PointerEvent<HTMLButtonElement>, p: Piece) => {
    const rect=e.currentTarget.parentElement!.getBoundingClientRect();drag.current={id:p.id,dx:e.clientX-rect.left-rect.width*p.x/100,dy:e.clientY-rect.top-rect.height*p.y/100};e.currentTarget.setPointerCapture(e.pointerId);setSelected(p.id);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => { if(!drag.current)return;const rect=e.currentTarget.parentElement!.getBoundingClientRect();const x=Math.max(0,Math.min(84,(e.clientX-rect.left-drag.current.dx)/rect.width*100));const y=Math.max(0,Math.min(80,(e.clientY-rect.top-drag.current.dy)/rect.height*100));setPieces(v=>v.map(p=>p.id===drag.current!.id?{...p,x,y}:p)); };
  const setMotion=(motion:Motion)=>setPieces(v=>{history.current.push(v);return v.map(p=>p.id===selected?{...p,motion}:p)});
  const removeSelected=()=>{setPieces(v=>{history.current.push(v);return v.filter(p=>p.id!==selected)});setSelected(null)};
  const undo=()=>{const previous=history.current.pop();if(previous){setPieces(previous);setSelected(null);setStatus("已撤销上一步图层操作")}};
  const downloadBlob=(blob:Blob,name:string)=>{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
  const saveProject=()=>{const data={version:1,name:"浮游画室项目",savedAt:new Date().toISOString(),image,fileName,pieces};downloadBlob(new Blob([JSON.stringify(data)],{type:"application/json"}),`${fileName.replace(/\.[^.]+$/,"")||"浮游画室"}.float.json`);setStatus("项目文件已保存，可在任何电脑继续编辑")};
  const loadProject=(file?:File)=>{if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(String(reader.result));if(!data.image||!Array.isArray(data.pieces))throw new Error();setImage(data.image);setFileName(data.fileName||file.name);setPieces(data.pieces);setSelected(null);setPoints([]);setHasMask(false);setMode("compose");runtime.current=null;history.current=[];setStatus("项目已恢复，可继续编排或重新启动智能拆解")}catch{setStatus("这不是有效的浮游画室项目文件")}};reader.readAsText(file)};
  const exportSelectedPng=()=>{const p=pieces.find(x=>x.id===selected);if(!p){setStatus("请先选择一个元素");return}const a=document.createElement("a");a.href=p.src;a.download=`floating-element-${pieces.indexOf(p)+1}.png`;a.click()};
  const exportZip=async()=>{if(!pieces.length)return;setStatus("正在整理完整网页项目…");const JSZip=(await import("jszip")).default;const zip=new JSZip();const elementPaths:string[]=[];pieces.forEach((p,i)=>{const base64=p.src.split(",")[1];const path=`elements/element-${i+1}.png`;zip.file(path,base64,{base64:true});elementPaths.push(path)});const css=`body{margin:0;min-height:100vh;background:#17152e;overflow:hidden}.piece{position:absolute;object-fit:contain;animation:float 4s ease-in-out infinite alternate}@keyframes float{to{transform:translateY(-25px) rotate(5deg)}}`;const body=pieces.map((p,i)=>`<img class="piece" src="${elementPaths[i]}" style="left:${p.x}%;top:${p.y}%;width:${p.w}%" alt="element ${i+1}">`).join("\n");zip.file("index.html",`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>浮游画室作品</title><link rel="stylesheet" href="style.css"><body>${body}</body></html>`);zip.file("style.css",css);zip.file("project.json",JSON.stringify({version:1,pieces:pieces.map(({src,...p},i)=>({...p,src:elementPaths[i]}))},null,2));zip.file("README.txt","双击 index.html 即可预览。elements 文件夹包含所有透明 PNG 图层，project.json 保存位置与动效配置。");downloadBlob(await zip.generateAsync({type:"blob"}),"floating-art-web-project.zip");setStatus("完整 ZIP 网页项目已导出")};
  const download=()=>{if(!pieces.length)return;const html=`<!doctype html><html><style>body{margin:0;min-height:100vh;background:#17152e;overflow:hidden}.p{position:absolute;object-fit:contain;animation:float 4s ease-in-out infinite alternate}@keyframes float{to{transform:translateY(-25px) rotate(5deg)}}</style><body>${pieces.map(p=>`<img class="p" src="${p.src}" style="left:${p.x}%;top:${p.y}%;width:${p.w}%">`).join("")}</body></html>`;const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([html],{type:"text/html"}));a.download="floating-studio.html";a.click()};

  return <main>
    <nav><a className="brand" href="#top"><span>浮</span> 浮游画室</a><div className="navRight"><span>不止是上传，是让画作醒来。</span><a href="#studio">开始创作 ↘</a></div></nav>
    <section className="hero" id="top"><div className="eyebrow">DRAWING → SEGMENT → MOTION → WEB</div><h1>把你的画，<br/>变成<span>会呼吸</span>的网页。</h1><p>点一下小鸟、叶子或怪念头，智能画笔会沿着真实轮廓把它取出来。<br/>拖一拖，摇一摇，让每个元素拥有自己的行动轨迹。</p><a className="heroCta" href="#studio">进入浮游实验室 <b>↘</b></a><div className="orbit orbitA">✦</div><div className="orbit orbitB">●</div><div className="scribble">点一下<br/>完整取出<br/>一个世界！</div></section>
    <section className="studio" id="studio">
      <header><div><span className="step">01 / 智能选区　02 / 动态编排</span><h2>元素浮游实验室</h2></div><div className="status"><i/> 本地 AI · 你的画不会离开浏览器</div></header>
      <div className="workbench">
        <aside className="leftPanel"><div className="panelTitle">原始画作 <span>ORIGINAL</span></div>
          <label className={`dropzone ${image?"hasImage":""} ${isDraggingOver?"over":""}`} onDragOver={e=>{e.preventDefault();setDraggingOver(true)}} onDragLeave={()=>setDraggingOver(false)} onDrop={e=>{e.preventDefault();setDraggingOver(false);loadFile(e.dataTransfer.files[0])}}>
            {image?<img src={image} alt="已上传的画作"/>:<><div className="uploadGlyph">↥</div><strong>把画丢进来</strong><small>PNG / JPG / WEBP · 最大 20MB</small></>}<input type="file" accept="image/*" onChange={(e:ChangeEvent<HTMLInputElement>)=>loadFile(e.target.files?.[0])}/>
          </label><div className="filename"><span>{fileName}</span><b>{image?"READY":"EMPTY"}</b></div>
          <button className="extract" onClick={prepareAI} disabled={!image||!!runtime.current}><span>✦</span> {runtime.current?"智能画笔已就绪":"启动智能拆解"}</button>
          {progress>0&&<div className="modelProgress"><i style={{width:`${progress}%`}}/></div>}<p className="hint">{status}</p>
          <div className="localBadge">SAM · WebGPU/WASM <b>LOCAL</b></div>
        </aside>
        <div className="canvasPanel"><div className="panelTitle">浮游画布 <span>CLICK TO SEGMENT · DRAG TO COMPOSE</span></div>
          <div className="modeTabs"><button className={mode==="select"?"active":""} onClick={()=>setMode("select")}>智能选区</button><button className={mode==="compose"?"active":""} onClick={()=>setMode("compose")}>浮游编排 <b>{pieces.length}</b></button></div>
          <div className="canvas">
            {!image&&<div className="empty"><div className="specimen">?</div><strong>这里还很安静</strong><span>上传画作，把想象力放进来</span></div>}
            {image&&mode==="select"&&<div className="segmentWrap"><div className="segmentStage" onPointerDown={addPoint} onContextMenu={e=>e.preventDefault()}>
              <img ref={sourceImg} src={image} alt="待拆解画作"/><canvas ref={maskCanvas}/>{points.map((p,i)=><i key={i} className={p.label?"positive":"negative"} style={{left:`${p.position[0]*100}%`,top:`${p.position[1]*100}%`}}>{p.label?"+":"−"}</i>)}
            </div>{!runtime.current&&<div className="stageGuide"><b>先启动智能画笔</b><span>模型只需加载一次，之后点哪里就拆哪里</span></div>}</div>}
            {image&&mode==="compose"&&<>{!pieces.length&&<div className="empty"><div className="specimen">✂</div><strong>还没有透明元素</strong><span>回到智能选区，点击画中对象</span></div>}{pieces.map(p=><button key={p.id} aria-label={`元素 ${p.id}`} className={`piece cutout motion-${p.motion} ${selected===p.id?"selected":""}`} onPointerDown={e=>moveStart(e,p)} onPointerMove={move} onPointerUp={()=>drag.current=null} style={{left:`${p.x}%`,top:`${p.y}%`,width:`${p.w}%`,height:`${p.h}%`,animationDelay:`${p.delay}s`}}><img src={p.src} alt="提取元素"/></button>)}</>}
            <span className="canvasNote">∞ PLAYGROUND</span>
          </div>
          {image&&mode==="select"&&<div className="selectionBar"><div><button className={!excludeMode?"active":""} onClick={()=>setExcludeMode(false)}>＋ 保留笔</button><button className={excludeMode?"active":""} onClick={()=>setExcludeMode(true)}>− 排除笔</button></div><button onClick={clearSelection}>清除选点</button><button className="commit" onClick={commitMask} disabled={!hasMask}>提取为透明元素 ↗</button></div>}
        </div>
        <aside className="rightPanel"><div className="panelTitle">动作魔法 <span>MOTION</span></div><p>{selected?`已选中元素 ${pieces.findIndex(p=>p.id===selected)+1}`:"先选择一个元素"}</p><div className="motions">{motions.map(m=><button key={m.id} onClick={()=>setMotion(m.id)} disabled={!selected} className={pieces.find(p=>p.id===selected)?.motion===m.id?"active":""}><b>{m.icon}</b><span>{m.label}<small>{m.en}</small></span></button>)}</div><div className="pieceActions"><button onClick={()=>setMode("select")} disabled={!image}>＋ 再提取一个</button><button onClick={removeSelected} disabled={!selected}>删除元素</button><button onClick={undo} disabled={!history.current.length}>↶ 撤销一步</button><button onClick={exportSelectedPng} disabled={!selected}>下载 PNG</button></div><div className="speed"><span>速度</span><input type="range" min="1" max="5" defaultValue="3" aria-label="动画速度"/></div><div className="projectActions"><button onClick={saveProject} disabled={!image}>保存项目</button><button onClick={()=>projectInput.current?.click()}>打开项目</button><input ref={projectInput} type="file" accept=".json,.float.json" onChange={e=>loadProject(e.target.files?.[0])}/></div><button className="export" onClick={exportZip} disabled={!pieces.length}>导出完整 ZIP 项目 <span>↗</span></button><button className="htmlExport" onClick={download} disabled={!pieces.length}>导出单文件 HTML</button><small className="exportNote">ZIP 包含独立 PNG、CSS 与项目配置</small></aside>
      </div>
    </section><footer><span>浮游画室 / 让静止的灵感获得重力之外的自由</span><b>POWERED LOCALLY BY SEGMENT ANYTHING ✦</b></footer>
  </main>;
}
