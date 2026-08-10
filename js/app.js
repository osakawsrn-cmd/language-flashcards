import Home from './views/Home.js';
import AddCard from './views/AddCard.js';
import Library from './views/Library.js';
import Study from './views/Study.js';
import Review from './views/Review.js';
import Settings from './views/Settings.js';
import * as gdrive from './gdrive.js';

const { createApp, ref } = Vue;

const NAV_ITEMS = [
  { view: 'Home', icon: '🏠', label: '首頁' },
  { view: 'Review', icon: '📖', label: '複習' },
  { view: 'Library', icon: '📚', label: '單字庫' },
  { view: 'Settings', icon: '⚙️', label: '設定' }
];

const App = {
  components: { Home, AddCard, Library, Study, Review, Settings },
  setup() {
    const view = ref('Home');
    const params = ref(null);
    const toastMsg = ref('');
    let toastTimer = null;

    function navigate(name, navParams = null) {
      view.value = name;
      params.value = navParams;
      window.scrollTo(0, 0);
    }

    function showToast(msg) {
      toastMsg.value = msg;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastMsg.value = ''; }, 2200);
    }

    // Best-effort: if a Google account was connected before, reconnect silently and
    // pull in anything changed on other devices. Never blocks the UI if it fails.
    gdrive.trySilentConnect().then((ok) => {
      if (ok) gdrive.sync({ interactive: false }).catch(() => {});
    });

    return { view, params, toastMsg, navigate, showToast, navItems: NAV_ITEMS };
  },
  template: `
    <component
      :is="view"
      :navigate="navigate"
      :showToast="showToast"
      :params="params"
    />
    <nav class="bottom-nav">
      <button
        v-for="item in navItems"
        :key="item.view"
        :class="{ active: view === item.view }"
        @click="navigate(item.view)"
      >
        <span class="icon">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </button>
    </nav>
    <div class="toast" v-if="toastMsg">{{ toastMsg }}</div>
  `
};

createApp(App).mount('#app');
