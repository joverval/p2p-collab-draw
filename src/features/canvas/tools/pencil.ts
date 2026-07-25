import type { Tool } from '../../../shared/types';

export const pencilTool = {
  type: 'pencil' as Tool,
  defaultStrokeWidth: 1,
  defaultOpacity: 1,
  // defaultColor undefined = use current selected color
} as const;