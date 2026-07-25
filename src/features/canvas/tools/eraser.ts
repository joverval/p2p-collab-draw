import type { Tool } from '../../../shared/types';

export const eraserTool = {
  type: 'eraser' as Tool,
  defaultStrokeWidth: 20,
  defaultOpacity: 1,
  defaultColor: '#1e1e1e',
} as const;