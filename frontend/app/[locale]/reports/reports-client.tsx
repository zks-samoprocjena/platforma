'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { 
  FileText, 
  BarChart3,
  RefreshCw,
  Grid3x3,
  Radar
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { OverviewTab } from './components/overview-tab'
import { BarChartsTab } from './components/bar-charts-tab'
import { SpiderDiagramTab } from './components/spider-diagram-tab'
import { HeatMapTab } from './components/heat-map-tab'
import { useAssessments } from '@/hooks/api/use-assessments'

type TabValue = 'overview' | 'bar-charts' | 'spider-diagram' | 'heat-map'

export function ReportsClient() {
  const tReports = useTranslations('Reports')
  const { refetch } = useAssessments()
  const [activeTab, setActiveTab] = useState<TabValue>('overview')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-primary mb-2">
              {tReports('header.title')}
            </h1>
            <p className="text-lg text-base-content/70">
              {tReports('header.subtitle')}
            </p>
          </div>
          <button 
            onClick={() => refetch()}
            className="btn btn-ghost btn-circle"
            title={tReports('header.refresh')}
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
        <TabsList className="grid w-full grid-cols-4 gap-1 h-auto p-1 bg-base-200">
          <TabsTrigger 
            value="overview" 
            className="flex items-center gap-2 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-content"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">{tReports('tabs.overview')}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="bar-charts"
            className="flex items-center gap-2 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-content"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">{tReports('tabs.barCharts')}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="spider-diagram"
            className="flex items-center gap-2 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-content"
          >
            <Radar className="h-4 w-4" />
            <span className="hidden sm:inline">{tReports('tabs.spiderDiagram')}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="heat-map"
            className="flex items-center gap-2 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-content"
          >
            <Grid3x3 className="h-4 w-4" />
            <span className="hidden sm:inline">{tReports('tabs.heatMap')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="bar-charts" className="mt-6">
          <BarChartsTab />
        </TabsContent>
        <TabsContent value="spider-diagram" className="mt-6">
          <SpiderDiagramTab />
        </TabsContent>
        <TabsContent value="heat-map" className="mt-6">
          <HeatMapTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}