"""PDF Export Service for generating assessment reports."""
import io
from datetime import datetime
from typing import Dict, List, Optional, Any
from uuid import UUID
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.platypus.flowables import HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

import logging

logger = logging.getLogger(__name__)


class PDFExportService:
    """Service for generating PDF reports for assessments."""
    
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()
        
    def _setup_custom_styles(self):
        """Setup custom paragraph styles for the PDF."""
        # Title style
        self.styles.add(ParagraphStyle(
            name='CustomTitle',
            parent=self.styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1f2937'),
            spaceAfter=30,
            alignment=TA_CENTER
        ))
        
        # Subtitle style
        self.styles.add(ParagraphStyle(
            name='CustomSubtitle',
            parent=self.styles['Heading2'],
            fontSize=16,
            textColor=colors.HexColor('#374151'),
            spaceAfter=20,
            alignment=TA_CENTER
        ))
        
        # Section header style
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor('#1f2937'),
            spaceAfter=12,
            spaceBefore=20
        ))
        
        # Score style for numbers
        self.styles.add(ParagraphStyle(
            name='ScoreStyle',
            parent=self.styles['Normal'],
            fontSize=12,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#059669')
        ))
        
    async def generate_assessment_pdf(self, assessment_data: Dict[str, Any]) -> bytes:
        """
        Generate a PDF report for an assessment.
        
        Args:
            assessment_data: Dictionary containing assessment details, scores, and compliance data
            
        Returns:
            PDF file as bytes
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=18,
        )
        
        # Container for the 'Flowable' objects
        elements = []
        
        # Add header
        elements.extend(self._create_header(assessment_data))
        
        # Add executive summary
        elements.extend(self._create_executive_summary(assessment_data))
        
        # Add compliance overview
        elements.extend(self._create_compliance_overview(assessment_data))
        
        # Add measure details
        if 'measures' in assessment_data.get('compliance', {}):
            elements.extend(self._create_measure_details(assessment_data['compliance']['measures']))
        
        # Add recommendations if available
        if 'recommendations' in assessment_data:
            elements.extend(self._create_recommendations(assessment_data['recommendations']))
        
        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        
        return buffer.read()
    
    def _create_header(self, data: Dict[str, Any]) -> List:
        """Create header section of the PDF."""
        elements = []
        
        # Title
        title = Paragraph(data['assessment']['title'], self.styles['CustomTitle'])
        elements.append(title)
        
        # Organization and date info
        org_info = f"<b>Organizacija:</b> {data['assessment'].get('organization_name', 'N/A')}<br/>"
        org_info += f"<b>Razina sigurnosti:</b> {data['assessment']['security_level'].upper()}<br/>"
        org_info += f"<b>Datum izvještaja:</b> {datetime.now().strftime('%d.%m.%Y')}"
        
        info_para = Paragraph(org_info, self.styles['Normal'])
        elements.append(info_para)
        elements.append(Spacer(1, 0.5*inch))
        elements.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
        elements.append(Spacer(1, 0.3*inch))
        
        return elements
    
    def _create_executive_summary(self, data: Dict[str, Any]) -> List:
        """Create executive summary section."""
        elements = []
        
        # Section header
        header = Paragraph("Izvršni sažetak", self.styles['SectionHeader'])
        elements.append(header)
        
        # Create summary table
        summary_data = []
        
        # Overall compliance score
        compliance = data.get('compliance', {}).get('overall', {})
        overall_score = compliance.get('overall_score', 0)
        compliance_percentage = compliance.get('compliance_percentage', 0)
        
        summary_data.append(['Ukupna usklađenost', f"{compliance_percentage:.1f}%"])
        summary_data.append(['Prosječna ocjena', f"{overall_score:.2f} / 5.00"])
        summary_data.append(['Status procjene', data['assessment']['status'].replace('_', ' ').title()])
        
        # Progress info
        progress = data.get('progress', {})
        summary_data.append(['Završene kontrole', f"{progress.get('answered_controls', 0)} / {progress.get('total_controls', 0)}"])
        summary_data.append(['Završene obavezne kontrole', f"{progress.get('mandatory_answered', 0)} / {progress.get('mandatory_controls', 0)}"])
        
        # Create table
        summary_table = Table(summary_data, colWidths=[4*inch, 2*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.grey.clone(alpha=0.05)),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey.clone(alpha=0.3)),
        ]))
        
        elements.append(summary_table)
        elements.append(Spacer(1, 0.5*inch))
        
        return elements
    
    def _create_compliance_overview(self, data: Dict[str, Any]) -> List:
        """Create compliance overview section."""
        elements = []
        
        # Section header
        header = Paragraph("Pregled usklađenosti po mjerama", self.styles['SectionHeader'])
        elements.append(header)
        
        # Compliance by measure table
        compliance_data = [['Mjera', 'Ocjena', 'Usklađenost', 'Status']]
        
        measures = data.get('compliance', {}).get('overall', {}).get('measures', [])
        for measure in measures:
            score = measure.get('overall_score', 0)
            compliance_pct = (score / 5.0 * 100) if score else 0
            status = 'PROŠAO' if measure.get('passes_compliance', False) else 'PAO'
            status_color = colors.green if status == 'PROŠAO' else colors.red
            
            compliance_data.append([
                measure.get('measure_code', 'N/A'),
                f"{score:.2f}",
                f"{compliance_pct:.1f}%",
                status
            ])
        
        # Create table
        compliance_table = Table(compliance_data, colWidths=[2.5*inch, 1.5*inch, 1.5*inch, 1*inch])
        
        # Style the table
        table_style = TableStyle([
            # Header row
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1f2937')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            # Data rows
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
            ('TOPPADDING', (0, 1), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.grey.clone(alpha=0.05)]),
        ])
        
        # Color status column based on pass/fail
        for i in range(1, len(compliance_data)):
            if compliance_data[i][3] == 'PROŠAO':
                table_style.add('TEXTCOLOR', (3, i), (3, i), colors.green)
            else:
                table_style.add('TEXTCOLOR', (3, i), (3, i), colors.red)
        
        compliance_table.setStyle(table_style)
        elements.append(compliance_table)
        elements.append(Spacer(1, 0.5*inch))
        
        return elements
    
    def _create_measure_details(self, measures: List[Dict]) -> List:
        """Create detailed measure breakdown section."""
        elements = []
        
        # Add page break before detailed measures
        elements.append(PageBreak())
        
        # Section header
        header = Paragraph("Detaljni pregled po mjerama", self.styles['SectionHeader'])
        elements.append(header)
        
        for measure in measures:
            # Measure header
            measure_title = f"{measure['measure_code']}: {measure.get('measure_name', '')}"
            measure_header = Paragraph(measure_title, self.styles['Heading3'])
            elements.append(measure_header)
            
            # Submeasures table
            submeasure_data = [['Podmjera', 'Kontrola', 'Dok.', 'Impl.', 'Prosjek']]
            
            for submeasure in measure.get('submeasures', []):
                for control in submeasure.get('controls', []):
                    doc_score = control.get('documentation_score', '-')
                    impl_score = control.get('implementation_score', '-')
                    avg_score = control.get('average_score', '-')
                    
                    submeasure_data.append([
                        submeasure['submeasure_code'],
                        control['control_code'],
                        str(doc_score) if doc_score != '-' else '-',
                        str(impl_score) if impl_score != '-' else '-',
                        f"{avg_score:.1f}" if avg_score != '-' else '-'
                    ])
            
            # Create submeasure table
            if len(submeasure_data) > 1:
                submeasure_table = Table(submeasure_data, colWidths=[1.5*inch, 1.5*inch, 1*inch, 1*inch, 1*inch])
                submeasure_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#374151')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                    ('TOPPADDING', (0, 0), (-1, -1), 6),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.grey.clone(alpha=0.03)]),
                ]))
                elements.append(submeasure_table)
                elements.append(Spacer(1, 0.3*inch))
        
        return elements
    
    def _create_recommendations(self, recommendations: List[Dict]) -> List:
        """Create recommendations section."""
        elements = []
        
        # Add page break
        elements.append(PageBreak())
        
        # Section header
        header = Paragraph("Preporuke za poboljšanje", self.styles['SectionHeader'])
        elements.append(header)
        
        for i, rec in enumerate(recommendations, 1):
            # Recommendation title
            rec_title = f"{i}. {rec.get('title', 'Preporuka')}"
            title_para = Paragraph(rec_title, self.styles['Heading4'])
            elements.append(title_para)
            
            # Recommendation description
            if rec.get('description'):
                desc_para = Paragraph(rec['description'], self.styles['Normal'])
                elements.append(desc_para)
                elements.append(Spacer(1, 0.2*inch))
            
            # Priority and impact
            if rec.get('priority') or rec.get('impact'):
                info = []
                if rec.get('priority'):
                    info.append(f"<b>Prioritet:</b> {rec['priority']}")
                if rec.get('impact'):
                    info.append(f"<b>Utjecaj:</b> {rec['impact']}")
                info_para = Paragraph(" | ".join(info), self.styles['Normal'])
                elements.append(info_para)
                elements.append(Spacer(1, 0.3*inch))
        
        return elements