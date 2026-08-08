import * as db from '../db.js';
import * as srs from '../srs.js';
import * as gdrive from '../gdrive.js';

const { ref, reactive, onMounted, computed } = Vue;

export default {
  props: ['navigate', 'showToast', 'params'],
  setup(props) {
    const editingId = props.params?.cardId || null;
    const isEdit = !!editingId;
    const saving = ref(false);
    const loaded = ref(!isEdit);

    const form = reactive({
      lang: props.params?.lang === 'ja' ? 'ja' : 'en',
      text: '',
      explanation: '',
      example: '',
      exampleZh: ''
    });

    async function loadExisting() {
      if (!editingId) return;
      const card = await db.getCard(editingId);
      if (card) {
        form.lang = card.lang;
        form.text = card.text;
        form.explanation = card.explanation || '';
        form.example = card.example || '';
        form.exampleZh = card.exampleZh || '';
      }
      loaded.value = true;
    }

    onMounted(loadExisting);

    const canSave = computed(() => form.text.trim().length > 0);

    async function save() {
      if (!canSave.value || saving.value) return;
      saving.value = true;
      const now = db.nowISO();

      if (isEdit) {
        const existing = await db.getCard(editingId);
        await db.saveCard({
          ...existing,
          lang: form.lang,
          text: form.text.trim(),
          explanation: form.explanation.trim(),
          example: form.example.trim(),
          exampleZh: form.exampleZh.trim(),
          updatedAt: now
        });
        props.showToast('已更新');
      } else {
        const id = db.newId();
        await db.saveCard({
          id,
          lang: form.lang,
          text: form.text.trim(),
          explanation: form.explanation.trim(),
          example: form.example.trim(),
          exampleZh: form.exampleZh.trim(),
          createdAt: now,
          updatedAt: now,
          deleted: false
        });
        // Typing it in counts as "already seen once" — schedule like a first successful
        // review so it's due tomorrow instead of flooding today's review queue immediately.
        const progress = srs.schedule(srs.newProgressItem(id), 'good');
        await db.saveProgress(progress);
        await db.addReviewLog({ type: 'card_add', cardId: id, rating: 'good' });
        props.showToast('已新增，明天開始複習');
      }

      saving.value = false;
      gdrive.scheduleBackgroundSync();
      props.navigate('Library');
    }

    async function remove() {
      if (!editingId) return;
      if (!window.confirm('確定要刪除這張卡片嗎？此動作無法復原。')) return;
      await db.deleteCard(editingId);
      gdrive.scheduleBackgroundSync();
      props.showToast('已刪除');
      props.navigate('Library');
    }

    return { isEdit, loaded, form, saving, canSave, save, remove, navigate: props.navigate };
  },
  template: `
  <div class="screen">
    <div class="top-bar">
      <button class="back" @click="navigate(isEdit ? 'Library' : 'Home')">←</button>
      <h1>{{ isEdit ? '編輯卡片' : '新增單字/句子' }}</h1>
    </div>

    <div v-if="!loaded" class="empty-state"><p>載入中...</p></div>

    <template v-else>
      <div class="field">
        <label>語言</label>
        <div class="chip-group">
          <span class="chip" :class="{ active: form.lang === 'en' }" @click="form.lang = 'en'">英文</span>
          <span class="chip" :class="{ active: form.lang === 'ja' }" @click="form.lang = 'ja'">日文</span>
        </div>
      </div>

      <div class="field">
        <label>單字或句子</label>
        <input type="text" v-model="form.text" placeholder="例如：resilient 或 It's up to you." />
      </div>

      <div class="field">
        <label>解釋</label>
        <textarea v-model="form.explanation" rows="2" placeholder="意思、用法說明..."></textarea>
      </div>

      <div class="field">
        <label>例句</label>
        <textarea v-model="form.example" rows="2" placeholder="一個包含這個單字/句子的例句"></textarea>
      </div>

      <div class="field">
        <label>例句中文翻譯</label>
        <textarea v-model="form.exampleZh" rows="2" placeholder="上面例句的中文翻譯"></textarea>
      </div>

      <button class="btn" :disabled="!canSave || saving" @click="save">{{ saving ? '儲存中...' : (isEdit ? '儲存變更' : '新增') }}</button>
      <button v-if="isEdit" class="btn danger" style="margin-top:10px;" @click="remove">刪除這張卡片</button>
    </template>
  </div>
  `
};
