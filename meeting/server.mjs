#!/usr/bin/env node
// AI 회의실: AI 직원들이 돌아가며 안건을 토론하고, 대표가 후보안을 정리해 결론을 냄
//   node meeting/server.mjs ["안건"] [-f 참고파일] [--rounds 3] [--port 4800]
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DRY_RUN = process.env.DRY_RUN === "1";

// ---------- 인자 ----------

const opts = { topic: "", rounds: 2, port: 4800, ref: "", open: true };
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-f" || a === "--file") {
      const f = argv[++i];
      if (!f || !fs.existsSync(f)) die(`파일이 없습니다: ${f}`);
      opts.ref += `\n\n[참고자료: ${path.basename(f)}]\n${fs.readFileSync(f, "utf8")}`;
    } else if (a === "--rounds") opts.rounds = clampRounds(argv[++i]);
    else if (a === "--port") opts.port = Number(argv[++i]) || opts.port;
    else if (a === "--no-open") opts.open = false;
    else if (a === "-h" || a === "--help") {
      console.log('사용법: ai meeting ["안건"] [-f 참고파일] [--rounds 3] [--port 4800]');
      process.exit(0);
    } else opts.topic = opts.topic ? `${opts.topic} ${a}` : a;
  }
}

function die(msg) {
  console.error(`\x1b[1;31m✖ ${msg}\x1b[0m`);
  process.exit(1);
}
function warn(msg) {
  console.error(`\x1b[1;33m⚠ ${msg}\x1b[0m`);
}
function clampRounds(v) {
  return Math.min(5, Math.max(1, Number(v) || 2));
}

// 내 회의실 구성(meeting/roster.json)이 있으면 그걸, 없으면 예시를 씀
function loadRoster() {
  const mine = path.join(HERE, "roster.json");
  const file = fs.existsSync(mine) ? mine : path.join(HERE, "roster.example.json");
  const roster = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!roster.members?.some((m) => m.id === roster.chair)) die(`${file}: chair 가 members 안에 없습니다`);
  return roster;
}

function profile() {
  const f = path.join(ROOT, "profile.md");
  return fs.existsSync(f) ? `[나(대표·사용자)에 대한 정보]\n${fs.readFileSync(f, "utf8")}\n\n` : "";
}

// ---------- AI 호출 (lib/common.sh 의 ask 와 같은 규칙) ----------

const CMD = {
  claude: process.env.CLAUDE_CMD || "claude",
  gpt: process.env.GPT_CMD || "codex",
  gemini: process.env.GEMINI_CMD || (has("agy") ? "agy" : "gemini"),
};
const ENGINE_LABEL = { claude: "Claude", gpt: "Codex", gemini: "Gemini" };

function has(cmd) {
  const which = process.platform === "win32" ? "where" : "which";
  return spawnSync(which, [cmd], { stdio: "ignore" }).status === 0;
}

let current = null; // 실행 중인 AI 프로세스 (회의 중단 시 종료)

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    current = child;
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      current = null;
      code === 0 ? resolve(out) : reject(new Error(err.trim().split("\n").pop() || `종료 코드 ${code}`));
    });
  });
}

async function call(who, prompt) {
  if (who === "gpt") {
    // codex exec 는 진행 로그가 많아서 마지막 답변만 파일로 받음
    const tmp = path.join(os.tmpdir(), `meeting_${process.pid}_${Date.now()}.txt`);
    try {
      await run(CMD.gpt, ["exec", "--skip-git-repo-check", "--output-last-message", tmp, prompt]);
      return fs.readFileSync(tmp, "utf8");
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  return run(CMD[who], ["-p", prompt]);
}

// 원하는 AI가 없거나 빈 답을 내면 설치된 다른 AI로 대신 실행
async function ask(want, prompt, dryAnswer) {
  if (DRY_RUN) {
    await sleep(600);
    return { text: dryAnswer(), engine: want };
  }
  for (const who of [...new Set([want, "claude", "gpt", "gemini"])]) {
    if (state.status === "stopped") throw new Stopped();
    if (!has(CMD[who])) continue;
    if (who !== want) warn(`${want} 대신 ${who} 로 실행합니다`);
    try {
      const text = (await call(who, prompt)).trim();
      if (text) return { text, engine: who };
      warn(`${who} 가 빈 답을 냈습니다`);
    } catch (e) {
      if (state.status === "stopped") throw new Stopped();
      warn(`${who} 실행 실패: ${e.message}`);
    }
  }
  throw new Error("답을 받은 AI가 없습니다. ai check 와 각 도구 로그인을 확인하세요.");
}

class Stopped extends Error {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 회의 상태 ----------

const roster = loadRoster();
const chair = () => roster.members.find((m) => m.id === roster.chair);

const state = {
  status: "idle", // idle | running | paused | done | stopped | error
  topic: opts.topic,
  rounds: opts.rounds,
  round: 0,
  speaker: null,
  log: [], // { round, id, name, role, engine, kind: "speech"|"summary"|"owner"|"conclusion", text, at }
  board: [], // { name, status: "keep"|"drop", note }
  next: "",
  conclusion: "",
  outDir: "",
  error: "",
};
let ownerNotes = []; // 대표(사용자)가 회의 중에 넣은, 아직 반영 안 된 지시

const clients = new Set();
function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
function snapshot() {
  return { roster, engines: ENGINE_LABEL, dryRun: DRY_RUN, ...state };
}
function setState(patch) {
  Object.assign(state, patch);
  broadcast("state", snapshot());
}
function addLog(entry) {
  state.log.push({ ...entry, at: new Date().toISOString() });
  broadcast("state", snapshot());
  save();
}

async function checkpoint() {
  while (state.status === "paused") await sleep(300);
  if (state.status === "stopped") throw new Stopped();
}

// ---------- 프롬프트 ----------

function transcript() {
  if (!state.log.length) return "(아직 발언 없음)";
  return state.log
    .map((l) =>
      l.kind === "owner" ? `[대표(사용자) 지시] ${l.text}` :
      l.kind === "summary" ? `[R${l.round} 정리 · ${l.role} ${l.name}] ${l.text}` :
      `[R${l.round} · ${l.role} ${l.name}] ${l.text}`)
    .join("\n");
}

function boardText() {
  if (!state.board.length) return "(아직 없음)";
  return state.board.map((c) => `- ${c.name} [${c.status === "drop" ? "제외" : "유지"}] ${c.note || ""}`).join("\n");
}

function header(m) {
  return `${profile()}너는 '${roster.company}' 회의에 참석한 ${m.role} ${m.name}이야.
성격·관점: ${m.persona}
회의 참석자: ${roster.members.map((x) => `${x.role} ${x.name}`).join(", ")}
안건: ${state.topic}${opts.ref}`;
}

function speechPrompt(m) {
  const notes = ownerNotes.length ? `\n[대표(사용자)가 방금 한 지시 — 반드시 반영]\n${ownerNotes.join("\n")}\n` : "";
  return `${header(m)}

[후보 보드]
${boardText()}
${state.next ? `\n[이번 라운드 집중 질문] ${state.next}\n` : ""}${notes}
[지금까지 회의 내용]
${transcript()}

라운드 ${state.round}/${state.rounds}, 네 차례야. 실제 회의에서 말하듯 대답해.
- 앞사람 의견에 동의하는지 반박하는지 분명히 하고, 네 관점에서 구체적인 아이디어·수치·우려를 말해.
- 3~5문장. 인사말, 서론, 마크다운 제목, 목록 없이 말로만.
- 이미 나온 말을 반복하지 마.`;
}

function summaryPrompt(m) {
  return `${header(m)}

[기존 후보 보드]
${boardText()}

[지금까지 회의 내용]
${transcript()}

너는 회의 진행자야. 라운드 ${state.round}/${state.rounds}를 정리해.
후보 보드를 갱신해: 나온 안을 짧은 이름으로 올리고, 근거가 약하거나 대표가 제외한 안은 drop 으로 표시해. 기존 후보도 빠뜨리지 마.
다른 말 없이 아래 형식의 JSON 만 출력해.
{"summary":"이번 라운드 정리 1~2문장 (말하듯)","candidates":[{"name":"짧은 이름","status":"keep 또는 drop","note":"한 줄 이유"}],"next":"다음 라운드에서 따질 질문 하나"}`;
}

function conclusionPrompt(m) {
  return `${header(m)}

[최종 후보 보드]
${boardText()}

[전체 회의 내용]
${transcript()}

너는 회의 진행자야. 회의를 마무리하는 결론 보고서를 마크다운으로 써줘.
목차:
## 결정안 (한 줄)
## 왜 이 안인가 (회의에서 나온 근거 중심)
## 실행 계획 (표: 할 일 | 담당 | 기한)
## 남은 리스크와 대응
## 버린 안과 이유
## 대표(사용자)가 확인할 것`;
}

function parseSummary(text) {
  const raw = text.match(/\{[\s\S]*\}/)?.[0];
  try {
    const j = JSON.parse(raw);
    return {
      summary: String(j.summary || ""),
      candidates: Array.isArray(j.candidates)
        ? j.candidates.filter((c) => c?.name).map((c) => ({ name: String(c.name), status: c.status === "drop" ? "drop" : "keep", note: String(c.note || "") }))
        : null,
      next: String(j.next || ""),
    };
  } catch {
    return { summary: text, candidates: null, next: "" }; // 형식이 틀리면 보드는 그대로 둠
  }
}

// ---------- DRY_RUN 가짜 답 ----------

const dry = {
  speech: (m) => () => `[DRY_RUN ${m.role}] 라운드 ${state.round}에서 ${m.role} 관점으로 '${state.topic}'에 대한 의견을 냅니다. 앞사람 의견에 일부 동의하지만 비용이 걱정됩니다.`,
  summary: () => () => JSON.stringify({
    summary: `라운드 ${state.round} 정리: 두 안이 나왔고 하나는 보류합니다.`,
    candidates: [
      { name: "안 A", status: "keep", note: "기존 자산 활용 가능" },
      { name: "안 B", status: state.round > 1 ? "drop" : "keep", note: "비용 대비 효과 불확실" },
    ],
    next: "안 A를 2주 안에 검증할 방법은?",
  }),
  conclusion: () => () => `## 결정안 (한 줄)\n안 A로 간다.\n\n## 실행 계획 (표: 할 일 | 담당 | 기한)\n| 할 일 | 담당 | 기한 |\n|---|---|---|\n| 시제품 | 개발자 | 1주 |`,
};

// ---------- 회의 진행 ----------

async function meeting() {
  const c = chair();
  const others = roster.members.filter((m) => m.id !== c.id);
  try {
    for (state.round = 1; state.round <= state.rounds; state.round++) {
      for (const m of others) {
        await checkpoint();
        setState({ speaker: m.id });
        const prompt = speechPrompt(m);
        const used = ownerNotes.length;
        const { text, engine } = await ask(m.ai, prompt, dry.speech(m));
        ownerNotes = ownerNotes.slice(used); // 이 발언에 들어간 지시는 반영된 것으로 봄
        addLog({ round: state.round, id: m.id, name: m.name, role: m.role, engine, kind: "speech", text });
      }
      await checkpoint();
      setState({ speaker: c.id });
      const { text, engine } = await ask(c.ai, summaryPrompt(c), dry.summary());
      const s = parseSummary(text);
      if (s.candidates) state.board = s.candidates;
      state.next = s.next;
      addLog({ round: state.round, id: c.id, name: c.name, role: c.role, engine, kind: "summary", text: s.summary + (s.next ? `\n다음 질문: ${s.next}` : "") });
    }
    state.round = state.rounds;
    await checkpoint();
    setState({ speaker: c.id });
    const { text, engine } = await ask(c.ai, conclusionPrompt(c), dry.conclusion());
    state.conclusion = text;
    addLog({ round: state.rounds, id: c.id, name: c.name, role: c.role, engine, kind: "conclusion", text });
    setState({ status: "done", speaker: null });
    save();
    uploadToNotion();
  } catch (e) {
    if (e instanceof Stopped) setState({ status: "stopped", speaker: null });
    else setState({ status: "error", speaker: null, error: e.message });
    save();
  }
}

function start(topic, rounds) {
  if (state.status === "running" || state.status === "paused") return "이미 회의 중입니다";
  if (!topic?.trim()) return "안건을 입력하세요";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
  const slug = topic.trim().replace(/[\s/]+/g, "_").slice(0, 40);
  const outDir = path.join(ROOT, "output", `${stamp}_meeting_${slug}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "0_주제.txt"), `${topic.trim()}\n`);
  ownerNotes = [];
  Object.assign(state, {
    status: "running", topic: topic.trim(), rounds: clampRounds(rounds), round: 1,
    speaker: null, log: [], board: [], next: "", conclusion: "", outDir, error: "",
  });
  broadcast("state", snapshot());
  console.error(`\x1b[1;36m▶ 회의 시작: ${state.topic} (결과: ${outDir})\x1b[0m`);
  meeting();
  return null;
}

// ---------- 저장 ----------

function exportJson() {
  return {
    company: roster.company,
    topic: state.topic,
    rounds: state.rounds,
    status: state.status,
    members: roster.members,
    board: state.board,
    log: state.log,
    conclusion: state.conclusion,
  };
}

function minutesMd() {
  const lines = [`# 회의록: ${state.topic}`, "", `참석: ${roster.members.map((m) => `${m.role} ${m.name}(${ENGINE_LABEL[m.ai] || m.ai})`).join(", ")}`, ""];
  let round = 0;
  for (const l of state.log) {
    if (l.kind === "conclusion") continue;
    if (l.round !== round) lines.push(`## 라운드 ${(round = l.round)}`, "");
    const who = l.kind === "owner" ? "**대표(사용자) 지시**" : `**${l.role} ${l.name}**${l.kind === "summary" ? " (정리)" : ""}`;
    lines.push(`${who}: ${l.text}`, "");
  }
  if (state.board.length) {
    lines.push("## 후보 보드", "", "| 후보 | 상태 | 메모 |", "|---|---|---|");
    for (const c of state.board) lines.push(`| ${c.name} | ${c.status === "drop" ? "제외" : "유지"} | ${c.note} |`);
  }
  return lines.join("\n") + "\n";
}

function save() {
  if (!state.outDir) return;
  fs.writeFileSync(path.join(state.outDir, "회의록.json"), JSON.stringify(exportJson(), null, 2));
  fs.writeFileSync(path.join(state.outDir, "1_회의록.md"), minutesMd());
  if (state.conclusion) fs.writeFileSync(path.join(state.outDir, "2_결론.md"), state.conclusion + "\n");
}

function uploadToNotion() {
  if (DRY_RUN || !(fs.existsSync(path.join(ROOT, "notion.env")) || process.env.NOTION_TOKEN)) return;
  spawn(process.execPath, [path.join(ROOT, "lib", "notion.mjs"), "upload", "meeting", state.outDir, path.join(state.outDir, "2_결론.md")], { stdio: "inherit" });
}

// ---------- 웹 서버 ----------

function body(req) {
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (d) => (s += d));
    req.on("end", () => {
      try { resolve(JSON.parse(s || "{}")); } catch { resolve({}); }
    });
  });
}

function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const route = `${req.method} ${url.pathname}`;

  if (route === "GET /") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(HERE, "index.html")));
  }
  if (route === "GET /api/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    return req.on("close", () => clients.delete(res));
  }
  if (route === "GET /api/export") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`회의록_${state.topic || "meeting"}.json`)}`,
    });
    return res.end(JSON.stringify(exportJson(), null, 2));
  }
  if (req.method !== "POST") return json(res, 404, { error: "없는 주소입니다" });

  const b = await body(req);
  switch (url.pathname) {
    case "/api/start": {
      const err = start(b.topic, b.rounds);
      return json(res, err ? 400 : 200, err ? { error: err } : { ok: true });
    }
    case "/api/pause":
      if (state.status === "running") setState({ status: "paused" });
      return json(res, 200, { ok: true });
    case "/api/resume":
      if (state.status === "paused") setState({ status: "running" });
      return json(res, 200, { ok: true });
    case "/api/stop":
      if (state.status === "running" || state.status === "paused") {
        setState({ status: "stopped" });
        current?.kill();
      }
      return json(res, 200, { ok: true });
    case "/api/say": {
      const text = String(b.text || "").trim();
      if (!text) return json(res, 400, { error: "내용을 입력하세요" });
      if (state.status !== "running" && state.status !== "paused") return json(res, 400, { error: "회의 중에만 지시할 수 있습니다" });
      ownerNotes.push(text);
      addLog({ round: state.round, id: "owner", name: "나", role: "대표", engine: "", kind: "owner", text });
      return json(res, 200, { ok: true });
    }
    default:
      return json(res, 404, { error: "없는 주소입니다" });
  }
});

server.on("error", (e) => die(e.code === "EADDRINUSE" ? `포트 ${opts.port}가 사용 중입니다. --port 4801 처럼 다른 번호를 쓰세요.` : e.message));
server.listen(opts.port, "127.0.0.1", () => {
  const url = `http://localhost:${opts.port}`;
  console.error(`\x1b[1;36m▶ AI 회의실: ${url}  (끝내려면 Ctrl+C)\x1b[0m`);
  for (const m of roster.members) {
    if (!DRY_RUN && !has(CMD[m.ai])) warn(`${m.role} ${m.name}의 ${CMD[m.ai]} 가 없어서 다른 AI가 대신 말합니다`);
  }
  if (opts.topic) start(opts.topic, opts.rounds);
  if (opts.open) {
    const opener = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
    spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  }
});
