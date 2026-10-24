// Vitest resolves 'bits-ui' here (vite.config.ts test.alias): the package root re-exports every component, about 690 modules per test file. tests/unit/bits-ui-slim.test.ts fails when src/ imports a name this file lacks.
export { Combobox } from '../../node_modules/bits-ui/dist/bits/combobox/index.js';
export { Command } from '../../node_modules/bits-ui/dist/bits/command/index.js';
export { Dialog } from '../../node_modules/bits-ui/dist/bits/dialog/index.js';
export { DropdownMenu } from '../../node_modules/bits-ui/dist/bits/dropdown-menu/index.js';
export { Popover } from '../../node_modules/bits-ui/dist/bits/popover/index.js';
export { RadioGroup } from '../../node_modules/bits-ui/dist/bits/radio-group/index.js';
export { Slider } from '../../node_modules/bits-ui/dist/bits/slider/index.js';
export { Tabs } from '../../node_modules/bits-ui/dist/bits/tabs/index.js';
export { Tooltip } from '../../node_modules/bits-ui/dist/bits/tooltip/index.js';
