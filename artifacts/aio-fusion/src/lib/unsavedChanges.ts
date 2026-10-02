export type UnsavedEditorRegistration = {
  editor: "creator" | "optimiser" | "howto";
  dirty: boolean;
  busy: boolean;
  save: () => Promise<{ ok: boolean; error?: string }>;
};

export type RegisterUnsavedEditor = (registration: UnsavedEditorRegistration | null) => void;
export type RequestEditorAction = (run: () => void, options?: { replacing?: boolean }) => boolean;

export type EditorRecoverySnapshot<T> = {
  version: 1;
  editor: "creator" | "optimiser";
  workspaceId: string;
  projectId: string;
  sourceArchiveId: string | null;
  savedAt: string;
  snapshot: string;
  data: T;
};

const RECOVERY_PREFIX = "aio.editor-recovery.v1";

function recoveryKey(editor: "creator" | "optimiser", workspaceId: string, projectId: string): string {
  return `${RECOVERY_PREFIX}::${encodeURIComponent(workspaceId)}::${encodeURIComponent(projectId)}::${editor}`;
}

export function loadEditorRecovery<T>(
  editor: "creator" | "optimiser",
  workspaceId: string,
  projectId: string,
): EditorRecoverySnapshot<T> | null {
  if (!workspaceId || !projectId) return null;
  try {
    const raw = localStorage.getItem(recoveryKey(editor, workspaceId, projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EditorRecoverySnapshot<T>;
    if (
      parsed?.version !== 1 ||
      parsed.editor !== editor ||
      parsed.workspaceId !== workspaceId ||
      parsed.projectId !== projectId ||
      typeof parsed.snapshot !== "string" ||
      !parsed.data ||
      typeof parsed.data !== "object"
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveEditorRecovery<T>(
  editor: "creator" | "optimiser",
  workspaceId: string,
  projectId: string,
  sourceArchiveId: string | null,
  snapshot: string,
  data: T,
): void {
  if (!workspaceId || !projectId) return;
  try {
    const recovery: EditorRecoverySnapshot<T> = {
      version: 1,
      editor,
      workspaceId,
      projectId,
      sourceArchiveId,
      savedAt: new Date().toISOString(),
      snapshot,
      data,
    };
    localStorage.setItem(recoveryKey(editor, workspaceId, projectId), JSON.stringify(recovery));
  } catch {
    // Recovery is best effort and must never interrupt editing.
  }
}

export function clearEditorRecovery(
  editor: "creator" | "optimiser",
  workspaceId: string,
  projectId: string,
  expectedSnapshot?: string,
): void {
  if (!workspaceId || !projectId) return;
  try {
    const key = recoveryKey(editor, workspaceId, projectId);
    if (expectedSnapshot !== undefined) {
      const current = loadEditorRecovery<unknown>(editor, workspaceId, projectId);
      if (current && current.snapshot !== expectedSnapshot) return;
    }
    localStorage.removeItem(key);
  } catch {
    // Recovery cleanup is best effort and must not turn a confirmed save into an error.
  }
}