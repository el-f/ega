import { debugCatch } from '@/shared/logger';
import { mount, unmount, type ComponentProps } from 'svelte';
import ConfirmDialog from './ConfirmDialog.svelte';

type ConfirmDialogProps = ComponentProps<typeof ConfirmDialog>;

interface ConfirmOpts {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  typeToConfirm?: string;
}

/** Themed replacement for window.confirm; resolves true or false. */
export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    let settled = false;
    const close = async (value: boolean) => {
      if (settled) return;
      settled = true;
      // Unmount before resolve, so the focus trap is gone when the caller moves focus; Svelte runs the teardown in a Promise executor, so only an await sees its throw.
      try {
        await unmount(app);
      } catch (e) {
        debugCatch(e, 'shared.components.confirmDialog.1');
      }
      host.remove();
      resolve(value);
    };

    // exactOptionalPropertyTypes lets the Props type read `string | undefined` but rejects undefined on write.
    const props: ConfirmDialogProps = {
      open: true,
      title: opts.title,
      body: opts.body,
      onConfirm: () => void close(true),
      onCancel: () => void close(false),
      ...(opts.confirmLabel !== undefined ? { confirmLabel: opts.confirmLabel } : {}),
      ...(opts.cancelLabel !== undefined ? { cancelLabel: opts.cancelLabel } : {}),
      ...(opts.danger !== undefined ? { danger: opts.danger } : {}),
      ...(opts.typeToConfirm !== undefined ? { typeToConfirm: opts.typeToConfirm } : {}),
    };

    const app = mount(ConfirmDialog, {
      target: host,
      props,
    });
  });
}
