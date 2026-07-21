# 浮游画室

一个把数字画作拆成透明、可拖动、可动画网页图层的创意工具。

## 功能

- 浏览器本地运行 SlimSAM 智能分割，原图无需上传服务器
- 正选点与负选点精修对象边界
- 多透明图层拖拽编排与四种动画
- 保存和恢复 `.float.json` 项目
- 导出单独 PNG、单文件 HTML 或完整 ZIP 网页项目
- Windows 桌面版与网页版

## 本地开发

```bash
npm install
npm run dev
```

Windows PowerShell 可直接运行：

```powershell
$env:WRANGLER_LOG_PATH='.wrangler/wrangler.log'
npm exec vinext dev
```

## 构建

```bash
npm run build
npm run desktop:dist
```

桌面版内置完整工作台，可离线打开、编排和导出；首次使用智能拆解时需要联网下载模型，模型缓存后可重复使用。

## 开源组件

- Transformers.js（Apache-2.0）
- SlimSAM / Segment Anything（Apache-2.0）
- JSZip（MIT）
- Electron（MIT）

项目源代码采用 MIT License。
