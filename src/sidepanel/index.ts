import { mount } from 'svelte';
import SidePanel from './SidePanel.svelte';
import './sidepanel.css';
import { initTheme } from '@/shared/theme';
import { invariant } from '@/shared/invariants';

initTheme();

const target = document.getElementById('app');
invariant(target, 'sidepanel: #app not found');
mount(SidePanel, { target });
