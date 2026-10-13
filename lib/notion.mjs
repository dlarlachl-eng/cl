#!/usr/bin/env node
// 노션 연동: 결과물을 노션 페이지로 저장
//   node lib/notion.mjs setup                         토큰·페이지 등록 (처음 한 번)
//   node lib/notion.mjs upload <작업> <결과폴더> <최종본파일>
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(ROOT, "notion.env");
const API = process.env.NOTION_API_URL || "https://api.notion.com/v1";
const VERSION = "2022-06-28";
const TEXT_LIMIT = 1900; // 노션 텍스트 조각 한도(2000자)보다 조금 작게
const BATCH = 100; // 한 번에 추가할 수 있는 블록 수

const KIND_LABEL = {
  youtube: "유튜브",
  insta: "인스타",
  business: "사업기획",
  travel: "여행",
  design: "디자인",
};

function loadConfig() {
  const cfg = { token: process.env.NOTION_TOKEN, pageId: process.env.NOTION_PAGE_ID };
  if (fs.existsSync(ENV_FILE)) {
    for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
      const m = line.match(/^\s*(NOTION_TOKEN|NOTION_PAGE_ID)\s*=\s*(.+?)\s*$/);
      if (m && !cfg[m[1] === "NOTION_TOKEN" ? "token" : "pageId"]) {
        cfg[m[1] === "NOTION_TOKEN" ? "token" : "pageId"] = m[2];
      }
    }
  }
  return cfg;
}

// 페이지 링크나 ID에서 32자리 ID만 뽑기
export function parsePageId(input) {
  const hex = input.split(/[?#]/)[0].replace(/[-/]/g, "").match(/[0-9a-f]{32}$/i);
  return hex ? hex[0].toLowerCase() : null;
}

async function notion(token, method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint =
      res.status === 401 ? " (토큰이 틀렸습니다)" :
      res.status === 404 ? " (페이지에 연결(Connections)을 추가했는지 확인하세요)" : "";
    throw new Error(`노션 오류 ${res.status}: ${data.message || res.statusText}${hint}`);
  }
  return data;
}

// ---------- 마크다운 → 노션 블록 ----------

// **굵게**, `코드`, [링크](url) 정도만 처리
export function richText(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  const push = (content, extra = {}) => {
    for (let i = 0; i < content.length; i += TEXT_LIMIT) {
      out.push({ type: "text", text: { content: content.slice(i, i + TEXT_LIMIT), ...extra.text }, annotations: extra.annotations });
    }
  };
  for (const m of text.matchAll(re)) {
    if (m.index > last) push(text.slice(last, m.index));
    if (m[1]) push(m[1], { annotations: { bold: true } });
    else if (m[2]) push(m[2], { annotations: { code: true } });
    else push(m[3], { text: { link: { url: m[4] } } });
    last = m.index + m[0].length;
  }
  if (last < text.length) push(text.slice(last));
  return out.map((r) => (r.annotations ? r : { type: r.type, text: r.text }));
}

const block = (type, text, extra = {}) => ({ type, [type]: { rich_text: richText(text), ...extra } });

function tableBlock(rows) {
  const cells = rows
    .filter((r) => !/^\|?\s*:?-{2,}/.test(r))
    .map((r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()));
  const width = Math.max(...cells.map((c) => c.length));
  return {
    type: "table",
    table: {
      table_width: width,
      has_column_header: true,
      has_row_header: false,
      children: cells.slice(0, BATCH).map((c) => ({
        type: "table_row",
        table_row: { cells: Array.from({ length: width }, (_, i) => richText(c[i] || "")) },
      })),
    },
  };
}

export function markdownToBlocks(md) {
  const lines = md.replace(/\r/g, "").split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if (/^```/.test(line)) {
      const code = [];
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
      blocks.push(block("code", code.join("\n"), { language: "plain text" }));
    } else if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows = [line];
      while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1])) rows.push(lines[++i]);
      blocks.push(tableBlock(rows));
    } else if ((m = line.match(/^(#{1,6})\s+(.*)/))) {
      blocks.push(block(`heading_${Math.min(m[1].length, 3)}`, m[2]));
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: "divider", divider: {} });
    } else if ((m = line.match(/^\s*[-*+]\s+\[( |x)\]\s+(.*)/i))) {
      blocks.push(block("to_do", m[2], { checked: m[1].toLowerCase() === "x" }));
    } else if ((m = line.match(/^\s*[-*+]\s+(.*)/))) {
      blocks.push(block("bulleted_list_item", m[1]));
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
      blocks.push(block("numbered_list_item", m[1]));
    } else if ((m = line.match(/^>\s?(.*)/))) {
      blocks.push(block("quote", m[1]));
    } else if (line.trim()) {
      blocks.push(block("paragraph", line));
    }
  }
  return blocks;
}

// ---------- 명령 ----------

async function setup() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("노션 연결 설정을 시작합니다. (README의 '노션 자동 저장' 참고)\n");
  const token = (await rl.question("1) 노션 통합 시크릿(ntn_ 로 시작)을 붙여넣으세요: ")).trim();
  const link = (await rl.question("2) 결과를 모을 노션 페이지 링크를 붙여넣으세요: ")).trim();
  rl.close();

  const pageId = parsePageId(link);
  if (!token) throw new Error("시크릿이 비어 있습니다.");
  if (!pageId) throw new Error("페이지 링크에서 ID를 찾지 못했습니다. 노션에서 '링크 복사'한 주소를 넣어 주세요.");

  const page = await notion(token, "GET", `/pages/${pageId}`);
  const title = Object.values(page.properties || {}).find((p) => p.type === "title")?.title?.map((t) => t.plain_text).join("") || "(제목 없음)";
  fs.writeFileSync(ENV_FILE, `NOTION_TOKEN=${token}\nNOTION_PAGE_ID=${pageId}\n`, { mode: 0o600 });
  console.log(`\n✔ 연결 성공: "${title}" 페이지에 결과가 저장됩니다.`);
}

async function upload(kind, outDir, finalFile) {
  const { token, pageId } = loadConfig();
  if (!token || !pageId) return; // 노션 설정 안 했으면 조용히 건너뜀

  const topic = fs.readFileSync(path.join(outDir, "0_주제.txt"), "utf8").trim();
  const now = new Date();
  const date = `${now.getMonth() + 1}/${now.getDate()}`;
  const title = `[${KIND_LABEL[kind] || kind}] ${topic} (${date})`;

  const body = markdownToBlocks(fs.readFileSync(finalFile, "utf8"));

  // 중간 단계 결과는 접기(토글)로 맨 아래에
  const steps = fs.readdirSync(outDir)
    .filter((f) => /^\d+_.*\.md$/.test(f) && path.join(outDir, f) !== finalFile)
    .sort();
  if (steps.length) {
    body.push({ type: "divider", divider: {} }, block("heading_3", "중간 과정"));
    for (const f of steps) {
      const text = fs.readFileSync(path.join(outDir, f), "utf8");
      const chunks = text.match(new RegExp(`[\\s\\S]{1,${TEXT_LIMIT}}`, "g")) || [""];
      body.push({
        type: "toggle",
        toggle: {
          rich_text: richText(f.replace(/\.md$/, "")),
          children: chunks.slice(0, BATCH).map((c) => ({ type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: c } }] } })),
        },
      });
    }
  }

  const page = await notion(token, "POST", "/pages", {
    parent: { page_id: pageId },
    icon: { type: "emoji", emoji: "🤖" },
    properties: { title: { title: [{ type: "text", text: { content: title } }] } },
    children: body.slice(0, BATCH),
  });
  for (let i = BATCH; i < body.length; i += BATCH) {
    await notion(token, "PATCH", `/blocks/${page.id}/children`, { children: body.slice(i, i + BATCH) });
  }
  console.error(`\x1b[1;36m▶ 노션에 저장: ${page.url}\x1b[0m`);
}

const [cmd, ...args] = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("notion.mjs")) {
  const run = cmd === "setup" ? setup() : cmd === "upload" ? upload(...args) : Promise.reject(new Error("사용법: notion.mjs setup | upload <작업> <결과폴더> <최종본>"));
  run.catch((e) => {
    console.error(`\x1b[1;33m⚠ ${e.message}\x1b[0m`);
    process.exit(cmd === "upload" ? 0 : 1); // 업로드 실패해도 결과 파일은 이미 저장됨
  });
}
