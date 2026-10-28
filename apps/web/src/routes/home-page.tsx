import { HealthStatus } from '@/features/health/health-status';

export function HomePage() {
  return (
    <div className="max-w-sm">
      <HealthStatus />
    </div>
  );
}
