export type UnsavedEditorRegistration = {
  editor: "creator" | "optimiser";
  dirty: boolean;
  busy: boolean;
  save: () => Promise<{ ok: boolean; error?: string }>;
};

export type RegisterUnsavedEditor = (registration: UnsavedEditorRegistration | null) => void;
export type RequestEditorAction = (run: () => void, options?: { replacing?: boolean }) => boolean;