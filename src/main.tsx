import React, { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import {
  BadgeCheck,
  Download,
  FileDown,
  FileVideo,
  FolderOpen,
  Gauge,
  Loader2,
  Maximize2,
  Play,
  Save,
  ScissorsLineDashed,
  Share2,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
  X
} from "lucide-react";
import "./styles.css";

type Meta = {
  width: number;
  height: number;
  duration: number;
};

type SaveMode = "download" | "picker" | "folder";

type SavePlan = {
  mode: SaveMode;
  handle?: FileSystemFileHandle;
  directory?: FileSystemDirectoryHandle;
};

declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
    showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
  }
}

const ACCEPTED_EXTENSIONS = [".mp4", ".mov", ".wmv", ".m4v", ".webm", ".avi", ".mkv"];
const ffmpeg = new FFmpeg();

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 MB";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function getBaseName(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
}

function getExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot > 0 ? fileName.slice(lastDot).toLowerCase() : ".mp4";
}

function even(value: number) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function getVideoMeta(file: File): Promise<Meta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const meta = {
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        duration: video.duration || 0
      };
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The browser could not read this video's metadata. Try compressing anyway."));
    };
    video.src = url;
  });
}

async function loadFfmpeg(setStatus: (value: string) => void) {
  if (ffmpeg.loaded) {
    return;
  }

  setStatus("Loading local video tools");
  const baseURL = `${import.meta.env.BASE_URL}ffmpeg`;

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm")
  });
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaWarning, setMetaWarning] = useState("");
  const [scale, setScale] = useState(60);
  const [quality, setQuality] = useState(28);
  const [targetSize, setTargetSize] = useState(0);
  const [useTargetSize, setUseTargetSize] = useState(false);
  const [outputName, setOutputName] = useState("");
  const [savePlan, setSavePlan] = useState<SavePlan>({ mode: "download" });
  const [isDragging, setIsDragging] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    name: string;
    size: number;
    blob: Blob;
    url: string;
    destination: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);

  const canPickSaveFile = typeof window.showSaveFilePicker === "function";
  const canPickFolder = typeof window.showDirectoryPicker === "function";

  const outputDimensions = useMemo(() => {
    if (!meta?.width || !meta?.height) {
      return null;
    }

    return {
      width: even((meta.width * scale) / 100),
      height: even((meta.height * scale) / 100)
    };
  }, [meta, scale]);

  const estimatedReduction = useMemo(() => {
    if (!file || !outputDimensions || !meta) {
      return "Choose a video to estimate output.";
    }

    const pixelRatio = (outputDimensions.width * outputDimensions.height) / (meta.width * meta.height);
    const qualityRatio = Math.max(0.18, (44 - quality) / 28);
    const roughSize = file.size * pixelRatio * qualityRatio;
    return `Estimated ${formatBytes(roughSize)} before audio and codec variance.`;
  }, [file, meta, outputDimensions, quality]);

  useEffect(() => {
    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    window.addEventListener("beforeinstallprompt", handleInstall);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    }

    return () => window.removeEventListener("beforeinstallprompt", handleInstall);
  }, []);

  useEffect(() => {
    if (!file) {
      return;
    }

    setMeta(null);
    setMetaWarning("");
    setOutputName(`${getBaseName(file.name)}_smol.mp4`);
    setTargetSize(Math.max(1, Math.floor(file.size / 1024 / 1024 / 2)));
    setResult(null);
    setError("");

    getVideoMeta(file)
      .then(setMeta)
      .catch((err: Error) => {
        setMetaWarning(err.message);
        setMeta({ width: 1280, height: 720, duration: 0 });
      });
  }, [file]);

  useEffect(() => {
    const url = result?.url;
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [result?.url]);

  const chooseFile = (selected: File | null) => {
    if (!selected) {
      return;
    }

    const extension = getExtension(selected.name);
    if (!ACCEPTED_EXTENSIONS.includes(extension) && !selected.type.startsWith("video/")) {
      setError("That does not look like a supported video file.");
      return;
    }

    setFile(selected);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    chooseFile(event.dataTransfer.files[0] ?? null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    chooseFile(event.target.files?.[0] ?? null);
  };

  const chooseOutputFile = async () => {
    if (!canPickSaveFile) {
      setError("Your browser does not support save pickers. The app will download the finished video instead.");
      return;
    }

    try {
      const handle = await window.showSaveFilePicker?.({
        suggestedName: outputName || "video_smol.mp4",
        types: [
          {
            description: "MP4 video",
            accept: { "video/mp4": [".mp4"] }
          }
        ]
      });

      if (handle) {
        setSavePlan({ mode: "picker", handle });
        setError("");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Could not open the save picker.");
      }
    }
  };

  const chooseOutputFolder = async () => {
    if (!canPickFolder) {
      setError("Your browser does not support folder access. The app will download the finished video instead.");
      return;
    }

    try {
      const directory = await window.showDirectoryPicker?.({ mode: "readwrite" });
      if (directory) {
        setSavePlan({ mode: "folder", directory });
        setError("");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Could not open the folder picker.");
      }
    }
  };

  const installApp = async () => {
    const prompt = installPrompt as Event & { prompt?: () => Promise<void> };
    if (prompt.prompt) {
      await prompt.prompt();
      setInstallPrompt(null);
    }
  };

  const saveBlob = async (blob: Blob, name: string) => {
    if (savePlan.mode === "picker" && savePlan.handle) {
      const writable = await savePlan.handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }

    if (savePlan.mode === "folder" && savePlan.directory) {
      const fileHandle = await savePlan.directory.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const shareBlob = async (blob: Blob, name: string) => {
    if (!navigator.share) {
      setError("This browser does not support mobile sharing. Use Download instead.");
      return;
    }

    const shareFile = new File([blob], name, { type: "video/mp4" });
    const canShareFile = !navigator.canShare || navigator.canShare({ files: [shareFile] });

    if (!canShareFile) {
      setError("This browser cannot share video files from a web app. Use Download instead.");
      return;
    }

    try {
      await navigator.share({
        title: "smol video",
        files: [shareFile]
      });
      setError("");
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Sharing failed. The video is still ready to download.");
      }
    }
  };

  const openResult = () => {
    if (!result?.url) {
      return;
    }

    const opened = window.open(result.url, "_blank", "noopener,noreferrer");
    if (!opened) {
      setError("The browser blocked opening the video. Use Download or Share instead.");
    }
  };

  const getDestinationLabel = () => {
    if (savePlan.mode === "folder") {
      return "selected folder";
    }

    if (savePlan.mode === "picker") {
      return "chosen file";
    }

    return "downloads";
  };

  const makeSmol = async () => {
    if (!file || !outputDimensions) {
      setError("Choose a video before compressing.");
      return;
    }

    setIsWorking(true);
    setError("");
    setResult(null);
    setProgress(0);

    const inputName = `input${getExtension(file.name)}`;
    const safeOutputName = outputName.trim().endsWith(".mp4")
      ? outputName.trim()
      : `${outputName.trim() || `${getBaseName(file.name)}_smol`}.mp4`;
    const tempOutputName = "output.mp4";

    try {
      await loadFfmpeg(setStatus);

      ffmpeg.on("progress", ({ progress: nextProgress }) => {
        setProgress(Math.max(0, Math.min(100, Math.round(nextProgress * 100))));
      });

      setStatus("Reading video");
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      const args = [
        "-i",
        inputName,
        "-vf",
        `scale=${outputDimensions.width}:${outputDimensions.height}:flags=lanczos`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        "128k"
      ];

      if (useTargetSize && targetSize > 0 && meta?.duration) {
        const totalBits = targetSize * 1024 * 1024 * 8;
        const audioBitsPerSecond = 128000;
        const videoBitrate = Math.max(120000, Math.floor(totalBits / meta.duration - audioBitsPerSecond));
        args.push("-b:v", `${Math.floor(videoBitrate / 1000)}k`, "-maxrate", `${Math.floor(videoBitrate / 850)}k`, "-bufsize", `${Math.floor(videoBitrate / 500)}k`);
      } else {
        args.push("-crf", String(quality));
      }

      args.push(tempOutputName);
      setStatus("Making it smol");
      await ffmpeg.exec(args);

      setStatus("Preparing save");
      const data = await ffmpeg.readFile(tempOutputName);
      const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
      const arrayBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(arrayBuffer).set(bytes);
      const blob = new Blob([arrayBuffer], { type: "video/mp4" });

      await saveBlob(blob, safeOutputName);
      setResult({
        name: safeOutputName,
        size: blob.size,
        blob,
        url: URL.createObjectURL(blob),
        destination: getDestinationLabel()
      });
      setStatus("Done");

      await ffmpeg.deleteFile(inputName).catch(() => undefined);
      await ffmpeg.deleteFile(tempOutputName).catch(() => undefined);
    } catch (err) {
      setError((err as Error).message || "Compression failed.");
      setStatus("Stopped");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <main className="app">
      <section className="hero">
        <div className="hero__copy">
          <div className="eyebrow">
            <ScissorsLineDashed size={18} />
            local-first video shrinking
          </div>
          <h1>smol video</h1>
          <p>
            Drop in a chunky clip, reduce the dimensions or target size, and export a lighter MP4 without uploading the
            original anywhere.
          </p>
        </div>
        <div className="hero__actions">
          {installPrompt ? (
            <button className="button button--dark" onClick={installApp} type="button">
              <Download size={18} />
              Install app
            </button>
          ) : (
            <span className="install-note">
              <BadgeCheck size={18} />
              PWA ready
            </span>
          )}
        </div>
      </section>

      <section className="workspace">
        <label
          className={`dropzone ${isDragging ? "dropzone--active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.wmv,.mov,.mp4,.m4v,.avi,.mkv,.webm"
            onChange={handleFileChange}
          />
          <UploadCloud size={42} />
          <span>{file ? file.name : "Drop a video here"}</span>
          <strong>Select video</strong>
          <small>MP4, MOV, WMV, phone clips and other FFmpeg-readable formats</small>
        </label>

        <div className="panel">
          <div className="panel__header">
            <FileVideo size={20} />
            <h2>Input</h2>
          </div>
          {file ? (
            <div className="stats">
              <div>
                <span>File size</span>
                <strong>{formatBytes(file.size)}</strong>
              </div>
              <div>
                <span>Dimensions</span>
                <strong>{meta ? `${meta.width} x ${meta.height}` : "Reading..."}</strong>
              </div>
              <div>
                <span>Duration</span>
                <strong>{meta?.duration ? `${Math.round(meta.duration)}s` : "Unknown"}</strong>
              </div>
            </div>
          ) : (
            <p className="muted">Pick a source video to unlock the output controls.</p>
          )}
          {metaWarning ? <p className="warning">{metaWarning}</p> : null}
        </div>

        <div className="panel controls">
          <div className="panel__header">
            <SlidersHorizontal size={20} />
            <h2>Smol settings</h2>
          </div>

          <label className="control">
            <span>
              <Maximize2 size={18} />
              Dimensions
            </span>
            <strong>{outputDimensions ? `${outputDimensions.width} x ${outputDimensions.height}` : `${scale}%`}</strong>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={scale}
              disabled={!file || isWorking}
              onChange={(event) => setScale(Number(event.target.value))}
            />
          </label>

          <label className="control">
            <span>
              <Gauge size={18} />
              Quality
            </span>
            <strong>{quality <= 22 ? "Crisper" : quality >= 34 ? "Tiny" : "Balanced"}</strong>
            <input
              type="range"
              min="18"
              max="40"
              step="1"
              value={quality}
              disabled={!file || isWorking || useTargetSize}
              onChange={(event) => setQuality(Number(event.target.value))}
            />
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={useTargetSize}
              disabled={!file || isWorking}
              onChange={(event) => setUseTargetSize(event.target.checked)}
            />
            <span>Target a file size instead of quality</span>
          </label>

          {useTargetSize ? (
            <label className="control">
              <span>
                <FileDown size={18} />
                Target size
              </span>
              <strong>{targetSize} MB</strong>
              <input
                type="range"
                min="1"
                max={Math.max(2, file ? Math.ceil(file.size / 1024 / 1024) : 100)}
                step="1"
                value={targetSize}
                disabled={!file || isWorking}
                onChange={(event) => setTargetSize(Number(event.target.value))}
              />
            </label>
          ) : null}

          <p className="estimate">{estimatedReduction}</p>
        </div>

        <div className="panel output">
          <div className="panel__header">
            <Save size={20} />
            <h2>Output</h2>
          </div>

          <label className="text-field">
            File name
            <input
              value={outputName}
              disabled={!file || isWorking}
              onChange={(event) => setOutputName(event.target.value)}
              placeholder="video_smol.mp4"
            />
          </label>

          <div className="save-grid">
            <button
              type="button"
              className={`save-card ${savePlan.mode === "download" ? "save-card--selected" : ""}`}
              onClick={() => setSavePlan({ mode: "download" })}
              disabled={isWorking}
            >
              <Download size={20} />
              <span>Download</span>
            </button>
            <button type="button" className="save-card" onClick={chooseOutputFile} disabled={!file || isWorking}>
              <Save size={20} />
              <span>Save as</span>
            </button>
            <button type="button" className="save-card" onClick={chooseOutputFolder} disabled={!file || isWorking}>
              <FolderOpen size={20} />
              <span>Folder</span>
            </button>
          </div>

          <button className="button button--primary" disabled={!file || isWorking} type="button" onClick={makeSmol}>
            {isWorking ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
            {isWorking ? status || "Working" : "Make it smol"}
          </button>

          {isWorking ? (
            <div className="progress" aria-label="Compression progress">
              <span style={{ width: `${progress}%` }} />
            </div>
          ) : null}

          {result ? (
            <div className="result">
              <p className="success">
                <Sparkles size={18} />
                Saved {result.name} at {formatBytes(result.size)} to {result.destination}.
              </p>
              <div className="result__actions">
                <button className="button button--secondary" type="button" onClick={openResult}>
                  <Play size={18} />
                  Open video
                </button>
                <button className="button button--secondary" type="button" onClick={() => shareBlob(result.blob, result.name)}>
                  <Share2 size={18} />
                  Share video
                </button>
              </div>
              <p className="result__note">
                PWAs cannot open the containing folder in the system file manager. Use Folder before encoding where
                supported, or open/share the finished video here.
              </p>
            </div>
          ) : null}
          {error ? (
            <p className="error">
              <X size={18} />
              {error}
            </p>
          ) : null}
        </div>
      </section>

      <section className="limits">
        <h2>Browser and codec limits</h2>
        <p>
          A web app cannot silently write beside the original file because browsers hide local paths. In Chromium-based
          browsers you can pick a save file or output folder; elsewhere the app downloads the result with the
          <code>_smol</code> name.
        </p>
        <p>
          Common phone videos usually work, including MP4 and MOV files using H.264, HEVC/H.265, or AAC audio when the
          bundled FFmpeg build can decode them. Output is normalized to MP4 with H.264 video and AAC audio for broad
          playback support.
        </p>
        <p>
          On phones, the most reliable export path is usually Download or Share. Exact save-location picking is mainly a
          desktop Chromium feature, so iOS and many Android browsers will not offer same-folder saving.
        </p>
        <p>
          Very large files can be slow or run out of memory in WebAssembly. Some unusual, proprietary, or DRM-protected
          codecs may fail, and unsupported MOV or WMV clips may not preview in every browser before conversion.
        </p>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
