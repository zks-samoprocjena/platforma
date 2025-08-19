"""
English language prompts for AI services (fallback).
"""

# System prompts for different output modes
SYSTEM_PROMPT_STRUCTURED = """You are an experienced cybersecurity expert with 15 years of experience
implementing ZKS/NIS2 controls in Croatian organizations.

TASK:
✔︎ Generate DETAILED, SPECIFIC, and PRACTICAL recommendations tailored to
  the current control assessment using only information from the provided
  context (RAG).
✔︎ Respond EXCLUSIVELY with one valid JSON object **without Markdown tags and
  without additional text**. Root must be an object; do not add comments.
✔︎ Escape all quotes or newline characters that appear within
  strings so JSON is not invalid.
✔︎ Do not use the following generic phrases:
   "Current state analysis", "Solution selection and preparation",
   "Pilot implementation", "Evaluate available solutions",
   "Conduct detailed inventory".
✔︎ Do not invent laws, standards, or standard numbers that are not present in
  the provided context.

Do not add fields that are not explicitly requested in the user prompt."""

SYSTEM_PROMPT_UNSTRUCTURED = """You are an experienced cybersecurity expert with 15 years of experience
implementing ZKS/NIS2 controls in Croatian organizations.

Generate PRACTICAL, CONCRETE recommendations in English, using
only information from the provided context (RAG) and considering
the current control assessment. Avoid generic phrases like:
"Current state analysis", "Solution selection and preparation", "Pilot implementation".
Do not mention laws or standards not in the context."""

# Q&A prompt for context-based questions
CONTEXT_QA = """Use the following context to answer the question in English.

Context:
{context}

Question: {question}

Answer guidelines:
- Answer precisely based on the context
- Be concrete and practical
- Cite sources when possible
- If context doesn't contain the answer, state it clearly

Answer:"""

# Unstructured recommendations prompt
RECOMMENDATIONS = """Generate recommendations for improving a security control based on assessment analysis.

Control: {control_name}
Current score: {current_score}/5
Target score: {target_score}/5
Security level: {security_level}
Mandatory control: {is_mandatory_text}

Best practices context:
{context}

Assessor comments:
{comments}

Generate concrete recommendations including:
1. Specific implementation steps
2. Priorities and action sequence
3. Required resources or competencies
4. Expected timelines
5. Progress measurement methods

Provide a structured response:"""

# Structured recommendations prompt with JSON output
RECOMMENDATIONS_STRUCTURED = """TASK  
As a cybersecurity expert, generate **DETAILED, SPECIFIC and
TAILORED** recommendations to improve the specified security control.

⬇️ Input parameters:

- Control name: **{control_name}**
- Current score: **{current_score}/5**
- Target score: **{target_score}/5**
- Gap: **{gap_size}** (target − current)
- Security level: **{security_level}**
- Mandatory control: **{is_mandatory_text}**
- Relevant context and best practices (RAG source):  
  ```{context}```
- Assessor comments:  
  ```{comments}```

🎯 **Goal** – raise the score from *{current_score}* to *{target_score}*.

🚫 **Forbidden generic phrases** (MUST NOT appear in any field!):  
"Current state analysis", "Solution selection and preparation", "Pilot implementation",  
"Evaluate available solutions", "Conduct detailed inventory".

📐 **Rules**  
1. Each step starts with an imperative verb (e.g., "Implement…", "Configure…").  
2. Steps and description must be **unique** for control *{control_name}* – never copy‑paste.  
3. Specify **exact** tools, technologies or standards (e.g., "Elastic SIEM 8.13" instead of "SIEM").  
4. Steps are measurable: mention concrete outcome or KPI.  
5. `timeline_weeks` ≈ `gap_size × 2` (for **gap 0** put 1).  
6. `compliance_impact` estimate realistically in range **5–40** (%).  
7. `effort_estimate`: `"low" (<1 FTE)`, `"medium"` (1–3 FTE), `"high"` (>3 FTE).  
8. `source_references`: put **key** labels or URLs from `{context}` (max 4).  
9. Don't add undefined fields, don't repeat input text.

📦 **Output JSON format**:  
{{
  "title": "...",
  "description": "...",
  "implementation_steps": [
    "...",
    "...",
    "...",
    "...",
    "..."
  ],
  "timeline_weeks": 6,
  "compliance_impact": 25,
  "effort_estimate": "medium",
  "source_references": ["ISO27001:2022 A.5.7", "NIST CSF PR.AC‑1"]
}}

🔁 **Respond EXCLUSIVELY with this JSON. No introduction, no explanation.**"""

# Roadmap generation prompt
ROADMAP = """Create a security improvement plan based on compliance assessment analysis.

Assessment: {assessment_title}
Security level: {security_level}
Total identified gaps: {total_gaps}
Mandatory controls with gaps: {mandatory_gaps}

Gaps (top 5):
{gaps_summary}

Regulatory requirements context:
{regulatory_context}

Create a comprehensive improvement plan including:
1. Short-term priorities (1-3 months)
2. Medium-term goals (3-6 months)
3. Long-term strategy (6-12 months)
4. Resource allocation and responsibilities
5. Critical control points and success indicators

Structure the plan according to ZKS/NIS2 requirements:"""

# Export all English prompts as a dictionary
ENGLISH_PROMPTS = {
    "system_structured": SYSTEM_PROMPT_STRUCTURED,
    "system_unstructured": SYSTEM_PROMPT_UNSTRUCTURED,
    "context_qa": CONTEXT_QA,
    "recommendations": RECOMMENDATIONS,
    "recommendations_structured": RECOMMENDATIONS_STRUCTURED,
    "roadmap": ROADMAP,
}