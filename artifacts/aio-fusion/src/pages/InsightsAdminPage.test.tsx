import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const cmsMocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  refetch: vi.fn(),
  insights: [] as Array<Record<string, unknown>>,
}));

vi.mock('@workspace/api-client-react', () => ({
  useListAdminInsights: () => ({ data: cmsMocks.insights, refetch: cmsMocks.refetch }),
  getListAdminInsightsQueryKey: () => ['insights'],
  useCreateAdminInsight: () => ({ mutateAsync: cmsMocks.create }),
  useUpdateAdminInsight: () => ({ mutateAsync: cmsMocks.update }),
  useDeleteAdminInsight: () => ({ mutateAsync: cmsMocks.remove }),
  useListAdminInsightMedia: () => ({ data: [], isLoading: false, refetch: cmsMocks.refetch }),
  getListAdminInsightMediaQueryKey: () => ['insight-media'],
}));

import { buildStoryPayload, createStoryTemplate, InsightsAdminPage, isValidPublicationDate } from './InsightsAdminPage';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  cmsMocks.insights = [];
});

describe('Insights CMS story templates', () => {
  it('provides a complete Standard Article structure by default', () => {
    const template = createStoryTemplate('standard');

    expect(template.tag).toBe('Insights');
    expect(template.body.map((block) => block.type)).toEqual([
      'paragraph',
      'heading',
      'paragraph',
      'heading',
      'paragraph',
      'pullquote',
      'heading',
      'list',
    ]);
    expect(template.body.find((block) => block.type === 'list')?.items).toHaveLength(3);
  });

  it('returns independent block arrays when a template is selected again', () => {
    const first = createStoryTemplate('case-study');
    const second = createStoryTemplate('case-study');

    first.body[0]!.text = 'Edited';
    expect(second.body[0]!.text).toBe('');
  });

  it('builds a valid slug from the fallback title', () => {
    const payload = buildStoryPayload({
      slug: '',
      title: '',
      excerpt: '',
      tag: 'Insights',
      body: [],
      coverImageAlt: '',
      status: 'draft',
    }, 'published');

    expect(payload).toMatchObject({
      slug: 'untitled-story',
      title: 'Untitled Story',
      status: 'published',
    });
  });

  it('only sends homepage pinning for published stories', () => {
    const story = {
      slug: 'homepage-story',
      title: 'Homepage story',
      excerpt: '',
      tag: 'Insights',
      body: [],
      coverImageAlt: '',
      status: 'published' as const,
      pinned: true,
    };

    expect(buildStoryPayload(story, 'published').pinned).toBe(true);
    expect(buildStoryPayload(story, 'draft').pinned).toBe(false);
  });

  it('accepts only real YYYY-MM-DD calendar dates as verified publication dates', () => {
    expect(isValidPublicationDate('2024-02-29')).toBe(true);
    expect(isValidPublicationDate('2026-02-29')).toBe(false);
    expect(isValidPublicationDate('2026-09-01T00:00:00Z')).toBe(false);
    expect(isValidPublicationDate(null)).toBe(false);
  });

  it('does not send a server-owned modification timestamp in a story payload', () => {
    const payload = buildStoryPayload({
      slug: 'timestamp-check',
      title: 'Timestamp check',
      excerpt: '',
      tag: 'Insights',
      body: [],
      coverImageAlt: '',
      dateModified: '1900-01-01T00:00:00.000Z',
      datePublished: '2026-09-01T00:00:00.000Z',
      status: 'draft',
    } as any, 'draft');

    expect(payload.datePublished).toBe('2026-09-01');
    expect(payload).not.toHaveProperty('dateModified');
  });

  it('shows the homepage feature control in Settings & SEO', () => {
    render(<InsightsAdminPage onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /write new story/i }));
    fireEvent.click(screen.getByRole('button', { name: /settings & seo/i }));

    expect(screen.getByRole('checkbox', { name: /feature on homepage/i })).toBeDisabled();
    expect(screen.getByText(/publish this story before featuring it/i)).toBeInTheDocument();
  });

  it('marks occupied homepage slots in the story list', () => {
    cmsMocks.insights = [{
      id: 'pinned-story',
      title: 'Pinned story',
      status: 'published',
      pinned: true,
      body: [],
    }];
    render(<InsightsAdminPage onBack={() => {}} />);

    expect(screen.getByTestId('pinned-badge-pinned-story')).toHaveTextContent('PINNED');
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(screen.getByText(/homepage feature slots used/i)).toBeInTheDocument();
  });

  it('publishes a newly titled story through the create endpoint', async () => {
    cmsMocks.create.mockResolvedValue({
      id: 'published-story',
      slug: 'cms-publish-check',
      title: 'CMS Publish Check',
      excerpt: '',
      tag: 'Insights',
      body: [],
      coverImageUrl: null,
      coverImageAlt: '',
      seoTitle: null,
      seoDescription: null,
      focusKeyphrase: null,
      canonicalUrl: null,
      status: 'published',
    });
    render(<InsightsAdminPage onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /write new story/i }));
    fireEvent.change(screen.getByPlaceholderText('Enter story title...'), {
      target: { value: 'CMS Publish Check' },
    });
    fireEvent.click(screen.getByRole('button', { name: /settings & seo/i }));
    fireEvent.change(screen.getByLabelText('Verified publication date'), {
      target: { value: '2026-09-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(cmsMocks.create).toHaveBeenCalledTimes(1));
    expect(cmsMocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'CMS Publish Check',
        slug: 'cms-publish-check',
        datePublished: '2026-09-01',
        status: 'published',
      }),
    });
  });

  it('does not call the publish endpoint when the publication date is missing', async () => {
    render(<InsightsAdminPage onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /write new story/i }));
    fireEvent.change(screen.getByPlaceholderText('Enter story title...'), {
      target: { value: 'Undated Story' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(cmsMocks.create).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/verified original publication date/i);
  });
});