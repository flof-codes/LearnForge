import api from './client';
import type { FocusTopic, FocusTopicInput, ExpandedFocusEntry } from '../types';

export const focusService = {
  list:     ()                                => api.get<FocusTopic[]>('/focus'),
  set:      (topics: FocusTopicInput[])       => api.put<FocusTopic[]>('/focus', { topics }),
  clear:    ()                                => api.delete<void>('/focus'),
  expanded: ()                                => api.get<ExpandedFocusEntry[]>('/focus/expanded'),
};
