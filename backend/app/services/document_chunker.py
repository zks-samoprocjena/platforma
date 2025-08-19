"""Page-aware document chunking with metadata extraction for two-layer RAG."""
import re
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from langchain.schema import Document
import logging

logger = logging.getLogger(__name__)


# Document source types that we classify for retrieval boosting
# These align with the 'source' field in ProcessedDocument model
DOCUMENT_SOURCES = {
    'ZKS': 'ZKS',        # Zakon o kibernetičkoj sigurnosti
    'NIS2': 'NIS2',      # NIS2 Directive
    'UKS': 'UKS',        # Uredba o kibernetičkoj sigurnosti  
    'PRILOG_B': 'PRILOG_B',  # Prilog B / Appendix B
    'PRILOG_C': 'PRILOG_C',  # Prilog C / Appendix C
    'ISO': 'ISO',        # ISO standards
    'NIST': 'NIST',      # NIST framework
    'STANDARD': 'standard',  # Generic standards
    'REGULATION': 'regulation',  # Generic regulations
    'UNKNOWN': 'custom'  # Unknown/custom documents
}


@dataclass
class ChunkMetadata:
    """Structured metadata for document chunks."""
    page_start: int
    page_end: int
    page_anchor: int
    control_ids: List[str]
    doc_type: str  # Will store the document source classification
    section_title: Optional[str]
    is_spillover: bool = False
    chunk_index: int = 0


class PageAwareChunker:
    """Chunks documents preserving page boundaries with metadata extraction."""
    
    # Control ID pattern - matches XXX-NNN or XXXX-NNN format
    CONTROL_PATTERN = re.compile(r'\b[A-Z]{3,4}-\d{3}\b')
    
    # Section title patterns
    SECTION_PATTERNS = [
        re.compile(r'^(?:\d+\.)+\s+(.+)$'),  # Numbered sections (1.2.3 Title)
        re.compile(r'^[A-Z][A-Z\s]{2,50}$'),  # All caps headers
        re.compile(r'^(?:Članak|Article|Section)\s+\d+'),  # Legal sections
        re.compile(r'^(?:Mjera|Measure)\s+\d+'),  # Measure sections
    ]
    
    # Document type detection patterns - aligned with existing source field
    DOC_TYPE_PATTERNS = {
        'ZKS': re.compile(r'(?i)(zakon.*kibern|zks|cyber.*security.*act)'),
        'NIS2': re.compile(r'(?i)(nis\s*2|network.*information.*security|direktiva.*nis)'),
        'UKS': re.compile(r'(?i)(uredba.*kibern|uks|regulation.*cyber)'),
        'PRILOG_B': re.compile(r'(?i)(prilog\s*b|appendix\s*b|annex\s*b)'),
        'PRILOG_C': re.compile(r'(?i)(prilog\s*c|appendix\s*c|annex\s*c)'),
        'ISO': re.compile(r'(?i)(iso\s*27\d{3}|iso/iec)'),
        'NIST': re.compile(r'(?i)(nist\s*(csf|framework|sp\s*800))'),
    }
    
    def __init__(
        self,
        max_chunk_size: int = 800,
        min_chunk_size: int = 200,
        header_footer_lines: int = 2,
    ):
        """
        Initialize the page-aware chunker.
        
        Args:
            max_chunk_size: Maximum size of a chunk in characters
            min_chunk_size: Minimum size of a chunk (avoid tiny fragments)
            header_footer_lines: Number of lines to check for headers/footers
        """
        self.max_chunk_size = max_chunk_size
        self.min_chunk_size = min_chunk_size
        self.header_footer_lines = header_footer_lines
    
    def process_document(
        self,
        documents: List[Document],
        filename: str = "",
        force_doc_type: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Process documents into page-aware chunks with metadata.
        
        Args:
            documents: List of Document objects from LangChain loaders
            filename: Original filename for type detection
            force_doc_type: Override automatic document type detection
            
        Returns:
            List of chunk dictionaries ready for database insertion
        """
        # Detect document type once for entire document
        doc_type = force_doc_type or self._detect_doc_type(documents, filename)
        logger.info(f"Processing document with type: {doc_type}")
        
        processed_chunks = []
        
        for doc_idx, doc in enumerate(documents):
            page_num = doc.metadata.get('page', doc_idx)
            
            # Clean and normalize page content
            clean_content = self._clean_page_content(doc.page_content)
            
            if not clean_content.strip():
                continue  # Skip empty pages
            
            # Extract page-level metadata
            page_control_ids = self._extract_control_ids(clean_content)
            section_title = self._extract_section_title(clean_content, page_num)
            
            # Check for spillover indicators
            has_spillover = self._detect_spillover(clean_content)
            
            # Create chunks from page
            page_chunks = self._chunk_page_content(
                content=clean_content,
                page_num=page_num,
                metadata=ChunkMetadata(
                    page_start=page_num,
                    page_end=page_num,
                    page_anchor=page_num,
                    control_ids=page_control_ids,
                    doc_type=doc_type,
                    section_title=section_title,
                    is_spillover=has_spillover,
                )
            )
            
            processed_chunks.extend(page_chunks)
        
        # Post-process for spillover connections
        self._connect_spillovers(processed_chunks)
        
        return processed_chunks
    
    def _detect_doc_type(self, documents: List[Document], filename: str) -> str:
        """
        Detect document type from content and filename.
        
        Returns one of the DOCUMENT_SOURCES values.
        """
        # Sample first few pages for detection
        sample = filename.lower() + " "
        if documents:
            sample += " ".join(d.page_content[:500] for d in documents[:min(3, len(documents))])
        
        # Check against known patterns
        for doc_type, pattern in self.DOC_TYPE_PATTERNS.items():
            if pattern.search(sample):
                return DOCUMENT_SOURCES[doc_type]
        
        # Check for generic types
        if re.search(r'(?i)(standard|iso|cobit|itil)', sample):
            return DOCUMENT_SOURCES['STANDARD']
        elif re.search(r'(?i)(regulation|directive|zakon|uredba)', sample):
            return DOCUMENT_SOURCES['REGULATION']
        
        return DOCUMENT_SOURCES['UNKNOWN']
    
    def _clean_page_content(self, content: str) -> str:
        """Remove headers, footers, and normalize text."""
        lines = content.split('\n')
        
        # Remove empty lines at start/end
        while lines and not lines[0].strip():
            lines.pop(0)
        while lines and not lines[-1].strip():
            lines.pop()
        
        if not lines:
            return ""
        
        if len(lines) <= self.header_footer_lines * 2:
            return '\n'.join(lines)
        
        # Remove likely headers (first N lines if they look like headers)
        header_removed = 0
        for i in range(min(self.header_footer_lines, len(lines))):
            if self._is_likely_header_footer(lines[i]):
                header_removed += 1
            else:
                break
        
        # Remove likely footers
        footer_removed = 0
        for i in range(min(self.header_footer_lines, len(lines))):
            if self._is_likely_header_footer(lines[-(i+1)]):
                footer_removed += 1
            else:
                break
        
        # Slice out headers/footers
        if header_removed or footer_removed:
            end_idx = len(lines) - footer_removed if footer_removed else len(lines)
            lines = lines[header_removed:end_idx]
        
        # Normalize whitespace
        content = '\n'.join(lines)
        content = re.sub(r'\n{3,}', '\n\n', content)  # Max 2 newlines
        content = re.sub(r'[ \t]+', ' ', content)  # Normalize spaces
        
        return content.strip()
    
    def _is_likely_header_footer(self, line: str) -> bool:
        """Detect if line is likely a header or footer."""
        line = line.strip()
        
        if not line:
            return False
        
        # Page numbers in various formats
        if re.match(r'^(?:Page\s+)?\d+(?:\s+of\s+\d+)?$', line, re.I):
            return True
        if re.match(r'^(?:Stranica\s+)?\d+(?:\s+od\s+\d+)?$', line, re.I):
            return True
        if re.match(r'^-\s*\d+\s*-$', line):  # - 1 -
            return True
        
        # Date stamps
        if re.match(r'^\d{1,2}[./]\d{1,2}[./]\d{2,4}', line):
            return True
        
        # Document identifiers
        if re.match(r'^(?:Doc|Document|ID)[:\s]+[\w-]+$', line, re.I):
            return True
        
        # Copyright lines
        if re.search(r'(?i)^.{0,10}(copyright|©|\(c\))', line):
            return True
        
        # Very short lines with special chars (likely decorative)
        if len(line) < 5 and any(c in line for c in '═─│┌┐└┘'):
            return True
        
        return False
    
    def _extract_control_ids(self, content: str) -> List[str]:
        """Extract all control IDs (XXX-NNN or XXXX-NNN format) from content."""
        matches = self.CONTROL_PATTERN.findall(content)
        # Return unique IDs while preserving order
        return list(dict.fromkeys(matches))
    
    def _extract_section_title(self, content: str, page_num: int) -> Optional[str]:
        """Extract section title from page content."""
        lines = content.split('\n')[:15]  # Check first 15 lines
        
        for line in lines:
            line = line.strip()
            if not line or len(line) > 150:  # Skip empty or too long
                continue
            
            for pattern in self.SECTION_PATTERNS:
                match = pattern.match(line)
                if match:
                    # Extract the title part
                    if match.groups():
                        title = match.group(1)
                    else:
                        title = line
                    return title[:200]  # Cap length at 200 chars
        
        return None
    
    def _detect_spillover(self, content: str) -> bool:
        """Detect if content likely continues on next page."""
        lines = content.split('\n')
        if not lines:
            return False
        
        # Get last non-empty line
        last_line = ""
        for line in reversed(lines):
            if line.strip():
                last_line = line.strip()
                break
        
        if not last_line:
            return False
        
        # Strong indicators of continuation
        if last_line.endswith((',', '-', ':', ';')):
            return True
        
        # No sentence terminator and substantial content
        if len(last_line) > 40 and not re.search(r'[.!?]\s*$', last_line):
            return True
        
        # Bullet or list item without termination
        if re.match(r'^[\d•◦▪→▸]\s*.+', last_line) and not last_line.endswith('.'):
            return True
        
        # Incomplete parenthesis or quotes
        if last_line.count('(') > last_line.count(')'):
            return True
        if last_line.count('"') % 2 != 0:
            return True
        
        return False
    
    def _chunk_page_content(
        self,
        content: str,
        page_num: int,
        metadata: ChunkMetadata,
    ) -> List[Dict[str, Any]]:
        """Create chunks from page content."""
        chunks = []
        
        # If content fits in one chunk, return as-is
        if len(content) <= self.max_chunk_size:
            chunks.append({
                'content': content,
                'page_start': metadata.page_start,
                'page_end': metadata.page_end,
                'page_anchor': metadata.page_anchor,
                'control_ids': metadata.control_ids,
                'doc_type': metadata.doc_type,
                'section_title': metadata.section_title,
                'chunk_metadata': {
                    'page': page_num,
                    'is_spillover': metadata.is_spillover,
                    'chunk_index': 0,
                    'is_partial': False,
                }
            })
            return chunks
        
        # Split large pages into semantic chunks
        segments = self._split_semantic_segments(content)
        
        for idx, segment in enumerate(segments):
            # Each segment inherits page metadata but extracts its own control IDs
            segment_control_ids = self._extract_control_ids(segment)
            
            chunks.append({
                'content': segment,
                'page_start': metadata.page_start,
                'page_end': metadata.page_end,
                'page_anchor': metadata.page_anchor,
                'control_ids': segment_control_ids or metadata.control_ids,
                'doc_type': metadata.doc_type,
                'section_title': metadata.section_title,
                'chunk_metadata': {
                    'page': page_num,
                    'is_spillover': metadata.is_spillover and idx == len(segments) - 1,
                    'chunk_index': idx,
                    'is_partial': True,
                    'total_segments': len(segments),
                }
            })
        
        return chunks
    
    def _split_semantic_segments(self, content: str) -> List[str]:
        """Split content into semantic segments respecting boundaries."""
        segments = []
        
        # Try splitting by paragraphs first
        paragraphs = content.split('\n\n')
        
        current_segment = ""
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
                
            # If adding paragraph exceeds max, save current and start new
            if current_segment and len(current_segment) + len(para) + 2 > self.max_chunk_size:
                if len(current_segment) >= self.min_chunk_size:
                    segments.append(current_segment.strip())
                    current_segment = para
                else:
                    # Current too small, must combine
                    current_segment += "\n\n" + para
                    # If combined is still too large, force split
                    if len(current_segment) > self.max_chunk_size:
                        segments.append(current_segment[:self.max_chunk_size].strip())
                        current_segment = current_segment[self.max_chunk_size:].strip()
            else:
                current_segment += ("\n\n" if current_segment else "") + para
        
        # Add final segment
        if current_segment:
            segments.append(current_segment.strip())
        
        # Handle segments that are still too large
        final_segments = []
        for segment in segments:
            if len(segment) <= self.max_chunk_size:
                final_segments.append(segment)
            else:
                # Force split at sentence boundaries
                sentences = re.split(r'(?<=[.!?])\s+', segment)
                temp = ""
                for sent in sentences:
                    if temp and len(temp) + len(sent) + 1 > self.max_chunk_size:
                        final_segments.append(temp.strip())
                        temp = sent
                    else:
                        temp += (" " if temp else "") + sent
                if temp:
                    final_segments.append(temp.strip())
        
        return final_segments
    
    def _connect_spillovers(self, chunks: List[Dict[str, Any]]) -> None:
        """Connect spillover pages by marking continuations."""
        for i in range(len(chunks) - 1):
            curr = chunks[i]
            next_chunk = chunks[i + 1]
            
            # If current has spillover and next is consecutive page
            if (curr['chunk_metadata'].get('is_spillover') and 
                next_chunk['page_start'] == curr['page_end'] + 1):
                
                # Check if they share control IDs (indicates same control continues)
                shared_controls = set(curr['control_ids']) & set(next_chunk['control_ids'])
                if shared_controls:
                    # Mark the connection
                    curr['chunk_metadata']['continues_to'] = next_chunk['page_start']
                    next_chunk['chunk_metadata']['continues_from'] = curr['page_end']
                    # Add shared control IDs to metadata for reference
                    curr['chunk_metadata']['continued_controls'] = list(shared_controls)
                    next_chunk['chunk_metadata']['continued_controls'] = list(shared_controls)