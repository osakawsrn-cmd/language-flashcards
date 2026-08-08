// End-to-end smoke test for the "語言學習卡" PWA (English + Japanese self-built flashcards).
//
// Run from a separate scratch npm project that has Playwright installed
// (this project intentionally has no node_modules of its own — see README.md):
//   1. In this project folder:  python -m http.server 8000
//   2. In a scratch npm project with `playwright` installed + `npx playwright install chromium`:
//        NODE_PATH=<scratch>/node_modules node "<this file's path>"

const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=你好', { timeout: 10000 });
  console.log('OK  Home 直接顯示（無 onboarding）');

  // ---- Add an English card ----
  await page.click('text=新增單字/句子');
  await page.waitForSelector('h1:has-text("新增單字/句子")');
  await page.fill('input[placeholder*="resilient"]', 'resilient');
  let textareas = page.locator('textarea');
  await textareas.nth(0).fill('有韌性的、能快速恢復的');
  await textareas.nth(1).fill('She is a resilient person.');
  await textareas.nth(2).fill('她是一個有韌性的人。');
  await page.click('button:has-text("新增")');
  await page.waitForSelector('h1:has-text("我的單字庫")');
  if (await page.locator('text=resilient').count() === 0) {
    throw new Error('英文卡片未出現在單字庫');
  }
  console.log('OK  新增英文卡片成功');

  // ---- Add a Japanese card ----
  await page.click('.fab');
  await page.waitForSelector('h1:has-text("新增單字/句子")');
  await page.click('.chip:has-text("日文")');
  await page.fill('input[placeholder*="resilient"]', 'ありがとう');
  textareas = page.locator('textarea');
  await textareas.nth(0).fill('謝謝');
  await textareas.nth(1).fill('ありがとうございます。');
  await textareas.nth(2).fill('非常感謝。');
  await page.click('button:has-text("新增")');
  await page.waitForSelector('h1:has-text("我的單字庫")');
  if (await page.locator('text=ありがとう').count() === 0) {
    throw new Error('日文卡片未出現在單字庫');
  }
  console.log('OK  新增日文卡片成功');

  // Sanity: library shows both languages
  const hasEnTag = await page.locator('.task-item .sub:has-text("英文")').count();
  const hasJaTag = await page.locator('.task-item .sub:has-text("日文")').count();
  if (hasEnTag === 0 || hasJaTag === 0) throw new Error('單字庫未同時顯示英文與日文卡片');
  console.log('OK  單字庫同時顯示英文與日文卡片');

  // New cards are scheduled due "tomorrow" by design (typing it in counts as one review).
  // Force today's due date directly in IndexedDB so the Review screen has something to test.
  await page.evaluate(async () => {
    const req = indexedDB.open('lang-learning-app');
    const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    const tx = db.transaction('progress', 'readwrite');
    const store = tx.objectStore('progress');
    const all = await new Promise((res, rej) => { const r = store.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const today = new Date().toISOString().slice(0, 10);
    all.forEach((p) => { p.due = today; store.put(p); });
    await new Promise((res) => { tx.oncomplete = res; });
  });

  // ---- Review flow ----
  await page.click('.bottom-nav button:has-text("複習")');
  await page.waitForSelector('.flashcard');
  const isEnglishCard = (await page.locator('.flashcard .pos:has-text("英文")').count()) > 0;
  const speakBtnCount = await page.locator('button:has-text("🔊 發音")').count();
  if (isEnglishCard && speakBtnCount === 0) throw new Error('英文卡片在複習畫面缺少發音按鈕');
  if (!isEnglishCard && speakBtnCount > 0) throw new Error('日文卡片不應該顯示發音按鈕');
  console.log('OK  發音按鈕只在英文卡片出現（目前這張是 ' + (isEnglishCard ? '英文' : '日文') + '）');

  await page.click('.flashcard');
  await page.waitForSelector('.rating-row');
  await page.click('button.rating-good');
  await page.waitForTimeout(300);
  console.log('OK  複習評分流程可執行（good）');

  // Rate the second due card too, if present, to exercise the "done" state.
  const stillHasCard = await page.locator('.flashcard').count();
  if (stillHasCard > 0) {
    await page.click('.flashcard');
    await page.waitForSelector('.rating-row');
    await page.click('button.rating-good');
    await page.waitForTimeout(300);
  }
  if (await page.locator('text=今天的複習都完成了').count() === 0) {
    throw new Error('複習完成後未顯示完成畫面');
  }
  console.log('OK  複習完成畫面正常顯示');

  // ---- Settings ----
  await page.click('.bottom-nav button:has-text("設定")');
  await page.waitForSelector('h1:has-text("設定")');
  const totalText = await page.locator('.stat-tile .num').first().textContent();
  if (totalText !== '2') throw new Error(`設定頁卡片總數應為 2，實際為 ${totalText}`);
  console.log('OK  設定頁統計數字正確（卡片總數 = 2）');

  // Google sync UI should render without throwing even with no client id configured.
  await page.click('button:has-text("連接 Google 帳號")');
  await page.waitForTimeout(300);
  if (await page.locator('text=尚未設定 Google OAuth Client ID').count() === 0) {
    throw new Error('未設定 Client ID 時應提示錯誤訊息');
  }
  console.log('OK  Google 同步 UI 在未設定 Client ID 時正確顯示錯誤提示（不噴例外）');

  console.log('\n=== console/page errors:', errors.length, '===');
  errors.forEach((e) => console.log(' -', e));

  await browser.close();
  if (errors.length > 0) {
    console.error('\nFAILED: 有 console/page error');
    process.exit(1);
  }
  console.log('\nAll smoke tests passed.');
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
