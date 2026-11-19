// B-4: the positioning wizard no longer saves a source at an intermediate step. «Ta med kilden» stages it in the
// workflow draft and «Lagre endringer» commits the whole draft atomically. A suite that needs a source saved before
// it reviews positions saves it as its own connection-only (or metadata-only) transaction: stage, then commit with no
// positions. Errors are those of the stage (validated exactly as the save) or of the commit.
export function saveStagedSource(session, ticket, review, options) {
  const staged = session.stageSourceWorkflowSource(ticket, review, options);
  if (!staged.ok) return staged;
  const committed = session.commitSourceWorkflow(ticket);
  if (!committed.ok) return committed;
  // The receipt reports what was written; it must agree with what the stage validated.
  if (committed.receipt.captureTimes !== staged.captureTimeCount) throw new Error('receipt differs from the staged change');
  return { ok: true, captureTimeCount: staged.captureTimeCount };
}
