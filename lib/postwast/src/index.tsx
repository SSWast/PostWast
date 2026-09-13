import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  fetchPostWastResponse,
  hasValidPostWastFileSignature,
  readPostWastResponse,
  safePostWastUrl,
  type PostWastPublishResult,
  type PostWastMediaType as SharedPostWastMediaType,
} from "./shared.js";

export type { PostWastPublishResult } from "./shared";

export type PostWastLocale = "auto" | "ar" | "en";
export type PostWastMediaType = SharedPostWastMediaType;
export type PostWastConnectionState =
  "connected" | "disconnected" | "connecting";
export type PostWastFeedback = "like" | "dislike";

export interface PostWastChannel {
  id: string;
  name: string;
  description?: string;
  icon?: ReactNode;
  connected: boolean;
  connectionState?: PostWastConnectionState;
}

export interface PostWastPublishInput {
  file: File;
  mediaType: PostWastMediaType;
  description: string;
  channelId: string;
}

export interface PostWastAdapter {
  /**
   * The developer's own channels or destinations. PostWast never assumes
   * which external service owns them.
   */
  channels: readonly PostWastChannel[];
  /**
   * Perform the real upload and publish operation in the host project.
   * Keep provider credentials and tokens on the host server.
   */
  publish(input: PostWastPublishInput): Promise<PostWastPublishResult>;
  /**
   * Optional hook for a host-owned connection or authorization flow.
   */
  connect?(channelId: string): Promise<void>;
}

export interface PostWastHttpAdapterOptions {
  channels: readonly PostWastChannel[];
  endpoint: string;
  credentials?: RequestCredentials;
  headers?: HeadersInit;
  fetcher?: typeof fetch;
  connect?: (channelId: string) => Promise<void>;
  /** Set to 0 or a negative value to disable the client-side timeout. */
  timeoutMs?: number;
}

export interface PostWastEffectSettings {
  shader?: boolean;
  shadow?: boolean;
}

export interface PostWastPublishFlowProps {
  adapter: PostWastAdapter;
  locale?: PostWastLocale;
  effects?: PostWastEffectSettings;
  maxFileSizeBytes?: number;
  className?: string;
  onPublished?: (
    result: PostWastPublishResult,
    input: PostWastPublishInput,
  ) => void;
  onPublishError?: (error: unknown) => void;
  onFeedback?: (feedback: PostWastFeedback) => void;
}

type ResolvedLocale = "ar" | "en";

const MIME_TYPES: Record<PostWastMediaType, ReadonlySet<string>> = {
  image: new Set(["image/jpeg", "image/png", "image/webp"]),
  video: new Set(["video/mp4", "video/webm", "video/quicktime"]),
};

/**
 * Create a PostWast adapter for any HTTP server. The server can use SQLite,
 * PostgreSQL, MySQL, or no database at all; PostWast only requires the
 * documented multipart/form-data request and a successful HTTP response.
 */
export function createPostWastHttpAdapter({
  channels,
  endpoint,
  credentials = "include",
  headers,
  fetcher = fetch,
  connect,
  timeoutMs = 120_000,
}: PostWastHttpAdapterOptions): PostWastAdapter {
  return {
    channels,
    connect,
    async publish(input) {
      const body = new FormData();
      body.append("file", input.file);
      body.append("mediaType", input.mediaType);
      body.append("description", input.description);
      body.append("channelId", input.channelId);

      const response = await fetchPostWastResponse(
        fetcher,
        endpoint,
        {
          method: "POST",
          body,
          credentials,
          headers,
        },
        timeoutMs,
      );

      return readPostWastResponse(response);
    },
  };
}

const copy = {
  ar: {
    eyebrow: "POSTWAST / PUBLISH LAYER",
    title: "انشرها كما تراها.",
    subtitle: "واجهة نشر جاهزة لمشروعك، مع بقاء الاتصال والنشر تحت تحكمك.",
    media: "الوسائط",
    image: "صورة",
    video: "فيديو",
    drop: "اسحب الملف هنا أو اختره",
    supported: "JPG، PNG، WEBP أو MP4 · حتى 50 ميغابايت",
    choose: "اختر ملفًا",
    caption: "الوصف",
    captionPlaceholder: "اكتب وصف المنشور...",
    channel: "قناة النشر",
    connected: "متصل",
    disconnected: "غير متصل",
    connect: "ربط",
    publish: "نشر الآن",
    publishing: "جارٍ النشر…",
    published: "تم النشر بنجاح",
    publishAgain: "نشر منشور آخر",
    feedback: "كيف كانت تجربة النشر؟",
    like: "أعجبتني",
    dislike: "تحتاج تحسينًا",
    viewPost: "عرض المنشور",
    invalidFile: "اختر ملف صورة أو فيديو صالحًا لهذا النوع.",
    tooLarge: "حجم الملف يتجاوز الحد المسموح.",
    noChannels: "أضف قناة واحدة على الأقل إلى PostWast.",
    notConnected: "اربط قناة النشر أولًا.",
    publishFailed: "تعذر النشر. تحقق من مشروعك وحاول مرة أخرى.",
    secure: "الاتصال والنشر يديرهما مشروعك",
    chars: "حرف",
  },
  en: {
    eyebrow: "POSTWAST / PUBLISH LAYER",
    title: "Publish as you see it.",
    subtitle:
      "A ready-made publishing surface while your project owns the connection.",
    media: "Media",
    image: "Image",
    video: "Video",
    drop: "Drop a file here or choose one",
    supported: "JPG, PNG, WEBP or MP4 · up to 50 MB",
    choose: "Choose a file",
    caption: "Description",
    captionPlaceholder: "Write a description...",
    channel: "Publish channel",
    connected: "Connected",
    disconnected: "Not connected",
    connect: "Connect",
    publish: "Publish now",
    publishing: "Publishing…",
    published: "Published successfully",
    publishAgain: "Publish another post",
    feedback: "How did publishing feel?",
    like: "Like",
    dislike: "Needs work",
    viewPost: "View post",
    invalidFile: "Choose a valid image or video for this media type.",
    tooLarge: "The file exceeds the allowed size.",
    noChannels: "Add at least one channel to PostWast.",
    notConnected: "Connect the publish channel first.",
    publishFailed: "Publishing failed. Check your project and try again.",
    secure: "Connection and publishing stay in your project",
    chars: "chars",
  },
} as const;

function resolveLocale(locale: PostWastLocale): ResolvedLocale {
  if (locale === "ar") return "ar";
  if (locale === "en") return "en";
  if (typeof navigator !== "undefined") {
    return navigator.language.toLowerCase().startsWith("ar") ? "ar" : "en";
  }
  return "en";
}

function formatFileLimit(bytes: number, locale: ResolvedLocale): string {
  const megabytes = Math.round(bytes / (1024 * 1024));
  return locale === "ar"
    ? `حتى ${megabytes} ميغابايت`
    : `up to ${megabytes} MB`;
}

function ChannelMark({ channel }: { channel: PostWastChannel }) {
  if (channel.icon)
    return <span className="pw-channel-icon">{channel.icon}</span>;
  return (
    <span
      className="pw-channel-icon pw-channel-icon-default"
      aria-hidden="true"
    >
      {channel.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function PostWastPublishFlow({
  adapter,
  locale: localeProp = "auto",
  effects = {},
  maxFileSizeBytes = 50 * 1024 * 1024,
  className,
  onPublished,
  onPublishError,
  onFeedback,
}: PostWastPublishFlowProps) {
  const locale = resolveLocale(localeProp);
  const text = copy[locale];
  const direction = locale === "ar" ? "rtl" : "ltr";
  const channels = adapter.channels;
  const [mediaType, setMediaType] = useState<PostWastMediaType>("image");
  const [description, setDescription] = useState("");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishState, setPublishState] = useState<
    "idle" | "publishing" | "success" | "error"
  >("idle");
  const [lastResult, setLastResult] = useState<PostWastPublishResult | null>(
    null,
  );
  const [feedback, setFeedback] = useState<PostWastFeedback | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectionOverrides, setConnectionOverrides] = useState<
    Record<string, boolean>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const shaderEnabled = effects.shader ?? true;
  const shadowEnabled = effects.shadow ?? true;
  const selectedChannel = channels.find((channel) => channel.id === channelId);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!channels.some((channel) => channel.id === channelId)) {
      setChannelId(channels[0]?.id ?? "");
    }
  }, [channelId, channels]);

  const connected = (channel: PostWastChannel) =>
    connectionOverrides[channel.id] ?? channel.connected;

  const accept = useMemo(
    () =>
      mediaType === "image"
        ? "image/jpeg,image/png,image/webp"
        : "video/mp4,video/webm,video/quicktime",
    [mediaType],
  );

  const clearFile = () => {
    setFile(null);
    setPreviewUrl(null);
    setFileError(null);
  };

  const selectFile = async (nextFile?: File) => {
    if (!nextFile) return;
    const selectedMediaType = mediaType;
    if (
      !MIME_TYPES[selectedMediaType].has(nextFile.type) ||
      !(await hasValidPostWastFileSignature(nextFile, selectedMediaType))
    ) {
      clearFile();
      setFileError(text.invalidFile);
      return;
    }
    if (mediaType !== selectedMediaType) return;
    if (nextFile.size > maxFileSizeBytes) {
      clearFile();
      setFileError(
        `${text.tooLarge} (${formatFileLimit(maxFileSizeBytes, locale)}).`,
      );
      return;
    }
    setFileError(null);
    setPublishError(null);
    setPublishState("idle");
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void selectFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void selectFile(event.dataTransfer.files?.[0]);
  };

  const handleConnect = async (channel: PostWastChannel) => {
    if (!adapter.connect || connectingId) return;
    setConnectingId(channel.id);
    setPublishError(null);
    try {
      await adapter.connect(channel.id);
      if (mountedRef.current) {
        setConnectionOverrides((current) => ({
          ...current,
          [channel.id]: true,
        }));
      }
    } catch (error) {
      if (mountedRef.current) {
        setPublishError(
          error instanceof Error ? error.message : text.publishFailed,
        );
      }
      onPublishError?.(error);
    } finally {
      if (mountedRef.current) setConnectingId(null);
    }
  };

  const publish = async () => {
    if (publishState === "publishing") return;
    if (!file) {
      setPublishError(text.invalidFile);
      setPublishState("error");
      return;
    }
    if (!selectedChannel || !connected(selectedChannel)) {
      setPublishError(text.notConnected);
      setPublishState("error");
      return;
    }

    const input: PostWastPublishInput = {
      file,
      mediaType,
      description: description.trim(),
      channelId: selectedChannel.id,
    };
    setPublishError(null);
    setPublishState("publishing");
    let result: PostWastPublishResult;
    try {
      result = await adapter.publish(input);
    } catch (error) {
      if (!mountedRef.current) return;
      setPublishError(
        error instanceof Error ? error.message : text.publishFailed,
      );
      setPublishState("error");
      onPublishError?.(error);
      return;
    }
    if (!mountedRef.current) return;
    setLastResult(result);
    setPublishState("success");
    try {
      onPublished?.(result, input);
    } catch {
      // A host callback must not turn a completed publish into a failed publish.
    }
  };

  const reset = () => {
    setPublishState("idle");
    setPublishError(null);
    setLastResult(null);
    setFeedback(null);
  };

  const sendFeedback = (value: PostWastFeedback) => {
    setFeedback(value);
    try {
      onFeedback?.(value);
    } catch {
      // Feedback is advisory and must not interrupt the publishing flow.
    }
  };

  const resultUrl = safePostWastUrl(lastResult?.url);

  if (channels.length === 0) {
    return (
      <div dir={direction} className="pw-shell pw-empty">
        <style>{styles}</style>
        <strong>{text.noChannels}</strong>
      </div>
    );
  }

  return (
    <div
      dir={direction}
      className={[
        "pw-shell",
        shaderEnabled ? "" : "pw-no-shader",
        shadowEnabled ? "" : "pw-no-shadow",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <style>{styles}</style>
      <header className="pw-header">
        <div>
          <div className="pw-brand">POSTWAST</div>
          <div className="pw-brand-sub">{text.secure}</div>
        </div>
        <div className="pw-header-mark" aria-hidden="true">
          ↗
        </div>
      </header>

      <div className="pw-intro">
        <div className="pw-eyebrow">{text.eyebrow}</div>
        <h1>{text.title}</h1>
        <p>{text.subtitle}</p>
      </div>

      <main className="pw-grid">
        <section className="pw-media-panel">
          <div className="pw-label-row">
            <span>{text.media}</span>
            <div className="pw-segmented">
              <button
                className={mediaType === "image" ? "is-active" : ""}
                type="button"
                onClick={() => {
                  setMediaType("image");
                  clearFile();
                }}
              >
                {text.image}
              </button>
              <button
                className={mediaType === "video" ? "is-active" : ""}
                type="button"
                onClick={() => {
                  setMediaType("video");
                  clearFile();
                }}
              >
                {text.video}
              </button>
            </div>
          </div>

          <div
            className={`pw-dropzone ${file ? "has-file" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                fileInputRef.current?.click();
              }
            }}
          >
            {previewUrl ? (
              mediaType === "video" ? (
                <video
                  src={previewUrl}
                  controls
                  muted
                  playsInline
                  onClick={(event) => event.stopPropagation()}
                  aria-label={file?.name}
                />
              ) : (
                <img src={previewUrl} alt={file?.name ?? text.media} />
              )
            ) : (
              <div className="pw-drop-content">
                <div className="pw-upload-glyph" aria-hidden="true">
                  ↑
                </div>
                <strong>{text.drop}</strong>
                <span>{text.supported}</span>
              </div>
            )}
            <input
              ref={fileInputRef}
              hidden
              type="file"
              accept={accept}
              onChange={handleFileChange}
            />
          </div>
          {fileError && (
            <p className="pw-error pw-error-dark" role="alert">
              {fileError}
            </p>
          )}
          {!file && (
            <button
              className="pw-choose-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              {text.choose}
            </button>
          )}
        </section>

        <aside className="pw-control-panel">
          <label className="pw-field-label" htmlFor="postwast-description">
            {text.caption}
          </label>
          <textarea
            id="postwast-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={text.captionPlaceholder}
            maxLength={500}
          />
          <div className="pw-character-count">
            {description.length}/500 {text.chars}
          </div>

          <div className="pw-field-label">{text.channel}</div>
          <div className="pw-channel-list">
            {channels.map((channel) => {
              const isConnected = connected(channel);
              return (
                <div
                  key={channel.id}
                  className={`pw-channel ${channel.id === channelId ? "is-selected" : ""}`}
                >
                  <button
                    type="button"
                    className="pw-channel-select"
                    onClick={() => {
                      setChannelId(channel.id);
                      setPublishError(null);
                      setPublishState("idle");
                    }}
                  >
                    <ChannelMark channel={channel} />
                    <span className="pw-channel-copy">
                      <strong>{channel.name}</strong>
                      {channel.description && (
                        <small>{channel.description}</small>
                      )}
                    </span>
                    <span
                      className={`pw-connection ${isConnected ? "is-connected" : ""}`}
                    >
                      {isConnected ? text.connected : text.disconnected}
                    </span>
                  </button>
                  {!isConnected && adapter.connect && (
                    <button
                      className="pw-connect-button"
                      type="button"
                      onClick={() => void handleConnect(channel)}
                      disabled={connectingId !== null}
                    >
                      {connectingId === channel.id ? "…" : text.connect}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button
            className="pw-publish-button"
            type="button"
            onClick={() => void publish()}
            disabled={publishState === "publishing"}
          >
            {publishState === "publishing" ? text.publishing : text.publish}
            <span aria-hidden="true">↗</span>
          </button>
          {publishError && (
            <p className="pw-error" role="alert">
              {publishError}
            </p>
          )}
        </aside>
      </main>

      {publishState === "success" && (
        <div className="pw-success-wrap">
          <div className="pw-success" role="status">
            <span>✓</span>
            <strong>{text.published}</strong>
            {resultUrl && (
              <a
                href={resultUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="pw-view-link"
              >
                {text.viewPost}
              </a>
            )}
            <button type="button" onClick={reset}>
              {text.publishAgain}
            </button>
          </div>
          <div className="pw-feedback" aria-label={text.feedback}>
            <span>{text.feedback}</span>
            <button
              type="button"
              className={feedback === "like" ? "is-active" : ""}
              onClick={() => sendFeedback("like")}
              aria-pressed={feedback === "like"}
            >
              {text.like}
            </button>
            <button
              type="button"
              className={feedback === "dislike" ? "is-active" : ""}
              onClick={() => sendFeedback("dislike")}
              aria-pressed={feedback === "dislike"}
            >
              {text.dislike}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = `
  .pw-shell {
    --pw-ink: #152f43;
    --pw-muted: #647a84;
    --pw-cream: #f5f0e8;
    --pw-coral: #e8836d;
    --pw-mint: #b8ded8;
    position: relative;
    isolation: isolate;
    overflow: hidden;
    max-width: 1120px;
    margin: 0 auto;
    padding: 28px;
    color: var(--pw-ink);
    background:
      radial-gradient(circle at 88% 12%, rgba(184, 222, 216, .82), transparent 28%),
      radial-gradient(circle at 10% 36%, rgba(232, 131, 109, .20), transparent 32%),
      var(--pw-cream);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }
  .pw-shell::before {
    content: "";
    position: absolute;
    inset: -25%;
    z-index: -1;
    background: radial-gradient(circle at var(--pw-x, 72%) var(--pw-y, 22%), rgba(255,255,255,.42), transparent 28%);
    pointer-events: none;
    animation: pw-drift 12s ease-in-out infinite alternate;
  }
  .pw-no-shader::before { display: none; }
  .pw-no-shadow .pw-control-panel, .pw-no-shadow .pw-dropzone, .pw-no-shadow .pw-publish-button {
    box-shadow: none;
  }
  .pw-header, .pw-label-row, .pw-channel-select, .pw-success {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .pw-header { padding-bottom: 22px; border-bottom: 1px solid rgba(21,47,67,.18); }
  .pw-brand { font: 800 18px/1 Inter, sans-serif; letter-spacing: .08em; }
  .pw-brand-sub { margin-top: 7px; color: var(--pw-muted); font-size: 11px; }
  .pw-header-mark { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 13px; background: var(--pw-ink); color: var(--pw-mint); font-size: 20px; }
  .pw-intro { max-width: 690px; margin: 70px 0 38px; }
  .pw-eyebrow { color: #a56358; font: 700 10px/1 Inter, sans-serif; letter-spacing: .14em; }
  .pw-intro h1 { margin: 12px 0 12px; font-size: clamp(38px, 6vw, 72px); line-height: .98; letter-spacing: -.06em; }
  .pw-intro p { max-width: 560px; margin: 0; color: var(--pw-muted); font-size: 15px; line-height: 1.8; }
  .pw-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(290px, .72fr); gap: 18px; align-items: stretch; }
  .pw-media-panel { min-width: 0; }
  .pw-label-row { margin-bottom: 12px; font-size: 12px; font-weight: 700; }
  .pw-segmented { display: flex; gap: 4px; padding: 4px; border-radius: 999px; background: rgba(255,255,255,.52); }
  .pw-segmented button, .pw-choose-button, .pw-connect-button, .pw-success button { border: 0; cursor: pointer; font: inherit; }
  .pw-segmented button { padding: 8px 13px; border-radius: 999px; color: var(--pw-muted); background: transparent; font-size: 11px; }
  .pw-segmented button.is-active { color: white; background: var(--pw-ink); }
  .pw-dropzone { position: relative; min-height: 410px; overflow: hidden; border: 1px solid rgba(21,47,67,.15); border-radius: 22px; background: rgba(255,255,255,.54); box-shadow: 0 24px 60px rgba(21,47,67,.14); cursor: pointer; }
  .pw-dropzone::after { content: ""; position: absolute; inset: 14px; border: 1px dashed rgba(21,47,67,.22); border-radius: 16px; pointer-events: none; }
  .pw-dropzone img, .pw-dropzone video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; }
  .pw-drop-content { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 9px; z-index: 1; text-align: center; }
  .pw-upload-glyph { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 18px; color: var(--pw-ink); background: var(--pw-mint); font-size: 28px; }
  .pw-drop-content strong { font-size: 16px; }
  .pw-drop-content span { color: var(--pw-muted); font-size: 11px; }
  .pw-choose-button { margin-top: 12px; padding: 10px 14px; border-radius: 999px; color: var(--pw-ink); background: rgba(255,255,255,.66); font-size: 12px; }
  .pw-control-panel { display: flex; flex-direction: column; min-width: 0; padding: 25px; border-radius: 22px; color: white; background: var(--pw-ink); box-shadow: 0 24px 60px rgba(21,47,67,.22); }
  .pw-field-label { margin-bottom: 10px; color: rgba(255,255,255,.72); font-size: 11px; font-weight: 700; }
  .pw-control-panel textarea { min-height: 132px; resize: vertical; border: 1px solid rgba(255,255,255,.18); border-radius: 15px; outline: none; padding: 15px; color: white; background: rgba(255,255,255,.08); font: inherit; font-size: 13px; line-height: 1.7; }
  .pw-control-panel textarea:focus { border-color: var(--pw-mint); box-shadow: 0 0 0 3px rgba(184,222,216,.14); }
  .pw-character-count { margin: 8px 3px 28px; color: rgba(255,255,255,.48); font-size: 10px; }
  .pw-channel-list { display: grid; gap: 8px; margin-bottom: 22px; }
  .pw-channel { display: flex; gap: 8px; align-items: center; min-width: 0; padding: 6px; border: 1px solid rgba(255,255,255,.12); border-radius: 14px; }
  .pw-channel.is-selected { border-color: rgba(184,222,216,.64); background: rgba(255,255,255,.07); }
  .pw-channel-select { flex: 1; min-width: 0; gap: 10px; padding: 5px; border: 0; color: white; background: transparent; cursor: pointer; text-align: start; }
  .pw-channel-icon { display: grid; flex: 0 0 auto; place-items: center; width: 32px; height: 32px; border-radius: 10px; color: var(--pw-ink); background: var(--pw-coral); font-size: 12px; font-weight: 800; }
  .pw-channel-icon-default { background: var(--pw-mint); }
  .pw-channel-copy { display: grid; min-width: 0; gap: 3px; }
  .pw-channel-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .pw-channel-copy small { overflow: hidden; color: rgba(255,255,255,.5); text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
  .pw-connection { margin-inline-start: auto; color: rgba(255,255,255,.48); font-size: 9px; white-space: nowrap; }
  .pw-connection.is-connected { color: var(--pw-mint); }
  .pw-connect-button { padding: 7px 9px; border-radius: 8px; color: var(--pw-ink); background: var(--pw-mint); font-size: 10px; }
  .pw-publish-button { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; margin-top: auto; padding: 15px 17px; border: 0; border-radius: 14px; color: var(--pw-ink); background: var(--pw-coral); box-shadow: 0 15px 28px rgba(232,131,109,.2); cursor: pointer; font: 800 13px/1 Inter, sans-serif; }
  .pw-publish-button:disabled { cursor: wait; opacity: .7; }
  .pw-error { margin: 10px 2px 0; color: #ffb09d; font-size: 11px; line-height: 1.6; }
  .pw-error-dark { color: #a95649; }
  .pw-success-wrap { margin-top: 18px; }
  .pw-success { gap: 12px; padding: 14px 18px; border-radius: 14px; color: var(--pw-ink); background: var(--pw-mint); font-size: 12px; }
  .pw-success span { font-size: 18px; }
  .pw-success button { margin-inline-start: auto; padding: 8px 11px; border-radius: 999px; color: var(--pw-ink); background: rgba(255,255,255,.54); font-size: 10px; }
  .pw-view-link { color: var(--pw-ink); font-size: 10px; text-decoration: underline; }
  .pw-feedback { display: flex; align-items: center; gap: 8px; margin-top: 9px; color: var(--pw-muted); font-size: 10px; }
  .pw-feedback button { padding: 6px 9px; border: 1px solid rgba(21,47,67,.14); border-radius: 999px; color: var(--pw-ink); background: rgba(255,255,255,.48); cursor: pointer; font: inherit; }
  .pw-feedback button.is-active { border-color: var(--pw-ink); background: var(--pw-ink); color: var(--pw-mint); }
  .pw-empty { display: grid; min-height: 140px; place-items: center; border-radius: 18px; }
  @keyframes pw-drift { from { transform: translate3d(-2%, -1%, 0) scale(1); } to { transform: translate3d(2%, 1%, 0) scale(1.04); } }
  @media (max-width: 760px) {
    .pw-shell { padding: 18px; }
    .pw-intro { margin: 48px 0 28px; }
    .pw-grid { grid-template-columns: 1fr; }
    .pw-dropzone { min-height: 300px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .pw-shell::before { animation: none; }
  }
`;
