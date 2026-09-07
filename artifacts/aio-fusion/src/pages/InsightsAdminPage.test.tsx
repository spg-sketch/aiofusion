import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const cmsMocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@workspace/api-client-react', () => ({
  useListAdminInsights: () => ({ data: [], refetch: cmsMocks.refetch }),
  getListAdminInsightsQueryKey: () => ['insights'],
  useCreateAdminInsight: () => ({ mutateAsync: cmsMocks.create }),
  useUpdateAdminInsight: () => ({ mutateAsync: cmsMocks.update }),
  useDeleteAdminInsight: () => ({ mutateAsync: cmsMocks.remove }),
  useListAdminInsightMedia: () => ({ data: [], isLoading: false, refetch: cmsMocks.refetch }),
  getListAdminInsightMediaQueryKey: () => ['insight-media'],
}));

import { buildStoryPayload, createStoryTemplate, InsightsAdminPage } from './InsightsAdminPage';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(cmsMocks.create).toHaveBeenCalledTimes(1));
    expect(cmsMocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'CMS Publish Check',
        slug: 'cms-publish-check',
        status: 'published',
      }),
    });
  });
});