import React, { useState, useEffect, useRef, useCallback } from "react";
import { AlertCircle, Check, X, Loader2, RefreshCw, ExternalLink, Info } from "lucide-react";
import { apiBase } from "../lib/contentAi";
import { vars } from "../marketing/vars";

type DiscoveryStatus = "pending" | "approved" | "rejected";

type DiscoveryItem = {
  id: number;
  status: DiscoveryStatus;
  candidate: {
    firstName?: string;
    lastName?: string;
    role?: string;
    outletName?: string;
    outletCategory?: string;
    outletWebsite?: string;
    email?: string;
    sourceUrl?: string;
    evidence?: string;
    confidence?: number;
    beats?: string[];
    sectors?: string[];
    geography?: string[];
    verifiedAt?: string;
  };
  projectId?: number;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  contactId?: number;
  outletId?: number;
};

function getSafeUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    // invalid url
  }
  return null;
}

export default function MediaDiscoveryReview({ onApproved }: { onApproved?: () => void }) {
  const [statusFilter, setStatusFilter] = useState<DiscoveryStatus>("pending");
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canReview, setCanReview] = useState(false);
  
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<{ id: number, msg: string } | null>(null);
  
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const fetchDiscoveries = useCallback(async (isSilent = false) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const requestId = ++requestIdRef.current;
    
    if (!isSilent) setLoading(true);
    setError(null);
    
    try {
      const url = `${apiBase()}/api/store/media-db/discoveries?status=${statusFilter}`;
      const res = await fetch(url, {
        credentials: "include",
        signal: abortRef.current.signal
      });
      
      if (!res.ok) {
        throw new Error(`Failed to load discoveries (${res.status})`);
      }
      
      const data = await res.json();
      if (data.ok) {
        if (requestId !== requestIdRef.current) return;
        setItems(data.items || []);
        setCanReview(!!data.canReview);
      } else {
        throw new Error(data.error || "Failed to load discoveries.");
      }
    } catch (err: any) {
      if (requestId === requestIdRef.current && err.name !== "AbortError") {
        setError(err.message || "An error occurred while loading discoveries.");
      }
    } finally {
      if (!isSilent && requestId === requestIdRef.current) setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchDiscoveries();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchDiscoveries]);

  const handleApprove = async (id: number) => {
    if (!canReview) return;
    setProcessingId(id);
    setActionError(null);
    
    try {
      const url = `${apiBase()}/api/store/media-db/discoveries/${id}/approve`;
      const res = await fetch(url, {
        method: "POST",
        credentials: "include"
      });
      
      if (res.status === 409) {
        setActionError({ id, msg: "This discovery was already reviewed. Please refresh." });
        return;
      }
      
      if (!res.ok) {
        throw new Error(`Approval failed (${res.status})`);
      }
      
      const data = await res.json();
      if (data.ok) {
        setItems(prev => prev.filter(item => item.id !== id));
        if (onApproved) onApproved();
        fetchDiscoveries(true);
      } else {
        throw new Error(data.error || "Failed to approve discovery.");
      }
    } catch (err: any) {
      setActionError({ id, msg: err.message || "Approval failed." });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectSubmit = async (id: number) => {
    if (!canReview) return;
    setProcessingId(id);
    setActionError(null);
    
    try {
      const url = `${apiBase()}/api/store/media-db/discoveries/${id}/reject`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: rejectReason })
      });
      
      if (res.status === 409) {
        setActionError({ id, msg: "This discovery was already reviewed. Please refresh." });
        return;
      }
      
      if (!res.ok) {
        throw new Error(`Rejection failed (${res.status})`);
      }
      
      const data = await res.json();
      if (data.ok) {
        setItems(prev => prev.filter(item => item.id !== id));
        setRejectingId(null);
        setRejectReason("");
        fetchDiscoveries(true);
      } else {
        throw new Error(data.error || "Failed to reject discovery.");
      }
    } catch (err: any) {
      setActionError({ id, msg: err.message || "Rejection failed." });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="w-full rounded-xl bg-white p-5 sm:p-6">
      <div className="flex items-center gap-2 p-3 mb-6 rounded-lg text-sm bg-blue-50 text-blue-800 border border-blue-100">
        <Info size={16} className="mt-0.5 shrink-0" />
        <div>
          <p>
            <strong>Note:</strong> Approving means human approval into the database, NOT an independently verified source or email. 
            There is no outreach or shortlisting directly from pending discoveries.
          </p>
        </div>
      </div>

      <div className="flex gap-4 border-b mb-6" style={{ borderColor: vars.g200 }}>
        {(["pending", "approved", "rejected"] as const).map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`pb-3 text-sm font-medium capitalize border-b-2 transition-colors`}
            style={{ 
              borderColor: statusFilter === status ? vars.accent : "transparent",
              color: statusFilter === status ? vars.navy : vars.g500
            }}
            data-testid={`tab-filter-${status}`}
          >
            {status}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="animate-spin" color={vars.accent} size={28} />
        </div>
      ) : error ? (
        <div className="p-6 text-center border rounded-xl bg-white" style={{ borderColor: vars.g200 }}>
          <AlertCircle size={24} className="mx-auto mb-3 text-red-500" />
          <p className="text-sm font-medium text-gray-800 mb-4">{error}</p>
          <button 
            onClick={() => fetchDiscoveries()} 
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border hover:bg-gray-50"
            style={{ borderColor: vars.g200, color: vars.navy }}
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center border rounded-xl bg-white" style={{ borderColor: vars.g200 }}>
          <p className="text-sm" style={{ color: vars.g500 }}>
            No {statusFilter} discoveries found.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => {
            const safeSourceUrl = getSafeUrl(item.candidate.sourceUrl);
            
            return (
              <div key={item.id} className="border rounded-xl bg-white overflow-hidden shadow-sm" style={{ borderColor: vars.g200 }} data-testid={`card-discovery-${item.id}`}>
                <div className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-bold" style={{ color: vars.navy }}>
                          {item.candidate.firstName} {item.candidate.lastName}
                        </h3>
                        {item.status === "pending" && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            Unverified discovery
                          </span>
                        )}
                        {item.status === "approved" && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200">
                            Approved
                          </span>
                        )}
                        {item.status === "rejected" && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
                            Rejected
                          </span>
                        )}
                      </div>
                      <p className="text-sm mb-1" style={{ color: vars.g600 }}>
                        {item.candidate.role} {item.candidate.outletName ? `at ${item.candidate.outletName}` : ""}
                      </p>
                      {item.candidate.email && (
                        <p className="text-sm font-mono" style={{ color: vars.g500 }}>{item.candidate.email}</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 border mb-4" style={{ borderColor: vars.g200 }}>
                    <h4 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: vars.g500 }}>Source Evidence</h4>
                    <p className="text-sm whitespace-pre-wrap mb-2" style={{ color: vars.navy }}>
                      {item.candidate.evidence || "No evidence provided."}
                    </p>
                    {safeSourceUrl && (
                      <a 
                        href={safeSourceUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                        style={{ color: vars.teal }}
                        data-testid={`link-source-${item.id}`}
                      >
                        <ExternalLink size={14} /> View Source
                      </a>
                    )}
                  </div>

                  {item.status !== "pending" && item.reviewedBy && (
                    <div className="text-xs mt-4 pt-4 border-t" style={{ borderColor: vars.g200, color: vars.g500 }}>
                      Reviewed by {item.reviewedBy} {item.reviewedAt ? `on ${new Date(item.reviewedAt).toLocaleDateString()}` : ""}
                      {item.status === "rejected" && item.rejectionReason && (
                         <span className="block mt-1 text-red-600">Reason: {item.rejectionReason}</span>
                      )}
                    </div>
                  )}

                  {actionError?.id === item.id && (
                    <div className="mt-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2">
                      <AlertCircle size={16} />
                      {actionError.msg}
                    </div>
                  )}
                </div>

                {item.status === "pending" && (
                  <div className="border-t p-4 bg-gray-50 flex gap-3" style={{ borderColor: vars.g200 }}>
                    {rejectingId === item.id ? (
                      <div className="w-full">
                        <label className="block text-xs font-semibold mb-1" style={{ color: vars.navy }}>Rejection Reason (Optional)</label>
                        <input 
                          type="text" 
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="e.g. Invalid source url"
                          className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 mb-3"
                          style={{ borderColor: vars.g200, outlineColor: vars.teal }}
                          data-testid={`input-reject-reason-${item.id}`}
                          disabled={processingId === item.id}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRejectSubmit(item.id)}
                            disabled={processingId === item.id}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                            data-testid={`button-confirm-reject-${item.id}`}
                          >
                            {processingId === item.id && <Loader2 size={14} className="animate-spin" />}
                            Confirm Reject
                          </button>
                          <button
                            onClick={() => { setRejectingId(null); setRejectReason(""); }}
                            disabled={processingId === item.id}
                            className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-gray-100 disabled:opacity-50"
                            style={{ borderColor: vars.g200, color: vars.navy }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleApprove(item.id)}
                            disabled={!canReview || processingId !== null}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
                          style={{ backgroundColor: vars.green }}
                          data-testid={`button-approve-${item.id}`}
                        >
                          {processingId === item.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectingId(item.id)}
                            disabled={!canReview || processingId !== null}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border rounded-lg hover:bg-gray-100 disabled:opacity-50"
                          style={{ borderColor: vars.g200, color: vars.navy }}
                          data-testid={`button-reject-${item.id}`}
                        >
                          <X size={16} /> Reject
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
