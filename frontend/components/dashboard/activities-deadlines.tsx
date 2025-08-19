'use client';

import { useTranslations } from 'next-intl';
import { useAssessments } from '@/hooks/api/use-assessments';
import { useUser } from '@/hooks/use-user';
import { 
  CalendarIcon, 
  ClockIcon,
  UserIcon,
  ArrowRightIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';
import { hr, enUS } from 'date-fns/locale';
import Link from 'next/link';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

interface ActivityItem {
  id: string;
  type: 'deadline' | 'activity';
  title: string;
  description: string;
  timestamp: Date;
  user?: string;
  assessmentId?: string;
  controlId?: string;
  priority?: 'high' | 'medium' | 'low';
  link?: string;
  status?: string;
  securityLevel?: string;
  progress?: {
    completion_percentage: number;
    total_controls: number;
    completed_controls: number;
  };
}

interface TimelineItemProps {
  item: ActivityItem;
  isLast: boolean;
  locale: string;
  tStatus: (key: string) => string;
}

function TimelineItem({ item, isLast, locale, tStatus }: TimelineItemProps) {
  const router = useRouter();
  const t = useTranslations('Dashboard');
  const dateLocale = locale === 'hr' ? hr : enUS;
  
  const handleClick = () => {
    if (item.link) {
      router.push(item.link);
    }
  };

  const IconComponent = item.type === 'deadline' ? CalendarIcon : UserIcon;
  const iconColorClass = item.type === 'deadline' && item.priority === 'high' 
    ? 'text-error' 
    : item.type === 'deadline' 
    ? 'text-warning' 
    : 'text-info';

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-success text-success-content';
      case 'in_progress':
        return 'bg-warning text-warning-content';
      case 'draft':
        return 'bg-info text-info-content';
      case 'review':
        return 'bg-primary text-primary-content';
      default:
        return 'bg-base-300 text-base-content';
    }
  };

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`w-10 h-10 rounded-full bg-base-200 flex items-center justify-center ${iconColorClass}`}>
          <IconComponent className="w-5 h-5" />
        </div>
        {!isLast && (
          <div className="w-0.5 h-full bg-base-200 mt-2"></div>
        )}
      </div>
      
      <div className="flex-1 pb-6">
        <div 
          className={`card bg-base-100 ${item.link ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
          onClick={handleClick}
        >
          <div className="card-body p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-medium text-sm">{item.title}</h4>
                <p className="text-sm text-base-content/70 mt-1">{item.description}</p>
                
                {/* Status and Security Level */}
                {(item.status || item.securityLevel) && (
                  <div className="flex items-center gap-2 mt-2">
                    {item.status && (
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                        {tStatus(item.status)}
                      </span>
                    )}
                    {item.securityLevel && (
                      <span className="text-xs text-base-content/60 capitalize">
                        {item.securityLevel}
                      </span>
                    )}
                  </div>
                )}
                
                {/* Progress Bar */}
                {item.progress && item.progress.total_controls > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-base-content/60 mb-1">
                      <span>{t('progress')}</span>
                      <span>{Math.round(item.progress.completion_percentage)}%</span>
                    </div>
                    <div className="w-full bg-base-200 rounded-full h-1.5">
                      <div 
                        className="bg-primary h-1.5 rounded-full transition-all"
                        style={{ width: `${item.progress.completion_percentage}%` }}
                      />
                    </div>
                  </div>
                )}
                
                {item.user && (
                  <p className="text-xs text-base-content/60 mt-2 flex items-center gap-1">
                    <UserIcon className="w-3 h-3" />
                    {item.user}
                  </p>
                )}
              </div>
              {item.link && (
                <ArrowRightIcon className="w-4 h-4 text-base-content/40" />
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-base-content/60">
              <ClockIcon className="w-3 h-3" />
              {formatDistanceToNow(item.timestamp, { addSuffix: true, locale: dateLocale })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActivitiesDeadlines() {
  const t = useTranslations('Dashboard.activities');
  const tStatus = useTranslations('Dashboard.status');
  const { data: assessments, isLoading } = useAssessments();
  const { locale } = useUser();

  const activities = useMemo(() => {
    if (!assessments?.items) return [];

    const items: ActivityItem[] = [];

    // Process assessments for deadlines and activities
    assessments.items.forEach(assessment => {
      // Add recent activities
      if (assessment.updated_at) {
        // Calculate progress if not provided or fix if incorrect
        let progress = assessment.progress;
        if (!progress && assessment.total_controls > 0) {
          // Fallback calculation if progress object is missing
          progress = {
            total_controls: assessment.total_controls,
            completed_controls: assessment.answered_controls || 0,
            completion_percentage: assessment.total_controls > 0 
              ? Math.round((assessment.answered_controls || 0) / assessment.total_controls * 100)
              : 0
          };
        }

        items.push({
          id: `activity-${assessment.id}`,
          type: 'activity',
          title: t('assessmentUpdated', { title: assessment.title }),
          description: t('statusChanged', { status: assessment.status }),
          timestamp: new Date(assessment.updated_at),
          user: assessment.updated_by || t('unknownUser'),
          assessmentId: assessment.id,
          link: `/${locale}/assessments/${assessment.id}/questionnaire`,
          status: assessment.status,
          securityLevel: assessment.security_level,
          progress: progress
        });
      }

      // Add upcoming deadlines (mock data for now - would come from backend)
      if (assessment.status === 'in_progress') {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + Math.floor(Math.random() * 7) + 1); // Random deadline in next 7 days
        
        items.push({
          id: `deadline-${assessment.id}`,
          type: 'deadline',
          title: t('evidenceDeadline'),
          description: t('controlsNeedEvidence', { count: Math.floor(Math.random() * 5) + 1, assessment: assessment.title }),
          timestamp: deadline,
          assessmentId: assessment.id,
          priority: deadline.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000 ? 'high' : 'medium',
          link: `/${locale}/assessments/${assessment.id}/questionnaire`
        });
      }
    });

    // Sort by timestamp (most recent first)
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Return max 5 items
    return items.slice(0, 5);
  }, [assessments, t, locale]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-24"></div>
          ))}
        </div>
      </div>
    );
  }

  const dueThisWeek = activities.filter(item => 
    item.type === 'deadline' && 
    item.timestamp.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-4">{t('title')}</h2>
        
        {dueThisWeek.length > 0 && (
          <div className="alert alert-warning mb-6">
            <ExclamationTriangleIcon className="w-5 h-5" />
            <span className="text-sm">
              {t('dueThisWeek', { count: dueThisWeek.length })}
            </span>
          </div>
        )}

        {activities.length === 0 ? (
          <div className="text-center py-8 text-base-content/60">
            <CalendarIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>{t('noActivities')}</p>
          </div>
        ) : (
          <div className="space-y-0">
            {activities.map((item, index) => (
              <TimelineItem
                key={item.id}
                item={item}
                isLast={index === activities.length - 1}
                locale={locale}
                tStatus={tStatus}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}