import * as db from '../db.js';
import * as srs from '../srs.js';

const { ref, onMounted } = Vue;

/** Counts consecutive days (ending today, or yesterday if today has no log yet) with at least one review-log entry. */
function computeStreak(dates) {
  const set = new Set(dates);
  const today = srs.todayISO();
  const cursor = new Date();
  if (!set.has(today)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (true) {
    const iso = cursor.toISOString().slice(0, 10);
    if (!set.has(iso)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default {
  props: ['navigate', 'showToast'],
  setup(props) {
    const loading = ref(true);
    const dueCount = ref(0);
    const totalCount = ref(0);
    const streak = ref(0);
    const langCounts = ref({ en: 0, ja: 0 });

    async function load() {
      loading.value = true;
      const [cards, progressList, logs] = await Promise.all([
        db.getAllCards(),
        db.getAllProgress(),
        db.getAllReviewLogs()
      ]);
      totalCount.value = cards.length;
      langCounts.value = {
        en: cards.filter((c) => c.lang === 'en').length,
        ja: cards.filter((c) => c.lang === 'ja').length
      };
      const today = srs.todayISO();
      const cardIds = new Set(cards.map((c) => c.id));
      dueCount.value = progressList.filter((p) => cardIds.has(p.id) && srs.isDue(p, today)).length;
      streak.value = computeStreak(logs.map((l) => l.date));
      loading.value = false;
    }

    onMounted(load);

    return { loading, dueCount, totalCount, streak, langCounts, navigate: props.navigate };
  },
  template: `
  <div class="screen">
    <h1>你好 👋</h1>
    <p>連續學習：{{ streak }} 天 🔥</p>

    <div v-if="loading" class="empty-state"><p>載入中...</p></div>

    <template v-else>
      <div class="stat-grid">
        <div class="stat-tile"><div class="num">{{ dueCount }}</div><div class="label">今日待複習</div></div>
        <div class="stat-tile"><div class="num">{{ totalCount }}</div><div class="label">卡片總數</div></div>
      </div>

      <div class="task-list">
        <div class="task-item" @click="navigate('Review')">
          <div><div class="title">📖 開始複習</div><div class="sub">間隔複習到期的單字/句子</div></div>
          <div class="count" :class="{ zero: dueCount === 0 }">{{ dueCount }}</div>
        </div>
        <div class="task-item" @click="navigate('AddCard')">
          <div><div class="title">➕ 新增單字/句子</div><div class="sub">記下你剛看過的內容</div></div>
        </div>
        <div class="task-item" @click="navigate('Library')">
          <div><div class="title">📚 我的單字庫</div><div class="sub">英文 {{ langCounts.en }} 張・日文 {{ langCounts.ja }} 張</div></div>
        </div>
      </div>
    </template>
  </div>
  `
};
