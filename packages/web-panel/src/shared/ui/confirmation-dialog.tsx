import { Button, Modal } from '@heroui/react';
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
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  isConfirmDanger = false,
  isOpen,
  isPending = false,
  message,
  onCancel,
  onConfirm,
  onOpenChange,
  title,
}: ConfirmationDialogProps): ReactElement {
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
                {cancelLabel}
              </Button>
              <Button
                isPending={isPending}
                onPress={() => {
                  void onConfirm();
                }}
                variant={isConfirmDanger ? 'danger' : 'primary'}
              >
                {confirmLabel}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
