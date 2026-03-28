import { Link } from 'react-router-dom';
import { useTopicBreadcrumb } from '../hooks/useTopics';

interface Props {
  topicId: string | undefined;
}

export default function TopicBreadcrumb({ topicId }: Props) {
  const { data: breadcrumb } = useTopicBreadcrumb(topicId);

  if (!breadcrumb || breadcrumb.length === 0) return null;

  return (
    <nav className="flex items-center gap-1.5 text-sm text-text-muted">
      {breadcrumb.map((topic, i) => (
        <span key={topic.id} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-text-muted/50">&rarr;</span>}
          <Link
            to={`/dashboard/topics/${topic.id}`}
            className="hover:text-accent-blue transition-colors"
          >
            {topic.name}
          </Link>
        </span>
      ))}
    </nav>
  );
}
