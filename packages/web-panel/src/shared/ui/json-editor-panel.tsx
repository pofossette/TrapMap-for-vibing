import { Button } from '@heroui/react';
import type { ReactElement } from 'react';
import { useI18nStore } from '../../stores/i18n-store';

import type { ReviewArtifactFile } from '../types/admin-panel';

type JsonEditorPanelProps = {
  activeFilePath: string | null;
  canSave: boolean;
  draftText: string;
  error: string | null;
  files: ReviewArtifactFile[];
  isDirty: boolean;
  isSaving?: boolean;
  onChangeRationale: (rationale: string) => void;
  onChangeText: (text: string) => void;
  onFormat: () => void;
  onReset: () => void;
  onSave: () => void | Promise<void>;
  onSelectFile: (path: string) => void;
  rationale: string;
  rationaleMissing: boolean;
};

export function JsonEditorPanel({
  activeFilePath,
  canSave,
  draftText,
  error,
  files,
  isDirty,
  isSaving = false,
  onChangeRationale,
  onChangeText,
  onFormat,
  onReset,
  onSave,
  onSelectFile,
  rationale,
  rationaleMissing,
}: JsonEditorPanelProps): ReactElement {
  const { t } = useI18nStore();
  const activeFile = files.find((file) => file.path === activeFilePath) ?? null;
  const isJsonFile = activeFile?.language === 'json';

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-panel-text">{t('fileEditorTitle')}</h3>
          <p className="mt-1 text-sm leading-6 text-panel-muted">{t('fileEditorDesc')}</p>
        </div>
        {isDirty ? (
          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-200 border border-amber-500/30">
            {t('unsavedChangesBadge')}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-200 border border-emerald-500/30">
            {t('syncedBadge')}
          </span>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[240px,1fr]">
        <div className="rounded-xl border border-panel-line bg-panel-surface p-2">
          <div className="mb-2 px-2 py-1 font-mono text-[12px] font-medium uppercase text-panel-muted">
            {t('reviewFilesTitle')}
          </div>
          <div className="space-y-1">
            {files.map((file) => {
              const selected = file.path === activeFilePath;
              return (
                <button
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    selected
                      ? 'border-panel-text bg-panel-text text-white'
                      : 'border-transparent bg-transparent text-panel-muted hover:border-panel-line hover:bg-[#fafafa] hover:text-panel-text'
                  }`}
                  key={file.path}
                  onClick={() => onSelectFile(file.path)}
                  type="button"
                >
                  <div className="truncate text-sm font-medium">{file.name}</div>
                  <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-[0.12em]">
                    <span>{file.language}</span>
                    <span>{Math.max(1, Math.ceil(file.size / 1024))} KB</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-panel-line bg-panel-surface-strong px-4 py-3">
            <div className="text-xs font-semibold text-panel-text">
              {activeFile?.name ?? t('noFileSelected')}
            </div>
            <div className="mt-1 text-[11px] text-panel-muted">
              {activeFile?.path ?? t('selectFileFromList')}
            </div>
            <div className="mt-2 text-[11px] text-panel-muted">
              {t('lastEdited')} {activeFile?.lastEditedAt ?? 'n/a'}
            </div>
          </div>

          <textarea
            className={`w-full min-h-[360px] rounded-xl border bg-panel-surface-strong p-4 font-mono text-xs text-panel-text focus:outline-none focus:ring-1 ${
              error
                ? 'border-rose-500/50 focus:ring-rose-500'
                : 'border-panel-line focus:ring-panel-accent'
            }`}
            onChange={(e) => onChangeText(e.target.value)}
            spellCheck={false}
            value={draftText}
          />

          <div className="space-y-1">
            <label
              className="text-xs font-medium uppercase tracking-[0.12em] text-panel-muted"
              htmlFor="edit-rationale"
            >
              {t('editRationaleLabel')}
            </label>
            <input
              className={`w-full rounded-md border bg-panel-surface-strong px-4 py-3 text-sm focus:outline-none focus:ring-1 ${
                rationaleMissing && isDirty
                  ? 'border-amber-500/50 focus:ring-amber-500'
                  : 'border-panel-line focus:ring-panel-accent'
              }`}
              id="edit-rationale"
              onChange={(e) => onChangeRationale(e.target.value)}
              placeholder={t('editRationalePlaceholder')}
              type="text"
              value={rationale}
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-panel-line/40">
            <Button
              className="border border-panel-line bg-panel-surface"
              isDisabled={!isJsonFile}
              onPress={onFormat}
              size="sm"
              variant="secondary"
            >
              {t('formatJsonBtn')}
            </Button>
            <Button
              className="border border-panel-line bg-panel-surface"
              isDisabled={!isDirty}
              onPress={onReset}
              size="sm"
              variant="secondary"
            >
              {t('resetBtn')}
            </Button>
            <Button
              className="ml-auto border border-panel-text bg-panel-text text-white font-medium"
              isDisabled={!canSave}
              isPending={isSaving}
              onPress={onSave}
              size="sm"
              variant="primary"
            >
              {t('saveFileChangesBtn')}
            </Button>
          </div>

          {error ? (
            <div className="rounded-xl border border-[#ffd9d9] bg-[#fff5f5] p-3 text-xs text-[#c50000]">
              <p className="font-semibold">{t('jsonValidationError')}</p>
              <p className="mt-1 font-mono break-all">{error}</p>
            </div>
          ) : null}

          {rationaleMissing && isDirty ? (
            <p className="text-xs text-amber-300 font-medium">
              {t('editRationaleRequiredWarning')}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
