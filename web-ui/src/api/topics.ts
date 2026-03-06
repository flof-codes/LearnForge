import api from './client';
import type { Topic, TopicWithChildren, TopicTreeNode, CreateTopicInput, UpdateTopicInput } from '../types';

export const topicService = {
  list:    ()                                    => api.get<Topic[]>('/topics'),
  get:     (id: string)                          => api.get<TopicWithChildren>(`/topics/${id}`),
  getTree:       (id: string)                     => api.get<TopicTreeNode>(`/topics/${id}/tree`),
  getBreadcrumb: (id: string)                     => api.get<{ id: string; name: string }[]>(`/topics/${id}/breadcrumb`),
  create:  (data: CreateTopicInput)              => api.post<Topic>('/topics', data),
  update:  (id: string, data: UpdateTopicInput)  => api.put<Topic>(`/topics/${id}`, data),
  delete:  (id: string)                          => api.delete(`/topics/${id}`),
};
