import * as db from '../db.js';

const { ref, onMounted, computed } = Vue;

export default {
  props: ['navigate', 'showToast'],
  setup(props) {
    const loading = ref(true);
    const cards = ref([]);
    const filterLang = ref('all');
    const search = ref('');

    async function load() {
      loading.value = true;
      const all = await db.getAllCards();
      cards.value = all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      loading.value = false;
    }

    onMounted(load);

    const filtered = computed(() => {
      const q = search.value.trim().toLowerCase();
      return cards.value.filter((c) => {
        if (filterLang.value !== 'all' && c.lang !== filterLang.value) return false;
        if (!q) return true;
        return c.text.toLowerCase().includes(q) || (c.explanation || '').toLowerCase().includes(q);
      });
    });

    function openCard(card) {
      props.navigate('Study', { cardId: card.id, filter: filterLang.value });
    }

    function addNew() {
      props.navigate('AddCard', { lang: filterLang.value === 'ja' ? 'ja' : 'en' });
    }

    return { loading, filtered, filterLang, search, openCard, addNew, navigate: props.navigate };
  },
  template: `
  <div class="screen">
    <div class="top-bar">
      <button class="back" @click="navigate('Home')">←</button>
      <h1>我的單字庫</h1>
    </div>

    <div class="chip-group">
      <span class="chip" :class="{ active: filterLang === 'all' }" @click="filterLang = 'all'">全部</span>
      <span class="chip" :class="{ active: filterLang === 'en' }" @click="filterLang = 'en'">英文</span>
      <span class="chip" :class="{ active: filterLang === 'ja' }" @click="filterLang = 'ja'">日文</span>
    </div>

    <div class="field">
      <input type="text" v-model="search" placeholder="搜尋單字或解釋..." />
    </div>

    <div v-if="loading" class="empty-state"><p>載入中...</p></div>

    <div v-else-if="filtered.length === 0" class="empty-state">
      <div class="big-emoji">📭</div>
      <p>還沒有卡片，點右下角新增一個吧</p>
    </div>

    <div v-else class="task-list">
      <div class="task-item" v-for="c in filtered" :key="c.id" @click="openCard(c)">
        <div>
          <div class="title">{{ c.text }}</div>
          <div class="sub">{{ c.lang === 'en' ? '英文' : '日文' }}{{ c.explanation ? '・' + c.explanation : '' }}</div>
        </div>
      </div>
    </div>

    <button class="fab" @click="addNew">＋</button>
  </div>
  `
};
