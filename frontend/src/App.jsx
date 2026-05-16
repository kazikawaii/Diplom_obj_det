import { useEffect, useRef, useState } from "react";

// ─── Logo Icon ────────────────────────────────────────────────────────────────

function LogoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="logo-icon" aria-hidden="true">
      <path d="M2 8V2h6"    stroke="var(--neon)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 2h6v6"   stroke="var(--neon)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M20 14v6h-6" stroke="var(--neon)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 20H2v-6"  stroke="var(--neon)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="11" cy="11" r="3.2" fill="var(--neon)" className="logo-icon-dot"/>
      <circle cx="11" cy="11" r="1.4" fill="#0c0e09"/>
    </svg>
  );
}

// ─── Hero Canvas ──────────────────────────────────────────────────────────────

function HeroCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let frame = 0;

    const NEON   = "#b4f840";
    const BG     = "#0c0e09";
    const LABELS = ["car","person","bus","truck","bicycle","motorcycle","traffic light","dog","cat","van"];

    function rnd(a, b) { return a + Math.random() * (b - a); }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    class Box {
      constructor() { this.spawn(); this.age = rnd(0, 220); }

      spawn() {
        this.x     = rnd(0.05, 0.88);
        this.y     = rnd(0.18, 0.78);
        this.w     = rnd(0.06, 0.17);
        this.h     = this.w * rnd(0.65, 1.5);
        this.vx    = rnd(-0.00018, 0.00018);
        this.vy    = rnd(-0.00009, 0.00009);
        this.label = LABELS[Math.floor(rnd(0, LABELS.length))];
        this.conf  = Math.floor(rnd(73, 99));
        this.life  = rnd(170, 300);
        this.age   = 0;
      }

      alpha() {
        return Math.min(this.age / 20, 1) * Math.min((this.life - this.age) / 20, 1);
      }

      draw(W, H) {
        const a = this.alpha();
        if (a < 0.02) return;

        const bx = (this.x - this.w / 2) * W;
        const by = (this.y - this.h / 2) * H;
        const bw = this.w * W;
        const bh = this.h * H;
        const cs = Math.min(bw, bh) * 0.22;

        ctx.save();
        ctx.globalAlpha = a * 0.62;
        ctx.strokeStyle = NEON;
        ctx.shadowColor = NEON;
        ctx.shadowBlur  = 10;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([3, 7]);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.setLineDash([]);

        ctx.lineWidth   = 2.5;
        ctx.globalAlpha = a * 0.9;
        [[bx,by,1,1],[bx+bw,by,-1,1],[bx+bw,by+bh,-1,-1],[bx,by+bh,1,-1]].forEach(([cx,cy,dx,dy]) => {
          ctx.beginPath();
          ctx.moveTo(cx + dx * cs, cy);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx, cy + dy * cs);
          ctx.stroke();
        });

        ctx.shadowBlur = 0;
        ctx.font = "bold 10px 'Geist Mono', monospace";
        const text = `${this.label}  ${this.conf}%`;
        const tw   = ctx.measureText(text).width;
        const tagX = bx;
        const tagY = by - 22;

        ctx.globalAlpha = a * 0.88;
        ctx.fillStyle   = NEON;
        roundRect(tagX, tagY, tw + 14, 19, 3);
        ctx.fill();

        ctx.fillStyle   = BG;
        ctx.globalAlpha = a;
        ctx.fillText(text, tagX + 7, tagY + 13);
        ctx.restore();
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.age++;
        if (this.age > this.life) this.spawn();
      }
    }

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const boxes = Array.from({ length: 7 }, () => new Box());

    function render() {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (!W || !H) { animId = requestAnimationFrame(render); return; }

      ctx.clearRect(0, 0, W, H);

      const bg = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.5, W * 0.75);
      bg.addColorStop(0, "#101a0b");
      bg.addColorStop(1, BG);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.globalAlpha = 0.055;
      ctx.fillStyle   = NEON;
      for (let gx = 36; gx < W; gx += 36) {
        for (let gy = 36; gy < H; gy += 36) {
          ctx.beginPath();
          ctx.arc(gx, gy, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      const scanY = ((frame * 0.22) % (H + 60)) - 30;
      const sg = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
      sg.addColorStop(0,   "rgba(180,248,64,0)");
      sg.addColorStop(0.5, "rgba(180,248,64,0.06)");
      sg.addColorStop(1,   "rgba(180,248,64,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(0, scanY - 30, W, 60);

      boxes.forEach(b => { b.update(); b.draw(W, H); });
      frame++;
      animId = requestAnimationFrame(render);
    }

    render();
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="hero-canvas" />;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function NumStepper({ value, onChange, min = 320, max = 1920, step = 32 }) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  return (
    <div className="num-stepper">
      <button type="button" className="stepper-btn" onClick={dec} disabled={value <= min}>−</button>
      <span className="stepper-val">{value}</span>
      <button type="button" className="stepper-btn" onClick={inc} disabled={value >= max}>+</button>
    </div>
  );
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function getApiUrl() {
  const configured = import.meta.env.VITE_API_URL;
  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (configured && !isLocal && /:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(configured)) {
    return `${window.location.protocol}//${host}:8000`;
  }
  if (configured) return configured;
  return `${window.location.protocol}//${host}:8000`;
}

const API_URL = getApiUrl();
const FILE_KIND_IMAGE = "image";
const FILE_KIND_VIDEO  = "video";
const APK_URL = "/apk/app-debug.apk";
const APK_NAME = "app-debug.apk";
const APK_SIZE = "4.9 MB";

function getWsUrl(path) {
  const u = new URL(API_URL);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return `${u.origin}${path}`;
}

function getFileKind(f) {
  const mime = typeof f === "string" ? f : (f?.type ?? "");
  return mime.startsWith("video/") ? FILE_KIND_VIDEO : FILE_KIND_IMAGE;
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar({ activePage, setActivePage }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  function scrollToInference() {
    if (activePage !== "home") {
      setActivePage("home");
      setTimeout(() => {
        document.getElementById("inference")?.scrollIntoView({ behavior: "smooth" });
      }, 80);
    } else {
      document.getElementById("inference")?.scrollIntoView({ behavior: "smooth" });
    }
  }

  function goHome() {
    setActivePage("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const solid = scrolled || activePage === "streams" || activePage === "android";

  return (
    <nav className={`navbar${solid ? " navbar--solid" : ""}`}>
      <div className="navbar-inner">
        <button type="button" className="navbar-logo" onClick={goHome}>
          <LogoIcon />
          FarSight AI
        </button>

        <div className="navbar-center">
          <button type="button" className="nav-link" onClick={scrollToInference}>
            Инференс
          </button>
          <button
            type="button"
            className={`nav-link${activePage === "streams" ? " nav-link--active" : ""}`}
            onClick={() => setActivePage("streams")}
          >
            Трансляции
          </button>
          <button
            type="button"
            className={`nav-link${activePage === "android" ? " nav-link--active" : ""}`}
            onClick={() => setActivePage("android")}
          >
            Android
          </button>
        </div>

        <button type="button" className="nav-cta" onClick={scrollToInference}>
          Попробовать →
        </button>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function HeroSection() {
  function scrollToInference() {
    document.getElementById("inference")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section className="hero">
      <HeroCanvas />
      <div className="hero-overlay" />

      <div className="hero-content">
        <div className="hero-label">
          <span className="label-dot" />
          AI Object Detection
        </div>
        <h1 className="hero-heading">
          Детекция объектов.<br />
          <em>В реальном времени.</em>
        </h1>
        <p className="hero-desc">
          Загрузите фото или видео — мы найдём и разметим каждый объект.
        </p>
        <button type="button" className="btn-hero" onClick={scrollToInference}>
          Начать анализ →
        </button>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: "◆",
    title: "Детекция на изображениях",
    desc: "Загружайте JPEG и PNG — YOLO мгновенно находит объекты и возвращает размеченное изображение с точными координатами и уверенностью.",
  },
  {
    icon: "▶",
    title: "Анализ видеофайлов",
    desc: "Покадровый инференс, сводная статистика по классам и скачивание финального видео с нанесёнными боксами детекции.",
  },
  {
    icon: "⬡",
    title: "Live-трансляция",
    desc: "WebSocket Publisher / Viewer — захват с веб-камеры, обработка каждого кадра выбранной моделью, минимальная задержка.",
  },
];

function FeaturesSection() {
  const gridRef = useRef(null);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("revealed"); obs.disconnect(); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function scrollToInference() {
    document.getElementById("inference")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section className="features">
      <div className="container">
        <div className="section-tag">
          <span className="tag-dot" />
          ВОЗМОЖНОСТИ
        </div>

        <div className="features-header">
          <h2 className="features-heading">
            Детекция объектов,<br />
            рождённая для точности
          </h2>
          <button type="button" className="btn-outlined" onClick={scrollToInference}>
            Запустить
          </button>
        </div>

        <div ref={gridRef} className="features-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Inference Section ────────────────────────────────────────────────────────

function InferenceSection({
  models, selectedModel, setSelectedModel, loadingModels,
  file, setFile,
  settings, setSettings,
  objectQuery, setObjectQuery,
  predicting, error, result,
  handleSubmit,
  previewUrl, renderedSrc, downloadName, fileKind, resultKind,
}) {
  const fileInputRef = useRef(null);
  const [showResult, setShowResult] = useState(false);

  // сбросить на оригинал при новом файле
  useEffect(() => { setShowResult(false); }, [previewUrl]);

  // автоматически показать результат когда он пришёл
  useEffect(() => { if (result && renderedSrc) setShowResult(true); }, [result, renderedSrc]);

  const hasToggle  = Boolean(previewUrl && renderedSrc && !predicting);
  const activeSrc  = showResult && renderedSrc ? renderedSrc : previewUrl;
  const activeKind = showResult && renderedSrc ? resultKind : fileKind;

  return (
    <section id="inference" className="inference-section">
      <div className="scene-glow" aria-hidden="true" />
      <div className="container">
        <div className="section-tag section-tag--light">
          <span className="tag-dot tag-dot--neon" />
          ИНФЕРЕНС
        </div>
        <h2 className="inference-heading">Запустить распознавание</h2>

        <div className="inference-layout">
          {/* ── Controls ── */}
          <aside className="inference-controls">
            <form onSubmit={handleSubmit} className="controls-form">

              <div className="ctrl-field">
                <label className="ctrl-label">Модель</label>
                <select
                  className="ctrl-select"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={loadingModels || models.length === 0}
                >
                  {loadingModels
                    ? <option>Загрузка...</option>
                    : models.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.name} ({m.size_mb} MB)
                        </option>
                      ))}
                </select>
              </div>

              <div className="ctrl-field">
                <label className="ctrl-label">Файл</label>
                <div
                  className={`file-drop${file ? " file-drop--has-file" : ""}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) setFile(f);
                  }}
                >
                  <span className="file-drop-icon">{file ? "◆" : "↑"}</span>
                  <span>{file ? file.name : "Перетащите или нажмите"}</span>
                  {!file && <span className="ctrl-hint">Изображения и видео</span>}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  style={{ display: "none" }}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="ctrl-field">
                <label className="ctrl-label">Поиск объектов</label>
                <input
                  className="ctrl-input"
                  type="text"
                  placeholder="person, car, truck..."
                  value={objectQuery}
                  onChange={(e) => setObjectQuery(e.target.value)}
                />
                <span className="ctrl-hint">Фильтр по классам через запятую</span>
              </div>

              <div className="ctrl-field">
                <label className="ctrl-label">
                  Confidence <span className="ctrl-val">{settings.conf}</span>
                </label>
                <input
                  type="range" min="0.05" max="0.95" step="0.05"
                  value={settings.conf}
                  onChange={(e) => setSettings((s) => ({ ...s, conf: Number(e.target.value) }))}
                />
              </div>

              <div className="ctrl-field">
                <label className="ctrl-label">
                  IoU <span className="ctrl-val">{settings.iou}</span>
                </label>
                <input
                  type="range" min="0.05" max="0.95" step="0.05"
                  value={settings.iou}
                  onChange={(e) => setSettings((s) => ({ ...s, iou: Number(e.target.value) }))}
                />
              </div>

              <div className="ctrl-field">
                <label className="ctrl-label">Image Size</label>
                <NumStepper
                  value={settings.imgsz}
                  onChange={(v) => setSettings((s) => ({ ...s, imgsz: v }))}
                />
              </div>

              <button className="btn-run" type="submit" disabled={predicting}>
                {predicting ? "Анализируем..." : "Запустить"}
              </button>

              {error && <div className="error-msg">{error}</div>}
            </form>
          </aside>

          {/* ── Single viewer ── */}
          <div className="preview-main">
            <div className="preview-header">
              <span className="preview-label">
                {predicting ? "Обработка..." : showResult && renderedSrc ? "Результат" : previewUrl ? "Оригинал" : "Просмотр"}
              </span>

              {hasToggle && (
                <div className="toggle-group">
                  <button
                    type="button"
                    className={`toggle-seg${!showResult ? " active" : ""}`}
                    onClick={() => setShowResult(false)}
                  >
                    Оригинал
                  </button>
                  <button
                    type="button"
                    className={`toggle-seg${showResult ? " active" : ""}`}
                    onClick={() => setShowResult(true)}
                  >
                    Результат
                  </button>
                </div>
              )}

              {renderedSrc && !predicting && (
                <a className="btn-download" href={renderedSrc} download={downloadName}>
                  Скачать ↓
                </a>
              )}
            </div>

            {predicting ? (
              <div className="skeleton-screen">
                <span className="skeleton-label">Анализируем изображение...</span>
              </div>
            ) : activeSrc ? (
              <div className="preview-viewer">
                {activeKind === FILE_KIND_VIDEO
                  ? <video key={activeSrc} className="preview-img-fade" src={activeSrc} controls playsInline />
                  : <img key={activeSrc} className="preview-img-fade" src={activeSrc} alt="preview" />}
              </div>
            ) : (
              <div className="preview-viewer">
                <div className="preview-empty">
                  <span className="preview-empty-icon">↑</span>
                  Загрузите файл слева и нажмите Запустить
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Detections (below grid) ── */}
        {result && !predicting && (
          <div className="detections" style={{ marginTop: 20 }}>
            {result.extra?.query_applied && (
              <div className="query-info">
                <strong>Запрос:</strong>{" "}
                {result.extra.requested_classes?.join(", ") || "—"} ·{" "}
                <strong>Совпало:</strong>{" "}
                {result.extra.matched_classes?.length
                  ? result.extra.matched_classes.join(", ")
                  : "нет совпадений"}
              </div>
            )}

            <div className="detections-header">
              <span className="detections-count">{result.total_detections}</span>
              <span>объектов · {result.model}</span>
            </div>

            {result.detections.length > 0 ? (
              <div className="detections-grid">
                {result.detections.slice(0, 30).map((det, i) => (
                  <div key={i} className="det-chip">
                    <span className="det-name">{det.class_name}</span>
                    <span className="det-conf">{Math.round(det.confidence * 100)}%</span>
                    {typeof det.frame_index === "number" && (
                      <span className="det-frame">f{det.frame_index}</span>
                    )}
                  </div>
                ))}
                {result.detections.length > 30 && (
                  <div className="det-chip det-more">+{result.detections.length - 30}</div>
                )}
              </div>
            ) : (
              <div className="det-empty">
                {result.extra?.query_applied && !result.extra?.matched_classes?.length
                  ? "Класс не найден в выбранной модели"
                  : "Объекты не обнаружены"}
              </div>
            )}

            {result.media_type === FILE_KIND_VIDEO && result.extra && (
              <div className="video-stats">
                <strong>Кадров:</strong> {result.extra.frame_count ?? "?"} ·{" "}
                <strong>FPS:</strong> {result.extra.fps ?? "?"} ·{" "}
                <strong>Классы:</strong>{" "}
                {result.extra.class_totals && Object.keys(result.extra.class_totals).length
                  ? Object.entries(result.extra.class_totals).map(([k, v]) => `${k}: ${v}`).join(", ")
                  : "—"}
              </div>
            )}

            {result.extra?.available_classes?.length > 0 && (
              <div className="classes-wrap">
                {result.extra.available_classes.map((c) => (
                  <span key={c} className="class-tag">{c}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Streams Page ─────────────────────────────────────────────────────────────

function StreamsPage({
  models, selectedModel, setSelectedModel, loadingModels,
  settings, setSettings,
  objectQuery, setObjectQuery,
  streamSettings, setStreamSettings,
  viewerFrameUrl, viewerStatus, publisherStatus,
  sentFrames, receivedFrames, streamError,
  handleStartViewer, handleStartPublisher,
  stopPublisher, stopViewer,
  publisherVideoRef, canvasRef,
  viewerSocketRef, publisherSocketRef,
  buildViewerWsUrl, buildPublisherWsUrl,
}) {
  return (
    <main className="streams-page">
      <div className="scene-glow" aria-hidden="true" />
      <div className="streams-header">
        <div className="section-tag section-tag--light">
          <span className="tag-dot tag-dot--neon" />
          LIVE
        </div>
        <h1 className="streams-heading">Трансляции</h1>
        <p className="streams-desc">
          WebSocket Publisher / Viewer с детекцией объектов в реальном времени
        </p>
      </div>

      <div className="streams-layout">
        {/* ── Controls ── */}
        <aside className="streams-controls">
          <form onSubmit={handleStartViewer} className="controls-form">

            <div className="ctrl-field">
              <label className="ctrl-label">ID трансляции</label>
              <input
                className="ctrl-input"
                type="text"
                placeholder="main"
                value={streamSettings.streamId}
                onChange={(e) =>
                  setStreamSettings((s) => ({ ...s, streamId: e.target.value }))
                }
              />
              <span className="ctrl-hint">Publisher и Viewer должны совпадать</span>
            </div>

            <div className="ctrl-field">
              <label className="ctrl-label">Модель</label>
              <select
                className="ctrl-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={loadingModels || models.length === 0}
              >
                {models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} ({m.size_mb} MB)
                  </option>
                ))}
              </select>
            </div>

            <div className="ctrl-field">
              <label className="ctrl-label">Поиск объектов</label>
              <input
                className="ctrl-input"
                type="text"
                placeholder="person, car..."
                value={objectQuery}
                onChange={(e) => setObjectQuery(e.target.value)}
              />
            </div>

            <div className="ctrl-field">
              <label className="ctrl-label">
                Confidence <span className="ctrl-val">{settings.conf}</span>
              </label>
              <input
                type="range" min="0.05" max="0.95" step="0.05"
                value={settings.conf}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, conf: Number(e.target.value) }))
                }
              />
            </div>

            <div className="ctrl-field">
              <label className="ctrl-label">
                IoU <span className="ctrl-val">{settings.iou}</span>
              </label>
              <input
                type="range" min="0.05" max="0.95" step="0.05"
                value={settings.iou}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, iou: Number(e.target.value) }))
                }
              />
            </div>

            <div className="ctrl-field">
              <label className="ctrl-label">Image Size</label>
              <NumStepper
                value={settings.imgsz}
                onChange={(v) => setSettings((s) => ({ ...s, imgsz: v }))}
              />
            </div>

            <div className="ctrl-field">
              <label className="ctrl-label">
                FPS отправки <span className="ctrl-val">{streamSettings.maxFps}</span>
              </label>
              <input
                type="range" min="1" max="15" step="1"
                value={streamSettings.maxFps}
                onChange={(e) =>
                  setStreamSettings((s) => ({ ...s, maxFps: Number(e.target.value) }))
                }
              />
            </div>

            <button className="btn-run" type="submit">
              Подключить просмотр
            </button>
            <button
              className="btn-secondary"
              type="button"
              onClick={handleStartPublisher}
            >
              Отправлять с камеры
            </button>
            <button
              className="btn-danger"
              type="button"
              onClick={() => { stopPublisher(); stopViewer(); }}
              disabled={!publisherSocketRef.current && !viewerSocketRef.current}
            >
              Остановить
            </button>

            {streamError && <div className="stream-error">{streamError}</div>}
          </form>
        </aside>

        {/* ── Viewer ── */}
        <div className="streams-viewer">
          <div className="viewer-header">
            <span>Просмотр</span>
            <span className="viewer-status">
              {viewerStatus} · {receivedFrames} кадров
            </span>
          </div>
          <div className="viewer-screen">
            {viewerFrameUrl
              ? <img src={viewerFrameUrl} alt="WebSocket трансляция" />
              : <div className="viewer-empty">Нет сигнала — подключите viewer</div>}
          </div>
        </div>

        {/* ── Publisher ── */}
        <div className="streams-publisher">
          <div className="viewer-header">
            <span>Камера</span>
            <span className="viewer-status">
              {publisherStatus} · {sentFrames} кадров
            </span>
          </div>
          <div className="viewer-screen">
            <video ref={publisherVideoRef} muted playsInline autoPlay />
            <canvas ref={canvasRef} hidden />
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Android Install Page ────────────────────────────────────────────────────

function AndroidInstallPage() {
  return (
    <main className="android-page">
      <div className="scene-glow" aria-hidden="true" />
      <section className="android-hero">
        <div className="section-tag section-tag--light">
          <span className="tag-dot tag-dot--neon" />
          ANDROID
        </div>
        <div className="android-hero-grid">
          <div>
            <h1 className="android-heading">Установка мобильного клиента</h1>
            <p className="android-desc">
              Скачайте APK-файл на Android-устройство, откройте его и
              подтвердите установку из браузера или файлового менеджера.
            </p>
          </div>

          <div className="android-card">
            <div className="apk-mark" aria-hidden="true">APK</div>
            <span className="android-card-kicker">Файл готов</span>
            <h2>{APK_NAME}</h2>
            <p>{APK_SIZE} · Android package archive</p>
            <a className="btn-run android-download" href={APK_URL} download={APK_NAME}>
              Скачать APK
            </a>
          </div>
        </div>
      </section>

      <section className="android-steps">
        <article className="android-step">
          <span>1</span>
          <h3>Откройте страницу на телефоне</h3>
          <p>Перейдите на этот сайт с Android-устройства или отправьте ссылку себе.</p>
        </article>
        <article className="android-step">
          <span>2</span>
          <h3>Скачайте APK</h3>
          <p>Нажмите кнопку скачивания и дождитесь окончания загрузки файла.</p>
        </article>
        <article className="android-step">
          <span>3</span>
          <h3>Разрешите установку</h3>
          <p>Если Android попросит разрешение для источника, включите его и завершите установку.</p>
        </article>
      </section>
    </main>
  );
}

// ─── App (state + logic) ──────────────────────────────────────────────────────

function App() {
  const viewerSocketRef    = useRef(null);
  const publisherSocketRef = useRef(null);
  const cameraStreamRef    = useRef(null);
  const captureTimerRef    = useRef(null);
  const canvasRef          = useRef(null);
  const publisherVideoRef  = useRef(null);
  const viewerFrameUrlRef  = useRef("");

  const [activePage, setActivePage] = useState("home");

  const [models, setModels]         = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [loadingModels, setLoadingModels] = useState(true);

  const [file, setFile]             = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult]         = useState(null);
  const [predicting, setPredicting] = useState(false);
  const [error, setError]           = useState("");
  const [settings, setSettings]     = useState({ conf: 0.25, iou: 0.45, imgsz: 960 });
  const [objectQuery, setObjectQuery] = useState("");

  const [streamSettings, setStreamSettings] = useState({ streamId: "main", maxFps: 8 });
  const [viewerFrameUrl, setViewerFrameUrl] = useState("");
  const [viewerStatus, setViewerStatus]     = useState("Отключено");
  const [publisherStatus, setPublisherStatus] = useState("Отключено");
  const [sentFrames, setSentFrames]         = useState(0);
  const [receivedFrames, setReceivedFrames] = useState(0);
  const [streamError, setStreamError]       = useState("");

  const fileKind   = file ? getFileKind(file) : FILE_KIND_IMAGE;
  const resultKind = result?.media_type ?? FILE_KIND_IMAGE;
  const renderedSrc = result?.rendered_media && result?.rendered_mime_type
    ? `data:${result.rendered_mime_type};base64,${result.rendered_media}`
    : "";
  const downloadName = result
    ? `farsight-${selectedModel.replace(/\.[^.]+$/, "")}.${result.media_type === FILE_KIND_VIDEO ? "mp4" : "jpg"}`
    : "prediction";

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingModels(true);
      setError("");
      try {
        const res = await fetch(`${API_URL}/api/models`);
        if (!res.ok) throw new Error("Не удалось получить список моделей");
        const data = await res.json();
        if (mounted) { setModels(data); setSelectedModel(data[0]?.name ?? ""); }
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoadingModels(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!file) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    return () => {
      stopPublisher();
      stopViewer();
      if (viewerFrameUrlRef.current) URL.revokeObjectURL(viewerFrameUrlRef.current);
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file || !selectedModel) { setError("Выберите модель и файл"); return; }
    const form = new FormData();
    form.append("file", file);
    form.append("model_name", selectedModel);
    form.append("conf", String(settings.conf));
    form.append("iou", String(settings.iou));
    form.append("imgsz", String(settings.imgsz));
    form.append("object_query", objectQuery);
    setPredicting(true); setError(""); setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/predict`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Ошибка инференса");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setPredicting(false);
    }
  }

  function buildViewerWsUrl() {
    const id = encodeURIComponent(streamSettings.streamId.trim());
    return getWsUrl(`/ws/streams/${id}/view`);
  }

  function buildPublisherWsUrl() {
    const id = encodeURIComponent(streamSettings.streamId.trim());
    const p = new URLSearchParams({
      model_name: selectedModel,
      conf: String(settings.conf),
      iou: String(settings.iou),
      imgsz: String(settings.imgsz),
      object_query: objectQuery,
    });
    return getWsUrl(`/ws/streams/${id}/publish?${p}`);
  }

  function handleStartViewer(e) {
    e.preventDefault();
    if (!streamSettings.streamId.trim()) { setStreamError("Укажите ID трансляции"); return; }
    stopViewer(); setStreamError(""); setReceivedFrames(0);
    const ws = new WebSocket(buildViewerWsUrl());
    ws.binaryType = "blob";
    viewerSocketRef.current = ws;
    ws.onopen  = () => setViewerStatus("Подключено");
    ws.onmessage = (msg) => {
      if (msg.data instanceof Blob) {
        const url = URL.createObjectURL(msg.data);
        if (viewerFrameUrlRef.current) URL.revokeObjectURL(viewerFrameUrlRef.current);
        viewerFrameUrlRef.current = url;
        setViewerFrameUrl(url);
        setReceivedFrames((n) => n + 1);
        return;
      }
      try {
        const d = JSON.parse(msg.data);
        if (d?.message) setViewerStatus(d.message);
      } catch { setViewerStatus("Подключено"); }
    };
    ws.onerror = () => setStreamError("Ошибка WebSocket. Проверьте backend.");
    ws.onclose = () => {
      if (viewerSocketRef.current === ws) {
        viewerSocketRef.current = null;
        setViewerStatus("Отключено");
      }
    };
  }

  function stopViewer() {
    if (viewerSocketRef.current) { viewerSocketRef.current.close(); viewerSocketRef.current = null; }
    setViewerStatus("Отключено");
  }

  async function handleStartPublisher(e) {
    e.preventDefault();
    if (!streamSettings.streamId.trim()) { setStreamError("Укажите ID трансляции"); return; }
    if (!selectedModel) { setStreamError("Выберите модель"); return; }
    stopPublisher(); setStreamError(""); setSentFrames(0);
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      cameraStreamRef.current = cam;
      if (publisherVideoRef.current) {
        publisherVideoRef.current.srcObject = cam;
        await publisherVideoRef.current.play();
      }
      const ws = new WebSocket(buildPublisherWsUrl());
      publisherSocketRef.current = ws;
      ws.onopen  = () => { setPublisherStatus("Подключено"); startFrameCapture(ws); };
      ws.onmessage = (msg) => {
        try {
          const d = JSON.parse(msg.data);
          if (d?.type === "ack") setSentFrames(d.frame_index ?? 0);
        } catch {}
      };
      ws.onerror = () => setStreamError("Ошибка WebSocket Publisher.");
      ws.onclose = () => {
        if (publisherSocketRef.current === ws) {
          publisherSocketRef.current = null;
          setPublisherStatus("Отключено");
          stopCaptureTimer();
        }
      };
    } catch (err) {
      setStreamError(err?.message ?? "Нет доступа к камере.");
      stopPublisher();
    }
  }

  function startFrameCapture(ws) {
    stopCaptureTimer();
    const ms = Math.max(1000 / streamSettings.maxFps, 33);
    captureTimerRef.current = window.setInterval(() => {
      const video = publisherVideoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || ws.readyState !== WebSocket.OPEN) return;
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;
      if (!w || !h) return;
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(video, 0, 0, w, h);
      canvas.toBlob(
        (blob) => { if (blob && ws.readyState === WebSocket.OPEN) ws.send(blob); },
        "image/jpeg", 0.82
      );
    }, ms);
  }

  function stopCaptureTimer() {
    if (captureTimerRef.current) { window.clearInterval(captureTimerRef.current); captureTimerRef.current = null; }
  }

  function stopPublisher() {
    stopCaptureTimer();
    if (publisherSocketRef.current) { publisherSocketRef.current.close(); publisherSocketRef.current = null; }
    if (cameraStreamRef.current) { cameraStreamRef.current.getTracks().forEach((t) => t.stop()); cameraStreamRef.current = null; }
    if (publisherVideoRef.current) publisherVideoRef.current.srcObject = null;
    setPublisherStatus("Отключено");
  }

  const sharedProps = { models, selectedModel, setSelectedModel, loadingModels, settings, setSettings, objectQuery, setObjectQuery };

  return (
    <>
      <Navbar activePage={activePage} setActivePage={setActivePage} />

      {activePage === "home" ? (
        <>
          <HeroSection />
          <FeaturesSection />
          <InferenceSection
            {...sharedProps}
            file={file}
            setFile={(f) => { setFile(f); setResult(null); setError(""); }}
            predicting={predicting}
            error={error}
            result={result}
            handleSubmit={handleSubmit}
            previewUrl={previewUrl}
            renderedSrc={renderedSrc}
            downloadName={downloadName}
            fileKind={fileKind}
            resultKind={resultKind}
          />
        </>
      ) : activePage === "streams" ? (
        <StreamsPage
          {...sharedProps}
          streamSettings={streamSettings}
          setStreamSettings={setStreamSettings}
          viewerFrameUrl={viewerFrameUrl}
          viewerStatus={viewerStatus}
          publisherStatus={publisherStatus}
          sentFrames={sentFrames}
          receivedFrames={receivedFrames}
          streamError={streamError}
          handleStartViewer={handleStartViewer}
          handleStartPublisher={handleStartPublisher}
          stopPublisher={stopPublisher}
          stopViewer={stopViewer}
          publisherVideoRef={publisherVideoRef}
          canvasRef={canvasRef}
          viewerSocketRef={viewerSocketRef}
          publisherSocketRef={publisherSocketRef}
          buildViewerWsUrl={buildViewerWsUrl}
          buildPublisherWsUrl={buildPublisherWsUrl}
        />
      ) : (
        <AndroidInstallPage />
      )}
    </>
  );
}

export default App;
