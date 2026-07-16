import type { ShaftMap } from '../../shared/domain';

export type TunnelRunSceneData = {
  mode?: 'play' | 'editor-test';
  map?: ShaftMap;
};

export type MapEditorSceneData = {
  baseMap?: ShaftMap;
};
