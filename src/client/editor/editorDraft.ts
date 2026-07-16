import type { ShaftMap } from '../../shared/domain';
import { cloneShaftMap } from './mapEditorModel';

/**
 * In-memory editor draft shared between MapEditor and TunnelRun test flights.
 * Not persisted and never published to Redis in this phase.
 */
let draft: ShaftMap | undefined;

export const setEditorDraft = (map: ShaftMap): void => {
  draft = cloneShaftMap(map);
};

export const getEditorDraft = (): ShaftMap | undefined =>
  draft ? cloneShaftMap(draft) : undefined;

export const clearEditorDraft = (): void => {
  draft = undefined;
};
