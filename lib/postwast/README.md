# `postwast`

PostWast is a provider-agnostic React publishing surface. It owns the
publishing UI, media validation, preview, localization, and interaction states.
The host project owns authentication, storage, API calls, and publishing rules.

## Use from the repository

```bash
pnpm install
pnpm --filter postwast run build
```

This repository contains the `postwast` package. Use it according to the
license tier that applies to your project. Inside this workspace, import the
package as `postwast`. In an independent project, obtain the appropriate
license before copying or publishing the package to your organization's
registry, then install it with `pnpm add postwast react`.

Use `PostWastPublishFlow` in React projects, or import
`postwast/web-component` from a browser bundle for projects using plain HTML
or another server-side language.

## Usage

```tsx
import { createPostWastHttpAdapter, PostWastPublishFlow } from "postwast";

const adapter = createPostWastHttpAdapter({
  channels: [
    {
      id: "team-feed",
      name: "Team feed",
      description: "Your project's publishing destination",
      connected: true,
    },
  ],
  endpoint: "/api/posts",
});

export function PublishButton() {
  return (
    <PostWastPublishFlow
      adapter={adapter}
      locale="auto"
      effects={{ shader: true, shadow: true }}
    />
  );
}
```

`publish` receives the real `File` object. Keep tokens and provider
credentials on the host server; do not put them in the adapter or browser
bundle. If a channel needs a host-owned authorization flow, implement
`adapter.connect(channelId)` and update the channel's `connected` state after
the host flow completes.

## Use from PHP, Python, Go, and other web stacks

The same UI is also available as a browser Web Component, so a project does
not need React:

```html
<script type="module">
  import "postwast/web-component";
</script>

<postwast-publisher
  endpoint="/api/posts"
  locale="auto"
  channels='[
    {"id":"main","name":"My project","description":"Main publishing channel","connected":true}
  ]'
></postwast-publisher>
```

This works in plain HTML and server-rendered templates from PHP, Laravel,
Django, Rails, Go, Java, and similar stacks. The component dispatches
`postwast-published`, `postwast-error`, `postwast-feedback`, and
`postwast-connect` browser events. Listen for `postwast-connect` to start the
host application's authorization flow, then update the `channels` attribute
with the new connection state.
The backend contract below remains the same.

## Backend contract

The built-in HTTP adapter works with any backend language and any database.
Your server should accept a `POST multipart/form-data` request containing:

- `file`: the uploaded image or video
- `mediaType`: `image` or `video`
- `description`: the post description
- `channelId`: the host project's destination identifier

Return `2xx` and optionally JSON such as `{ "id": "post-123", "url": "/posts/123" }`.
Return a non-2xx response with optional JSON `{ "error": "..." }` for a
user-visible publishing error. SQLite is used entirely on the server side;
PostWast has no database driver and therefore does not depend on a database
choice.

An empty `2xx` response, including `204 No Content`, is also treated as a
successful publish. The client performs a best-effort media signature check
before uploading and only renders safe HTTP(S) result URLs. These checks
improve the user experience but are not a security boundary; the host server
must validate files, authorization, and provider responses again.

The React HTTP adapter uses a 120-second request timeout by default. Set
`timeoutMs` to another positive value, or to `0` to disable the client-side
timeout. The Web Component accepts the equivalent `timeout-ms` attribute.
