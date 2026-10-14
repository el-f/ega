import { mount } from 'svelte';
import Popup from './Popup.svelte';
import './popup.css';
import { initTheme } from '@/shared/theme';

initTheme();

// Overlay primitives read this flag to size themselves to the 360px popup, not the page viewport.
document.body.setAttribute('data-ega-popup', '');

const target = document.getElementById('root');
if (target) {
  mount(Popup, { target });
}
