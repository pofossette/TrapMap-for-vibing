import { Button, Modal } from '@heroui/react';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';
import type { ReactElement } from 'react';

type ConfirmationDialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  isConfirmDanger?: boolean;
  isOpen: boolean;
  isPending?: boolean;
  message: string;
  onCancel?: () => void;
  onConfirm: () => void | Promise<void>;
  onOpenChange?: (open: boolean) => void;
  title: string;
};

export function ConfirmationDialog({
  cancelLabel,
  confirmLabel,
  isConfirmDanger = false,
  isOpen,
  isPending = false,
  message,
  onCancel,
  onConfirm,
  onOpenChange,
  title,
}: ConfirmationDialogProps): ReactElement {
  const { t } = useI18nStore();
  const finalCancelLabel = cancelLabel ?? t('cancel');
  const finalConfirmLabel = confirmLabel ?? t('confirm');

  return (
    <Modal isOpen={isOpen} {...(onOpenChange ? { onOpenChange } : {})}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[400px] border border-panel-line bg-panel-surface shadow-panel backdrop-blur rounded-panel">
            <Modal.Header>
              <Modal.Heading className="text-lg font-semibold text-panel-text">
                {title}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="py-2 text-sm text-panel-muted leading-relaxed">
              {message}
            </Modal.Body>
            <Modal.Footer className="flex justify-end gap-3 mt-4">
              <Button
                isDisabled={isPending}
                onPress={() => {
                  if (onCancel) onCancel();
                  if (onOpenChange) onOpenChange(false);
                }}
                variant="secondary"
              >
                {finalCancelLabel}
              </Button>
              <Button
                isPending={isPending}
                onPress={() => {
                  void onConfirm();
                }}
                variant={isConfirmDanger ? 'danger' : 'primary'}
              >
                {finalConfirmLabel}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
