import type { ApiSessionClient } from '@/api/apiSession';
import { logger } from '@/ui/logger';
import type { CodexAppServerClient } from './codexAppServerClient';
import type { Model } from './codexAppServerTypes';

export type CodexSessionModelOption = {
    code: string;
    value: string;
    description: string | null;
};

/**
 * Codex publishes the models it can actually run over `model/list`, and that
 * list comes from `model_catalog_json` — a custom catalog for a third-party
 * provider included, not just OpenAI's own registry. The app prefers a catalog
 * reported through session metadata over its built-in list, so reporting it is
 * what makes those models selectable instead of invisible.
 */
export function mapCodexModelsToSessionOptions(
    models: ReadonlyArray<Model>,
): CodexSessionModelOption[] {
    return models
        .filter(model => model.id && !model.hidden)
        .map(model => ({
            code: model.id,
            // `displayName` is what the catalog calls the model; fall back to the
            // id rather than showing an empty row.
            value: model.displayName || model.id,
            description: model.description || null,
        }));
}

/**
 * Report the codex model catalog into session metadata so the mobile model
 * picker offers what this install can run. Never throws: a session must start
 * even when the catalog cannot be read.
 */
export async function publishCodexModelCatalog(opts: {
    client: Pick<CodexAppServerClient, 'listModels'>;
    session: Pick<ApiSessionClient, 'updateMetadata'>;
}): Promise<void> {
    try {
        const { data } = await opts.client.listModels();
        const models = mapCodexModelsToSessionOptions(data ?? []);
        if (models.length === 0) {
            logger.debug('[codex]: model catalog is empty, leaving metadata untouched');
            return;
        }
        logger.debug(
            `[codex]: publishing ${models.length} models -> ${models.map(model => model.code).join(', ')}`,
        );
        opts.session.updateMetadata(current => ({ ...current, models }));
    } catch (error) {
        logger.debug(`[codex]: failed to publish model catalog: ${error}`);
    }
}
