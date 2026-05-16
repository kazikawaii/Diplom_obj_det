import { useEffect, useRef, useState } from "react";

function getApiUrl() {
    const configuredUrl = import.meta.env.VITE_API_URL;
    const pageHost = window.location.hostname;
    const isLocalPage = pageHost === "localhost" || pageHost === "127.0.0.1";

    if (
        configuredUrl &&
        !isLocalPage &&
        /:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(configuredUrl)
    ) {
        return `${window.location.protocol}//${pageHost}:8000`;
    }

    if (configuredUrl) {
        return configuredUrl;
    }

    return `${window.location.protocol}//${pageHost}:8000`;
}

const API_URL = getApiUrl();
const FILE_KIND_IMAGE = "image";
const FILE_KIND_VIDEO = "video";
const APK_URL = "/apk/app-debug.apk";
const APK_NAME = "app-debug.apk";
const APK_SIZE = "4.9 MB";

function getWsUrl(path) {
    const apiUrl = new URL(API_URL);
    apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
    return `${apiUrl.origin}${path}`;
}

function getFileKind(fileOrType) {
    const mimeType =
        typeof fileOrType === "string" ? fileOrType : (fileOrType?.type ?? "");

    if (mimeType.startsWith("video/")) {
        return FILE_KIND_VIDEO;
    }

    return FILE_KIND_IMAGE;
}

function App() {
    const viewerSocketRef = useRef(null);
    const publisherSocketRef = useRef(null);
    const cameraStreamRef = useRef(null);
    const captureTimerRef = useRef(null);
    const canvasRef = useRef(null);
    const publisherVideoRef = useRef(null);
    const viewerFrameUrlRef = useRef("");
    const [activePage, setActivePage] = useState("predict");
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState("");
    const [file, setFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState("");
    const [result, setResult] = useState(null);
    const [loadingModels, setLoadingModels] = useState(true);
    const [predicting, setPredicting] = useState(false);
    const [error, setError] = useState("");
    const [settings, setSettings] = useState({
        conf: 0.25,
        iou: 0.45,
        imgsz: 960,
    });
    const [objectQuery, setObjectQuery] = useState("");
    const [streamSettings, setStreamSettings] = useState({
        streamId: "main",
        maxFps: 8,
    });
    const [viewerFrameUrl, setViewerFrameUrl] = useState("");
    const [viewerStatus, setViewerStatus] = useState("Отключено");
    const [publisherStatus, setPublisherStatus] = useState("Отключено");
    const [sentFrames, setSentFrames] = useState(0);
    const [receivedFrames, setReceivedFrames] = useState(0);
    const [streamError, setStreamError] = useState("");
    const fileKind = file ? getFileKind(file) : FILE_KIND_IMAGE;
    const resultKind = result?.media_type ?? FILE_KIND_IMAGE;
    const renderedSrc =
        result?.rendered_media && result?.rendered_mime_type
            ? `data:${result.rendered_mime_type};base64,${result.rendered_media}`
            : "";
    const downloadName = result
        ? `prediction-${selectedModel.replace(/\.[^.]+$/, "")}.${
              result.media_type === FILE_KIND_VIDEO ? "mp4" : "jpg"
          }`
        : "prediction";

    useEffect(() => {
        let isMounted = true;

        async function fetchModels() {
            setLoadingModels(true);
            setError("");
            try {
                const response = await fetch(`${API_URL}/api/models`);
                if (!response.ok) {
                    throw new Error("Не удалось получить список моделей");
                }
                const data = await response.json();
                if (isMounted) {
                    setModels(data);
                    setSelectedModel(data[0]?.name ?? "");
                }
            } catch (requestError) {
                if (isMounted) {
                    setError(requestError.message);
                }
            } finally {
                if (isMounted) {
                    setLoadingModels(false);
                }
            }
        }

        fetchModels();
        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (!file) {
            setPreviewUrl("");
            return undefined;
        }

        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [file]);

    useEffect(() => {
        return () => {
            stopPublisher();
            stopViewer();
            if (viewerFrameUrlRef.current) {
                URL.revokeObjectURL(viewerFrameUrlRef.current);
            }
        };
    }, []);

    async function handleSubmit(event) {
        event.preventDefault();
        if (!file || !selectedModel) {
            setError("Выберите модель и файл");
            return;
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("model_name", selectedModel);
        formData.append("conf", String(settings.conf));
        formData.append("iou", String(settings.iou));
        formData.append("imgsz", String(settings.imgsz));
        formData.append("object_query", objectQuery);

        setPredicting(true);
        setError("");
        setResult(null);

        try {
            const response = await fetch(`${API_URL}/api/predict`, {
                method: "POST",
                body: formData,
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail ?? "Ошибка инференса");
            }
            setResult(data);
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setPredicting(false);
        }
    }

    function buildViewerWsUrl() {
        const streamId = encodeURIComponent(streamSettings.streamId.trim());
        return getWsUrl(`/ws/streams/${streamId}/view`);
    }

    function buildPublisherWsUrl() {
        const streamId = encodeURIComponent(streamSettings.streamId.trim());
        const params = new URLSearchParams({
            model_name: selectedModel,
            conf: String(settings.conf),
            iou: String(settings.iou),
            imgsz: String(settings.imgsz),
            object_query: objectQuery,
        });

        return getWsUrl(`/ws/streams/${streamId}/publish?${params.toString()}`);
    }

    function handleStartViewer(event) {
        event.preventDefault();

        if (!streamSettings.streamId.trim()) {
            setStreamError("Укажите ID трансляции");
            return;
        }

        stopViewer();
        setStreamError("");
        setReceivedFrames(0);

        const socket = new WebSocket(buildViewerWsUrl());
        socket.binaryType = "blob";
        viewerSocketRef.current = socket;

        socket.onopen = () => setViewerStatus("Подключено");
        socket.onmessage = (message) => {
            if (message.data instanceof Blob) {
                const nextUrl = URL.createObjectURL(message.data);
                if (viewerFrameUrlRef.current) {
                    URL.revokeObjectURL(viewerFrameUrlRef.current);
                }
                viewerFrameUrlRef.current = nextUrl;
                setViewerFrameUrl(nextUrl);
                setReceivedFrames((count) => count + 1);
                return;
            }

            try {
                const data = JSON.parse(message.data);
                if (data?.message) {
                    setViewerStatus(data.message);
                }
            } catch {
                setViewerStatus("Подключено");
            }
        };
        socket.onerror = () =>
            setStreamError("Ошибка WebSocket просмотра. Проверьте backend.");
        socket.onclose = () => {
            if (viewerSocketRef.current === socket) {
                viewerSocketRef.current = null;
                setViewerStatus("Отключено");
            }
        };
    }

    function stopViewer() {
        if (viewerSocketRef.current) {
            viewerSocketRef.current.close();
            viewerSocketRef.current = null;
        }
        setViewerStatus("Отключено");
    }

    async function handleStartPublisher(event) {
        event.preventDefault();

        if (!streamSettings.streamId.trim()) {
            setStreamError("Укажите ID трансляции");
            return;
        }

        if (!selectedModel) {
            setStreamError("Выберите модель для обработки кадров");
            return;
        }

        stopPublisher();
        setStreamError("");
        setSentFrames(0);

        try {
            const cameraStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false,
            });
            cameraStreamRef.current = cameraStream;

            if (publisherVideoRef.current) {
                publisherVideoRef.current.srcObject = cameraStream;
                await publisherVideoRef.current.play();
            }

            const socket = new WebSocket(buildPublisherWsUrl());
            publisherSocketRef.current = socket;

            socket.onopen = () => {
                setPublisherStatus("Подключено");
                startFrameCapture(socket);
            };
            socket.onmessage = (message) => {
                try {
                    const data = JSON.parse(message.data);
                    if (data?.type === "ack") {
                        setSentFrames(data.frame_index ?? 0);
                    }
                } catch {
                    setPublisherStatus("Подключено");
                }
            };
            socket.onerror = () =>
                setStreamError("Ошибка WebSocket отправителя. Проверьте backend.");
            socket.onclose = () => {
                if (publisherSocketRef.current === socket) {
                    publisherSocketRef.current = null;
                    setPublisherStatus("Отключено");
                    stopCaptureTimer();
                }
            };
        } catch (requestError) {
            setStreamError(
                requestError?.message ??
                    "Не удалось получить доступ к камере браузера.",
            );
            stopPublisher();
        }
    }

    function startFrameCapture(socket) {
        stopCaptureTimer();
        const intervalMs = Math.max(1000 / streamSettings.maxFps, 33);

        captureTimerRef.current = window.setInterval(() => {
            const video = publisherVideoRef.current;
            const canvas = canvasRef.current;

            if (!video || !canvas || socket.readyState !== WebSocket.OPEN) {
                return;
            }

            const width = video.videoWidth || 640;
            const height = video.videoHeight || 480;
            if (!width || !height) {
                return;
            }

            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            context.drawImage(video, 0, 0, width, height);
            canvas.toBlob(
                (blob) => {
                    if (blob && socket.readyState === WebSocket.OPEN) {
                        socket.send(blob);
                    }
                },
                "image/jpeg",
                0.82,
            );
        }, intervalMs);
    }

    function stopCaptureTimer() {
        if (captureTimerRef.current) {
            window.clearInterval(captureTimerRef.current);
            captureTimerRef.current = null;
        }
    }

    function stopPublisher() {
        stopCaptureTimer();

        if (publisherSocketRef.current) {
            publisherSocketRef.current.close();
            publisherSocketRef.current = null;
        }

        if (cameraStreamRef.current) {
            cameraStreamRef.current
                .getTracks()
                .forEach((track) => track.stop());
            cameraStreamRef.current = null;
        }

        if (publisherVideoRef.current) {
            publisherVideoRef.current.srcObject = null;
        }

        setPublisherStatus("Отключено");
    }

    return (
        <div className="app-shell">
            <div className="ambient ambient-left" />
            <div className="ambient ambient-right" />

            <nav className="app-nav" aria-label="Основная навигация">
                <button
                    className={activePage === "predict" ? "active" : ""}
                    type="button"
                    onClick={() => setActivePage("predict")}
                >
                    Инференс
                </button>
                <button
                    className={activePage === "streams" ? "active" : ""}
                    type="button"
                    onClick={() => setActivePage("streams")}
                >
                    Трансляции
                </button>
                <button
                    className={activePage === "android" ? "active" : ""}
                    type="button"
                    onClick={() => setActivePage("android")}
                >
                    Android
                </button>
            </nav>

            {activePage === "predict" ? (
            <main className="grid">
                <section className="panel form-panel">
                    <form onSubmit={handleSubmit}>
                        <label className="field">
                            <span>Модель</span>
                            <select
                                value={selectedModel}
                                onChange={(event) =>
                                    setSelectedModel(event.target.value)
                                }
                                disabled={loadingModels || models.length === 0}
                            >
                                {models.map((model) => (
                                    <option key={model.name} value={model.name}>
                                        {model.name} ({model.size_mb} MB)
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="field">
                            <span>Файл</span>
                            <input
                                type="file"
                                accept="image/*,video/*"
                                onChange={(event) => {
                                    setFile(event.target.files?.[0] ?? null);
                                    setResult(null);
                                    setError("");
                                }}
                            />
                            <small className="field-hint">
                                Поддерживаются изображения и видео.
                            </small>
                        </label>

                        <div className="slider-grid">
                            <label className="field">
                                <span>Запрос по объектам</span>
                                <input
                                    type="text"
                                    placeholder="Например: person, car"
                                    value={objectQuery}
                                    onChange={(event) =>
                                        setObjectQuery(event.target.value)
                                    }
                                />
                                <small className="field-hint">
                                    Можно указать один или несколько классов
                                    через запятую.
                                </small>
                            </label>

                            <label className="field">
                                <span>Confidence: {settings.conf}</span>
                                <input
                                    type="range"
                                    min="0.05"
                                    max="0.95"
                                    step="0.05"
                                    value={settings.conf}
                                    onChange={(event) =>
                                        setSettings((current) => ({
                                            ...current,
                                            conf: Number(event.target.value),
                                        }))
                                    }
                                />
                            </label>

                            <label className="field">
                                <span>IoU: {settings.iou}</span>
                                <input
                                    type="range"
                                    min="0.05"
                                    max="0.95"
                                    step="0.05"
                                    value={settings.iou}
                                    onChange={(event) =>
                                        setSettings((current) => ({
                                            ...current,
                                            iou: Number(event.target.value),
                                        }))
                                    }
                                />
                            </label>

                            <label className="field">
                                <span>Image Size</span>
                                <input
                                    type="number"
                                    min="320"
                                    max="1920"
                                    step="32"
                                    value={settings.imgsz}
                                    onChange={(event) =>
                                        setSettings((current) => ({
                                            ...current,
                                            imgsz: Number(event.target.value),
                                        }))
                                    }
                                />
                            </label>
                        </div>

                        <button
                            className="primary-button"
                            type="submit"
                            disabled={predicting}
                        >
                            {predicting
                                ? "Выполняем инференс..."
                                : "Запустить распознавание"}
                        </button>

                        {error ? (
                            <div className="error-box">{error}</div>
                        ) : null}
                    </form>
                </section>

                <section className="panel image-panel">
                    <div className="panel-header">
                        <h2>Файл</h2>
                        <p>
                            {previewUrl
                                ? "Исходник слева, результат ниже"
                                : "Загрузите изображение или видео для предпросмотра"}
                        </p>
                    </div>

                    <div className="image-stack">
                        <div className="image-card">
                            <h3>Original</h3>
                            {previewUrl ? (
                                fileKind === FILE_KIND_VIDEO ? (
                                    <video
                                        src={previewUrl}
                                        controls
                                        playsInline
                                    />
                                ) : (
                                    <img
                                        src={previewUrl}
                                        alt="Исходное изображение"
                                    />
                                )
                            ) : (
                                <div className="empty-state">Нет файла</div>
                            )}
                        </div>
                        <div className="image-card">
                            <h3>Prediction</h3>

                            {renderedSrc ? (
                                resultKind === FILE_KIND_VIDEO ? (
                                    <video
                                        src={renderedSrc}
                                        controls
                                        playsInline
                                    />
                                ) : (
                                    <img
                                        src={renderedSrc}
                                        alt="Результат предсказания"
                                    />
                                )
                            ) : (
                                <div className="empty-state">
                                    Результат появится после инференса
                                </div>
                            )}
                            {renderedSrc ? (
                                <a
                                    className="download-button"
                                    href={renderedSrc}
                                    download={downloadName}
                                >
                                    Скачать
                                </a>
                            ) : null}
                        </div>
                    </div>
                </section>

                <section className="panel detections-panel">
                    <div className="panel-header">
                        <h2>Детекции</h2>
                        <p>
                            {result
                                ? `${result.total_detections} объектов, модель ${result.model}`
                                : "Здесь появится список найденных объектов"}
                        </p>
                    </div>

                    {result?.extra?.query_applied ? (
                        <div className="query-summary">
                            <strong>Запрос:</strong>{" "}
                            {result.extra.requested_classes?.join(", ") ||
                                "не указан"}
                            <br />
                            <strong>Совпавшие классы:</strong>{" "}
                            {result.extra.matched_classes?.length
                                ? result.extra.matched_classes.join(", ")
                                : "совпадений нет"}
                        </div>
                    ) : null}

                    <div className="detections-list">
                        {result?.detections?.length ? (
                            result.detections.map((detection, index) => (
                                <article
                                    className="detection-card"
                                    key={`${detection.class_id}-${index}`}
                                >
                                    <strong>{detection.class_name}</strong>
                                    <span>
                                        {Math.round(detection.confidence * 100)}
                                        %
                                    </span>
                                    {typeof detection.frame_index ===
                                    "number" ? (
                                        <code>
                                            frame: {detection.frame_index}
                                        </code>
                                    ) : null}
                                    <code>{detection.bbox.join(", ")}</code>
                                </article>
                            ))
                        ) : (
                            <div className="empty-state">
                                {loadingModels
                                    ? "Загружаем модели..."
                                    : result?.extra?.query_applied &&
                                        !result?.extra?.matched_classes?.length
                                      ? "По запросу не найдено классов в выбранной модели"
                                      : "После запуска инференса здесь будет таблица результатов"}
                            </div>
                        )}
                    </div>

                    {result?.media_type === FILE_KIND_VIDEO ? (
                        <div className="query-summary">
                            <strong>Кадров:</strong>{" "}
                            {result.extra.frame_count ?? "?"}
                            <br />
                            <strong>FPS:</strong> {result.extra.fps ?? "?"}
                            <br />
                            <strong>Сводка по классам:</strong>{" "}
                            {result.extra.class_totals &&
                            Object.keys(result.extra.class_totals).length
                                ? Object.entries(result.extra.class_totals)
                                      .map(
                                          ([name, count]) =>
                                              `${name}: ${count}`,
                                      )
                                      .join(", ")
                                : "детекций нет"}
                        </div>
                    ) : null}

                    {result?.extra?.available_classes?.length ? (
                        <div className="classes-cloud">
                            {result.extra.available_classes.map((className) => (
                                <span key={className} className="class-chip">
                                    {className}
                                </span>
                            ))}
                        </div>
                    ) : null}
                </section>
            </main>
            ) : activePage === "streams" ? (
            <main className="stream-grid">
                <section className="panel form-panel">
                    <form onSubmit={handleStartViewer}>
                        <label className="field">
                            <span>ID трансляции</span>
                            <input
                                type="text"
                                placeholder="main"
                                value={streamSettings.streamId}
                                onChange={(event) =>
                                    setStreamSettings((current) => ({
                                        ...current,
                                        streamId: event.target.value,
                                    }))
                                }
                            />
                            <small className="field-hint">
                                Отправитель и просмотрщик должны использовать
                                один ID.
                            </small>
                        </label>

                        <label className="field">
                            <span>Модель</span>
                            <select
                                value={selectedModel}
                                onChange={(event) =>
                                    setSelectedModel(event.target.value)
                                }
                                disabled={loadingModels || models.length === 0}
                            >
                                {models.map((model) => (
                                    <option key={model.name} value={model.name}>
                                        {model.name} ({model.size_mb} MB)
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="field">
                            <span>Запрос по объектам</span>
                            <input
                                type="text"
                                placeholder="Например: person, car"
                                value={objectQuery}
                                onChange={(event) =>
                                    setObjectQuery(event.target.value)
                                }
                            />
                        </label>

                        <label className="field">
                            <span>Confidence: {settings.conf}</span>
                            <input
                                type="range"
                                min="0.05"
                                max="0.95"
                                step="0.05"
                                value={settings.conf}
                                onChange={(event) =>
                                    setSettings((current) => ({
                                        ...current,
                                        conf: Number(event.target.value),
                                    }))
                                }
                            />
                        </label>

                        <label className="field">
                            <span>IoU: {settings.iou}</span>
                            <input
                                type="range"
                                min="0.05"
                                max="0.95"
                                step="0.05"
                                value={settings.iou}
                                onChange={(event) =>
                                    setSettings((current) => ({
                                        ...current,
                                        iou: Number(event.target.value),
                                    }))
                                }
                            />
                        </label>

                        <label className="field">
                            <span>Image Size</span>
                            <input
                                type="number"
                                min="320"
                                max="1920"
                                step="32"
                                value={settings.imgsz}
                                onChange={(event) =>
                                    setSettings((current) => ({
                                        ...current,
                                        imgsz: Number(event.target.value),
                                    }))
                                }
                            />
                        </label>

                        <label className="field">
                            <span>FPS отправки: {streamSettings.maxFps}</span>
                            <input
                                type="range"
                                min="1"
                                max="15"
                                step="1"
                                value={streamSettings.maxFps}
                                onChange={(event) =>
                                    setStreamSettings((current) => ({
                                        ...current,
                                        maxFps: Number(event.target.value),
                                    }))
                                }
                            />
                        </label>

                        <button className="primary-button" type="submit">
                            Подключить просмотр
                        </button>
                        <button
                            className="secondary-button"
                            type="button"
                            onClick={handleStartPublisher}
                        >
                            Отправлять с камеры
                        </button>
                        <button
                            className="secondary-button"
                            type="button"
                            onClick={() => {
                                stopPublisher();
                                stopViewer();
                            }}
                            disabled={
                                !publisherSocketRef.current &&
                                !viewerSocketRef.current
                            }
                        >
                            Остановить WebSocket
                        </button>

                        {streamError ? (
                            <div className="error-box">{streamError}</div>
                        ) : null}
                    </form>
                </section>

                <section className="panel stream-panel">
                    <div className="panel-header">
                        <h2>Просмотр</h2>
                        <p>
                            {viewerStatus} · кадров: {receivedFrames}
                        </p>
                    </div>

                    <div className="stream-viewer">
                        {viewerFrameUrl ? (
                            <img
                                src={viewerFrameUrl}
                                alt="WebSocket трансляция с детекцией объектов"
                            />
                        ) : (
                            <div className="empty-state">
                                Кадры появятся после подключения viewer и
                                отправки publisher
                            </div>
                        )}
                    </div>
                </section>

                <section className="panel stream-panel publisher-panel">
                    <div className="panel-header">
                        <h2>Отправитель</h2>
                        <p>
                            {publisherStatus} · кадров: {sentFrames}
                        </p>
                    </div>

                    <div className="stream-viewer publisher-preview">
                        <video
                            ref={publisherVideoRef}
                            muted
                            playsInline
                            autoPlay
                        />
                        <canvas ref={canvasRef} hidden />
                    </div>

                    <div className="query-summary">
                        <strong>Viewer WS:</strong>{" "}
                        {streamSettings.streamId.trim()
                            ? buildViewerWsUrl()
                            : "укажите ID"}
                        <br />
                        <strong>Publisher WS:</strong>{" "}
                        {streamSettings.streamId.trim()
                            ? buildPublisherWsUrl()
                            : "укажите ID"}
                    </div>
                </section>
            </main>
            ) : (
            <main className="install-page">
                <section className="install-hero">
                    <div>
                        <p className="eyebrow">Android приложение</p>
                        <h1>Установка мобильного клиента</h1>
                        <p className="hero-copy">
                            Скачайте APK-файл на Android-устройство, откройте
                            его и подтвердите установку из браузера или
                            файлового менеджера.
                        </p>
                    </div>

                    <div className="install-card panel">
                        <div className="apk-badge" aria-hidden="true">
                            APK
                        </div>
                        <h2>Файл готов</h2>
                        <p>
                            {APK_NAME} · {APK_SIZE}
                        </p>
                        <a
                            className="primary-button install-button"
                            href={APK_URL}
                            download={APK_NAME}
                        >
                            Скачать APK
                        </a>
                    </div>
                </section>

                <section className="install-steps">
                    <article className="install-step panel">
                        <span>1</span>
                        <h3>Откройте страницу на телефоне</h3>
                        <p>
                            Перейдите на этот сайт с Android-устройства или
                            отправьте ссылку себе в мессенджер.
                        </p>
                    </article>
                    <article className="install-step panel">
                        <span>2</span>
                        <h3>Скачайте APK</h3>
                        <p>
                            Нажмите кнопку скачивания и дождитесь окончания
                            загрузки файла.
                        </p>
                    </article>
                    <article className="install-step panel">
                        <span>3</span>
                        <h3>Разрешите установку</h3>
                        <p>
                            Если Android попросит разрешение для источника,
                            включите его и завершите установку приложения.
                        </p>
                    </article>
                </section>
            </main>
            )}
        </div>
    );
}

export default App;
