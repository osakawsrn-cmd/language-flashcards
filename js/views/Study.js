import * as db from '../db.js';
import * as speech from '../speech.js';

const { ref, onMounted, computed } = Vue;

export default {
  props: ['navigate', 'showToast', 'params'],
  setup(props) {
    const loading = ref(true);
    const cards = ref([]);
    const filterLang = ref(['en', 'ja'].includes(props.params?.filter) ? props.params.filter : 'all');
    const currentId = ref(props.params?.cardId || null);

    async function load() {
      loading.value = true;
      const all = await db.getAllCards();
      cards.value = all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      loading.value = false;
    }

    onMounted(load);

    const filtered = computed(() => {
      if (filterLang.value === 'all') return cards.value;
      return cards.value.filter((c) => c.lang === filterLang.value);
    });

    const index = computed(() => filtered.value.findIndex((c) => c.id === currentId.value));
    const current = computed(() => (index.value >= 0 ? filtered.value[index.value] : null));

    function setFilter(lang) {
      if (filterLang.value === lang) return;
      filterLang.value = lang;
      const list = filterLang.value === 'all' ? cards.value : cards.value.filter((c) => c.lang === filterLang.value);
      if (!list.some((c) => c.id === currentId.value)) {
        currentId.value = list.length ? list[0].id : null;
      }
    }

    function prev() {
      if (index.value > 0) currentId.value = filtered.value[index.value - 1].id;
    }

    function next() {
      if (index.value >= 0 && index.value < filtered.value.length - 1) currentId.value = filtered.value[index.value + 1].id;
    }

    function speakCurrent() {
      if (current.value && current.value.lang === 'en') speech.speak(current.value.text);
    }

    function editCurrent() {
      if (!current.value) return;
      props.navigate('AddCard', { cardId: current.value.id, returnView: 'Study', returnFilter: filterLang.value });
    }

    return {
      loading, filtered, filterLang, index, current,
      setFilter, prev, next, speakCurrent, editCurrent,
      navigate: props.navigate
    };
  },
  template: `
  <div class="screen">
    <div class="top-bar">
      <button class="back" @click="navigate('Library')">←</button>
      <h1 style="flex:1;">學習瀏覽</h1>
      <button class="back" @click="editCurrent" v-if="current" title="編輯這張卡片">✏️</button>
    </div>

    <div class="chip-group">
      <span class="chip" :class="{ active: filterLang === 'all' }" @click="setFilter('all')">全部</span>
      <span class="chip" :class="{ active: filterLang === 'en' }" @click="setFilter('en')">英文</span>
      <span class="chip" :class="{ active: filterLang === 'ja' }" @click="setFilter('ja')">日文</span>
    </div>

    <div v-if="loading" class="empty-state"><p>載入中...</p></div>

    <div v-else-if="!current" class="empty-state">
      <div class="big-emoji">📭</div>
      <p>這個語言還沒有卡片</p>
    </div>

    <template v-else>
      <div class="btn-row" style="margin-bottom:14px; align-items:center;">
        <button class="btn secondary small" :disabled="index === 0" @click="prev">◀ 上一張</button>
        <p class="hint" style="flex:1; text-align:center; margin:0;">{{ index + 1 }} / {{ filtered.length }}</p>
        <button class="btn secondary small" :disabled="index === filtered.length - 1" @click="next">下一張 ▶</button>
      </div>

      <div class="flashcard" style="cursor:default;">
        <span class="pos">{{ current.lang === 'en' ? '英文' : '日文' }}</span>
        <div class="word">{{ current.text }}</div>
        <div class="meaning" v-if="current.explanation">{{ current.explanation }}</div>
        <p class="example" v-if="current.example">{{ current.example }}</p>
        <p class="example-zh" v-if="current.exampleZh">{{ current.exampleZh }}</p>
      </div>

      <div class="btn-row" style="margin-top:14px;" v-if="current.lang === 'en'">
        <button class="btn secondary small" @click="speakCurrent">🔊 發音</button>
      </div>
    </template>
  </div>
  `
};
