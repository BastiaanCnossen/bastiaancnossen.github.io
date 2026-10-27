import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export async function waitFor(check, description, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { const value = await check(); if (value) return value; }
    catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out: ${description}${lastError ? ` (${lastError.message})` : ""}`);
}

export async function launchBrowser(url) {
  const candidates = [process.env.NOTES_READER_BROWSER, process.env.LAYERED_NOTES_BROWSER, process.env.SHT_WEB_BROWSER,
    path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env.ProgramFiles || "", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env.ProgramFiles || "", "Google/Chrome/Application/chrome.exe"),
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ].filter(Boolean);
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executable) throw new Error("Set NOTES_READER_BROWSER to an Edge, Chrome, or Chromium executable.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "notes-reader-test-"));
  const child = spawn(executable, ["--headless=new", "--disable-gpu", "--disable-extensions", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, url], { stdio: "ignore", windowsHide: true });
  let socket;
  let nextId = 0;
  const pending = new Map();
  const errors = [];
  const close = async () => {
    socket?.close();
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1000))]);
    }
    // Chromium may take a moment to release the profile on Windows.
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* OS temporary directory. */ }
  };
  try {
    const port = await waitFor(() => {
      const file = path.join(profile, "DevToolsActivePort");
      return fs.existsSync(file) && Number(fs.readFileSync(file, "utf8").split(/\r?\n/)[0]);
    }, "browser debugging port");
    const target = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((item) => item.type === "page"), "browser page");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      } else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 20000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await send("Page.enable");
    await send("Runtime.enable");
    const navigate = async (destination) => {
      await send("Page.navigate", { url: destination });
      await waitFor(() => evaluate(`location.href === ${JSON.stringify(destination)} && document.readyState === 'complete' && !!window.NotesReader`), destination);
    };
    return { send, evaluate, navigate, errors, close };
  } catch (error) { await close(); throw error; }
}
