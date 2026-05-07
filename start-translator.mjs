import * as launcher from 'chrome-launcher';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ========== 配置 ==========
const TARGET_LANG = 'zh-CN';          // 目标语言，可改为 en, ja, ko, fr, de, es 等
const PROXY = '';                      // 代理地址，如 'http://127.0.0.1:7890'，留空不使用
const START_URL = 'https://en.wikipedia.org/wiki/Translation';  // 启动首页
// ==========================

let reqId = 0;

function sendCDP(pipes, req) {
  return new Promise((res, rej) => {
    const id = ++reqId;
    req.id = id;
    let buf = '';
    const timer = setTimeout(() => rej(new Error(`CDP timeout: ${req.method}`)), 30000);
    const handler = (chunk) => {
      buf += chunk;
      let end;
      while ((end = buf.indexOf('\0')) !== -1) {
        const raw = buf.slice(0, end);
        buf = buf.slice(end + 1);
        try {
          const msg = JSON.parse(raw);
          if (msg.id === id) {
            clearTimeout(timer);
            pipes.incoming.removeListener('data', handler);
            if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
            else res(msg);
            return;
          }
        } catch {}
      }
    };
    pipes.incoming.on('data', handler);
    pipes.outgoing.write(JSON.stringify(req) + '\0');
  });
}

async function injectToTarget(pipes, sessionId, scriptCode) {
  try {
    await sendCDP(pipes, { method: 'Page.enable', sessionId });
    await sendCDP(pipes, { method: 'Page.addScriptToEvaluateOnNewDocument', params: { source: scriptCode }, sessionId });
  } catch (e) {
    // 已 enable 的页面会报错，忽略
  }
  try {
    await sendCDP(pipes, { method: 'Runtime.evaluate', params: { expression: scriptCode, returnByValue: true }, sessionId });
  } catch (e) {
    console.error('注入失败:', e.message);
  }
}

async function main() {
  console.log('正在启动翻译浏览器...');

  // 构建翻译脚本（自包含的 content.js + TARGET_LANG）
  const contentJs = readFileSync(join(__dirname, 'browser-translator/content/content.js'), 'utf8');
  const scriptCode = `var TARGET_LANG = '${TARGET_LANG}';\n${contentJs}`;

  // Chrome 启动参数
  const flags = launcher.Launcher.defaultFlags()
    .filter(f => f !== '--disable-extensions')
    .concat([
      '--remote-debugging-pipe',
      '--enable-unsafe-extension-debugging',
      '--no-first-run',
      '--no-default-browser-check',
    ]);
  if (PROXY) flags.push(`--proxy-server=${PROXY}`);

  const chrome = await launcher.launch({
    chromeFlags: flags,
    ignoreDefaultFlags: true,
    startingUrl: 'about:blank',
  });
  const pipes = chrome.remoteDebuggingPipes;
  console.log('Chrome 已启动, PID:', chrome.process.pid);

  // 监听新 target（新 tab、新窗口）
  const knownSessions = new Set();
  await sendCDP(pipes, { method: 'Target.setDiscoverTargets', params: { discover: true, filter: [{ type: 'page' }] } });

  let buf = '';
  pipes.incoming.on('data', (chunk) => {
    buf += chunk;
    let end;
    while ((end = buf.indexOf('\0')) !== -1) {
      const raw = buf.slice(0, end);
      buf = buf.slice(end + 1);
      try {
        const msg = JSON.parse(raw);
        if (msg.method === 'Target.attachedToTarget') {
          const sid = msg.params.sessionId;
          if (!knownSessions.has(sid)) {
            knownSessions.add(sid);
            injectToTarget(pipes, sid, scriptCode).then(() => {
              console.log('新标签页已注入翻译脚本');
            }).catch(() => {});
          }
        }
      } catch {}
    }
  });

  // 获取初始页面并注入
  const targets = await sendCDP(pipes, { method: 'Target.getTargets' });
  const page = targets.result?.targetInfos?.find(t => t.type === 'page');
  if (!page) throw new Error('找不到初始页面');

  const attachResp = await sendCDP(pipes, {
    method: 'Target.attachToTarget',
    params: { targetId: page.targetId, flatten: true },
  });
  const sid = attachResp.result.sessionId;
  knownSessions.add(sid);

  await sendCDP(pipes, { method: 'Target.setAutoAttach', params: { autoAttach: true, waitForDebuggerOnStart: false, flatten: true } });

  await injectToTarget(pipes, sid, scriptCode);

  // 导航到首页
  const startUrl = process.argv[2] || START_URL;
  console.log('正在打开:', startUrl);
  await sendCDP(pipes, { method: 'Page.navigate', params: { url: startUrl }, sessionId: sid });

  console.log('\n✅ 翻译浏览器已就绪!');
  console.log(`   目标语言: ${TARGET_LANG}`);
  console.log(`   所有页面将自动翻译为中文`);
  console.log(`   在浏览器中浏览任何网页都会自动翻译`);
  console.log(`   关闭请按 Ctrl+C 或运行: kill ${chrome.process.pid}`);

  // 保持运行
  chrome.process.on('exit', () => { console.log('Chrome 已关闭'); process.exit(0); });
  process.on('SIGINT', () => { console.log('\n正在关闭...'); chrome.process.kill(); process.exit(0); });
}

main().catch(e => { console.error('错误:', e.message); process.exit(1); });
