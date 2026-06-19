import { toast } from '@heroui/react';
import { type ReactElement, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useReviewDetailController } from '../../features/review-detail/use-review-detail-controller';
import { FadeIn, PageTransition } from '../../shared/motion';
import {
  ConfirmationDialog,
  ErrorPanel,
  JsonEditorPanel,
  PageContainer,
  ReviewActionBar,
  SectionHeader,
  SkeletonBlock,
  StatusBadge,
  TimelineItem,
} from '../../shared/ui';
import { useI18nStore } from '../../stores/i18n-store';

export function ReviewDetailPage(): ReactElement {
  const params = useParams();
  const model = useReviewDetailController(params.id ?? 'unknown');
  const { t } = useI18nStore();

  // Local state for decision action confirmation dialog
  const [pendingDecision, setPendingDecision] = useState<
    'approve' | 'reject' | 'return-for-correction' | null
  >(null);

  const item = model.item;

  if (model.error) {
    return (
      <PageTransition className="space-y-6">
        <SectionHeader title="Governance Detail Workspace" />
        <ErrorPanel message={model.error} />
        <div className="pt-4">
          <Link className="text-panel-accent hover:underline text-sm font-semibold" to="/reviews">
            &larr; Back to Review Queue
          </Link>
        </div>
      </PageTransition>
    );
  }

  // Triggered when clicking an action button in ReviewActionBar
  const handleActionClick = (decision: 'approve' | 'reject' | 'return-for-correction') => {
    setPendingDecision(decision);
  };

  // Triggered after user clicks "Confirm" in ConfirmationDialog
  const handleConfirmDecision = async () => {
    if (!pendingDecision) return;
    const decisionToSubmit = pendingDecision;
    setPendingDecision(null); // Close dialog first
    const success = await model.submitDecision(decisionToSubmit);
    if (success) {
      toast.success(t('decisionSuccess'));
    } else {
      toast.danger(t('decisionFailed'));
    }
  };

  const getDecisionDialogTitle = (decision: typeof pendingDecision) => {
    if (decision === 'approve') return 'Approve Review Item';
    if (decision === 'reject') return 'Reject Review Item';
    if (decision === 'return-for-correction') return 'Return Review Item for Correction';
    return 'Confirm Action';
  };

  const getDecisionDialogMessage = (decision: typeof pendingDecision) => {
    if (decision === 'approve') {
      return 'Are you sure you want to approve this governance item? Approved entries are ingested into the platform system.';
    }
    if (decision === 'reject') {
      return 'Are you sure you want to reject this entry? Rejected items will be permanently locked with the specified rationale.';
    }
    if (decision === 'return-for-correction') {
      return 'Are you sure you want to return this entry to the contributor for correction?';
    }
    return '';
  };

  return (
    <PageTransition className="space-y-6">
      <PageContainer>
        {/* Back Link and Page Heading */}
        <div className="mb-2">
          <Link
            className="inline-flex items-center text-xs font-semibold text-panel-muted hover:text-panel-accent transition gap-1.5"
            to="/reviews"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M15 19l-7-7 7-7"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
            Back to Queue
          </Link>
        </div>

        <SectionHeader
          description="Detailed governance metadata, validation reports, JSON configuration, and audit records."
          title={`Review Detail · ${item?.id ?? params.id ?? 'unknown'}`}
        />

        {model.loading && !item ? (
          <div className="space-y-6">
            <SkeletonBlock count={3} variant="line" />
            <div className="grid gap-6 xl:grid-cols-[1.5fr,1fr]">
              <SkeletonBlock count={4} variant="line" />
              <SkeletonBlock count={6} variant="line" />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="relative overflow-hidden rounded-2xl border border-panel-line bg-panel-surface p-6 shadow-panel">
              <div className="pointer-events-none absolute inset-y-0 right-0 w-[38%] bg-[radial-gradient(circle_at_center,#007cf01c_0%,#7928ca12_42%,#ff00800d_70%,transparent_100%)]" />
              <div className="relative grid gap-5 lg:grid-cols-[1.35fr,0.9fr]">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex rounded-full border border-panel-line bg-panel-surface px-3 py-1 font-mono text-[12px] font-medium uppercase text-panel-muted">
                      Review Workspace
                    </span>
                    {item?.status && (
                      <StatusBadge
                        tone={
                          item.status === 'submitted'
                            ? 'warning'
                            : item.status === 'approved'
                              ? 'success'
                              : 'danger'
                        }
                      >
                        {item.status}
                      </StatusBadge>
                    )}
                  </div>
                  <div>
                    <h3 className="text-[48px] font-semibold leading-[48px] tracking-[-2.4px] text-panel-text">
                      {item?.title ?? 'Loading review item'}
                    </h3>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-panel-muted">
                      {item?.summary ?? 'No summary available.'}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {model.contextCards.map((card) => (
                    <div
                      className="rounded-xl border border-panel-line bg-panel-surface-strong p-4"
                      key={card.label}
                    >
                      <span className="font-mono text-[12px] font-medium uppercase text-panel-muted">
                        {card.label}
                      </span>
                      <p className="mt-2 break-all text-sm font-medium leading-6 text-panel-text">
                        {card.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.5fr,1fr]">
              {/* Left Column: Metadata and Extracted Info */}
              <div className="space-y-6">
                {/* Machine analysis warnings section */}
                {item?.warnings.length ? (
                  <section className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel space-y-4">
                    <h4 className="text-sm font-bold uppercase tracking-[0.16em] text-panel-muted">
                      Automated Validation Reports
                    </h4>
                    <div className="space-y-2">
                      {item.warnings.map((warning, i) => (
                        <div
                          className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-xs leading-relaxed ${
                            warning.kind === 'system'
                              ? 'bg-[#fff5f5] border-[#ffd9d9] text-[#c50000]'
                              : warning.kind === 'manual-flag'
                                ? 'bg-[#ffefcf] border-[#ffd79e] text-[#ab570a]'
                                : 'bg-panel-surface-strong border-panel-line text-panel-muted'
                          }`}
                          key={i}
                        >
                          <span className="inline-flex rounded-full border border-panel-line bg-panel-surface px-1.5 py-0.5 font-mono text-[12px] font-medium uppercase text-panel-muted">
                            {warning.kind}
                          </span>
                          <p className="mt-0.5">{warning.message}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {/* Activity Timeline under left column for clean desktop layout */}
                <section className="rounded-2xl border border-panel-line bg-panel-surface p-5 shadow-panel space-y-5">
                  <h3 className="border-b border-panel-line pb-3 text-lg font-semibold text-panel-text">
                    Item Audit Timeline
                  </h3>
                  <div className="relative border-l-0 border-panel-line/30 ml-2">
                    {item?.activity.map((event) => (
                      <TimelineItem
                        actor={event.actor}
                        description={event.description}
                        key={event.id}
                        timestamp={event.timestamp}
                        title={event.title}
                        tone={event.tone}
                        typeLabel={event.typeLabel}
                      />
                    ))}
                    {(!item?.activity || item.activity.length === 0) && (
                      <p className="text-sm text-panel-muted italic">
                        No timeline entries recorded.
                      </p>
                    )}
                  </div>
                </section>
              </div>

              {/* Right Column: Actions and JSON intervention editor */}
              <div className="space-y-6">
                {/* Official Review Action panel */}
                <FadeIn delay={0.08}>
                  <ReviewActionBar
                    isPending={model.loading}
                    onChangeRationale={model.setDecisionRationale}
                    onSubmitDecision={handleActionClick}
                    rationale={model.decisionRationale}
                  />
                </FadeIn>

                {/* JSON Manual intervention editor */}
                <FadeIn delay={0.16}>
                  <JsonEditorPanel
                    activeFilePath={model.jsonEditor.activeFilePath}
                    canSave={model.jsonEditor.canSave}
                    draftText={model.jsonEditor.draftText}
                    error={model.jsonEditor.error}
                    files={model.jsonEditor.files}
                    isDirty={model.jsonEditor.dirty}
                    isSaving={model.loading} // matches loader
                    onChangeRationale={model.jsonEditor.setRationale}
                    onChangeText={model.jsonEditor.setDraftText}
                    onFormat={model.jsonEditor.format}
                    onReset={model.jsonEditor.reset}
                    onSelectFile={model.jsonEditor.selectFile}
                    onSave={async () => {
                      const success = await model.jsonEditor.save();
                      if (success) {
                        toast.success(t('jsonSaved'));
                      } else {
                        toast.danger(t('jsonSaveFailed'));
                      }
                    }}
                    rationale={model.jsonEditor.rationale}
                    rationaleMissing={model.jsonEditor.rationaleMissing}
                  />
                </FadeIn>
              </div>
            </div>
          </div>
        )}

        {/* Global confirmation dialog for actions */}
        <ConfirmationDialog
          isConfirmDanger={pendingDecision === 'reject'}
          isOpen={pendingDecision !== null}
          message={getDecisionDialogMessage(pendingDecision)}
          onCancel={() => setPendingDecision(null)}
          onConfirm={handleConfirmDecision}
          title={getDecisionDialogTitle(pendingDecision)}
        />
      </PageContainer>
    </PageTransition>
  );
}
