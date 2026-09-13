---
name: PostWast responsibility boundary
description: The durable division between the reusable PostWast library and each host application.
---

PostWast is a reusable client-side publishing surface. It may validate media
signatures as a best-effort user experience improvement, normalize host HTTP
responses, and sanitize result links before rendering them. It must not assume
which provider, database, authentication system, storage service, or publishing
rules the host application uses.

**Why:** The library is intended for unrelated Replit projects and languages.
Putting provider credentials, persistence, authorization, or external-platform
behavior in the shared package would make it unsafe and prevent developers
from adapting it to their own backend.

**How to apply:** Keep host-specific work behind `PostWastAdapter` or the
documented multipart HTTP contract. Treat browser validation as advisory only;
the host server must repeat authorization, file validation, storage, and
provider checks.