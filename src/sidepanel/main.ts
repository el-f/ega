import { mount } from 'svelte';
// The global sheet must load before component CSS so equal-specificity component rules win.
import './sidepanel.css';
import SidePanel from './SidePanel.svelte';
import { initTheme } from '@/shared/theme';
import { invariant } from '@/shared/invariants';

initTheme();

const target = document.getElementById('app');
invariant(target, 'sidepanel: #app not found');
mount(SidePanel, { target });
