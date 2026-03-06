import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reviewService } from '../api/reviews';
import type { SubmitReviewInput } from '../types';

export const useSubmitReview = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SubmitReviewInput) => reviewService.submit(data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['study'] });
      qc.invalidateQueries({ queryKey: ['cards'] });
    },
  });
};
