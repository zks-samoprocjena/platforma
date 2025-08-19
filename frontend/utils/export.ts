import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'
import { AssessmentResults, MeasureResult, GapAnalysisItem, AIRecommendation } from '@/types/assessment'
import { format } from 'date-fns'
import { hr } from 'date-fns/locale'

// Croatian language support for jsPDF
const addCroatianSupport = (doc: jsPDF) => {
  // Set UTF-8 encoding for Croatian characters
  doc.setCharSpace(0.5)
  // Note: Font setting might need different approach based on jsPDF version
}

interface AssessmentExportData {
  assessment: {
    id: string
    title: string
    created_at: string
    security_level: string
    organization_name: string
  }
  results: AssessmentResults
  gaps: GapAnalysisItem[]
  recommendations: AIRecommendation[]
}

export const exportToPDF = async (data: AssessmentExportData, language: 'hr' | 'en' = 'hr') => {
  try {
    // Simplified PDF generation for now - create a text version
    const content = `
${language === 'hr' ? 'IZVJEŠĆE O SAMOPROCJENI SIGURNOSTI' : 'SECURITY SELF-ASSESSMENT REPORT'}

${language === 'hr' ? 'Procjena' : 'Assessment'}: ${data.assessment.title}
${language === 'hr' ? 'Organizacija' : 'Organization'}: ${data.assessment.organization_name}
${language === 'hr' ? 'Razina sigurnosti' : 'Security Level'}: ${data.assessment.security_level.toUpperCase()}
${language === 'hr' ? 'Datum' : 'Date'}: ${format(new Date(), 'dd.MM.yyyy')}

${language === 'hr' ? 'UKUPNA USKLAĐENOST' : 'OVERALL COMPLIANCE'}
${language === 'hr' ? 'Postotak usklađenosti' : 'Compliance Percentage'}: ${data.results.overall_compliance_percentage.toFixed(1)}%
${language === 'hr' ? 'Završene kontrole' : 'Completed Controls'}: ${data.results.answered_controls}/${data.results.total_controls}
${language === 'hr' ? 'Obavezne kontrole' : 'Mandatory Controls'}: ${data.results.mandatory_completed}/${data.results.mandatory_total}

${language === 'hr' ? 'PREGLED PO MJERAMA' : 'MEASURES OVERVIEW'}
${(data.results.measure_results || []).map(measure => 
  `${measure.measure_title}: ${measure.compliance_percentage.toFixed(1)}%`
).join('\\n')}
`.trim()

    // Create blob and download
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `assessment-report-${data.assessment.id}-${format(new Date(), 'yyyy-MM-dd')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
  } catch (error) {
    console.error('PDF export error:', error)
    throw error
  }
}

export const exportToExcel = (data: AssessmentExportData, language: 'hr' | 'en' = 'hr') => {
  const workbook = XLSX.utils.book_new()
  
  // Summary sheet
  const summaryData = [
    [language === 'hr' ? 'Izvješće o samoprocjeni sigurnosti' : 'Security Self-Assessment Report'],
    [''],
    [language === 'hr' ? 'Osnovni podaci:' : 'Basic Information:'],
    [language === 'hr' ? 'Procjena:' : 'Assessment:', data.assessment.title],
    [language === 'hr' ? 'Organizacija:' : 'Organization:', data.assessment.organization_name],
    [language === 'hr' ? 'Razina sigurnosti:' : 'Security Level:', data.assessment.security_level.toUpperCase()],
    [language === 'hr' ? 'Datum izvješća:' : 'Report Date:', format(new Date(), 'dd.MM.yyyy')],
    [''],
    [language === 'hr' ? 'Rezultati usklađenosti:' : 'Compliance Results:'],
    [language === 'hr' ? 'Ukupna usklađenost:' : 'Overall Compliance:', `${data.results.overall_compliance_percentage.toFixed(1)}%`],
    [language === 'hr' ? 'Dovršeni kontrole:' : 'Completed Controls:', `${data.results.answered_controls}/${data.results.total_controls}`],
    [language === 'hr' ? 'Obavezne kontrole:' : 'Mandatory Controls:', `${data.results.mandatory_completed}/${data.results.mandatory_total}`]
  ]
  
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(workbook, summarySheet, language === 'hr' ? 'Sažetak' : 'Summary')
  
  // Measures sheet
  const measuresHeaders = [
    language === 'hr' ? 'Mjera' : 'Measure',
    language === 'hr' ? 'Postotak usklađenosti' : 'Compliance Percentage',
    language === 'hr' ? 'Status' : 'Status'
  ]
  
  const measuresData = [
    measuresHeaders,
    ...(data.results.measure_results || []).map(measure => [
      measure.measure_title,
      `${measure.compliance_percentage.toFixed(1)}%`,
      measure.compliance_percentage >= 90 ? 
        (language === 'hr' ? 'Izvrsno' : 'Excellent') : 
        measure.compliance_percentage >= 70 ? 
          (language === 'hr' ? 'Dobro' : 'Good') : 
          (language === 'hr' ? 'Treba poboljšanje' : 'Needs Improvement')
    ])
  ]
  
  const measuresSheet = XLSX.utils.aoa_to_sheet(measuresData)
  XLSX.utils.book_append_sheet(workbook, measuresSheet, language === 'hr' ? 'Mjere' : 'Measures')
  
  // Gap analysis sheet
  if (data.gaps.length > 0) {
    const gapHeaders = [
      language === 'hr' ? 'Kontrola' : 'Control',
      language === 'hr' ? 'Prioritet' : 'Priority',
      language === 'hr' ? 'Trenutni rezultat' : 'Current Score',
      language === 'hr' ? 'Ciljni rezultat' : 'Target Score',
      language === 'hr' ? 'Nedostatak' : 'Gap',
      language === 'hr' ? 'Procjena vremena (tjedni)' : 'Timeline (weeks)'
    ]
    
    const gapData = [
      gapHeaders,
      ...data.gaps.map(gap => [
        gap.control_title,
        gap.priority === 'critical' ? (language === 'hr' ? 'Kritično' : 'Critical') :
        gap.priority === 'high' ? (language === 'hr' ? 'Visoko' : 'High') :
        gap.priority === 'medium' ? (language === 'hr' ? 'Srednje' : 'Medium') :
        (language === 'hr' ? 'Nisko' : 'Low'),
        gap.current_score,
        gap.target_score,
        gap.gap_score,
        gap.timeline_weeks
      ])
    ]
    
    const gapSheet = XLSX.utils.aoa_to_sheet(gapData)
    XLSX.utils.book_append_sheet(workbook, gapSheet, language === 'hr' ? 'Analiza nedostajućih područja' : 'Gap Analysis')
  }
  
  // Recommendations sheet
  if (data.recommendations.length > 0) {
    const recHeaders = [
      language === 'hr' ? 'Preporuka' : 'Recommendation',
      language === 'hr' ? 'Opis' : 'Description',
      language === 'hr' ? 'Prioritet' : 'Priority',
      language === 'hr' ? 'Procjena napora' : 'Effort Estimate',
      language === 'hr' ? 'Utjecaj na usklađenost' : 'Compliance Impact'
    ]
    
    const recData = [
      recHeaders,
      ...data.recommendations.slice(0, 20).map(rec => [
        rec.title,
        rec.description,
        rec.priority === 'high' ? (language === 'hr' ? 'Visoko' : 'High') :
        rec.priority === 'medium' ? (language === 'hr' ? 'Srednje' : 'Medium') :
        (language === 'hr' ? 'Nisko' : 'Low'),
        rec.effort_estimate === 'high' ? (language === 'hr' ? 'Visoko' : 'High') :
        rec.effort_estimate === 'medium' ? (language === 'hr' ? 'Srednje' : 'Medium') :
        (language === 'hr' ? 'Nisko' : 'Low'),
        rec.compliance_impact ? `${rec.compliance_impact}%` : 'N/A'
      ])
    ]
    
    const recSheet = XLSX.utils.aoa_to_sheet(recData)
    XLSX.utils.book_append_sheet(workbook, recSheet, language === 'hr' ? 'AI preporuke' : 'AI Recommendations')
  }
  
  // Save the Excel file
  const fileName = `assessment-export-${data.assessment.id}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`
  XLSX.writeFile(workbook, fileName)
}

export const generateSummaryReport = (data: AssessmentExportData, language: 'hr' | 'en' = 'hr') => {
  const report = {
    metadata: {
      title: data.assessment.title,
      organization: data.assessment.organization_name,
      security_level: data.assessment.security_level,
      report_date: format(new Date(), 'yyyy-MM-dd'),
      language
    },
    executive_summary: {
      overall_compliance: data.results.overall_compliance_percentage,
      completed_controls: `${data.results.answered_controls}/${data.results.total_controls}`,
      mandatory_compliance: `${data.results.mandatory_completed}/${data.results.mandatory_total}`,
      top_performing_measures: (data.results.measure_results || [])
        .sort((a, b) => b.compliance_percentage - a.compliance_percentage)
        .slice(0, 3)
        .map(m => ({ title: m.measure_title, percentage: m.compliance_percentage })),
      critical_gaps: data.gaps.filter(gap => gap.priority === 'critical').length,
      high_priority_recommendations: data.recommendations.filter(rec => rec.priority === 'high').length
    },
    key_findings: {
      strengths: (data.results.measure_results || [])
        .filter(m => m.compliance_percentage >= 80)
        .map(m => m.measure_title),
      improvement_areas: data.gaps
        .filter(gap => gap.priority === 'critical' || gap.priority === 'high')
        .slice(0, 5)
        .map(gap => ({
          control: gap.control_title,
          priority: gap.priority,
          timeline: gap.timeline_weeks
        })),
      immediate_actions: data.recommendations
        .filter(rec => rec.priority === 'high')
        .slice(0, 3)
        .map(rec => ({
          title: rec.title,
          effort: rec.effort_estimate,
          impact: rec.compliance_impact
        }))
    }
  }
  
  return report
}
