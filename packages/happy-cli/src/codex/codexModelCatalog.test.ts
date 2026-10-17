import { describe, expect, it, vi } from 'vitest';
import type { Metadata } from '@/api/types';
import type { Model } from './codexAppServerTypes';
import { mapCodexModelsToSessionOptions, publishCodexModelCatalog } from './codexModelCatalog';

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

function model(overrides: Partial<Model> & Pick<Model, 'id'>): Model {
    return {
        id: overrides.id,
        model: overrides.model ?? overrides.id,
        displayName: overrides.displayName ?? overrides.id,
        description: overrides.description ?? '',
        hidden: overrides.hidden ?? false,
        supportedReasoningEfforts: overrides.supportedReasoningEfforts ?? [],
        defaultReasoningEffort: overrides.defaultReasoningEffort ?? 'high',
    };
}

describe('mapCodexModelsToSessionOptions', () => {
    it('maps the catalog to the metadata option shape', () => {
        const options = mapCodexModelsToSessionOptions([
            model({ id: 'deepseek-flash', displayName: 'DeepSeek-Flash', description: 'frontier coder' }),
            model({ id: 'deepseek-v4-pro', displayName: 'DeepSeek-V4-Pro' }),
        ]);

        expect(options).toEqual([
            { code: 'deepseek-flash', value: 'DeepSeek-Flash', description: 'frontier coder' },
            { code: 'deepseek-v4-pro', value: 'DeepSeek-V4-Pro', description: null },
        ]);
    });

    it('drops hidden entries and falls back to the id when displayName is blank', () => {
        const options = mapCodexModelsToSessionOptions([
            model({ id: 'hidden-model', hidden: true }),
            model({ id: 'bare-model', displayName: '' }),
        ]);

        expect(options).toEqual([{ code: 'bare-model', value: 'bare-model', description: null }]);
    });

    it('returns nothing for an empty catalog', () => {
        expect(mapCodexModelsToSessionOptions([])).toEqual([]);
    });
});

describe('publishCodexModelCatalog', () => {
    it('writes the catalog into session metadata', async () => {
        const current = { path: '/repo', flavor: 'codex' } as unknown as Metadata;
        const updateMetadata = vi.fn((updater: (metadata: Metadata) => Metadata) => updater(current));
        const listModels = vi.fn(async () => ({
            data: [model({ id: 'deepseek-flash', displayName: 'DeepSeek-Flash' })],
            nextCursor: null,
        }));

        await publishCodexModelCatalog({ client: { listModels }, session: { updateMetadata } });

        expect(listModels).toHaveBeenCalledTimes(1);
        expect(updateMetadata).toHaveBeenCalledTimes(1);
        expect(updateMetadata.mock.results[0]?.value).toEqual({
            path: '/repo',
            flavor: 'codex',
            models: [{ code: 'deepseek-flash', value: 'DeepSeek-Flash', description: null }],
        });
    });

    it('leaves metadata untouched when the catalog is empty', async () => {
        const updateMetadata = vi.fn();
        const listModels = vi.fn(async () => ({ data: [], nextCursor: null }));

        await publishCodexModelCatalog({ client: { listModels }, session: { updateMetadata } });

        expect(updateMetadata).not.toHaveBeenCalled();
    });

    it('swallows catalog failures so the session still starts', async () => {
        const updateMetadata = vi.fn();
        const listModels = vi.fn(async () => {
            throw new Error('app-server went away');
        });

        await expect(
            publishCodexModelCatalog({ client: { listModels }, session: { updateMetadata } }),
        ).resolves.toBeUndefined();
        expect(updateMetadata).not.toHaveBeenCalled();
    });
});
