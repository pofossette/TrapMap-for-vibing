import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { JsonEditorPanel } from './json-editor-panel';

// Configure React act environment for Vitest
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('JsonEditorPanel Component UI Rendering', () => {
  it('disables the save button and shows validation status when canSave is false', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <JsonEditorPanel
          activeFilePath="entry/review-payload.json"
          canSave={false}
          draftText='{"invalid":}'
          error="Unexpected token } in JSON at position 12"
          files={[
            {
              path: 'entry/review-payload.json',
              name: 'review-payload.json',
              language: 'json',
              lastEditedAt: '2026-06-19T10:00:00.000Z',
              size: 42,
              content: '{"invalid":}',
            },
          ]}
          isDirty={true}
          onChangeRationale={() => {}}
          onChangeText={() => {}}
          onFormat={() => {}}
          onReset={() => {}}
          onSave={() => {}}
          onSelectFile={() => {}}
          rationale=""
          rationaleMissing={true}
        />,
      );
    });

    // Find the save button by text content
    const buttons = Array.from(container.querySelectorAll('button'));
    const applyButton = buttons.find((b) => b.textContent?.includes('Save File Changes')) as
      | HTMLButtonElement
      | undefined;

    expect(applyButton).toBeTruthy();
    expect(applyButton?.disabled).toBe(true);

    // Check if the validation error is displayed
    const errorText = container.textContent;
    expect(errorText).toContain('Unexpected token } in JSON at position 12');
    expect(errorText).toContain('Edit rationale is required');

    root.unmount();
    document.body.removeChild(container);
  });

  it('enables the save button when canSave is true', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <JsonEditorPanel
          activeFilePath="entry/review-payload.json"
          canSave={true}
          draftText='{"valid": true}'
          error={null}
          files={[
            {
              path: 'entry/review-payload.json',
              name: 'review-payload.json',
              language: 'json',
              lastEditedAt: '2026-06-19T10:00:00.000Z',
              size: 32,
              content: '{"valid": true}',
            },
          ]}
          isDirty={true}
          onChangeRationale={() => {}}
          onChangeText={() => {}}
          onFormat={() => {}}
          onReset={() => {}}
          onSave={() => {}}
          onSelectFile={() => {}}
          rationale="fixing config"
          rationaleMissing={false}
        />,
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const applyButton = buttons.find((b) => b.textContent?.includes('Save File Changes')) as
      | HTMLButtonElement
      | undefined;

    expect(applyButton).toBeTruthy();
    expect(applyButton?.disabled).toBe(false);
    expect(container.textContent).toContain('review-payload.json');

    root.unmount();
    document.body.removeChild(container);
  });
});
