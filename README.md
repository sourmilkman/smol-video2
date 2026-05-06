# smol video

An installable PWA for making video files smaller directly in the browser. Drop or select a video, choose smaller dimensions and either a quality level or target file size, then export a compressed MP4.

## Features

- Drag-and-drop or file picker input for common video containers such as MP4, MOV, WMV, AVI, MKV, and WebM.
- Local FFmpeg/WebAssembly transcoding; the source video is not uploaded.
- Dimension slider, quality slider, and optional target-size mode.
- Output filename editing with the default `_smol` suffix.
- Save picker and folder picker support in compatible Chromium browsers, with regular browser download fallback.
- Open the finished MP4 in a new tab after encoding.
- Mobile-friendly sharing for finished videos when the browser supports file sharing through the Web Share API.
- Installable PWA shell with offline app assets after first load.

## Browser and codec limitations

Browsers do not expose the original local file path to web apps. That means a PWA cannot silently save the new video beside the original file by default. In Chromium-based browsers, users can choose a file or folder through the File System Access API. In other browsers, the app downloads the output using the `_smol` filename.

Common phone videos usually work, including MP4 and MOV files using H.264, HEVC/H.265, or AAC audio when the bundled FFmpeg build can decode them. Output is normalized to MP4 with H.264 video and AAC audio for broad playback support.

On phones, the most reliable export path is usually Download or Share. Exact save-location picking is mainly a desktop Chromium feature, so iOS and many Android browsers will not offer same-folder saving.

PWAs cannot open the containing folder in the system file manager after encoding. If folder output is supported, choose the folder before encoding; otherwise use Download, Open video, or Share.

Large videos can be slow or memory-heavy because FFmpeg is running inside WebAssembly. Some unusual, proprietary, or DRM-protected codecs may fail, and unsupported MOV or WMV clips may not preview in every browser before conversion.

## Run locally

```bash
npm install
npm run dev
```

The FFmpeg WebAssembly files are copied into `public/ffmpeg` during `npm install`.

## Build

```bash
npm run build
```
<<<<<<< HEAD
=======

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow that builds and deploys the app from `main`.

In the GitHub repo settings, set Pages to **Source: GitHub Actions**. After that, every push to `main` will publish the app to:

```text
https://sourmilkman.github.io/smol-video2/
```
>>>>>>> 509dade (Initial smol video PWA)
