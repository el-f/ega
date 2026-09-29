import { mount } from 'svelte';
import Options from './Options.svelte';
import './options.css';
import { initTheme } from '@/shared/theme';

initTheme();

const target = document.getElementById('root');
if (target) {
  mount(Options, { target });
}
