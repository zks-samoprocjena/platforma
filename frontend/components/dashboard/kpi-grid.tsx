'use client';

import { useTranslations } from 'next-intl';
import { useAssessments } from '@/hooks/api/use-assessments';
import { useControls } from '@/hooks/use-controls';
import { 
  ChartBarIcon, 
  CheckCircleIcon, 
  ClockIcon, 
  DocumentCheckIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  DocumentMagnifyingGlassIcon,
  CalendarDaysIcon
} from '@heroicons/react/24/outline';
import { useMemo } from 'react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  valueColor?: 'success' | 'warning' | 'error' | 'info' | 'base';
}

function KPICard({ title, value, subtitle, icon, trend, trendValue, valueColor = 'base' }: KPICardProps) {
  const valueColorClass = {
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
    info: 'text-info',
    base: 'text-base-content'
  }[valueColor];

  return (
    <div className="card bg-base-100 shadow-sm border border-base-200">
      <div className="card-body p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-sm font-medium text-base-content/70">{title}</h3>
            <div className={`text-2xl font-bold mt-1 ${valueColorClass}`}>
              {value}
            </div>
            {subtitle && (
              <p className="text-xs text-base-content/60 mt-1">{subtitle}</p>
            )}
            {trend && trendValue && (
              <div className="flex items-center gap-1 mt-2">
                <span className={`text-xs ${trend === 'up' ? 'text-success' : trend === 'down' ? 'text-error' : 'text-base-content/60'}`}>
                  {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
                </span>
              </div>
            )}
          </div>
          <div className="text-base-content/20">
            {icon}
          </div>
        </div>
      </div>
    </div>
  );
}

export function KPIGrid() {
  const t = useTranslations('Dashboard.kpis');
  const { data: assessments, isLoading: assessmentsLoading } = useAssessments();
  const { data: controls, isLoading: controlsLoading } = useControls();

  const kpis = useMemo(() => {
    if (!assessments?.items || !controls) {
      return {
        totalAssessments: 0,
        completed: 0,
        inProgress: 0,
        avgDocMaturity: 0,
        avgImplMaturity: 0,
        redZoneControls: 0,
        controlsWithoutEvidence: 0,
        estimatedCompletion: null
      };
    }

    const totalAssessments = assessments.items.length;
    const completed = assessments.items.filter(a => a.status === 'completed').length;
    const inProgress = assessments.items.filter(a => a.status === 'in_progress').length;

    // Calculate average maturity scores from completed assessments
    const completedAssessments = assessments.items.filter(a => a.status === 'completed');
    let totalDocScore = 0;
    let totalImplScore = 0;
    let scoreCount = 0;

    completedAssessments.forEach(assessment => {
      if (assessment.results) {
        Object.values(assessment.results).forEach((result: any) => {
          if (result.documentation_score !== null) {
            totalDocScore += result.documentation_score;
            scoreCount++;
          }
          if (result.implementation_score !== null) {
            totalImplScore += result.implementation_score;
            scoreCount++;
          }
        });
      }
    });

    const avgDocMaturity = scoreCount > 0 ? (totalDocScore / scoreCount).toFixed(1) : '0.0';
    const avgImplMaturity = scoreCount > 0 ? (totalImplScore / scoreCount).toFixed(1) : '0.0';

    // Count controls in red zone (score < 2)
    let redZoneControls = 0;
    let controlsWithoutEvidence = 0;

    completedAssessments.forEach(assessment => {
      if (assessment.results) {
        Object.values(assessment.results).forEach((result: any) => {
          const avgScore = (result.documentation_score + result.implementation_score) / 2;
          if (avgScore < 2) {
            redZoneControls++;
          }
          if (!result.evidence || result.evidence.length === 0) {
            controlsWithoutEvidence++;
          }
        });
      }
    });

    // Estimate completion time based on current progress
    let estimatedCompletion = null;
    if (inProgress > 0) {
      // Simple estimation: assume 2 weeks per assessment
      const weeksRemaining = inProgress * 2;
      const completionDate = new Date();
      completionDate.setDate(completionDate.getDate() + (weeksRemaining * 7));
      estimatedCompletion = completionDate.toLocaleDateString();
    }

    return {
      totalAssessments,
      completed,
      inProgress,
      avgDocMaturity,
      avgImplMaturity,
      redZoneControls,
      controlsWithoutEvidence,
      estimatedCompletion
    };
  }, [assessments, controls]);

  if (assessmentsLoading || controlsLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="skeleton h-24"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title={t('totalAssessments')}
          value={kpis.totalAssessments}
          subtitle={t('totalAssessmentsSubtitle')}
          icon={<ChartBarIcon className="w-6 h-6" />}
        />
        <KPICard
          title={t('completed')}
          value={kpis.completed}
          subtitle={`${kpis.totalAssessments > 0 ? Math.round((kpis.completed / kpis.totalAssessments) * 100) : 0}% ${t('ofTotal')}`}
          icon={<CheckCircleIcon className="w-6 h-6" />}
          valueColor="success"
        />
        <KPICard
          title={t('inProgress')}
          value={kpis.inProgress}
          subtitle={t('activeAssessments')}
          icon={<ClockIcon className="w-6 h-6" />}
          valueColor="info"
        />
        <KPICard
          title={t('avgDocMaturity')}
          value={kpis.avgDocMaturity}
          subtitle={t('scale15')}
          icon={<DocumentCheckIcon className="w-6 h-6" />}
          valueColor={parseFloat(kpis.avgDocMaturity) >= 3.5 ? 'success' : parseFloat(kpis.avgDocMaturity) >= 2.5 ? 'warning' : 'error'}
        />
        <KPICard
          title={t('avgImplMaturity')}
          value={kpis.avgImplMaturity}
          subtitle={t('scale15')}
          icon={<CubeIcon className="w-6 h-6" />}
          valueColor={parseFloat(kpis.avgImplMaturity) >= 3.5 ? 'success' : parseFloat(kpis.avgImplMaturity) >= 2.5 ? 'warning' : 'error'}
        />
        <KPICard
          title={t('redZoneControls')}
          value={kpis.redZoneControls}
          subtitle={t('highRisk')}
          icon={<ExclamationTriangleIcon className="w-6 h-6" />}
          valueColor={kpis.redZoneControls > 0 ? 'error' : 'success'}
        />
        <KPICard
          title={t('controlsWithoutEvidence')}
          value={kpis.controlsWithoutEvidence}
          subtitle={t('needsDocumentation')}
          icon={<DocumentMagnifyingGlassIcon className="w-6 h-6" />}
          valueColor={kpis.controlsWithoutEvidence > 0 ? 'warning' : 'success'}
        />
        <KPICard
          title={t('estimatedCompletion')}
          value={kpis.estimatedCompletion || t('noActiveAssessments')}
          subtitle={kpis.estimatedCompletion ? t('basedOnProgress') : undefined}
          icon={<CalendarDaysIcon className="w-6 h-6" />}
          valueColor="base"
        />
      </div>
    </div>
  );
}