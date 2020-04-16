import { store } from '../main/store';
import { Engine } from './engine';

window.addEventListener('DOMContentLoaded', () => {
  const body = document.querySelector('body');
  body.innerHTML = '';
  body.style = 'overflow:hidden;';
  (async () => {
    const engine = new Engine(store);
    await engine.initialize();
    await engine.run();
  })();
});
