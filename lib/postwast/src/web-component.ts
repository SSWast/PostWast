import {
  fetchPostWastResponse,
  hasValidPostWastFileSignature,
  readPostWastResponse,
  safePostWastUrl,
  type PostWastPublishResult,
} from "./shared.js";

export type PostWastElementLocale = "auto" | "ar" | "en";

export interface PostWastElementChannel {
  id: string;
  name: string;
  description?: string;
  connected?: boolean;
}

export type { PostWastPublishResult as PostWastElementResult } from "./shared";

type MediaType = "image" | "video";
type Feedback = "like" | "dislike";

const acceptedTypes: Record<MediaType, ReadonlySet<string>> = {
  image: new Set(["image/jpeg", "image/png", "image/webp"]),
  video: new Set(["video/mp4", "video/webm", "video/quicktime"]),
};

const labels = {
  ar: {
    dir: "rtl",
    media: "الوسائط",
    image: "صورة",
    video: "فيديو",
    drop: "اسحب الملف هنا أو اختره",
    supported: "JPG، PNG، WEBP أو MP4 · حتى 50 ميغابايت",
    choose: "اختر ملفًا",
    description: "الوصف",
    placeholder: "اكتب وصف المنشور...",
    channel: "قناة النشر",
    connected: "متصل",
    disconnected: "غير متصل",
    connect: "ربط",
    publish: "نشر الآن",
    publishing: "جارٍ النشر…",
    success: "تم النشر بنجاح",
    again: "نشر منشور آخر",
    view: "عرض المنشور",
    feedback: "كيف كانت تجربة النشر؟",
    like: "أعجبتني",
    dislike: "تحتاج تحسينًا",
    noEndpoint: "أضف الخاصية endpoint إلى عنصر PostWast.",
    noChannels: "أضف قنوات إلى الخاصية channels.",
    invalid: "اختر ملف صورة أو فيديو صالحًا.",
    tooLarge: "حجم الملف يتجاوز 50 ميغابايت.",
    notConnected: "قناة النشر غير متصلة.",
    failed: "تعذر النشر. تحقق من الخادم وحاول مرة أخرى.",
  },
  en: {
    dir: "ltr",
    media: "Media",
    image: "Image",
    video: "Video",
    drop: "Drop a file here or choose one",
    supported: "JPG, PNG, WEBP or MP4 · up to 50 MB",
    choose: "Choose a file",
    description: "Description",
    placeholder: "Write a description...",
    channel: "Publish channel",
    connected: "Connected",
    disconnected: "Not connected",
    connect: "Connect",
    publish: "Publish now",
    publishing: "Publishing…",
    success: "Published successfully",
    again: "Publish another post",
    view: "View post",
    feedback: "How did publishing feel?",
    like: "Like",
    dislike: "Needs work",
    noEndpoint: "Add the endpoint attribute to PostWast.",
    noChannels: "Add channels to the channels attribute.",
    invalid: "Choose a valid image or video file.",
    tooLarge: "The file exceeds the 50 MB limit.",
    notConnected: "The publish channel is not connected.",
    failed: "Publishing failed. Check the server and try again.",
  },
} as const;

function getLocale(value: string | null): "ar" | "en" {
  if (value === "ar" || value === "en") return value;
  return typeof navigator !== "undefined" &&
    navigator.language.toLowerCase().startsWith("ar")
    ? "ar"
    : "en";
}

function getChannels(value: string | null): PostWastElementChannel[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PostWastElementChannel =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as PostWastElementChannel).id === "string" &&
        typeof (item as PostWastElementChannel).name === "string",
    );
  } catch {
    return [];
  }
}

const PostWastHTMLElement = (
  typeof HTMLElement === "undefined" ? class {} : HTMLElement
) as typeof HTMLElement;

export class PostWastElement extends PostWastHTMLElement {
  static observedAttributes = [
    "endpoint",
    "channels",
    "locale",
    "credentials",
    "timeout-ms",
  ];

  private readonly root = this.attachShadow({ mode: "open" });
  private mediaType: MediaType = "image";
  private file: File | null = null;
  private objectUrl: string | null = null;
  private description = "";
  private channelId = "";
  private publishState: "idle" | "publishing" | "success" | "error" = "idle";
  private errorMessage = "";
  private result: PostWastPublishResult | null = null;
  private feedback: Feedback | null = null;

  connectedCallback() {
    this.channelId = this.channels[0]?.id ?? "";
    this.render();
  }

  disconnectedCallback() {
    this.revokeObjectUrl();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  private get locale() {
    return getLocale(this.getAttribute("locale"));
  }

  private get text() {
    return labels[this.locale];
  }

  private get channels() {
    return getChannels(this.getAttribute("channels"));
  }

  private get endpoint() {
    return this.getAttribute("endpoint") ?? "";
  }

  private get credentials(): RequestCredentials {
    const value = this.getAttribute("credentials");
    return value === "omit" || value === "same-origin" ? value : "include";
  }

  private get timeoutMs() {
    const value = Number(this.getAttribute("timeout-ms"));
    return Number.isFinite(value) ? value : 120_000;
  }

  private revokeObjectUrl() {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  private clearFile() {
    this.revokeObjectUrl();
    this.file = null;
    this.errorMessage = "";
  }

  private dispatch(name: string, detail: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async selectFile(file: File | undefined) {
    if (!file) return;
    const selectedMediaType = this.mediaType;
    this.clearFile();
    if (
      !acceptedTypes[selectedMediaType].has(file.type) ||
      !(await hasValidPostWastFileSignature(file, selectedMediaType))
    ) {
      this.errorMessage = this.text.invalid;
      this.publishState = "error";
      this.render();
      return;
    }
    if (this.mediaType !== selectedMediaType) return;
    if (file.size > 50 * 1024 * 1024) {
      this.errorMessage = this.text.tooLarge;
      this.publishState = "error";
      this.render();
      return;
    }
    this.file = file;
    this.objectUrl = URL.createObjectURL(file);
    this.errorMessage = "";
    this.publishState = "idle";
    this.render();
  }

  private async publish() {
    const channel = this.channels.find((item) => item.id === this.channelId);
    if (!this.endpoint) {
      this.errorMessage = this.text.noEndpoint;
      this.publishState = "error";
      this.render();
      return;
    }
    if (!this.channels.length) {
      this.errorMessage = this.text.noChannels;
      this.publishState = "error";
      this.render();
      return;
    }
    if (!this.file) {
      this.errorMessage = this.text.invalid;
      this.publishState = "error";
      this.render();
      return;
    }
    if (!channel?.connected) {
      this.errorMessage = this.text.notConnected;
      this.publishState = "error";
      this.render();
      return;
    }

    const body = new FormData();
    body.append("file", this.file);
    body.append("mediaType", this.mediaType);
    body.append("description", this.description.trim());
    body.append("channelId", channel.id);
    this.publishState = "publishing";
    this.errorMessage = "";
    this.render();

    try {
      const response = await fetchPostWastResponse(
        fetch,
        this.endpoint,
        {
          method: "POST",
          body,
          credentials: this.credentials,
        },
        this.timeoutMs,
      );
      this.result = await readPostWastResponse(response);
      this.publishState = "success";
      this.dispatch("postwast-published", {
        result: this.result,
        channelId: channel.id,
        mediaType: this.mediaType,
        file: this.file,
        description: this.description.trim(),
      });
    } catch (error) {
      this.errorMessage =
        error instanceof Error ? error.message : this.text.failed;
      this.publishState = "error";
      this.dispatch("postwast-error", { error });
    }
    this.render();
  }

  private render() {
    const text = this.text;
    const channels = this.channels;
    if (!this.channelId && channels[0]) this.channelId = channels[0].id;
    const selectedChannel = channels.find((item) => item.id === this.channelId);
    this.root.innerHTML = `
      <style></style>
      <section class="shell">
        <header><strong class="brand"></strong><span class="brand-sub"></span></header>
        <div class="intro"><small>POSTWAST / PUBLISH LAYER</small><h1 class="title"></h1></div>
        <main>
          <section class="media">
            <div class="label-row"><strong class="media-label"></strong><div class="tabs">
              <button data-media="image" type="button"><span class="image-label"></span></button>
              <button data-media="video" type="button"><span class="video-label"></span></button>
            </div></div>
            <div class="dropzone"><div class="preview"></div><input type="file" hidden></div>
            <button class="choose" type="button"></button>
          </section>
          <aside>
            <label><span class="description-label"></span><textarea maxlength="500"></textarea></label>
            <small class="count"></small>
            <div class="label channel-label"></div>
            <div class="channels"></div>
            <button class="publish" type="button"><span class="publish-label"></span><span>↗</span></button>
            <p class="error" role="alert" hidden></p>
          </aside>
        </main>
        <div class="success-slot"></div>
        <div class="feedback-slot"></div>
      </section>`;

    const style = this.root.querySelector("style");
    if (style) style.textContent = webComponentStyles;
    const shell = this.root.querySelector<HTMLElement>(".shell");
    shell?.setAttribute("dir", text.dir);
    this.root.querySelector<HTMLElement>(".brand")!.textContent = "POSTWAST";
    this.root.querySelector<HTMLElement>(".brand-sub")!.textContent =
      this.locale === "ar"
        ? "طبقة الاتصال والنشر لمشروعك"
        : "Publish layer for your project";
    this.root.querySelector<HTMLElement>(".title")!.textContent =
      this.locale === "ar" ? "انشرها كما تراها." : "Publish as you see it.";
    this.root.querySelector<HTMLElement>(".media-label")!.textContent =
      text.media;
    this.root.querySelector<HTMLElement>(".image-label")!.textContent =
      text.image;
    this.root.querySelector<HTMLElement>(".video-label")!.textContent =
      text.video;
    this.root.querySelector<HTMLElement>(".description-label")!.textContent =
      text.description;
    this.root.querySelector<HTMLElement>(".channel-label")!.textContent =
      text.channel;
    this.root.querySelector<HTMLTextAreaElement>("textarea")!.placeholder =
      text.placeholder;
    this.root.querySelector<HTMLTextAreaElement>("textarea")!.value =
      this.description;
    this.root.querySelector<HTMLElement>(".count")!.textContent =
      `${this.description.length}/500`;
    this.root.querySelector<HTMLElement>(".choose")!.textContent = text.choose;
    const publishButton =
      this.root.querySelector<HTMLButtonElement>(".publish")!;
    publishButton.disabled = this.publishState === "publishing";
    publishButton.querySelector(".publish-label")!.textContent =
      this.publishState === "publishing" ? text.publishing : text.publish;
    const error = this.root.querySelector<HTMLElement>(".error")!;
    error.hidden = !this.errorMessage;
    error.textContent = this.errorMessage;

    const imageButton = this.root.querySelector<HTMLButtonElement>(
      '[data-media="image"]',
    )!;
    const videoButton = this.root.querySelector<HTMLButtonElement>(
      '[data-media="video"]',
    )!;
    imageButton.classList.toggle("active", this.mediaType === "image");
    videoButton.classList.toggle("active", this.mediaType === "video");
    const input =
      this.root.querySelector<HTMLInputElement>('input[type="file"]')!;
    input.accept =
      this.mediaType === "image"
        ? "image/jpeg,image/png,image/webp"
        : "video/mp4,video/webm,video/quicktime";
    const preview = this.root.querySelector<HTMLElement>(".preview")!;
    if (this.objectUrl) {
      const media = document.createElement(
        this.mediaType === "video" ? "video" : "img",
      );
      media.src = this.objectUrl;
      if (media instanceof HTMLVideoElement) {
        media.controls = true;
        media.muted = true;
        media.playsInline = true;
      } else {
        media.alt = this.file?.name ?? text.media;
      }
      media.addEventListener("click", (event) => {
        if (media instanceof HTMLVideoElement) event.stopPropagation();
      });
      preview.replaceChildren(media);
    } else {
      const content = document.createElement("div");
      content.className = "drop-content";
      const upload = document.createElement("div");
      upload.className = "upload";
      upload.textContent = "↑";
      const title = document.createElement("strong");
      title.textContent = text.drop;
      const supported = document.createElement("span");
      supported.textContent = text.supported;
      content.append(upload, title, supported);
      preview.replaceChildren(content);
    }

    input?.addEventListener("change", () => {
      void this.selectFile(input.files?.[0]);
    });
    const textarea = this.root.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea?.addEventListener("input", () => {
      this.description = textarea.value;
      const count = this.root.querySelector<HTMLElement>(".count");
      if (count) count.textContent = `${this.description.length}/500`;
    });
    const dropzone = this.root.querySelector(".dropzone")!;
    dropzone.addEventListener("click", (event) => {
      if (!(event.target instanceof HTMLVideoElement)) input.click();
    });
    dropzone.addEventListener("dragover", (event) => event.preventDefault());
    dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      const dropEvent = event as DragEvent;
      void this.selectFile(dropEvent.dataTransfer?.files[0]);
    });
    this.root
      .querySelector(".choose")
      ?.addEventListener("click", () => input?.click());
    publishButton.addEventListener("click", () => void this.publish());
    this.root
      .querySelectorAll<HTMLElement>("[data-media]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          this.mediaType = button.dataset.media as MediaType;
          this.clearFile();
          this.publishState = "idle";
          this.render();
        });
      });

    const channelsHost = this.root.querySelector<HTMLElement>(".channels")!;
    if (!channels.length) {
      const empty = document.createElement("p");
      empty.className = "error";
      empty.textContent = text.noChannels;
      channelsHost.append(empty);
    }
    for (const channel of channels) {
      const channelRow = document.createElement("div");
      channelRow.className = "channel-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = `channel ${channel.id === this.channelId ? "selected" : ""}`;
      const mark = document.createElement("span");
      mark.className = "mark";
      mark.textContent = channel.name.slice(0, 1).toUpperCase();
      const channelCopy = document.createElement("span");
      channelCopy.className = "channel-copy";
      const name = document.createElement("strong");
      name.textContent = channel.name;
      const description = document.createElement("small");
      description.textContent = channel.description ?? "";
      channelCopy.append(name, description);
      const status = document.createElement("small");
      status.className = `status ${channel.connected ? "connected" : ""}`;
      status.textContent = channel.connected
        ? text.connected
        : text.disconnected;
      button.append(mark, channelCopy, status);
      button.addEventListener("click", () => {
        this.channelId = channel.id;
        this.publishState = "idle";
        this.errorMessage = "";
        this.render();
      });
      channelRow.append(button);
      if (!channel.connected) {
        const connect = document.createElement("button");
        connect.type = "button";
        connect.className = "connect";
        connect.textContent = text.connect;
        connect.addEventListener("click", (event) => {
          event.stopPropagation();
          this.dispatch("postwast-connect", { channelId: channel.id });
        });
        channelRow.append(connect);
      }
      channelsHost.append(channelRow);
    }

    if (this.publishState === "success") {
      const successHost =
        this.root.querySelector<HTMLElement>(".success-slot")!;
      const success = document.createElement("div");
      success.className = "success";
      success.setAttribute("role", "status");
      const successText = document.createElement("strong");
      successText.textContent = `✓ ${text.success}`;
      success.append(successText);
      const resultUrl = safePostWastUrl(this.result?.url);
      if (resultUrl) {
        const link = document.createElement("a");
        link.href = resultUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = text.view;
        success.append(link);
      }
      const again = document.createElement("button");
      again.className = "again";
      again.type = "button";
      again.textContent = text.again;
      again.addEventListener("click", () => {
        this.publishState = "idle";
        this.result = null;
        this.feedback = null;
        this.render();
      });
      success.append(again);
      successHost.append(success);

      const feedbackHost =
        this.root.querySelector<HTMLElement>(".feedback-slot")!;
      const feedback = document.createElement("div");
      feedback.className = "feedback";
      const feedbackLabel = document.createElement("span");
      feedbackLabel.textContent = text.feedback;
      feedback.append(feedbackLabel);
      for (const value of ["like", "dislike"] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = this.feedback === value ? "active" : "";
        button.textContent = value === "like" ? text.like : text.dislike;
        button.addEventListener("click", () => {
          this.feedback = value;
          this.dispatch("postwast-feedback", { feedback: value });
          this.render();
        });
        feedback.append(button);
      }
      feedbackHost.append(feedback);
    }
  }
}

export function registerPostWastElement() {
  if (typeof customElements === "undefined") return;
  if (!customElements.get("postwast-publisher")) {
    customElements.define("postwast-publisher", PostWastElement);
  }
}

if (typeof customElements !== "undefined") {
  registerPostWastElement();
}

const webComponentStyles = `
  :host { display: block; color: #152f43; }
  * { box-sizing: border-box; }
  .shell { max-width: 1120px; margin: 0 auto; padding: 28px; overflow: hidden; background: radial-gradient(circle at 88% 12%, #b8ded8d1, transparent 28%), radial-gradient(circle at 10% 36%, #e8836d33, transparent 32%), #f5f0e8; font: 14px Inter, ui-sans-serif, system-ui, sans-serif; }
  header, .label-row, .channel, .success, .feedback { display: flex; align-items: center; justify-content: space-between; }
  header { padding-bottom: 20px; border-bottom: 1px solid #152f4330; } header span { color: #647a84; font-size: 11px; }
  .intro { margin: 64px 0 32px; } .intro small { color: #a56358; font-size: 10px; letter-spacing: .14em; } h1 { margin: 10px 0 0; font-size: clamp(38px, 6vw, 72px); line-height: .98; letter-spacing: -.06em; }
  main { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(290px, .72fr); gap: 18px; } .label-row { margin-bottom: 12px; font-size: 12px; }
  .tabs { display: flex; gap: 4px; padding: 4px; border-radius: 999px; background: #ffffff85; } .tabs button, .choose, .again, .feedback button { border: 0; border-radius: 999px; padding: 8px 13px; cursor: pointer; font: inherit; font-size: 11px; } .tabs button { color: #647a84; background: transparent; } .tabs .active { color: #fff; background: #152f43; }
  .dropzone { position: relative; min-height: 410px; overflow: hidden; border: 1px solid #152f4326; border-radius: 22px; background: #ffffff8c; box-shadow: 0 24px 60px #152f4324; cursor: pointer; } .dropzone::after { content: ""; position: absolute; inset: 14px; border: 1px dashed #152f4338; border-radius: 16px; pointer-events: none; } .dropzone img, .dropzone video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; }
  .drop-content { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 9px; z-index: 1; text-align: center; } .drop-content span { color: #647a84; font-size: 11px; } .upload { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 18px; background: #b8ded8; font-size: 28px; }
  .label { margin-bottom: 10px; color: #ffffffbd; font-size: 11px; font-weight: 700; } .channels { display: grid; gap: 8px; margin-bottom: 22px; } .channel-row { display: flex; gap: 8px; min-width: 0; } .channel { flex: 1; gap: 10px; padding: 9px; border: 1px solid #ffffff1f; border-radius: 14px; color: #fff; background: transparent; cursor: pointer; text-align: start; } .channel.selected { border-color: #b8ded8a8; background: #ffffff12; } .mark { display: grid; flex: 0 0 auto; place-items: center; width: 32px; height: 32px; border-radius: 10px; color: #152f43; background: #b8ded8; font-weight: 800; } .channel-copy { display: grid; min-width: 0; gap: 3px; } .channel-copy small { overflow: hidden; color: #ffffff80; text-overflow: ellipsis; white-space: nowrap; } .status { margin-inline-start: auto; color: #ffffff80; white-space: nowrap; } .status.connected { color: #b8ded8; } .connect { align-self: center; border: 0; border-radius: 8px; padding: 7px 9px; color: #152f43; background: #b8ded8; cursor: pointer; font: inherit; font-size: 10px; }
  .publish { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; margin-top: auto; padding: 15px 17px; border: 0; border-radius: 14px; color: #152f43; background: #e8836d; cursor: pointer; font-weight: 800; } .publish:disabled { cursor: wait; opacity: .7; } .error { color: #ffb09d; font-size: 11px; line-height: 1.6; } .success { gap: 12px; margin-top: 18px; padding: 14px 18px; border-radius: 14px; color: #152f43; background: #b8ded8; } .success a { color: #152f43; font-size: 11px; } .again { margin-inline-start: auto; color: #152f43; background: #ffffff8c; } .feedback { justify-content: flex-start; gap: 8px; margin-top: 9px; color: #647a84; font-size: 10px; } .feedback button { padding: 6px 9px; color: #152f43; background: #ffffff7a; } .feedback button.active { color: #b8ded8; background: #152f43; }
  @media (max-width: 760px) { .shell { padding: 18px; } .intro { margin: 48px 0 28px; } main { grid-template-columns: 1fr; } .dropzone { min-height: 300px; } }
`;
