import { describe, expect, it } from 'vitest';
import { createStoryTemplate } from './InsightsAdminPage';

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
});