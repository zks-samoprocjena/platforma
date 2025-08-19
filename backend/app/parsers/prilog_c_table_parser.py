"""Parser for extracting control rating guidance from Prilog C."""
import re
from typing import Dict, List, Optional, Tuple
from pathlib import Path


class PrilogCTableParser:
    """Parse control rating guidance from Prilog C."""
    
    def __init__(self):
        self.table_pattern = re.compile(r'--- TABLE ---\s*(.*?)\s*--- END TABLE ---', re.DOTALL)
        self.control_pattern = re.compile(r'^([A-Z]{3}-\d{3}):\s*(.+?)$', re.MULTILINE)
        self.score_pattern = re.compile(r'^(\d)\s*\|\s*(.+?)$', re.MULTILINE)
        self.header_pattern = re.compile(r'^Ocjena\s*\|\s*Uvjet', re.MULTILINE)
        self.doc_impl_pattern = re.compile(r'^(\d)\s*\|\s*(.+?)\s*\|\s*(.+?)$', re.MULTILINE)
        self.doc_impl_header = re.compile(r'^Ocjena\s*\|\s*Dokumentacija\s*\|\s*Implementacija', re.MULTILINE)
        
    def parse_general_rating_table(self, table_text: str) -> List[Dict]:
        """
        Parse the general 1-5 rating criteria table.
        
        Args:
            table_text: Text of the rating table
            
        Returns:
            List of rating criteria
        """
        criteria = []
        
        # Check if this is a documentation/implementation table
        if self.doc_impl_header.search(table_text):
            return self.parse_doc_impl_table(table_text)
        
        # Skip if not a rating table
        if not self.header_pattern.search(table_text):
            return criteria
            
        # Parse score criteria
        for match in self.score_pattern.finditer(table_text):
            score = int(match.group(1))
            criterion = match.group(2).strip()
            
            criteria.append({
                'score': score,
                'criterion': criterion
            })
            
        return criteria
    
    def parse_doc_impl_table(self, table_text: str) -> List[Dict]:
        """
        Parse the documentation/implementation criteria table.
        
        Args:
            table_text: Text of the doc/impl table
            
        Returns:
            List of rating criteria with doc and impl
        """
        criteria = []
        
        # Parse score criteria with documentation and implementation
        for match in self.doc_impl_pattern.finditer(table_text):
            score = int(match.group(1))
            doc_criteria = match.group(2).strip()
            impl_criteria = match.group(3).strip()
            
            criteria.append({
                'score': score,
                'documentation_criteria': doc_criteria,
                'implementation_criteria': impl_criteria
            })
            
        return criteria
    
    def extract_control_context(self, table_text: str, full_text: str) -> Optional[str]:
        """
        Try to extract which control a rating table belongs to.
        
        Args:
            table_text: The table text
            full_text: Full document text for context
            
        Returns:
            Control code if found, None otherwise
        """
        # Find table position
        table_start = full_text.find(table_text)
        if table_start == -1:
            return None
            
        # Look backwards for control code - increase search window
        context_before = full_text[max(0, table_start - 5000):table_start]
        
        # Find the last control code before this table
        control_matches = list(self.control_pattern.finditer(context_before))
        if control_matches:
            # Get the last control code
            last_control = control_matches[-1].group(1)
            
            # Check if there's another control code between this one and the table
            # If there is, this table doesn't belong to the last control
            control_end = control_matches[-1].end()
            remaining_text = context_before[control_end:]
            
            # Look for "Smjernice za ocjenjivanje:" which indicates the rating section
            if "Smjernice za ocjenjivanje:" in remaining_text:
                return last_control
            
        return None
    
    def categorize_rating_criteria(self, criterion: str) -> Tuple[str, str]:
        """
        Categorize rating criteria into documentation and implementation.
        
        Args:
            criterion: The criterion text
            
        Returns:
            Tuple of (documentation_criteria, implementation_criteria)
        """
        # Keywords that indicate documentation-related criteria
        doc_keywords = [
            'dokument', 'politika', 'procedura', 'pravilnik', 'uputa', 
            'zapis', 'evidencija', 'plan', 'formaliziran', 'definiran',
            'opis', 'izvještaj', 'analiza', 'pregled'
        ]
        
        # Keywords that indicate implementation-related criteria
        impl_keywords = [
            'implementiran', 'primijenjen', 'provodi', 'koristi', 'integriran',
            'automatiziran', 'konfiguriran', 'instaliran', 'testiran', 'nadzire',
            'kontrolira', 'održava', 'ažurira', 'aktiviran', 'operativan'
        ]
        
        criterion_lower = criterion.lower()
        
        # Count keyword matches
        doc_score = sum(1 for keyword in doc_keywords if keyword in criterion_lower)
        impl_score = sum(1 for keyword in impl_keywords if keyword in criterion_lower)
        
        # If clearly one type, return accordingly
        if doc_score > impl_score:
            return (criterion, "Vidi dokumentacijske kriterije")
        elif impl_score > doc_score:
            return ("Vidi implementacijske kriterije", criterion)
        else:
            # If mixed or unclear, return same for both
            return (criterion, criterion)
    
    def parse_control_specific_rating(self, table_text: str, control_code: str) -> List[Dict]:
        """
        Parse control-specific rating criteria.
        
        Args:
            table_text: Text of the rating table
            control_code: Control code this table belongs to
            
        Returns:
            List of rating criteria for the control
        """
        criteria = []
        
        # Skip if not a rating table
        if not self.header_pattern.search(table_text):
            return criteria
            
        # Parse score criteria
        for match in self.score_pattern.finditer(table_text):
            score = int(match.group(1))
            criterion = match.group(2).strip()
            
            # Categorize into documentation and implementation
            doc_criteria, impl_criteria = self.categorize_rating_criteria(criterion)
            
            criteria.append({
                'control_code': control_code,
                'score': score,
                'documentation_criteria': doc_criteria,
                'implementation_criteria': impl_criteria
            })
            
        return criteria
    
    def extract_all_rating_guidance(self, file_path: str) -> Dict:
        """
        Extract all rating guidance from Prilog C text file.
        
        Args:
            file_path: Path to the text file
            
        Returns:
            Dictionary with rating guidance
        """
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        general_criteria = []
        control_specific_criteria = {}
        
        # Find all tables
        tables = self.table_pattern.findall(content)
        
        # First pass: look for general rating table (usually at the beginning)
        for i, table_text in enumerate(tables[:5]):  # Check first 5 tables
            criteria = self.parse_general_rating_table(table_text)
            if criteria and len(criteria) == 5:  # Found complete 1-5 rating
                general_criteria = criteria
                break
        
        # Second pass: extract control-specific tables
        for table_text in tables:
            # Skip if not a rating table
            if not self.header_pattern.search(table_text):
                continue
                
            # Try to find which control this belongs to
            control_code = self.extract_control_context(table_text, content)
            if control_code:
                criteria = self.parse_control_specific_rating(table_text, control_code)
                if criteria:
                    control_specific_criteria[control_code] = criteria
        
        return {
            'general': general_criteria,
            'control_specific': control_specific_criteria
        }
    
    def create_default_general_criteria(self) -> List[Dict]:
        """
        Create default general rating criteria based on ZKS/NIS2 methodology.
        
        Returns:
            List of default rating criteria
        """
        return [
            {
                'score': 1,
                'documentation_criteria': 'Dokumentacija i ključni dokumenti poput politike ne postoje ili su u potpunosti zastarjeli.',
                'implementation_criteria': 'Proces nije strukturiran, aktivnosti se provode ad-hoc bez definiranih procedura.'
            },
            {
                'score': 2,
                'documentation_criteria': 'Dokumentacija postoji ali je nepotpuna, nedosljedna ili nije redovito ažurirana.',
                'implementation_criteria': 'Proces je djelomično strukturiran, ali nedosljedna primjena i nedostaju kontrole.'
            },
            {
                'score': 3,
                'documentation_criteria': 'Dokumentacija je formalizirana i pokriva ključne aspekte, ali postoje nedostaci u detaljima.',
                'implementation_criteria': 'Proces je uglavnom strukturiran s osnovnim kontrolama, ali nedostaje dosljednost.'
            },
            {
                'score': 4,
                'documentation_criteria': 'Dokumentacija je sveobuhvatna, redovito ažurirana s manjim nedostacima.',
                'implementation_criteria': 'Proces je dobro strukturiran s učinkovitim kontrolama i redovitim pregledima.'
            },
            {
                'score': 5,
                'documentation_criteria': 'Dokumentacija je potpuna, optimizirana i integirana s poslovnim procesima.',
                'implementation_criteria': 'Proces je potpuno integriran, optimiziran s kontinuiranim poboljšanjima.'
            }
        ]
    
    def merge_with_defaults(self, extracted_data: Dict) -> Dict:
        """
        Merge extracted data with default criteria where needed.
        
        Args:
            extracted_data: Extracted rating guidance
            
        Returns:
            Merged rating guidance
        """
        # Use default general criteria if none found
        if not extracted_data.get('general'):
            extracted_data['general'] = self.create_default_general_criteria()
        
        return extracted_data


if __name__ == "__main__":
    # Test the parser
    parser = PrilogCTableParser()
    
    # Test with sample table
    sample_table = """
--- TABLE ---
Ocjena | Uvjet
1 | Subjekt nema dokumentiran proces upravljanja rizicima.
2 | Proces postoji ali nije formaliziran niti redovito ažuriran.
3 | Proces je formaliziran ali nedostaju ključni elementi.
4 | Proces je sveobuhvatan s manjim nedostacima.
5 | Proces je potpuno definiran, dokumentiran i redovito ažuriran.
--- END TABLE ---
"""
    
    criteria = parser.parse_general_rating_table(sample_table)
    print("Parsed criteria:")
    for c in criteria:
        print(f"Score {c['score']}: {c['criterion']}")
    
    # Test categorization
    test_criterion = "Proces je dokumentiran i implementiran s redovitim ažuriranjem"
    doc, impl = parser.categorize_rating_criteria(test_criterion)
    print(f"\nCategorization test:")
    print(f"Documentation: {doc}")
    print(f"Implementation: {impl}")