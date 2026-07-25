import type { Tool } from '../../../shared/types';

export const brushTool = {
  type: 'brush' as Tool,
  defaultStrokeWidth: 5,
  defaultOpacity: 0.8,
} as const;