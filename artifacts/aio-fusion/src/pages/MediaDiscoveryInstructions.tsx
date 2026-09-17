import React, { useState, useEffect, useRef, useCallback } from "react";
import { AlertCircle, Check, Loader2, RefreshCw, Info, RotateCcw } from "lucide-react";
import { apiBase } from "../lib/contentAi";
import { vars } from "../marketing/vars";

export default function MediaDiscoveryInstructions() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const [original, setOriginal] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [defaultText, setDefaultText] = useState<string>("");
  const [version, setVersion] = useState<number>(0);
  const [canEdit, setCanEdit] = useState<boolean>(false);
  
  const [saving, setSaving] = useState(false);
  
  const abortRef = useRef<AbortController | null>(null);

  const fetchInstructions = useCallback(async (isReload = false) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();
    
    if (!isReload) setLoading(true);
    setError(null);
    setConflictError(false);
    
    try {
      const url = `${apiBase()}/api/store/media-db/discovery-instructions`;
      const res = await fetch(url, {
        credentials: "include",
        signal: abortRef.current.signal
      });
      
      if (!res.ok) {
        throw new Error(`Failed to load instructions (${res.status})`);
      }
      
      const data = await res.json();
      if (data.ok) {
        setOriginal(data.instructions || "");
        setDraft(data.instructions || "");
        setDefaultText(data.defaultInstructions || "");
        setVersion(data.version != null ? data.version : 0);
        setCanEdit(!!data.canEdit);
      } else {
        throw new Error(data.error || "Failed to load instructions.");
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError(err.message || "An error occurred while loading instructions.");
      }
    } finally {
      if (!isReload) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstructions();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchInstructions]);

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setConflictError(false);
    setSuccessMsg(null);
    
    try {
      const url = `${apiBase()}/api/store/media-db/discovery-instructions`;
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ instructions: draft, version })
      });
      
      if (res.status === 409) {
        setConflictError(true);
        setError("Another user updated these instructions. Please reload the latest changes.");
        setSaving(false);
        return;
      }
      
      if (!res.ok) {
        throw new Error(`Failed to save instructions (${res.status})`);
      }
      
      const data = await res.json();
      if (data.ok) {
        setOriginal(data.instructions || "");
        setDraft(data.instructions || "");
        setVersion(data.version != null ? data.version : 0);
        setSuccessMsg("Instructions saved successfully.");
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        throw new Error(data.error || "Failed to save instructions.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred while saving instructions.");
    } finally {
      setSaving(false);
    }
  };

  const isDirty = draft !== original;
  const charCount = draft.length;
  const isValid = charCount >= 50 && charCount <= 12000;
  
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="animate-spin" color={vars.accent} size={24} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl bg-white rounded-xl border p-6" style={{ borderColor: vars.g200 }}>
      <h2 className="text-xl font-semibold mb-2" style={{ color: vars.navy }}>Research instructions</h2>
      
      <div className="flex gap-2 items-start p-3 mb-6 rounded-lg text-sm" style={{ backgroundColor: vars.g50, color: vars.g600 }}>
        <Info size={16} className="mt-0.5 shrink-0" color={vars.teal} />
        <div>
          <p className="mb-1">These instructions govern future explicit platform-wide discovery searches.</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Fixed rules require public sources.</li>
            <li>No guessed emails.</li>
            <li>All discoveries require human approval.</li>
            <li>No automatic 30-day sweeps.</li>
          </ul>
        </div>
      </div>

      {error && !conflictError && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 text-red-700 text-sm" data-testid="status-error">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => fetchInstructions()} className="ml-auto flex items-center gap-1 text-red-700 hover:underline">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {conflictError && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-amber-50 text-amber-800 text-sm" data-testid="status-conflict">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button 
            onClick={() => fetchInstructions(true)}
            className="ml-auto flex items-center gap-1 font-medium hover:underline"
            data-testid="button-reload-latest"
          >
            <RotateCcw size={14} /> Reload latest
          </button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-green-50 text-green-700 text-sm" data-testid="status-success">
          <Check size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="mb-4">
        <textarea
          data-testid="input-instructions"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!canEdit || saving}
          className="w-full h-64 p-3 rounded-lg border text-sm focus:outline-none focus:ring-2"
          style={{ 
            borderColor: vars.g200, 
            backgroundColor: canEdit ? "#fff" : vars.g50,
            outlineColor: vars.teal
          }}
          placeholder="Enter research instructions..."
        />
        <div className="flex justify-between items-center mt-2 text-xs" style={{ color: vars.g500 }}>
          <span className={!isValid && draft.length > 0 ? "text-red-500 font-medium" : ""}>
            {charCount} / 12000 characters (min 50)
          </span>
          <div className="flex gap-3">
            {canEdit && (
              <button 
                onClick={() => setDraft(defaultText)}
                disabled={saving || !defaultText}
                className="hover:underline disabled:opacity-50"
                data-testid="button-restore-default"
              >
                Restore default
              </button>
            )}
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="flex gap-3 items-center pt-4 border-t" style={{ borderColor: vars.g200 }}>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty || !isValid || !!(error && !conflictError)}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: vars.accent }}
            data-testid="button-save-instructions"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save instructions
          </button>
          
          {isDirty && (
            <button
              onClick={() => {
                setDraft(original);
                setError(null);
                setConflictError(false);
              }}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: vars.g200, color: vars.navy }}
              data-testid="button-discard-changes"
            >
              Discard changes
            </button>
          )}
        </div>
      )}
    </div>
  );
}
