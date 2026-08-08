# 語言學習卡

自己建立的英文／日文單字卡學習 PWA（純網頁 App）：看到想記的單字或句子就輸入進去，記下解釋、例句與例句中文翻譯，App 幫你用間隔複習（SM-2）排程「什麼時候該複習」。英文卡片可以按喇叭發音，日文不需要。桌機、手機都能安裝成類 App 使用，資料透過你自己的 Google 帳號在裝置間同步。

## 功能總覽

- **自建單字卡**：輸入英文或日文的單字/句子，填上解釋、例句、例句中文翻譯，沒有內建題庫、沒有等級分類，你看過什麼就記什麼。
- **間隔複習**：簡化版 SM-2 演算法，Again/Hard/Good/Easy 四選一評分，自動排下次複習時間。新增的卡片預設「明天開始複習」，不會塞爆當天的複習清單。
- **英文發音**：英文卡片在複習畫面有 🔊 播放鍵（瀏覽器內建 TTS，免金鑰）；日文卡片沒有這個功能。
- **單字庫**：所有卡片依語言篩選、關鍵字搜尋，可隨時編輯或刪除。
- **跨裝置同步**：連接你自己的 Google 帳號後，資料會存到你 Google Drive 裡 App 專屬的隱藏資料夾（一般 Drive 介面看不到），其他裝置登入同一個帳號、按「立即同步」就能拿到最新資料。離線時仍可正常使用，恢復連線後才會同步。
- **離線使用**：透過 Service Worker 快取 App 殼層，安裝後大部分功能可離線使用（跨裝置同步需要網路連上 Google API）。

## 跨裝置同步設定（Google Drive）——一次性步驟

同步功能需要你自己在 Google Cloud Console 建立一組 OAuth Client ID（免費，不需要通過 Google 審核，因為只有你自己用）。

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)，新增一個專案（名稱隨意，例如「語言學習卡」）。
2. 左側選單「API 和服務」→「已啟用的 API 和服務」，啟用 **Google Drive API**。
3. 左側選單「API 和服務」→「OAuth 同意畫面」：
   - 使用者類型選「外部」，填基本資訊即可（App 名稱、你自己的 email）。
   - 發布狀態保持「測試」，在「測試使用者」加入你自己的 Gmail（之後想用哪台裝置登入，那個 Gmail 都要加進來）。
4. 左側選單「API 和服務」→「憑證」→「建立憑證」→「OAuth 用戶端 ID」：
   - 應用程式類型選「網頁應用程式」。
   - 「已授權的 JavaScript 來源」填你部署後的網址（例如 `https://your-site.netlify.app`），本機測試要另外加一行 `http://localhost:8000`。
   - 建立後複製產生的 Client ID（長得像 `xxxxxxxx-xxxx.apps.googleusercontent.com`）。
5. 打開 App，進「設定」→「跨裝置同步」，貼上剛剛的 Client ID，按「儲存 Client ID」→「連接 Google 帳號」。第一次登入會看到「Google 尚未驗證這個應用程式」的警告畫面，這是正常的（因為是你自己的個人專案、發布狀態是「測試」），點「進階」→「前往（不安全）」繼續授權即可。
6. 在第二台裝置重複第 5 步（用同一組 Client ID、同一個 Google 帳號），兩邊就會同步了。

**⚠️ 重要：部署網址要固定。** 上面第 4 步的「已授權的 JavaScript 來源」要精確對應你實際使用的網址。如果用 Netlify Drop 每次重新拖拉資料夾都會換一個新網址，同步登入就會失效——請改用下面「部署」段落裡有固定網址的方式。

## 在手機上使用（重要：需要 HTTPS）

「加入主畫面」的 PWA 安裝功能與 Google 登入，瀏覽器都要求頁面必須是 **HTTPS**（或 `localhost`）。單純用電腦區網 IP（例如 `http://192.168.x.x`）分享會被視為不安全來源。因此**手機上請透過下面的雲端部署方式取得一個固定的 https 網址**。

## 部署（需要固定網址，才能讓 Google 登入正常運作）

跟舊版不同，這次**不建議用每次重新拖拉都換網址的 Netlify Drop**。改用下列任一種有固定網址的方式：

- **Netlify CLI 綁定同一個 site**：`npx netlify-cli deploy --prod` 第一次會建立 site，之後每次重新部署都用同一個網址。
- **GitHub Pages**：把整個資料夾推上 GitHub repo，在 repo 設定的 Pages 頁面啟用「Deploy from branch」，會得到固定的 `https://<帳號>.github.io/<repo>/`。
- **Vercel / Cloudflare Pages（接 Git）**：把 repo 接上，不需要任何 build 指令，Output Directory 設為根目錄，之後每次 push 都部署到同一個網址。

部署完拿到網址後，記得回 Google Cloud Console 把這個網址加進 OAuth Client 的「已授權的 JavaScript 來源」。

## 在電腦上開發測試

這是純靜態網站，不需要任何 build 工具，但**不能直接用瀏覽器開 `index.html` 檔案**（`file://` 協定下 IndexedDB／Service Worker／fetch 會有相容性問題），需要一個簡單的本地伺服器：

```bash
# 進入專案資料夾後，任選一種方式：
npx serve .
# 或
python -m http.server 8000
```

然後用瀏覽器開啟 `http://localhost:8000`。記得把 `http://localhost:8000` 也加進 Google OAuth Client 的授權來源，才能在本機測試同步功能。

### 自動化 smoke test

`scripts/smoke-test.js` 用 Playwright 跑一次完整流程：開啟 App → 直接進 Home（無 onboarding）→ 新增一張英文卡 → 新增一張日文卡 → 單字庫確認兩張都在 → 複習流程（含發音按鈕的語言判斷）→ 設定頁統計數字核對 → Google 同步 UI 在未設定 Client ID 時的錯誤提示。這支腳本不會、也無法自動化真正的 Google OAuth 登入流程（需要真人互動同意），同步功能請照上面步驟用你自己的帳號手動測試一次。

本專案本身沒有 `node_modules`（純靜態站不該混入建置產物），測試要在**另一個暫存 npm 專案**裝 Playwright：

```bash
# 1. 在專案目錄起本地伺服器
cd "/d/語言學習APP" && python -m http.server 8000

# 2. 在別的暫存目錄裝一次 Playwright（之後可重複用）
mkdir -p /tmp/pw-test && cd /tmp/pw-test
npm init -y && npm install playwright && npx playwright install chromium --with-deps

# 3. 用 NODE_PATH 指到剛裝好的 node_modules，執行專案裡的測試腳本
NODE_PATH="$(pwd)/node_modules" node "/d/語言學習APP/scripts/smoke-test.js"
```

## 專案結構

```
index.html             App 進入點（含 Google Identity Services 的 script tag）
manifest.json           PWA 設定（含 SVG 圖示）
sw.js                    Service Worker（離線快取）
css/style.css            樣式
js/
  app.js                 Vue 根元件，畫面切換（Home/Review/Library/Settings 四個底部分頁 + AddCard）
  db.js                   IndexedDB 封裝（cards／progress／reviewLog／syncMeta）
  srs.js                  簡化版 SM-2 間隔複習演算法
  speech.js               英文發音（瀏覽器 TTS）
  gdrive.js               Google OAuth + Drive API 同步（appDataFolder 裡的 sync.json，LWW 合併）
  views/                  Home／AddCard／Library／Review／Settings
  vendor/vue.global.prod.js   Vue 3（本地存放，離線可用）
icons/                   App 圖示（SVG）
scripts/smoke-test.js     Playwright 端對端 smoke test
```

## 資料模型

每張卡片：`{ id, lang: 'en'|'ja', text, explanation, example, exampleZh, createdAt, updatedAt, deleted }`。卡片 id 用 UUID（而不是流水號），因為兩台裝置離線各自新增卡片時，流水號整數可能互相碰撞；同步合併是用 `updatedAt` 新的蓋舊的（last-write-wins）。刪除卡片是軟刪除（設 `deleted: true`），避免同步時被另一台裝置的舊資料復活。

## 已知限制

- 沒有 AI 例句生成、AI 對話練習、跟讀口說練習——這版刻意簡化成「輸入＋複習」兩個核心動作。
- 跨裝置同步採「開啟 App 時 / 手動按同步 / 新增編輯後幾秒背景同步」，不是即時 push；兩台裝置都離線時各自累積的變更，要等其中一台連網同步後對方才拿得到。
- Google OAuth 在「測試」發布狀態下，只有你在「測試使用者」名單裡加過的帳號能登入；如果之後想開放給其他人用，需要送審驗證。
- 語音發音（TTS）僅支援英文；瀏覽器內建語音的音色因裝置而異。
