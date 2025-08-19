import { AssessmentResultsResponse, SubmeasureResult, MeasureResultCompliance, GapAnalysisItem } from '@/types/assessment'

/**
 * Helper functions for transforming Phase 3/4 API responses to component-expected formats
 */

export function calculateMandatoryCompliance(results: AssessmentResultsResponse): number {
  if (!results.statistics.mandatory_controls || results.statistics.mandatory_controls === 0) {
    return 100 // If no mandatory controls, consider it 100% compliant
  }
  
  return (results.statistics.mandatory_answered / results.statistics.mandatory_controls) * 100
}

export function calculateVoluntaryCompliance(results: AssessmentResultsResponse): number {
  const totalControls = results.statistics.total_controls
  const mandatoryControls = results.statistics.mandatory_controls
  const voluntaryControls = totalControls - mandatoryControls
  
  if (voluntaryControls === 0) {
    return 100 // If no voluntary controls, consider it 100% compliant
  }
  
  const answeredVoluntary = results.statistics.answered_controls - results.statistics.mandatory_answered
  return (answeredVoluntary / voluntaryControls) * 100
}

export function calculateDocumentationAverage(results: AssessmentResultsResponse): number {
  if (!results.submeasure_results || results.submeasure_results.length === 0) {
    return 0
  }
  
  const validSubmeasures = results.submeasure_results.filter(sub => 
    sub.documentation_avg !== null && sub.documentation_avg !== undefined
  )
  
  if (validSubmeasures.length === 0) {
    return 0
  }
  
  const total = validSubmeasures.reduce((sum, sub) => sum + sub.documentation_avg, 0)
  return total / validSubmeasures.length
}

export function calculateImplementationAverage(results: AssessmentResultsResponse): number {
  if (!results.submeasure_results || results.submeasure_results.length === 0) {
    return 0
  }
  
  const validSubmeasures = results.submeasure_results.filter(sub => 
    sub.implementation_avg !== null && sub.implementation_avg !== undefined
  )
  
  if (validSubmeasures.length === 0) {
    return 0
  }
  
  const total = validSubmeasures.reduce((sum, sub) => sum + sub.implementation_avg, 0)
  return total / validSubmeasures.length
}

export function deriveGapsFromResults(results: AssessmentResultsResponse): GapAnalysisItem[] {
  const gaps: GapAnalysisItem[] = []
  
  // Process failed controls from submeasure results
  results.submeasure_results?.forEach(submeasure => {
    if (submeasure.failed_controls && submeasure.failed_controls.length > 0) {
      submeasure.failed_controls.forEach(controlCode => {
        gaps.push({
          id: `${submeasure.submeasure_id}-${controlCode}`, // Add required ID field
          control_id: `${submeasure.submeasure_id}-${controlCode}`, // Construct ID
          control_title: `Control ${controlCode}`,
          measure_title: `Measure for ${submeasure.submeasure_code}`,
          priority: submeasure.mandatory_controls_count > 0 ? 'critical' : 'high',
          category: 'implementation',
          current_score: submeasure.overall_score || 0,
          target_score: results.statistics.compliance?.thresholds?.individual || 2.0,
          gap_score: (results.statistics.compliance?.thresholds?.individual || 2.0) - (submeasure.overall_score || 0),
          effort_estimate: 'medium',
          timeline_weeks: 4,
          impact_description: `Submeasure ${submeasure.submeasure_code} requires improvement`,
          recommendations: [
            `Improve control ${controlCode} implementation`,
            'Review documentation and procedures',
            'Conduct additional training if needed'
          ]
        })
      })
    }
  })
  
  return gaps
}

export function getComplianceLevel(percentage: number): { level: string; color: string } {
  if (percentage >= 90) return { level: 'excellent', color: 'text-success' }
  if (percentage >= 75) return { level: 'good', color: 'text-info' }
  if (percentage >= 60) return { level: 'moderate', color: 'text-warning' }
  return { level: 'needsImprovement', color: 'text-error' }
}

export function getSecurityLevelBadge(level: string): string {
  const badges: Record<string, string> = {
    'osnovna': 'badge-success',
    'srednja': 'badge-warning', 
    'napredna': 'badge-error'
  }
  return badges[level] || 'badge-neutral'
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`
}

export function formatScore(value: number): string {
  return value.toFixed(2)
}

/**
 * Legacy compatibility: Transform new API response to old expected format
 * Used for components that haven't been fully migrated yet
 */
export function transformToLegacyResults(results: AssessmentResultsResponse) {
  return {
    // Direct mappings
    assessment_id: results.assessment_id,
    overall_compliance_percentage: results.compliance_percentage,
    total_controls: results.statistics.total_controls,
    answered_controls: results.statistics.answered_controls,
    mandatory_total: results.statistics.mandatory_controls,
    mandatory_completed: results.statistics.mandatory_answered,
    
    // Calculated fields
    mandatory_compliance_percentage: calculateMandatoryCompliance(results),
    voluntary_compliance_percentage: calculateVoluntaryCompliance(results),
    documentation_average: calculateDocumentationAverage(results),
    implementation_average: calculateImplementationAverage(results),
    
    // Transformed structures
    by_measure: results.measure_results?.reduce((acc, measure) => {
      acc[measure.measure_id] = {
        measure_code: measure.measure_code,
        measure_name: `Measure ${measure.measure_code}`, // TODO: Get actual name
        compliance_score: measure.overall_score || 0,
        documentation_score: calculateDocumentationAverage(results), // Approximate
        implementation_score: calculateImplementationAverage(results), // Approximate
        total_controls: 0, // Not available in new structure
        completed_controls: 0 // Not available in new structure
      }
      return acc
    }, {} as Record<string, any>) || {},
    
    // Derived data - convert GapAnalysisItem to legacy format
    gaps: deriveGapsFromResults(results).map(gap => ({
      control_id: gap.control_id,
      control_code: gap.control_id.split('-').pop() || 'unknown', // Extract code from ID
      control_name: gap.control_title,
      gap_score: gap.gap_score,
      is_mandatory: gap.priority === 'critical',
      current_documentation: gap.current_score,
      current_implementation: gap.current_score
    })),
    recommendations: [] // Now fetched separately
  }
} 