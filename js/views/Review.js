import * as db from '../db.js';
import * as srs from '../srs.js';
import * as speech from '../speech.js';
import * as gdrive from '../gdrive.js';

const { ref, onMounted, computed } = Vue;

export default {
  props: ['navigate', 'showToast'],
  setup(props) {
    const loading = ref(true);
    const queue = ref([]);
    const index = ref(0);
    const flipped = ref(false);
    const done = ref(false);

    const current = computed(() => queue.value[index.value] || null);

    async function load() {
      loading.value = true;
      const [cards, progressList] = await Promise.all([db.getAllCards(), db.getAllProgress()]);
      const cardMap = new Map(cards.map((c) => [c.id, c]));
      const today = srs.todayISO();
      queue.value = progressList
        .filter((p) => srs.isDue(p, today) && cardMap.has(p.id))
        .map((p) => ({ progress: p, card: cardMap.get(p.id) }));
      loading.value = false;
      if (queue.value.length === 0) done.value = true;
    }

    onMounted(load);

    function flip() { flipped.value = !flipped.value; }

    function speakCurrent() {
      if (current.value && current.value.card.lang === 'en') speech.speak(current.value.card.text);
    }

    async function rate(rating) {
      const entry = current.value;
      if (!entry) return;
      const updated = srs.schedule(entry.progress, rating);
      await db.saveProgress(updated);
      await db.addReviewLog({ type: 'review', cardId: entry.card.id, rating });
      gdrive.scheduleBackgroundSync();

      if (index.value < queue.value.length - 1) {
        index.value += 1;
        flipped.value = false;
      } else {
        done.value = true;
      }
    }

    return { loading, queue, index, current, flipped, flip, speakCurrent, rate, done, navigate: props.navigate };
  },
  template: `
  <div class="screen">
    <div class="top-bar">
      <button class="back" @click="navigate('Home')">←</button>
      <h1>複習</h1>
    </div>

    <div v-if="loading" class="empty-state"><p>載入中...</p></div>

    <div v-else-if="done" class="empty-state">
      <div class="big-emoji">✅</div>
      <h2>今天的複習都完成了！</h2>
      <button class="btn" @click="navigate('Home')">回首頁</button>
    </div>

    <template v-else>
      <p class="hint" style="margin-bottom:10px;">第 {{ index + 1 }} / {{ queue.length }} 張</p>
      <div class="progress-bar" style="margin-bottom:20px;">
        <div :style="{ width: (index / queue.length * 100) + '%' }"></div>
      </div>

      <div class="flashcard" @click="flip">
        <span class="pos">{{ current.card.lang === 'en' ? '英文' : '日文' }}</span>
        <div class="word">{{ current.card.text }}</div>
        <template v-if="flipped">
          <div class="meaning">{{ current.card.explanation }}</div>
          <p class="example" v-if="current.card.example">{{ current.card.example }}</p>
          <p class="example-zh" v-if="current.card.exampleZh">{{ current.card.exampleZh }}</p>
        </template>
        <div v-else class="flip-hint">回想意思，點卡片查看答案</div>
      </div>

      <div class="btn-row" style="margin-top:10px;" v-if="current.card.lang === 'en'">
        <button class="btn secondary small" @click.stop="speakCurrent">🔊 發音</button>
      </div>

      <div class="rating-row" v-if="flipped">
        <button class="btn rating-again" @click="rate('again')">忘記了</button>
        <button class="btn rating-hard" @click="rate('hard')">有點難</button>
        <button class="btn rating-good" @click="rate('good')">記得</button>
        <button class="btn rating-easy" @click="rate('easy')">很簡單</button>
      </div>
    </template>
  </div>
  `
};
