import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

export function UnsavedChangesDialog({
  open,
  replacing = false,
  busy,
  saving,
  error,
  onSave,
  onDiscard,
  onStay,
}: {
  open: boolean;
  replacing?: boolean;
  busy: boolean;
  saving: boolean;
  error: string;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !saving) onStay(); }}>
      <AlertDialogContent
        className="bg-white"
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
          else onStay();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Save your changes before leaving?</AlertDialogTitle>
          <AlertDialogDescription>
            {replacing
              ? "Retrieving this item will replace the content currently in the editor."
              : "You have changes that have not been saved to Content Library."}
            {busy ? " AI work is still running. Stay on this page to keep waiting, or leave without saving to discard its result." : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <AlertDialogFooter className="gap-2">
          <button type="button" onClick={onStay} disabled={saving} className="aio-button aio-button--outline">
            Stay on this page
          </button>
          <button type="button" onClick={onDiscard} disabled={saving} className="aio-button aio-button--outline">
            Leave without saving
          </button>
          <button type="button" onClick={onSave} disabled={saving || busy} className="aio-button aio-button--primary">
            {saving ? "Saving…" : "Save and leave"}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}