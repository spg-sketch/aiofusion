import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  useListAdminInsights, getListAdminInsightsQueryKey,
  useCreateAdminInsight, useUpdateAdminInsight, useDeleteAdminInsight,
  useListAdminInsightMedia, getListAdminInsightMediaQueryKey
} from "@workspace/api-client-react";
import type { InsightArticle, InsightArticleInput, InsightBlock, InsightMedia } from "@workspace/api-client-react";
import {
  ChevronUp, ChevronDown, Trash2, Plus, X, UploadCloud, Settings, Image as ImageIcon,
  FileText, Loader2, Check, Search, ArrowLeft, Type, Quote, BarChart, List as ListIcon, ExternalLink
} from "lucide-react";
import { apiBase } from "../lib/contentAi";

// --- Helpers ---

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

const BLOCKS = [
  { id: 'paragraph', label: 'Paragraph', icon: FileText },
  { id: 'heading', label: 'Heading', icon: Type },
  { id: 'subheading', label: 'Subheading', icon: Type },
  { id: 'pullquote', label: 'Quote', icon: Quote },
  { id: 'stat', label: 'Statistic', icon: BarChart },
  { id: 'list', label: 'List', icon: ListIcon },
  { id: 'image', label: 'Image', icon: ImageIcon },
];

type StoryTemplateId = 'standard' | 'news' | 'guide' | 'case-study' | 'opinion';

const STORY_TEMPLATES: Array<{ id: StoryTemplateId; label: string }> = [
  { id: 'standard', label: 'Standard Article' },
  { id: 'news', label: 'News or Announcement' },
  { id: 'guide', label: 'How-to Guide' },
  { id: 'case-study', label: 'Case Study' },
  { id: 'opinion', label: 'Opinion or Commentary' },
];

export function createStoryTemplate(template: StoryTemplateId): Pick<InsightArticleInput, 'tag' | 'body'> {
  const templates: Record<StoryTemplateId, Pick<InsightArticleInput, 'tag' | 'body'>> = {
    standard: {
      tag: 'Insights',
      body: [
        { type: 'paragraph', text: '' },
        { type: 'heading', text: 'The context' },
        { type: 'paragraph', text: '' },
        { type: 'heading', text: 'What this means' },
        { type: 'paragraph', text: '' },
        { type: 'pullquote', text: '' },
        { type: 'heading', text: 'Key takeaways' },
        { type: 'list', items: ['', '', ''] },
      ],
    },
    news: {
      tag: 'News',
      body: [
        { type: 'paragraph', text: '' },
        { type: 'heading', text: 'What has been announced' },
        { type: 'paragraph', text: '' },
        { type: 'heading', text: 'Why it matters' },
        { type: 'paragraph', text: '' },
        { type: 'pullquote', text: '' },
        { type: 'heading', text: 'What happens next' },
        { type: 'paragraph', text: '' },
      ],
    },
    guide: {
      tag: 'Guidance',
      body: [
        { type: 'paragraph', text: '' },
        { type: 'heading', text: 'Before you begin' },
        { type: 'list', items: ['', '', ''] },
        { type: 'heading', text: 'Step-by-step guide' },
        { type: 'subheading', text: 'Step 1' },
        { type: 'paragraph', text: '' },
        { type: 'subheading', text: 'Step 2' },
        { type: 'paragraph', text: '' },
        { type: 'heading', text: 'Key takeaways' },
        { type: 'list', items: ['', '', ''] },
      ],
    },
    'case-study': {
      tag: 'Case Study',
      body: [
        { type: 'paragraph', text: '' },
        { type: 'heading', text: 'The challenge' },
        { type: 'paragraph', text: '' },
        { type: 'heading', text: 'The approach' },
        { type: 'paragraph', text: '' },
        { type: 'heading', text: 'The results' },
        { type: 'stat', text: '', caption: '' },
        { type: 'paragraph', text: '' },
        { type: 'pullquote', text: '' },
        { type: 'heading', text: 'What others can learn' },
        { type: 'list', items: ['', '', ''] },
      ],
    },
    opinion: {
      tag: 'Opinion',
      body: [
        { type: 'paragraph', text: '' },
        { type: 'heading', text: 'The argument' },
        { type: 'paragraph', text: '' },
        { type: 'heading', text: 'Why the usual view falls short' },
        { type: 'paragraph', text: '' },
        { type: 'pullquote', text: '' },
        { type: 'heading', text: 'A better way forward' },
        { type: 'paragraph', text: '' },
      ],
    },
  };
  return {
    tag: templates[template].tag,
    body: templates[template].body.map((block) => ({
      ...block,
      items: block.items ? [...block.items] : undefined,
    })),
  };
}

function createNewStory(): InsightArticleInput {
  const template = createStoryTemplate('standard');
  return {
    slug: '',
    title: '',
    excerpt: '',
    tag: template.tag,
    body: template.body,
    coverImageAlt: '',
    status: 'draft',
    pinned: false,
  };
}

export function buildStoryPayload(
  storyData: InsightArticleInput,
  status: 'draft' | 'published',
): InsightArticleInput {
  const title = storyData.title.trim() || 'Untitled Story';
  const generatedSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return {
    ...storyData,
    slug: storyData.slug.trim() || generatedSlug || 'untitled-story',
    title,
    excerpt: storyData.excerpt || '',
    tag: storyData.tag || 'Uncategorized',
    coverImageAlt: storyData.coverImageAlt || '',
    status,
    pinned: status === 'published' && storyData.pinned === true,
  };
}

const AutoResizeTextarea = ({ value, onChange, className, ...props }: any) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`resize-none overflow-hidden outline-none ${className}`}
      rows={1}
      {...props}
    />
  );
};

const Input = ({ label, className, ...props }: any) => (
  <div className={`mb-6 ${className || ''}`}>
    <label className="block text-sm font-semibold text-[#0a1628] mb-2">{label}</label>
    <input className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4f8fff]/20 focus:border-[#4f8fff] transition-all" {...props} />
  </div>
);

const Textarea = ({ label, className, ...props }: any) => (
  <div className={`mb-6 ${className || ''}`}>
    <label className="block text-sm font-semibold text-[#0a1628] mb-2">{label}</label>
    <textarea className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4f8fff]/20 focus:border-[#4f8fff] transition-all resize-y" rows={4} {...props} />
  </div>
);


// --- Media Library Modal ---

function MediaLibraryModal({ onClose, onSelect }: { onClose: () => void; onSelect?: (media: InsightMedia) => void }) {
  const { data: mediaItems, isLoading, refetch } = useListAdminInsightMedia({ query: { queryKey: getListAdminInsightMediaQueryKey() } });

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      if (file.size > 6 * 1024 * 1024) throw new Error('Images must be 6 MB or smaller');
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
      refetch();
      if (onSelect) onSelect(newMedia);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a1628]/40 backdrop-blur-sm p-6 transition-all" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
          <h2 className="text-xl font-bold text-[#0a1628]">Media Library</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 hover:text-[#0a1628] rounded-full transition-colors"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 flex flex-col gap-6">
          <div className="relative border-2 border-dashed border-gray-300 bg-white rounded-xl p-8 flex flex-col items-center justify-center hover:border-[#4f8fff] hover:bg-blue-50/30 transition-colors cursor-pointer shrink-0">
            <input type="file" accept="image/*" onChange={handleFileSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={uploading} />
            <UploadCloud size={32} className="text-[#4f8fff] mb-3" />
            <span className="text-base font-semibold text-[#0a1628]">Click or drag an image to upload</span>
            <span className="text-sm text-gray-500 mt-1">High resolution PNG, JPG, or WEBP</span>
            
            {uploading && (
              <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-xl">
                <Loader2 size={28} className="animate-spin text-[#4f8fff] mb-4" />
                <div className="w-64 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#4f8fff] transition-all duration-300 ease-out" style={{width: `${progress}%`}} />
                </div>
                <span className="text-sm font-semibold text-[#0a1628] mt-3">Uploading... {progress}%</span>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Existing Media</h3>
            {isLoading ? (
              <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-300" size={32} /></div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {mediaItems?.map((item: InsightMedia) => (
                  <div 
                    key={item.id} 
                    onClick={() => onSelect && onSelect(item)} 
                    className={`aspect-video relative group bg-white rounded-xl border border-gray-200 overflow-hidden transition-all ${onSelect ? 'cursor-pointer hover:border-[#4f8fff] hover:shadow-md hover:ring-4 hover:ring-[#4f8fff]/10' : ''}`}
                  >
                    <img src={item.publicUrl} alt={item.altText} className="w-full h-full object-cover" />
                    {onSelect && (
                      <div className="absolute inset-0 bg-[#0a1628]/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="text-white text-sm font-bold tracking-wide">Select Image</span>
                      </div>
                    )}
                  </div>
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


// --- Main Editor Component ---

interface StoryEditorProps {
  id: string;
  initialData: InsightArticleInput;
  onSave: (data: InsightArticleInput, status: 'draft' | 'published') => Promise<InsightArticle | void>;
  onDelete: (id: string) => Promise<void>;
  getMediaUrl: (id: string) => string | undefined;
}

function StoryEditor({ id, initialData, onSave, onDelete, getMediaUrl }: StoryEditorProps) {
  const [data, setData] = useState<InsightArticleInput>(initialData);
  const [templateId, setTemplateId] = useState<StoryTemplateId | 'custom'>(id === 'new' ? 'standard' : 'custom');
  const [tab, setTab] = useState<'content' | 'meta'>('content');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mediaTarget, setMediaTarget] = useState<'cover' | number | null>(null);

  // Reset data when ID changes (switching stories)
  useEffect(() => {
    setData(initialData);
    setTab('content');
    setTemplateId(id === 'new' ? 'standard' : 'custom');
  }, [id]);

  const changeTemplate = (nextTemplate: StoryTemplateId) => {
    const bodyDiffersFromTemplate = templateId === 'custom'
      ? data.body.some((block) =>
          Boolean(block.text?.trim() || block.caption?.trim() || block.mediaId || block.items?.some((item) => item.trim())),
        )
      : JSON.stringify(data.body) !== JSON.stringify(createStoryTemplate(templateId).body);
    if (bodyDiffersFromTemplate && !window.confirm('Change template and replace the current story body? Your title, excerpt, images and SEO settings will be kept.')) {
      return;
    }
    const template = createStoryTemplate(nextTemplate);
    setData((current) => ({ ...current, tag: template.tag, body: template.body }));
    setTemplateId(nextTemplate);
  };

  const handleSaveAction = async (status: 'draft' | 'published') => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await onSave(data, status);
      if (res) {
        // Soft update local data if server normalized fields (like slug)
        setData(prev => ({
          ...prev,
          slug: res.slug,
          status: res.status as 'draft' | 'published',
          pinned: res.pinned,
        }));
      }
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err: any) {
      const responseData = err?.data ?? err?.response?.data;
      const apiMessage = responseData && typeof responseData === 'object' && typeof responseData.error === 'string'
        ? responseData.error
        : null;
      setSaveError(apiMessage || (err.message || String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  const updateBlock = (idx: number, updates: Partial<InsightBlock>) => {
    const newBody = [...data.body];
    newBody[idx] = { ...newBody[idx], ...updates };
    setData({ ...data, body: newBody });
  };

  const moveBlock = (idx: number, dir: 1 | -1) => {
    if (idx + dir < 0 || idx + dir >= data.body.length) return;
    const newBody = [...data.body];
    const temp = newBody[idx];
    newBody[idx] = newBody[idx + dir];
    newBody[idx + dir] = temp;
    setData({ ...data, body: newBody });
  };

  const removeBlock = (idx: number) => {
    const newBody = data.body.filter((_, i) => i !== idx);
    setData({ ...data, body: newBody });
  };

  const addBlock = (type: string) => {
    const newBlock: InsightBlock = { type, text: '' };
    if (type === 'list') newBlock.items = [''];
    setData({ ...data, body: [...data.body, newBlock] });
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100);
  };

  const handleMediaSelect = (mediaItem: InsightMedia) => {
    if (mediaTarget === 'cover') {
      setData({ ...data, coverImageUrl: mediaItem.publicUrl, coverMediaId: mediaItem.id });
    } else if (typeof mediaTarget === 'number') {
      updateBlock(mediaTarget, { mediaId: mediaItem.id, previewUrl: mediaItem.publicUrl });
    }
    setMediaTarget(null);
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Editor Header */}
      <div className="h-16 border-b border-gray-100 bg-white/90 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-20 shrink-0">
        <div className="flex gap-8 h-full">
          <button 
            onClick={() => setTab('content')} 
            className={`h-full text-sm font-bold tracking-wide transition-all border-b-2 ${tab === 'content' ? 'border-[#0a1628] text-[#0a1628]' : 'border-transparent text-gray-400 hover:text-[#0a1628]'}`}
          >
            CONTENT
          </button>
          <button 
            onClick={() => setTab('meta')} 
            className={`h-full text-sm font-bold tracking-wide transition-all border-b-2 ${tab === 'meta' ? 'border-[#0a1628] text-[#0a1628]' : 'border-transparent text-gray-400 hover:text-[#0a1628]'}`}
          >
            SETTINGS & SEO
          </button>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs font-bold text-gray-500">
            <span className="hidden xl:inline">PAGE TEMPLATE</span>
            <select
              aria-label="Change page template"
              value={templateId}
              onChange={(event) => {
                const next = event.target.value;
                if (next !== 'custom') changeTemplate(next as StoryTemplateId);
              }}
              className="max-w-[190px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-[#0a1628] outline-none focus:border-[#4f8fff] focus:ring-2 focus:ring-[#4f8fff]/20"
            >
              {templateId === 'custom' && <option value="custom">Custom layout</option>}
              {STORY_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>{template.label}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2 text-sm font-medium mr-2 min-w-[100px] justify-end">
            {isSaving ? <span className="text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Saving...</span> 
             : isSaved ? <span className="text-green-600 flex items-center gap-2"><Check size={14} /> Saved</span> 
             : <span className="text-gray-400 capitalize">{data.status}</span>}
          </div>
          {saveError && (
            <span role="alert" data-testid="status-save-error" className="max-w-[280px] text-xs font-semibold text-red-600">
              {saveError}
            </span>
          )}
          <button 
            onClick={() => handleSaveAction('draft')} 
            disabled={isSaving} 
            className="text-sm font-bold text-[#0a1628] bg-gray-100 hover:bg-gray-200 px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            Save Draft
          </button>
          <button 
            onClick={() => handleSaveAction('published')} 
            disabled={isSaving} 
            className="text-sm font-bold text-white bg-[#C8497A] hover:bg-[#b03d68] shadow-md hover:shadow-lg px-6 py-2.5 rounded-lg transition-all disabled:opacity-50"
          >
            Publish
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'content' ? (
          <div className="max-w-[720px] mx-auto w-full py-16 px-6">
            <AutoResizeTextarea
              value={data.title}
              onChange={(val: string) => setData({ ...data, title: val })}
              placeholder="Enter story title..."
              className="w-full text-5xl font-bold text-[#0a1628] font-serif mb-6 leading-tight placeholder-gray-200"
            />
            <AutoResizeTextarea
              value={data.excerpt}
              onChange={(val: string) => setData({ ...data, excerpt: val })}
              placeholder="Write a brief excerpt or subtitle..."
              className={`w-full text-xl text-gray-400 font-serif italic leading-relaxed placeholder-gray-200 ${data.externalUrl ? 'mb-8' : 'mb-16'}`}
            />

            {data.externalUrl && (
              <div className="mb-12 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
                <div className="flex items-start gap-3">
                  <ExternalLink size={18} className="mt-0.5 shrink-0 text-blue-700" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#0a1628]">External article</p>
                    <p className="mt-1 text-sm text-gray-600">
                      Visitors are sent to an external page, so this story may not have content blocks in the CMS.
                    </p>
                    <a
                      href={data.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 block truncate text-sm font-semibold text-blue-700 underline underline-offset-2"
                    >
                      {data.externalUrl}
                    </a>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {data.body.map((block, idx) => {
                const pUrl = block.previewUrl || (block.mediaId ? getMediaUrl(block.mediaId as string) : "");
                
                return (
                  <div key={idx} className="group relative -mx-8 px-8 py-3 border border-transparent hover:border-gray-100 hover:bg-gray-50/50 rounded-2xl transition-all">
                    <div className="absolute right-full mr-2 top-6 opacity-0 group-hover:opacity-100 flex flex-col gap-1 items-center bg-white border border-gray-100 shadow-sm p-1 rounded-lg">
                      <button onClick={() => moveBlock(idx, -1)} className="p-1.5 text-gray-400 hover:text-[#0a1628] hover:bg-gray-100 rounded-md transition-colors"><ChevronUp size={16}/></button>
                      <button onClick={() => moveBlock(idx, 1)} className="p-1.5 text-gray-400 hover:text-[#0a1628] hover:bg-gray-100 rounded-md transition-colors"><ChevronDown size={16}/></button>
                      <div className="w-full h-px bg-gray-100 my-1"></div>
                      <button onClick={() => removeBlock(idx)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"><Trash2 size={16}/></button>
                    </div>
                    
                    <div className="w-full">
                      {block.type === 'paragraph' && (
                        <AutoResizeTextarea value={block.text || ''} onChange={(text: string) => updateBlock(idx, { text })} placeholder="Type paragraph here..." className="w-full text-lg leading-relaxed text-[#1C1C1C] font-serif bg-transparent" />
                      )}
                      {block.type === 'heading' && (
                        <AutoResizeTextarea value={block.text || ''} onChange={(text: string) => updateBlock(idx, { text })} placeholder="Heading" className="w-full text-3xl font-bold text-[#0a1628] mt-8 mb-2 font-serif bg-transparent" />
                      )}
                      {block.type === 'subheading' && (
                        <AutoResizeTextarea value={block.text || ''} onChange={(text: string) => updateBlock(idx, { text })} placeholder="Subheading" className="w-full text-xl font-bold text-[#0a1628] mt-6 mb-2 font-sans bg-transparent tracking-tight" />
                      )}
                      {block.type === 'pullquote' && (
                        <div className="border-l-4 border-[#C8497A] pl-6 my-10 py-2">
                          <AutoResizeTextarea value={block.text || ''} onChange={(text: string) => updateBlock(idx, { text })} placeholder="Quote text..." className="w-full text-2xl text-gray-500 font-serif italic leading-relaxed bg-transparent" />
                        </div>
                      )}
                      {block.type === 'stat' && (
                        <div className="bg-[#0a1628] p-10 rounded-3xl my-10 text-center shadow-xl">
                          <AutoResizeTextarea value={block.text || ''} onChange={(text: string) => updateBlock(idx, { text })} className="w-full text-6xl font-bold text-[#C8497A] text-center font-serif bg-transparent outline-none placeholder-white/20 mb-4" placeholder="45%" />
                          <AutoResizeTextarea value={block.caption || ''} onChange={(caption: string) => updateBlock(idx, { caption })} className="w-full text-lg text-gray-300 text-center bg-transparent outline-none placeholder-white/20 font-medium" placeholder="Statistic description" />
                        </div>
                      )}
                      {block.type === 'list' && (
                        <div className="my-8 space-y-4">
                          {(block.items || []).map((item, i) => (
                            <div key={i} className="flex gap-4 items-start group/item">
                              <span className="text-[#C8497A] font-bold mt-1 text-xl">•</span>
                              <AutoResizeTextarea value={item} onChange={(val: string) => {
                                const newItems = [...(block.items||[])]; newItems[i] = val; updateBlock(idx, { items: newItems });
                              }} placeholder="List item" className="flex-1 text-lg leading-relaxed text-[#1C1C1C] font-serif bg-transparent" />
                              <button onClick={() => {
                                const newItems = (block.items||[]).filter((_, i2) => i2 !== i);
                                updateBlock(idx, { items: newItems });
                              }} className="opacity-0 group-hover/item:opacity-100 p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-all mt-1"><X size={16}/></button>
                            </div>
                          ))}
                          <button onClick={() => updateBlock(idx, { items: [...(block.items||[]), ""] })} className="ml-8 text-sm font-bold text-[#4f8fff] hover:text-[#0a1628] flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors w-fit"><Plus size={16}/> Add Item</button>
                        </div>
                      )}
                      {block.type === 'image' && (
                        <div className="my-10">
                          {block.mediaId ? (
                            <div className="relative group rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 shadow-sm">
                              <img src={pUrl as string} alt={block.altText || ""} className="w-full h-auto max-h-[600px] object-contain" />
                              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                <button onClick={() => setMediaTarget(idx)} className="bg-white/95 backdrop-blur text-[#0a1628] px-4 py-2 rounded-lg font-bold text-sm shadow-md hover:text-[#4f8fff] transition-colors flex items-center gap-2"><Settings size={16}/> Change Image</button>
                              </div>
                              <div className="p-4 bg-white border-t border-gray-100">
                                <AutoResizeTextarea value={block.caption || ''} onChange={(caption: string) => updateBlock(idx, { caption })} placeholder="Write a caption... (optional)" className="w-full text-center text-sm font-medium text-gray-500 font-sans bg-transparent" />
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setMediaTarget(idx)} className="w-full h-72 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-[#4f8fff] hover:bg-[#4f8fff]/5 transition-all group/btn">
                              <div className="bg-white p-5 rounded-full shadow-sm mb-4 group-hover/btn:scale-110 group-hover/btn:shadow-md transition-all">
                                <ImageIcon size={28} className="text-[#4f8fff]" />
                              </div>
                              <span className="text-base font-bold text-[#0a1628]">Select or upload image</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-16 flex justify-center opacity-30 hover:opacity-100 transition-opacity duration-300">
              <div className="flex items-center gap-1 bg-white shadow-lg border border-gray-100 rounded-full p-1.5">
                {BLOCKS.map(b => (
                  <button
                    key={b.id}
                    onClick={() => addBlock(b.id)}
                    className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-[#0a1628] hover:bg-gray-100 px-4 py-2.5 rounded-full transition-colors tracking-wide"
                  >
                    <b.icon size={16} />
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full py-12 px-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 mb-8">
              <h3 className="text-xl font-bold text-[#0a1628] mb-8 border-b border-gray-100 pb-4">Publication Details</h3>
              
              <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                <div className="col-span-2 mb-6">
                  <label className="block text-sm font-semibold text-[#0a1628] mb-3">Cover Image</label>
                  {data.coverImageUrl ? (
                    <div className="relative group rounded-xl overflow-hidden border border-gray-100 shadow-sm">
                      <img src={data.coverImageUrl} alt="Cover" className="w-full h-64 object-cover" />
                      <div className="absolute inset-0 bg-[#0a1628]/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity gap-4">
                        <button type="button" onClick={() => setMediaTarget('cover')} className="bg-white text-[#0a1628] px-5 py-2.5 rounded-lg text-sm font-bold shadow-md hover:text-[#4f8fff] transition-colors">Change Cover</button>
                        <button type="button" onClick={() => setData({...data, coverImageUrl: null, coverMediaId: null})} className="bg-[#C8497A] text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md hover:bg-[#b03d68] transition-colors">Remove</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setMediaTarget('cover')} className="w-full h-48 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-500 hover:border-[#4f8fff] hover:bg-blue-50/50 transition-colors">
                      <div className="bg-white p-4 rounded-full shadow-sm mb-3">
                        <ImageIcon size={24} className="text-gray-400" />
                      </div>
                      <span className="text-sm font-bold text-[#0a1628]">Select Cover Image</span>
                    </button>
                  )}
                  <div className="mt-4">
                    <Input label="Cover Image Alt Text" value={data.coverImageAlt || ''} onChange={(e: any) => setData({...data, coverImageAlt: e.target.value})} placeholder="Describe the image for screen readers" />
                  </div>
                </div>

                <Input label="URL Slug" value={data.slug} onChange={(e: any) => setData({...data, slug: e.target.value})} placeholder="e.g. the-future-of-pr" />
                <Input label="Category Tag" value={data.tag} onChange={(e: any) => setData({...data, tag: e.target.value})} placeholder="e.g. Product Update" />
                
                <div className="col-span-2 mb-6">
                  <label className="block text-sm font-semibold text-[#0a1628] mb-2">External Link (Optional)</label>
                  <input
                    type="url"
                    value={data.externalUrl || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setData({...data, externalUrl: e.target.value})}
                    placeholder="https://example.com/article"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4f8fff]/20 focus:border-[#4f8fff] transition-all"
                  />
                  <p className="mt-2 text-xs leading-relaxed text-gray-500">
                    When set, visitors are sent to this URL instead of a native AIO Fusion article page.
                  </p>
                </div>
                
                <Input label="Override Publish Date" type="date" value={data.datePublished ? data.datePublished.substring(0,10) : ''} onChange={(e: any) => setData({...data, datePublished: e.target.value ? e.target.value + "T00:00:00Z" : null})} />
              </div>

                <div className="col-span-2 mt-2 rounded-xl border border-[#C8497A]/20 bg-[#C8497A]/5 p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label="Feature on homepage"
                      data-testid="checkbox-feature-homepage"
                      checked={data.pinned === true}
                      disabled={data.status !== 'published'}
                      onChange={(event) => setData({ ...data, pinned: event.target.checked })}
                      className="mt-1 h-4 w-4 accent-[#C8497A]"
                    />
                    <span>
                      <span className="block text-sm font-bold text-[#0a1628]">Feature on homepage</span>
                      <span className="mt-1 block text-xs leading-relaxed text-gray-500">
                        Pinned published stories appear before the latest articles. The newest pinned story appears first.
                        {data.status !== 'published'
                          ? ' Publish this story before featuring it.'
                          : ' Up to 3 stories can be featured.'}
                      </span>
                    </span>
                  </label>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 mb-8">
              <h3 className="text-xl font-bold text-[#0a1628] mb-8 border-b border-gray-100 pb-4">SEO & Social</h3>
              <Input label="SEO Title" value={data.seoTitle || ''} onChange={(e: any) => setData({...data, seoTitle: e.target.value})} placeholder="Optimized title for search engines (leave blank to use story title)" />
              <Textarea label="SEO Description" value={data.seoDescription || ''} onChange={(e: any) => setData({...data, seoDescription: e.target.value})} placeholder="Brief description for search results and social cards" />
              <div className="grid grid-cols-2 gap-8">
                <Input label="Focus Keyphrase" value={data.focusKeyphrase || ''} onChange={(e: any) => setData({...data, focusKeyphrase: e.target.value})} placeholder="e.g. digital pr platform" />
                <Input label="Canonical URL" value={data.canonicalUrl || ''} onChange={(e: any) => setData({...data, canonicalUrl: e.target.value})} placeholder="e.g. https://original-source.com/story" />
              </div>
            </div>

            {id !== 'new' && (
              <div className="mt-16 pt-10 border-t border-red-100 flex flex-col items-center">
                <h3 className="text-sm font-bold tracking-widest uppercase text-red-600 mb-3">Danger Zone</h3>
                <p className="text-sm text-gray-500 mb-6 text-center max-w-md">Deleting a story removes it permanently. This action cannot be undone and will break any live links to this slug.</p>
                <button 
                  onClick={() => { if(window.confirm('Are you sure you want to permanently delete this story?')) onDelete(id) }} 
                  className="text-sm font-bold text-red-600 bg-red-50 hover:bg-red-600 hover:text-white px-8 py-3 rounded-lg transition-all shadow-sm"
                >
                  Delete Story Permanently
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {mediaTarget !== null && (
        <MediaLibraryModal onClose={() => setMediaTarget(null)} onSelect={handleMediaSelect} />
      )}
    </div>
  );
}


// --- Main Page ---

export function InsightsAdminPage({ onBack }: { onBack: () => void }) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [isGlobalMediaOpen, setIsGlobalMediaOpen] = useState(false);

  const { data: insights, refetch } = useListAdminInsights({ query: { queryKey: getListAdminInsightsQueryKey() } });
  const { data: mediaItems } = useListAdminInsightMedia({ query: { queryKey: getListAdminInsightMediaQueryKey() } });
  const pinnedCount = insights?.filter((story: InsightArticle) => story.pinned).length ?? 0;
  
  const createInsight = (useCreateAdminInsight as any)();
  const updateInsight = (useUpdateAdminInsight as any)();
  const deleteInsight = (useDeleteAdminInsight as any)();

  const getMediaUrl = (id: string) => {
    return mediaItems?.find((m: InsightMedia) => m.id === id)?.publicUrl;
  };

  const handleSave = async (storyData: InsightArticleInput, status: 'draft' | 'published') => {
    const payload = buildStoryPayload(storyData, status);

    if (editingId === 'new') {
      const res = await createInsight.mutateAsync({ data: payload });
      setEditingId(res.id);
      refetch();
      return res;
    } else {
      const res = await updateInsight.mutateAsync({ id: editingId, data: payload });
      refetch();
      return res;
    }
  };

  const handleDelete = async (id: string) => {
    await deleteInsight.mutateAsync({ id });
    setEditingId(null);
    refetch();
  };

  const handleNewStory = () => {
    setEditingId('new');
  };

  const currentEditingStory = useMemo(() => {
    if (editingId === 'new') {
      return createNewStory();
    }
    if (editingId && insights) {
      const found = insights.find((s: InsightArticle) => s.id === editingId);
      if (found) {
        return {
          ...found,
          status: found.status as 'draft' | 'published',
          body: found.body || [],
          coverImageAlt: found.coverImageAlt || ''
        };
      }
    }
    return null;
  }, [editingId, insights]);

  return (
    <div className="h-[100dvh] flex flex-col bg-[#f8fafc] font-sans">
      {/* Top Navbar */}
      <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0 shadow-sm z-30 relative">
        <div className="flex items-center gap-6">
          <button onClick={onBack} aria-label="Back to admin" className="aio-button aio-button--outline aio-button--compact">
            <ArrowLeft size={20}/>
          </button>
          <div className="flex flex-col">
            <h1 className="aio-type-card-title">Insights Publication</h1>
            <span className="aio-type-eyebrow text-gray-400">Editorial workspace</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsGlobalMediaOpen(true)} 
            className="aio-button aio-button--outline"
          >
            <ImageIcon size={16} className="text-[#C8497A]"/> Media Library
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Story List */}
        <aside className="w-[340px] border-r border-gray-200 bg-[#f8fafc] flex flex-col shrink-0 z-20">
          <div className="p-5 border-b border-gray-200 bg-white flex flex-col gap-4 shrink-0 shadow-sm relative z-10">
            <button onClick={handleNewStory} className="aio-button aio-button--secondary w-full">
              <Plus size={18}/> Write New Story
            </button>
            <div className="relative group">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#4f8fff] transition-colors"/>
              <input 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                type="text" 
                placeholder="Search stories..." 
                className="w-full bg-gray-50 border border-gray-200 rounded-lg py-2.5 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#4f8fff]/20 focus:border-[#4f8fff] transition-all focus:bg-white" 
              />
            </div>
          </div>
            <div className="border-b border-gray-200 bg-white px-5 py-3 text-xs leading-relaxed text-gray-500">
              <strong className="text-[#0a1628]">{pinnedCount} of 3</strong> homepage feature slots used.
              Published stories can be pinned from Settings &amp; SEO; featured stories appear first.
            </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {insights ? (
              insights.filter((s: InsightArticle) => (s.title || '').toLowerCase().includes(search.toLowerCase())).map((story: InsightArticle) => (
                <button
                  key={story.id}
                  onClick={() => setEditingId(story.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                    editingId === story.id
                      ? 'bg-white border-[#0a1628] shadow-md ring-1 ring-[#0a1628]'
                      : 'bg-white border-transparent hover:border-gray-200 shadow-sm hover:shadow-md'
                  }`}
                >
                  <h4 className="font-bold text-[#0a1628] text-sm line-clamp-2 leading-snug mb-3">{story.title || 'Untitled Story'}</h4>
                  <div className="flex items-center justify-between gap-2 mt-1 text-xs">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className={`px-2 py-1 rounded font-bold tracking-wide ${story.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {story.status === 'published' ? 'PUBLISHED' : 'DRAFT'}
                      </span>
                      {story.externalUrl && (
                        <span className="flex items-center gap-1 rounded bg-blue-100 px-2 py-1 font-bold tracking-wide text-blue-700">
                          <ExternalLink size={11} />
                          EXTERNAL
                        </span>
                      )}
                      {story.pinned && story.status === 'published' && (
                        <span data-testid={`pinned-badge-${story.id}`} className="rounded bg-[#C8497A]/15 px-2 py-1 font-bold tracking-wide text-[#C8497A]">
                          PINNED
                        </span>
                      )}
                    </div>
                    <span className="text-gray-400 font-semibold">{new Date(story.updatedAt || story.createdAt || Date.now()).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-gray-400" /></div>
            )}
            {insights && insights.length === 0 && (
              <div className="text-center p-8 text-sm text-gray-500 font-medium">No stories found. Create one to get started.</div>
            )}
          </div>
        </aside>

        {/* Main Editor Area */}
        <main className="flex-1 flex flex-col overflow-hidden relative bg-white">
          {editingId && currentEditingStory ? (
            <StoryEditor
              key={editingId}
              id={editingId}
              initialData={currentEditingStory as InsightArticleInput}
              onSave={handleSave}
              onDelete={handleDelete}
              getMediaUrl={getMediaUrl}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50">
              <div className="bg-white p-6 rounded-full shadow-sm mb-6 border border-gray-100">
                <FileText size={48} className="text-gray-300" />
              </div>
              <p className="text-xl font-bold text-[#0a1628]">Select a story to edit</p>
              <p className="text-sm font-medium mt-2 text-gray-500">Or create a new one from the sidebar.</p>
            </div>
          )}
        </main>
      </div>

      {isGlobalMediaOpen && (
        <MediaLibraryModal onClose={() => setIsGlobalMediaOpen(false)} />
      )}
    </div>
  );
}
