// MEMORY LAB — integração independente com a navegação existente.
//
// O app principal foi escrito antes desta aba e mantém sua própria lista de
// views. Este bootstrap instala o Lab depois da inicialização do app, evitando
// acoplar o runner experimental ao runner clássico/Try Hard.

import { initMemoryLab, onEnterMemoryLab } from './ui.js';

let installed = false;

function ensureCss() {
  if (document.querySelector('link[data-memory-lab-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'assets/css/memory-lab.css';
  link.dataset.memoryLabCss = '1';
  document.head.appendChild(link);
}

function install() {
  if (installed || !document.querySelector('#main') || !document.querySelector('#tabbar')) return;
  installed = true;
  ensureCss();

  const main = document.querySelector('#main');
  const tabbar = document.querySelector('#tabbar');

  let section = document.querySelector('#view-memorylab');
  if (!section) {
    section = document.createElement('section');
    section.className = 'view';
    section.id = 'view-memorylab';
    section.setAttribute('aria-label', 'Memory Lab');
    section.hidden = true;
    section.innerHTML = '<div id="memory-lab-root"></div>';
    const history = document.querySelector('#view-history');
    main.insertBefore(section, history || null);
  }

  let button = tabbar.querySelector('[data-view="memorylab"]');
  if (!button) {
    button = document.createElement('button');
    button.className = 'tab';
    button.dataset.view = 'memorylab';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8M9 4v4l-4 8a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 16l-4-8V4M8 14h8"/></svg><span>Lab</span>';
    const historyTab = tabbar.querySelector('[data-view="history"]');
    tabbar.insertBefore(button, historyTab || null);
  }
  tabbar.classList.add('tabbar--with-lab');

  // O botão é criado depois de bindEvents() do app principal; portanto somente
  // este handler controla a view Memory Lab.
  button.addEventListener('click', () => {
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v !== section; });
    tabbar.querySelectorAll('.tab').forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    const title = document.querySelector('#topbar-title');
    const sub = document.querySelector('#topbar-sub');
    if (title) title.textContent = 'Memory Lab';
    if (sub) sub.textContent = 'Uma exposição. O máximo de memória que conseguir construir.';
    main.scrollTop = 0;
    onEnterMemoryLab();
  });

  // Ao voltar para qualquer aba antiga, a view experimental precisa sumir — o
  // showView legado não conhece a aba criada dinamicamente.
  tabbar.querySelectorAll('.tab:not([data-view="memorylab"])').forEach((tab) => {
    tab.addEventListener('click', () => { section.hidden = true; });
  });

  initMemoryLab({
    rootElement: section.querySelector('#memory-lab-root'),
    toast(message) {
      const el = document.querySelector('#toast');
      if (!el) return;
      el.textContent = message;
      el.hidden = false;
      setTimeout(() => { el.hidden = true; }, 2200);
    },
  });
}

// O import acontece durante o carregamento do app. O timer garante que a aba
// seja criada depois que a navegação legada já ligou seus listeners.
setTimeout(install, 0);

export { install as installMemoryLabTab };
