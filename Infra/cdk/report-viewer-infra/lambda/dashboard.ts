import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.ALLURE_BUCKET_NAME!;

interface FolderInfo {
  name: string;
  fileCount: number;
  totalSize: number;
  lastModified: Date;
}

interface FileInfo {
  key: string;
  name: string;
  size: number;
  lastModified: Date;
  contentType: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const path = event.path || "/";
    const userEmail =
      event.requestContext.authorizer?.claims?.email || "unknown";

    console.log(`Request from ${userEmail}: ${path}`);
    console.log(`S3 Bucket: ${BUCKET_NAME}`);

    if (path === "/" || path === "/oauth2/idpresponse") {
      return await handleDashboard();
    } else if (path.startsWith("/browse/")) {
      const folder = decodeURIComponent(path.replace("/browse/", ""));
      return await handleFolderView(folder);
    } else if (path.startsWith("/view/")) {
      const key = decodeURIComponent(path.replace("/view/", ""));
      return await handleFileView(key);
    } else if (path.startsWith("/raw/")) {
      const key = decodeURIComponent(path.replace("/raw/", ""));
      return await serveRawFile(key);
    }

    return {
      statusCode: 404,
      headers: { "Content-Type": "text/html" },
      body: renderPage("404 Not Found", "<h2>404 - Page Not Found</h2>"),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: renderPage(
        "Error",
        `<h2>Internal Error</h2><pre>${JSON.stringify(error, null, 2)}</pre>`,
      ),
    };
  }
};

// ── Dashboard: folder grid ────────────────────────────────────────────────────

async function handleDashboard(): Promise<APIGatewayProxyResult> {
  const folders = await listFolders();

  const tableRows =
    folders.length > 0
      ? folders
          .map(
            (f) => `
      <tr>
        <td><a class="folder-link" href="/browse/${encodeURIComponent(f.name)}">📁 ${escHtml(f.name)}</a></td>
        <td>${f.fileCount.toLocaleString()}</td>
        <td>${formatBytes(f.totalSize)}</td>
        <td>${formatDate(f.lastModified)}</td>
      </tr>`,
          )
          .join("")
      : `<tr><td colspan="4" class="empty">No folders found in bucket <strong>${escHtml(BUCKET_NAME)}</strong>.</td></tr>`;

  const body = `
    <div class="toolbar">
      <span class="bucket-label">📦 ${escHtml(BUCKET_NAME)}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Folder</th>
          <th>Files</th>
          <th>Total Size</th>
          <th>Last Modified</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>`;

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    body: renderPage("Reports Dashboard", body),
  };
}

async function listFolders(): Promise<FolderInfo[]> {
  const topLevel = await s3Client.send(
    new ListObjectsV2Command({ Bucket: BUCKET_NAME, Delimiter: "/" }),
  );

  const prefixes = (topLevel.CommonPrefixes ?? [])
    .map((p) => p.Prefix?.replace(/\/$/, "") ?? "")
    .filter(Boolean);

  const folders = await Promise.all(prefixes.map(fetchFolderInfo));
  return folders.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}

async function fetchFolderInfo(folder: string): Promise<FolderInfo> {
  let fileCount = 0;
  let totalSize = 0;
  let lastModified = new Date(0);
  let token: string | undefined;

  do {
    const resp = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: `${folder}/`,
        ContinuationToken: token,
      }),
    );
    for (const obj of resp.Contents ?? []) {
      fileCount++;
      totalSize += obj.Size ?? 0;
      if (obj.LastModified && obj.LastModified > lastModified) {
        lastModified = obj.LastModified;
      }
    }
    token = resp.NextContinuationToken;
  } while (token);

  return { name: folder, fileCount, totalSize, lastModified };
}

// ── Folder view: file list ────────────────────────────────────────────────────

async function handleFolderView(folder: string): Promise<APIGatewayProxyResult> {
  const files = await listFiles(folder);

  const tableRows =
    files.length > 0
      ? files
          .map(
            (f) => `
      <tr>
        <td><a class="file-link" href="/view/${encodeURIComponent(f.key)}">${fileIcon(f.contentType)} ${escHtml(f.name)}</a></td>
        <td>${formatBytes(f.size)}</td>
        <td>${f.contentType}</td>
        <td>${formatDate(f.lastModified)}</td>
      </tr>`,
          )
          .join("")
      : `<tr><td colspan="4" class="empty">No files found.</td></tr>`;

  const body = `
    <div class="breadcrumb">
      <a href="/">Dashboard</a> / ${escHtml(folder)}
    </div>
    <table>
      <thead>
        <tr>
          <th>File</th>
          <th>Size</th>
          <th>Type</th>
          <th>Last Modified</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>`;

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    body: renderPage(`📁 ${folder}`, body),
  };
}

async function listFiles(folder: string): Promise<FileInfo[]> {
  const files: FileInfo[] = [];
  let token: string | undefined;

  do {
    const resp = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: `${folder}/`,
        ContinuationToken: token,
      }),
    );
    for (const obj of resp.Contents ?? []) {
      if (!obj.Key || obj.Key === `${folder}/`) continue;
      const name = obj.Key.slice(`${folder}/`.length);
      const ct = getContentType(obj.Key);
      files.push({
        key: obj.Key,
        name,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ?? new Date(),
        contentType: ct,
      });
    }
    token = resp.NextContinuationToken;
  } while (token);

  return files.sort((a, b) => a.name.localeCompare(b.name));
}

// ── File viewer ───────────────────────────────────────────────────────────────

async function handleFileView(key: string): Promise<APIGatewayProxyResult> {
  const contentType = getContentType(key);
  const parts = key.split("/");
  const folder = parts[0];
  const fileName = parts.slice(1).join("/");

  // Binary files: serve directly (browser renders inline or downloads)
  if (isBinaryType(contentType)) {
    return serveRawFile(key);
  }

  // HTML files: render inline inside an iframe for isolation
  if (contentType.startsWith("text/html")) {
    const rawUrl = `/raw/${encodeURIComponent(key)}`;
    const body = `
      <div class="breadcrumb">
        <a href="/">Dashboard</a> / <a href="/browse/${encodeURIComponent(folder)}">${escHtml(folder)}</a> / ${escHtml(fileName)}
        <a class="raw-link" href="${rawUrl}" target="_blank">Open raw ↗</a>
      </div>
      <iframe src="${rawUrl}" class="file-iframe" title="${escHtml(fileName)}"></iframe>`;
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: renderPage(fileName, body, { wideIframe: true }),
    };
  }

  // Text files: fetch content and display in <pre>
  const content = await fetchTextContent(key);
  const lang = getLang(key);
  const body = `
    <div class="breadcrumb">
      <a href="/">Dashboard</a> / <a href="/browse/${encodeURIComponent(folder)}">${escHtml(folder)}</a> / ${escHtml(fileName)}
      <a class="raw-link" href="/raw/${encodeURIComponent(key)}" target="_blank">Download ↗</a>
    </div>
    <div class="file-viewer">
      <div class="file-viewer-header">
        <span>${escHtml(fileName)}</span>
        <span class="lang-badge">${lang}</span>
      </div>
      <pre class="file-content"><code>${escHtml(content)}</code></pre>
    </div>`;

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    body: renderPage(fileName, body),
  };
}

async function fetchTextContent(key: string): Promise<string> {
  const resp = await s3Client.send(
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
  );
  const stream = resp.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function serveRawFile(key: string): Promise<APIGatewayProxyResult> {
  try {
    const resp = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
    );
    const stream = resp.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const contentType = getContentType(key);
    const binary = isBinaryType(contentType);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
      body: binary ? buffer.toString("base64") : buffer.toString("utf-8"),
      isBase64Encoded: binary,
    };
  } catch (error: any) {
    if (error.name === "NoSuchKey") {
      return {
        statusCode: 404,
        headers: { "Content-Type": "text/html" },
        body: renderPage("Not Found", `<h2>404 – File not found</h2><p><code>${escHtml(key)}</code></p>`),
      };
    }
    throw error;
  }
}

// ── HTML shell ────────────────────────────────────────────────────────────────

function renderPage(
  title: string,
  body: string,
  opts: { wideIframe?: boolean } = {},
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background: #f1f5f9;
      color: #1e293b;
      min-height: 100vh;
    }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
      padding: 1rem 2rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    header h1 { font-size: 1.4rem; font-weight: 700; }
    header a { color: #fff; text-decoration: none; opacity: 0.85; }
    header a:hover { opacity: 1; }
    .main { max-width: ${opts.wideIframe ? "100%" : "1200px"}; margin: 2rem auto; padding: 0 1.5rem; }
    .toolbar {
      display: flex;
      align-items: center;
      margin-bottom: 1rem;
    }
    .bucket-label {
      font-size: 0.875rem;
      background: #e0e7ff;
      color: #3730a3;
      padding: 0.3rem 0.75rem;
      border-radius: 999px;
      font-weight: 500;
    }
    .breadcrumb {
      font-size: 0.9rem;
      color: #64748b;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .breadcrumb a { color: #667eea; text-decoration: none; }
    .breadcrumb a:hover { text-decoration: underline; }
    .raw-link {
      margin-left: auto;
      font-size: 0.8rem;
      color: #667eea;
      text-decoration: none;
      border: 1px solid #667eea;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
    }
    .raw-link:hover { background: #667eea; color: #fff; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }
    thead { background: #f8fafc; }
    th {
      text-align: left;
      padding: 0.85rem 1.25rem;
      font-size: 0.78rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #64748b;
      border-bottom: 1px solid #e2e8f0;
    }
    td {
      padding: 0.85rem 1.25rem;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.9rem;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f8fafc; }
    .folder-link, .file-link {
      color: #334155;
      text-decoration: none;
      font-weight: 500;
    }
    .folder-link:hover, .file-link:hover { color: #667eea; }
    .empty {
      text-align: center;
      color: #94a3b8;
      padding: 3rem 1rem;
    }
    /* File viewer */
    .file-viewer {
      background: #fff;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }
    .file-viewer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1.25rem;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      font-size: 0.875rem;
      font-weight: 600;
      color: #475569;
    }
    .lang-badge {
      font-size: 0.75rem;
      background: #e0e7ff;
      color: #3730a3;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-weight: 500;
      text-transform: uppercase;
    }
    .file-content {
      padding: 1.25rem;
      overflow: auto;
      max-height: 75vh;
      font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
      font-size: 0.825rem;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-all;
      color: #1e293b;
    }
    /* iFrame viewer */
    .file-iframe {
      width: 100%;
      height: calc(100vh - 160px);
      border: none;
      border-radius: 10px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      background: #fff;
    }
  </style>
</head>
<body>
  <header>
    <h1><a href="/">📊 Reports Dashboard</a></h1>
  </header>
  <div class="main">
    ${body}
  </div>
</body>
</html>`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function getContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const types: Record<string, string> = {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    mjs: "application/javascript; charset=utf-8",
    json: "application/json; charset=utf-8",
    xml: "application/xml; charset=utf-8",
    txt: "text/plain; charset=utf-8",
    md: "text/plain; charset=utf-8",
    csv: "text/plain; charset=utf-8",
    log: "text/plain; charset=utf-8",
    yaml: "text/plain; charset=utf-8",
    yml: "text/plain; charset=utf-8",
    sh: "text/plain; charset=utf-8",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    ico: "image/x-icon",
    webp: "image/webp",
    ttf: "font/ttf",
    woff: "font/woff",
    woff2: "font/woff2",
    eot: "application/vnd.ms-fontobject",
    pdf: "application/pdf",
  };
  return types[ext] ?? "application/octet-stream";
}

function isBinaryType(contentType: string): boolean {
  return (
    !contentType.includes("text") &&
    !contentType.includes("javascript") &&
    !contentType.includes("json") &&
    !contentType.includes("xml") &&
    !contentType.includes("svg")
  );
}

function getLang(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const langs: Record<string, string> = {
    js: "JS", mjs: "JS", ts: "TS", json: "JSON", xml: "XML",
    yaml: "YAML", yml: "YAML", html: "HTML", htm: "HTML",
    css: "CSS", md: "Markdown", txt: "Text", csv: "CSV",
    log: "Log", sh: "Shell",
  };
  return langs[ext] ?? (ext.toUpperCase() || "Text");
}

function fileIcon(contentType: string): string {
  if (contentType.startsWith("image/")) return "🖼️";
  if (contentType.includes("json")) return "📋";
  if (contentType.includes("html")) return "🌐";
  if (contentType.includes("javascript")) return "📜";
  if (contentType.includes("pdf")) return "📄";
  if (contentType.includes("xml")) return "📋";
  return "📄";
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
