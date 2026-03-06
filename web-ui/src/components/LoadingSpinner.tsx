import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <Loader2 size={28} className="animate-spin text-accent-blue" />
    </div>
  );
}
