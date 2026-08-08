import * as db from '../db.js';
import * as gdrive from '../gdrive.js';

const { ref, onMounted } = Vue;

export default {
  props: ['navigate', 'showToast'],
  setup(props) {
    const stats = ref({ total: 0, en: 0, ja: 0, reviewsToday: 0 });
    const clientIdInput = ref(gdrive.getClientId());
    const connected = ref(gdrive.isConnected());
    const syncing = ref(false);
    const syncError = ref('');
    const lastSyncedAt = ref('');

    async function loadStats() {
      const [cards, logs] = await Promise.all([db.getAllCards(), db.getAllReviewLogs()]);
      const today = db.todayISO();
      stats.value = {
        total: cards.length,
        en: cards.filter((c) => c.lang === 'en').length,
        ja: cards.filter((c) => c.lang === 'ja').length,
        reviewsToday: logs.filter((l) => l.date === today).length
      };
      const meta = await db.getSyncMeta();
      lastSyncedAt.value = meta?.lastSyncedAt || '';
    }

    onMounted(loadStats);

    function saveClientId() {
      if (!clientIdInput.value.trim()) return;
      gdrive.setClientId(clientIdInput.value);
      props.showToast('已儲存 Client ID');
    }

    async function connectGoogle() {
      syncError.value = '';
      if (!clientIdInput.value.trim()) {
        syncError.value = gdrive.ERROR_MESSAGES.missing_client_id;
        return;
      }
      gdrive.setClientId(clientIdInput.value);
      try {
        await gdrive.connect();
        connected.value = true;
        await syncNow();
      } catch (err) {
        syncError.value = gdrive.errorMessage(err);
      }
    }

    async function syncNow() {
      syncing.value = true;
      syncError.value = '';
      try {
        await gdrive.sync({ interactive: false });
        connected.value = true;
        await loadStats();
        props.showToast('同步完成');
      } catch (err) {
        syncError.value = gdrive.errorMessage(err);
      } finally {
        syncing.value = false;
      }
    }

    function disconnectGoogle() {
      gdrive.disconnect();
      connected.value = false;
      props.showToast('已中斷 Google 帳號連結');
    }

    async function clearAllData() {
      if (!window.confirm('確定要清除這台裝置上的所有卡片與複習紀錄嗎？此動作無法復原（若已同步過 Google Drive，雲端上的資料不會被刪除）。')) return;
      await db.resetEverything();
      await loadStats();
      props.showToast('已清除本機資料');
    }

    return {
      stats, clientIdInput, connected, syncing, syncError, lastSyncedAt,
      saveClientId, connectGoogle, syncNow, disconnectGoogle, clearAllData,
      navigate: props.navigate
    };
  },
  template: `
  <div class="screen">
    <div class="top-bar">
      <button class="back" @click="navigate('Home')">←</button>
      <h1>設定</h1>
    </div>

    <h2>學習統計</h2>
    <div class="stat-grid">
      <div class="stat-tile"><div class="num">{{ stats.total }}</div><div class="label">卡片總數</div></div>
      <div class="stat-tile"><div class="num">{{ stats.reviewsToday }}</div><div class="label">今日已複習</div></div>
    </div>
    <p class="hint" style="margin-bottom:20px;">英文 {{ stats.en }} 張・日文 {{ stats.ja }} 張</p>

    <h2>跨裝置同步（Google Drive）</h2>
    <div class="card">
      <p class="hint" v-if="!connected">尚未連接。資料會存到你自己 Google 帳號的 App 專屬資料夾，其他裝置登入同一個帳號即可同步。</p>
      <p class="hint" v-else style="color:var(--good);">✓ 已連接{{ lastSyncedAt ? '，上次同步：' + new Date(lastSyncedAt).toLocaleString('zh-TW') : '' }}</p>

      <div class="field">
        <label>Google OAuth Client ID</label>
        <input type="text" v-model="clientIdInput" placeholder="xxxxxxxx.apps.googleusercontent.com" />
        <p class="hint">需要自己到 Google Cloud Console 建立一次，步驟見 README。</p>
      </div>

      <p class="hint" v-if="syncError" style="color:var(--bad);">{{ syncError }}</p>

      <div class="btn-row">
        <button class="btn secondary" @click="saveClientId" :disabled="!clientIdInput.trim()">儲存 Client ID</button>
        <button v-if="!connected" class="btn" @click="connectGoogle">連接 Google 帳號</button>
        <button v-else class="btn" @click="syncNow" :disabled="syncing">{{ syncing ? '同步中...' : '立即同步' }}</button>
      </div>
      <button v-if="connected" class="btn ghost" style="margin-top:10px;" @click="disconnectGoogle">中斷連結</button>
    </div>

    <h2>資料管理</h2>
    <div class="card">
      <button class="btn danger" @click="clearAllData">清除本機資料</button>
    </div>
  </div>
  `
};
