import React, { useEffect, useId, useRef, useState } from "react";
import { useListAdminInsightMedia, getListAdminInsightMediaQueryKey } from "@workspace/api-client-react";
import type { InsightMedia } from "@workspace/api-client-react";
import { X, UploadCloud, Loader2 } from "lucide-react";
import { apiBase } from "../lib/contentAi";

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected image'));
    reader.onload = () => {
      const value = String(reader.result || '');
      const encoded = value.includes(',') ? value.slice(value.indexOf(',') + 1) : '';
      if (!encoded) reject(new Error('Could not encode the selected image'));
      else resolve(encoded);
    };
    reader.readAsDataURL(file);
  });
}

export function MediaLibraryModal({ onClose, onSelect }: { onClose: () => void; onSelect?: (media: InsightMedia) => void }) {
  const { data: mediaItems, isLoading, isError, refetch } = useListAdminInsightMedia({ query: { queryKey: getListAdminInsightMediaQueryKey() } });

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const uploadingRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!uploadingRef.current) closeRef.current();
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
      ));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault(); first.focus();
      }
    };
    dialog?.addEventListener("keydown", handleKey);
    return () => {
      dialog?.removeEventListener("keydown", handleKey);
      previousFocus?.focus();
    };
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Allow choosing the same file again after a validation or network failure.
    e.target.value = "";

    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setUploading(true);
    setProgress(0);
    setUploadError("");

    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error('Choose a PNG, JPEG or WEBP image');
      if (file.size > 6 * 1024 * 1024) throw new Error('Images must be 6 MB or smaller');
      if (file.size === 0) throw new Error('The selected image is empty');
      setProgress(15);
      const dataBase64 = await readFileAsBase64(file);
      setProgress(45);
      const response = await fetch(`${apiBase()}/api/storage/uploads/direct`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
          dataBase64,
        }),
      });
      const responseBody = await response.json().catch(() => ({})) as InsightMedia & { error?: string };
      if (!response.ok) throw new Error(responseBody.error || 'The image could not be uploaded');
      setProgress(100);
      const newMedia = responseBody;
      void refetch();
      if (onSelect) onSelect(newMedia);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a1628]/40 backdrop-blur-sm p-3 sm:p-6 transition-all"
      onClick={() => { if (!uploadingRef.current) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
          <h2 id={titleId} className="text-xl font-bold text-[#0a1628]">Media Library</h2>
          <button type="button" aria-label="Close media library" disabled={uploading} onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 hover:text-[#0a1628] rounded-full transition-colors disabled:opacity-40"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 flex flex-col gap-6">
          <div className="relative border-2 border-dashed border-gray-300 bg-white rounded-xl p-8 flex flex-col items-center justify-center hover:border-[#4f8fff] hover:bg-blue-50/30 transition-colors cursor-pointer shrink-0">
            <input type="file" aria-label="Upload image" accept="image/png,image/jpeg,image/webp" onChange={handleFileSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={uploading} />
            <UploadCloud size={32} className="text-[#4f8fff] mb-3" />
            <span className="text-base font-semibold text-[#0a1628]">Upload image from your device</span>
            <span className="text-sm text-gray-500 mt-1">PNG, JPEG or WEBP, up to 6 MB</span>
            
            {uploading && (
              <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-xl">
                <Loader2 size={28} className="animate-spin text-[#4f8fff] mb-4" />
                <div className="w-full max-w-64 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#4f8fff] transition-all duration-300 ease-out" style={{width: `${progress}%`}} />
                </div>
                <span role="status" className="text-sm font-semibold text-[#0a1628] mt-3">Uploading... {progress}%</span>
              </div>
            )}
          </div>
          {uploadError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{uploadError} Your guide or story has not been changed.</p>}

          <div>
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Existing Media</h3>
            {isError ? (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                The media library could not be loaded.
                <button type="button" disabled={uploading} onClick={() => void refetch()} className="ml-2 font-semibold underline">Retry loading images</button>
              </div>
            ) : isLoading ? (
              <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-300" size={32} /></div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {mediaItems?.map((item: InsightMedia) => (
                  <button type="button" disabled={uploading || !onSelect}
                    aria-label={`Select image ${item.fileName}`}
                    key={item.id} 
                    onClick={() => onSelect && onSelect(item)} 
                    className={`aspect-video relative group bg-white rounded-xl border border-gray-200 overflow-hidden transition-all focus-visible:ring-4 focus-visible:ring-[#4f8fff]/30 disabled:cursor-default ${onSelect ? 'cursor-pointer hover:border-[#4f8fff] hover:shadow-md hover:ring-4 hover:ring-[#4f8fff]/10' : ''}`}
                  >
                    <img src={item.publicUrl} alt={item.altText} className="w-full h-full object-cover" />
                    {onSelect && (
                      <div className="absolute inset-0 bg-[#0a1628]/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="text-white text-sm font-bold tracking-wide">Select Image</span>
                      </div>
                    )}
                  </button>
                ))}
                {(!mediaItems || mediaItems.length === 0) && (
                  <div className="col-span-full py-12 text-center text-gray-400">No media found. Upload an image to get started.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
