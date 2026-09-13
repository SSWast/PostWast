import { PostWastPublishFlow, type PostWastAdapter } from "postwast";

const demoAdapter: PostWastAdapter = {
  channels: [
    {
      id: "workspace",
      name: "مساحتي",
      description: "قناة المشروع الرئيسية",
      connected: true,
    },
    {
      id: "community",
      name: "مجتمعي",
      description: "قناة المجتمع",
      connected: true,
    },
  ],
  async publish() {
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    return { id: "preview-publish" };
  },
};

export function PublishFlow() {
  return (
    <PostWastPublishFlow
      adapter={demoAdapter}
      locale="ar"
      effects={{ shader: true, shadow: true }}
    />
  );
}
