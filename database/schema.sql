-- PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Tables

CREATE TABLE controls (
    code VARCHAR(20) NOT NULL, 
    name_hr VARCHAR(255) NOT NULL, 
    description_hr TEXT, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    UNIQUE (code)
)

;


CREATE TABLE import_logs (
    import_type VARCHAR(50) NOT NULL, 
    source_file VARCHAR(500) NOT NULL, 
    file_hash VARCHAR(64) NOT NULL, 
    status VARCHAR(50) NOT NULL, 
    progress_percentage INTEGER NOT NULL, 
    records_processed INTEGER NOT NULL, 
    records_created INTEGER NOT NULL, 
    records_updated INTEGER NOT NULL, 
    records_skipped INTEGER NOT NULL, 
    questionnaire_version_id UUID, 
    measures_count INTEGER, 
    submeasures_count INTEGER, 
    controls_count INTEGER, 
    started_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    completed_at TIMESTAMP WITH TIME ZONE, 
    log_messages TEXT, 
    error_message TEXT, 
    validation_errors TEXT, 
    is_forced_reimport BOOLEAN NOT NULL, 
    validation_only BOOLEAN NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id)
)

;


CREATE TABLE organizations (
    tenant_id UUID, 
    code VARCHAR(50) NOT NULL, 
    name VARCHAR(255) NOT NULL, 
    type VARCHAR(50) NOT NULL, 
    security_level VARCHAR(20) NOT NULL, 
    description VARCHAR(500), 
    active BOOLEAN NOT NULL, 
    website VARCHAR(255), 
    size VARCHAR(50), 
    admin_user_id VARCHAR(255), 
    registration_date TIMESTAMP WITHOUT TIME ZONE, 
    setup_completed BOOLEAN NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_valid_organization_security_level CHECK (security_level IN ('osnovna', 'srednja', 'napredna')), 
    CONSTRAINT ck_organization_type CHECK (type IN ('government', 'private-sector', 'critical-infrastructure', 'other')), 
    CONSTRAINT ck_organization_size CHECK (size IN ('1-10', '11-50', '51-250', '250+') OR size IS NULL)
)

;


CREATE TABLE questionnaire_versions (
    version_number VARCHAR(50) NOT NULL, 
    description TEXT, 
    content_hash VARCHAR(64) NOT NULL, 
    is_active BOOLEAN NOT NULL, 
    source_file VARCHAR(255), 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    UNIQUE (content_hash)
)

;


CREATE TABLE assessments (
    organization_id UUID NOT NULL, 
    version_id UUID, 
    security_level VARCHAR(20) NOT NULL, 
    title VARCHAR(255) NOT NULL, 
    description TEXT, 
    status VARCHAR(20) NOT NULL, 
    created_by UUID, 
    assigned_to UUID[], 
    started_at TIMESTAMP WITH TIME ZONE, 
    completed_at TIMESTAMP WITH TIME ZONE, 
    due_date TIMESTAMP WITH TIME ZONE, 
    total_controls INTEGER NOT NULL, 
    answered_controls INTEGER NOT NULL, 
    mandatory_controls INTEGER NOT NULL, 
    mandatory_answered INTEGER NOT NULL, 
    total_score NUMERIC(5, 2), 
    compliance_percentage NUMERIC(5, 2), 
    compliance_status VARCHAR(20), 
    version INTEGER NOT NULL, 
    is_template BOOLEAN NOT NULL, 
    template_id UUID, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_assessment_valid_security_level CHECK (security_level IN ('osnovna', 'srednja', 'napredna')), 
    CONSTRAINT ck_assessment_valid_status CHECK (status IN ('draft', 'in_progress', 'review', 'completed', 'abandoned', 'archived')), 
    CONSTRAINT ck_assessment_valid_compliance_percentage CHECK (compliance_percentage IS NULL OR (compliance_percentage >= 0 AND compliance_percentage <= 100)), 
    FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
    FOREIGN KEY(version_id) REFERENCES questionnaire_versions (id) ON DELETE RESTRICT, 
    FOREIGN KEY(template_id) REFERENCES assessments (id) ON DELETE SET NULL
)

;


CREATE TABLE document_templates (
    template_key VARCHAR(100) NOT NULL, 
    name VARCHAR(255) NOT NULL, 
    description TEXT, 
    version VARCHAR(20) NOT NULL, 
    file_path VARCHAR(500), 
    schema JSON, 
    is_active BOOLEAN NOT NULL, 
    created_by UUID, 
    organization_id UUID NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    UNIQUE (template_key), 
    FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE
)

;


CREATE TABLE documents (
    organization_id UUID NOT NULL, 
    document_type VARCHAR(50) NOT NULL, 
    name VARCHAR(255) NOT NULL, 
    description VARCHAR(500), 
    is_template BOOLEAN NOT NULL, 
    template_version VARCHAR(20), 
    generation_metadata JSONB, 
    status VARCHAR(50) NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_valid_document_type CHECK (document_type IN ('policy', 'procedure', 'guideline', 'evidence', 'other', 'compliance_declaration', 'self_assessment_report', 'internal_record', 'evaluation_report', 'action_plan')), 
    FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE
)

;


CREATE TABLE measures (
    version_id UUID NOT NULL, 
    code VARCHAR(10) NOT NULL, 
    name_hr VARCHAR(255) NOT NULL, 
    description_hr TEXT, 
    order_index INTEGER NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    UNIQUE (version_id, code), 
    FOREIGN KEY(version_id) REFERENCES questionnaire_versions (id) ON DELETE CASCADE
)

;


CREATE TABLE processed_documents (
    organization_id UUID, 
    scope VARCHAR(20) NOT NULL, 
    is_global BOOLEAN NOT NULL, 
    uploaded_by VARCHAR(255), 
    document_type VARCHAR(50), 
    source VARCHAR(50), 
    title VARCHAR(255) NOT NULL, 
    file_name VARCHAR(255) NOT NULL, 
    file_size INTEGER NOT NULL, 
    mime_type VARCHAR(100), 
    status VARCHAR(50) NOT NULL, 
    upload_date TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
    processed_date TIMESTAMP WITHOUT TIME ZONE, 
    processing_metadata JSONB, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT check_document_scope_consistency CHECK ((scope = 'global' AND organization_id IS NULL AND is_global = true) OR (scope = 'organization' AND organization_id IS NOT NULL AND is_global = false)), 
    FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE
)

;


CREATE TABLE ai_recommendations (
    assessment_id UUID NOT NULL, 
    organization_id UUID NOT NULL, 
    control_id UUID, 
    recommendation_type VARCHAR(50) NOT NULL, 
    title VARCHAR(500) NOT NULL, 
    content TEXT NOT NULL, 
    description TEXT, 
    priority VARCHAR(20) NOT NULL, 
    effort_estimate VARCHAR(20) NOT NULL, 
    impact_score NUMERIC(5, 2) NOT NULL, 
    current_score NUMERIC(3, 1) NOT NULL, 
    target_score NUMERIC(3, 1) NOT NULL, 
    is_implemented BOOLEAN NOT NULL, 
    implemented_at TIMESTAMP WITH TIME ZONE, 
    confidence_score NUMERIC(3, 2), 
    implementation_metadata JSONB, 
    source_chunks JSONB, 
    language VARCHAR(5) NOT NULL, 
    is_active BOOLEAN NOT NULL, 
    superseded_by_id UUID, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(assessment_id) REFERENCES assessments (id) ON DELETE CASCADE, 
    FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
    FOREIGN KEY(control_id) REFERENCES controls (id) ON DELETE SET NULL, 
    FOREIGN KEY(superseded_by_id) REFERENCES ai_recommendations (id) ON DELETE SET NULL
)

;


CREATE TABLE assessment_activity (
    assessment_id UUID NOT NULL, 
    user_id UUID NOT NULL, 
    measure_id UUID, 
    activity_type VARCHAR(50) NOT NULL, 
    section_name VARCHAR(255), 
    control_id UUID, 
    started_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    last_active TIMESTAMP WITH TIME ZONE NOT NULL, 
    ended_at TIMESTAMP WITH TIME ZONE, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_valid_activity_type CHECK (activity_type IN ('viewing', 'editing', 'idle')), 
    FOREIGN KEY(assessment_id) REFERENCES assessments (id) ON DELETE CASCADE, 
    FOREIGN KEY(measure_id) REFERENCES measures (id) ON DELETE SET NULL, 
    FOREIGN KEY(control_id) REFERENCES controls (id) ON DELETE SET NULL
)

;


CREATE TABLE assessment_audit_log (
    assessment_id UUID NOT NULL, 
    user_id UUID, 
    action VARCHAR(50) NOT NULL, 
    entity_type VARCHAR(50) NOT NULL, 
    entity_id UUID, 
    old_values JSONB, 
    new_values JSONB, 
    change_summary TEXT, 
    ip_address INET, 
    user_agent TEXT, 
    session_id UUID, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_valid_audit_action CHECK (action IN ('created', 'status_changed', 'answer_updated', 'submitted', 'assigned', 'deleted')), 
    CONSTRAINT ck_valid_entity_type CHECK (entity_type IN ('assessment', 'answer', 'result', 'assignment')), 
    FOREIGN KEY(assessment_id) REFERENCES assessments (id)
)

;


CREATE TABLE assessment_progress (
    assessment_id UUID NOT NULL, 
    measure_id UUID, 
    controls_total INTEGER NOT NULL, 
    controls_answered INTEGER NOT NULL, 
    controls_mandatory INTEGER NOT NULL, 
    controls_mandatory_answered INTEGER NOT NULL, 
    completion_percentage NUMERIC(5, 2) NOT NULL, 
    mandatory_completion_percentage NUMERIC(5, 2) NOT NULL, 
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_assessment_measure_progress UNIQUE (assessment_id, measure_id), 
    CONSTRAINT ck_valid_completion_percentage CHECK (completion_percentage >= 0 AND completion_percentage <= 100), 
    CONSTRAINT ck_valid_mandatory_completion_percentage CHECK (mandatory_completion_percentage >= 0 AND mandatory_completion_percentage <= 100), 
    FOREIGN KEY(assessment_id) REFERENCES assessments (id) ON DELETE CASCADE, 
    FOREIGN KEY(measure_id) REFERENCES measures (id) ON DELETE RESTRICT
)

;


CREATE TABLE compliance_scores (
    assessment_id UUID NOT NULL, 
    security_level VARCHAR(20) NOT NULL, 
    overall_score NUMERIC(3, 2), 
    compliance_percentage NUMERIC(5, 2), 
    is_compliant BOOLEAN NOT NULL, 
    compliance_grade VARCHAR(2), 
    total_measures INTEGER NOT NULL, 
    passed_measures INTEGER NOT NULL, 
    critical_measures_failed VARCHAR[], 
    total_controls INTEGER NOT NULL, 
    answered_controls INTEGER NOT NULL, 
    mandatory_controls INTEGER NOT NULL, 
    mandatory_answered INTEGER NOT NULL, 
    mandatory_passed INTEGER NOT NULL, 
    high_risk_areas VARCHAR[], 
    version INTEGER NOT NULL, 
    is_current BOOLEAN NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_compliance_score_version UNIQUE (assessment_id, version), 
    CONSTRAINT ck_compliance_score_security_level CHECK (security_level IN ('osnovna', 'srednja', 'napredna')), 
    CONSTRAINT ck_compliance_score_grade CHECK (compliance_grade IS NULL OR compliance_grade IN ('A', 'B', 'C', 'D', 'F')), 
    FOREIGN KEY(assessment_id) REFERENCES assessments (id) ON DELETE CASCADE
)

;


CREATE TABLE document_chunks (
    processed_document_id UUID NOT NULL, 
    chunk_index INTEGER NOT NULL, 
    content TEXT NOT NULL, 
    embedding VECTOR(768), 
    chunk_metadata JSONB, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(processed_document_id) REFERENCES processed_documents (id) ON DELETE CASCADE
)

;


CREATE TABLE document_generation_jobs (
    document_id UUID, 
    assessment_id UUID NOT NULL, 
    template_id UUID NOT NULL, 
    document_type VARCHAR(50) NOT NULL, 
    options JSON, 
    job_id VARCHAR(255), 
    started_at TIMESTAMP WITHOUT TIME ZONE, 
    completed_at TIMESTAMP WITHOUT TIME ZONE, 
    error_message TEXT, 
    status VARCHAR(50) NOT NULL, 
    organization_id UUID NOT NULL, 
    created_by UUID, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT chk_document_type CHECK (document_type IN ('compliance_declaration', 'self_assessment_report', 'internal_record', 'evaluation_report', 'action_plan')), 
    FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE, 
    FOREIGN KEY(assessment_id) REFERENCES assessments (id) ON DELETE CASCADE, 
    FOREIGN KEY(template_id) REFERENCES document_templates (id), 
    FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE
)

;


CREATE TABLE document_versions (
    document_id UUID NOT NULL, 
    version_number VARCHAR(20) NOT NULL, 
    file_path VARCHAR(500) NOT NULL, 
    file_hash VARCHAR(64) NOT NULL, 
    file_size INTEGER NOT NULL, 
    mime_type VARCHAR(100) NOT NULL, 
    is_active BOOLEAN NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE
)

;


CREATE TABLE measure_scores (
    assessment_id UUID NOT NULL, 
    measure_id UUID NOT NULL, 
    documentation_avg NUMERIC(3, 2), 
    implementation_avg NUMERIC(3, 2), 
    overall_score NUMERIC(3, 2), 
    passes_compliance BOOLEAN NOT NULL, 
    total_submeasures INTEGER NOT NULL, 
    passed_submeasures INTEGER NOT NULL, 
    critical_failures VARCHAR[], 
    total_controls INTEGER NOT NULL, 
    answered_controls INTEGER NOT NULL, 
    mandatory_controls INTEGER NOT NULL, 
    mandatory_answered INTEGER NOT NULL, 
    version INTEGER NOT NULL, 
    is_current BOOLEAN NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_measure_score_version UNIQUE (assessment_id, measure_id, version), 
    FOREIGN KEY(assessment_id) REFERENCES assessments (id) ON DELETE CASCADE, 
    FOREIGN KEY(measure_id) REFERENCES measures (id) ON DELETE CASCADE
)

;


CREATE TABLE submeasures (
    measure_id UUID NOT NULL, 
    code VARCHAR(20) NOT NULL, 
    name_hr VARCHAR(255) NOT NULL, 
    description_hr TEXT, 
    order_index INTEGER NOT NULL, 
    submeasure_type VARCHAR(1) NOT NULL, 
    is_conditional BOOLEAN NOT NULL, 
    condition_text TEXT, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    UNIQUE (measure_id, code), 
    FOREIGN KEY(measure_id) REFERENCES measures (id) ON DELETE CASCADE
)

;


CREATE TABLE assessment_answers (
    assessment_id UUID NOT NULL, 
    control_id UUID NOT NULL, 
    submeasure_id UUID NOT NULL, 
    documentation_score INTEGER, 
    implementation_score INTEGER, 
    comments TEXT, 
    evidence_files TEXT[], 
    confidence_level INTEGER, 
    answered_by UUID, 
    answered_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    is_final BOOLEAN NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_assessment_control_submeasure_answer UNIQUE (assessment_id, control_id, submeasure_id), 
    CONSTRAINT ck_valid_documentation_score CHECK (documentation_score IS NULL OR (documentation_score >= 1 AND documentation_score <= 5)), 
    CONSTRAINT ck_valid_implementation_score CHECK (implementation_score IS NULL OR (implementation_score >= 1 AND implementation_score <= 5)), 
    CONSTRAINT ck_valid_confidence_level CHECK (confidence_level IS NULL OR (confidence_level >= 1 AND confidence_level <= 5)), 
    FOREIGN KEY(assessment_id) REFERENCES assessments (id) ON DELETE CASCADE, 
    FOREIGN KEY(control_id) REFERENCES controls (id) ON DELETE RESTRICT, 
    FOREIGN KEY(submeasure_id) REFERENCES submeasures (id) ON DELETE RESTRICT
)

;


CREATE TABLE assessment_assignments (
    assessment_id UUID NOT NULL, 
    user_id UUID NOT NULL, 
    measure_id UUID, 
    submeasure_id UUID, 
    assigned_by UUID, 
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    due_date TIMESTAMP WITH TIME ZONE, 
    notes TEXT, 
    status VARCHAR(50) NOT NULL, 
    completed_at TIMESTAMP WITH TIME ZONE, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_assessment_measure_user_assignment UNIQUE (assessment_id, measure_id, user_id), 
    CONSTRAINT uq_assessment_submeasure_user_assignment UNIQUE (assessment_id, submeasure_id, user_id), 
    CONSTRAINT ck_valid_assignment_status CHECK (status IN ('assigned', 'in_progress', 'completed')), 
    CONSTRAINT ck_assignment_either_measure_or_submeasure CHECK ((measure_id IS NOT NULL AND submeasure_id IS NULL) OR (measure_id IS NULL AND submeasure_id IS NOT NULL)), 
    FOREIGN KEY(assessment_id) REFERENCES assessments (id) ON DELETE CASCADE, 
    FOREIGN KEY(measure_id) REFERENCES measures (id) ON DELETE CASCADE, 
    FOREIGN KEY(submeasure_id) REFERENCES submeasures (id) ON DELETE CASCADE
)

;


CREATE TABLE assessment_results (
    assessment_id UUID NOT NULL, 
    measure_id UUID, 
    submeasure_id UUID, 
    average_score NUMERIC(4, 2), 
    documentation_avg NUMERIC(4, 2), 
    implementation_avg NUMERIC(4, 2), 
    compliance_percentage NUMERIC(5, 2), 
    total_controls INTEGER NOT NULL, 
    answered_controls INTEGER NOT NULL, 
    mandatory_controls INTEGER NOT NULL, 
    mandatory_answered INTEGER NOT NULL, 
    calculated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    is_current BOOLEAN NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_assessment_measure_submeasure_result UNIQUE (assessment_id, measure_id, submeasure_id), 
    CONSTRAINT ck_valid_compliance_percentage CHECK (compliance_percentage IS NULL OR (compliance_percentage >= 0 AND compliance_percentage <= 100)), 
    CONSTRAINT ck_valid_average_score CHECK (average_score IS NULL OR (average_score >= 1 AND average_score <= 5)), 
    FOREIGN KEY(assessment_id) REFERENCES assessments (id) ON DELETE CASCADE, 
    FOREIGN KEY(measure_id) REFERENCES measures (id) ON DELETE RESTRICT, 
    FOREIGN KEY(submeasure_id) REFERENCES submeasures (id) ON DELETE RESTRICT
)

;


CREATE TABLE control_requirements (
    control_id UUID NOT NULL, 
    submeasure_id UUID NOT NULL, 
    level VARCHAR(20) NOT NULL, 
    is_mandatory BOOLEAN NOT NULL, 
    is_applicable BOOLEAN NOT NULL, 
    minimum_score FLOAT, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    UNIQUE (control_id, submeasure_id, level), 
    CHECK (level IN ('osnovna', 'srednja', 'napredna')), 
    CHECK (minimum_score IS NULL OR minimum_score IN (2.0, 2.5, 3.0, 3.5, 4.0, 5.0)), 
    FOREIGN KEY(control_id) REFERENCES controls (id) ON DELETE CASCADE, 
    FOREIGN KEY(submeasure_id) REFERENCES submeasures (id) ON DELETE CASCADE
)

;


CREATE TABLE control_score_history (
    assessment_id UUID NOT NULL, 
    control_id UUID NOT NULL, 
    submeasure_id UUID NOT NULL, 
    documentation_score INTEGER, 
    implementation_score INTEGER, 
    overall_score NUMERIC(3, 2), 
    meets_requirement BOOLEAN NOT NULL, 
    minimum_required NUMERIC(3, 2), 
    is_mandatory BOOLEAN NOT NULL, 
    is_applicable BOOLEAN NOT NULL, 
    version INTEGER NOT NULL, 
    is_current BOOLEAN NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_control_score_submeasure_version UNIQUE (assessment_id, control_id, submeasure_id, version), 
    CONSTRAINT ck_control_score_doc_range CHECK (documentation_score IS NULL OR documentation_score BETWEEN 1 AND 5), 
    CONSTRAINT ck_control_score_impl_range CHECK (implementation_score IS NULL OR implementation_score BETWEEN 1 AND 5), 
    FOREIGN KEY(assessment_id) REFERENCES assessments (id) ON DELETE CASCADE, 
    FOREIGN KEY(control_id) REFERENCES controls (id) ON DELETE CASCADE, 
    FOREIGN KEY(submeasure_id) REFERENCES submeasures (id) ON DELETE CASCADE
)

;


CREATE TABLE control_submeasure_mapping (
    control_id UUID NOT NULL, 
    submeasure_id UUID NOT NULL, 
    order_index INTEGER NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    UNIQUE (control_id, submeasure_id), 
    FOREIGN KEY(control_id) REFERENCES controls (id) ON DELETE CASCADE, 
    FOREIGN KEY(submeasure_id) REFERENCES submeasures (id) ON DELETE CASCADE
)

;


CREATE TABLE submeasure_scores (
    assessment_id UUID NOT NULL, 
    submeasure_id UUID NOT NULL, 
    documentation_avg NUMERIC(3, 2), 
    implementation_avg NUMERIC(3, 2), 
    overall_score NUMERIC(3, 2), 
    passes_individual_threshold BOOLEAN NOT NULL, 
    passes_average_threshold BOOLEAN NOT NULL, 
    passes_overall BOOLEAN NOT NULL, 
    total_controls INTEGER NOT NULL, 
    answered_controls INTEGER NOT NULL, 
    mandatory_controls INTEGER NOT NULL, 
    mandatory_answered INTEGER NOT NULL, 
    failed_controls VARCHAR[], 
    version INTEGER NOT NULL, 
    is_current BOOLEAN NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_submeasure_score_version UNIQUE (assessment_id, submeasure_id, version), 
    FOREIGN KEY(assessment_id) REFERENCES assessments (id) ON DELETE CASCADE, 
    FOREIGN KEY(submeasure_id) REFERENCES submeasures (id) ON DELETE CASCADE
)

;

-- Indexes
CREATE INDEX ix_controls_id ON controls (id);
CREATE INDEX ix_import_logs_id ON import_logs (id);
CREATE INDEX ix_organizations_tenant_id ON organizations (tenant_id);
CREATE INDEX ix_organizations_id ON organizations (id);
CREATE UNIQUE INDEX ix_organizations_code ON organizations (code);
CREATE INDEX ix_questionnaire_versions_id ON questionnaire_versions (id);
CREATE INDEX ix_assessments_organization_id ON assessments (organization_id);
CREATE INDEX ix_assessments_security_level ON assessments (security_level);
CREATE INDEX ix_assessments_version_id ON assessments (version_id);
CREATE INDEX ix_assessments_status ON assessments (status);
CREATE INDEX ix_assessments_created_by ON assessments (created_by);
CREATE INDEX ix_assessments_id ON assessments (id);
CREATE INDEX ix_assessments_compliance_status ON assessments (compliance_status);
CREATE INDEX idx_templates_key_version ON document_templates (template_key, version);
CREATE INDEX ix_document_templates_id ON document_templates (id);
CREATE INDEX idx_templates_organization ON document_templates (organization_id);
CREATE INDEX idx_templates_active ON document_templates (is_active);
CREATE INDEX ix_document_templates_organization_id ON document_templates (organization_id);
CREATE INDEX ix_documents_organization_id ON documents (organization_id);
CREATE INDEX ix_documents_id ON documents (id);
CREATE INDEX ix_measures_version_id ON measures (version_id);
CREATE INDEX ix_measures_id ON measures (id);
CREATE INDEX ix_processed_documents_scope ON processed_documents (scope);
CREATE INDEX idx_documents_global ON processed_documents (is_global, status);
CREATE INDEX idx_documents_upload_date ON processed_documents (upload_date);
CREATE INDEX ix_processed_documents_document_type ON processed_documents (document_type);
CREATE INDEX ix_processed_documents_organization_id ON processed_documents (organization_id);
CREATE INDEX ix_processed_documents_uploaded_by ON processed_documents (uploaded_by);
CREATE INDEX ix_processed_documents_id ON processed_documents (id);
CREATE INDEX idx_documents_org_status ON processed_documents (organization_id, status);
CREATE INDEX ix_processed_documents_is_global ON processed_documents (is_global);
CREATE INDEX idx_documents_scope_type ON processed_documents (scope, document_type);
CREATE INDEX ix_processed_documents_status ON processed_documents (status);
CREATE INDEX idx_recommendations_control ON ai_recommendations (control_id);
CREATE INDEX ix_ai_recommendations_assessment_id ON ai_recommendations (assessment_id);
CREATE INDEX idx_recommendations_type ON ai_recommendations (recommendation_type);
CREATE INDEX idx_recommendations_active ON ai_recommendations (is_active);
CREATE INDEX ix_ai_recommendations_organization_id ON ai_recommendations (organization_id);
CREATE INDEX ix_ai_recommendations_control_id ON ai_recommendations (control_id);
CREATE INDEX ix_ai_recommendations_id ON ai_recommendations (id);
CREATE INDEX idx_recommendations_assessment ON ai_recommendations (assessment_id);
CREATE INDEX idx_recommendations_organization ON ai_recommendations (organization_id);
CREATE INDEX ix_assessment_activity_last_active ON assessment_activity (last_active);
CREATE INDEX ix_assessment_activity_assessment_id ON assessment_activity (assessment_id);
CREATE INDEX ix_assessment_activity_user_id ON assessment_activity (user_id);
CREATE INDEX ix_assessment_activity_id ON assessment_activity (id);
CREATE INDEX ix_assessment_audit_log_id ON assessment_audit_log (id);
CREATE INDEX ix_assessment_audit_log_assessment_id ON assessment_audit_log (assessment_id);
CREATE INDEX ix_assessment_audit_log_action ON assessment_audit_log (action);
CREATE INDEX ix_assessment_audit_log_user_id ON assessment_audit_log (user_id);
CREATE INDEX ix_assessment_progress_assessment_id ON assessment_progress (assessment_id);
CREATE INDEX ix_assessment_progress_id ON assessment_progress (id);
CREATE INDEX ix_assessment_progress_measure_id ON assessment_progress (measure_id);
CREATE INDEX ix_compliance_scores_id ON compliance_scores (id);
CREATE INDEX idx_compliance_score_assessment ON compliance_scores (assessment_id);
CREATE INDEX idx_compliance_score_level ON compliance_scores (security_level);
CREATE INDEX ix_document_chunks_id ON document_chunks (id);
CREATE INDEX idx_chunks_document_idx ON document_chunks (processed_document_id, chunk_index);
CREATE INDEX ix_document_chunks_processed_document_id ON document_chunks (processed_document_id);
CREATE INDEX idx_chunks_embedding ON document_chunks USING ivfflat (embedding) WITH (lists = 100);
CREATE INDEX ix_document_generation_jobs_assessment_id ON document_generation_jobs (assessment_id);
CREATE INDEX ix_document_generation_jobs_id ON document_generation_jobs (id);
CREATE INDEX ix_document_generation_jobs_document_id ON document_generation_jobs (document_id);
CREATE INDEX idx_generation_jobs_assessment ON document_generation_jobs (assessment_id);
CREATE INDEX ix_document_generation_jobs_organization_id ON document_generation_jobs (organization_id);
CREATE INDEX idx_generation_jobs_organization ON document_generation_jobs (organization_id);
CREATE INDEX idx_generation_jobs_status ON document_generation_jobs (status);
CREATE INDEX idx_generation_jobs_template ON document_generation_jobs (template_id);
CREATE INDEX ix_document_generation_jobs_template_id ON document_generation_jobs (template_id);
CREATE INDEX idx_generation_jobs_document ON document_generation_jobs (document_id);
CREATE INDEX ix_document_versions_document_id ON document_versions (document_id);
CREATE INDEX ix_document_versions_id ON document_versions (id);
CREATE INDEX idx_measure_score_assessment ON measure_scores (assessment_id);
CREATE INDEX ix_measure_scores_id ON measure_scores (id);
CREATE INDEX idx_measure_score_compliance ON measure_scores (assessment_id, passes_compliance);
CREATE INDEX ix_submeasures_id ON submeasures (id);
CREATE INDEX ix_submeasures_measure_id ON submeasures (measure_id);
CREATE INDEX ix_assessment_answers_id ON assessment_answers (id);
CREATE INDEX ix_assessment_answers_assessment_id ON assessment_answers (assessment_id);
CREATE INDEX ix_assessment_answers_answered_by ON assessment_answers (answered_by);
CREATE INDEX ix_assessment_answers_control_id ON assessment_answers (control_id);
CREATE INDEX ix_assessment_answers_submeasure_id ON assessment_answers (submeasure_id);
CREATE INDEX ix_assessment_assignments_id ON assessment_assignments (id);
CREATE INDEX ix_assessment_assignments_status ON assessment_assignments (status);
CREATE INDEX ix_assessment_assignments_assessment_id ON assessment_assignments (assessment_id);
CREATE INDEX ix_assessment_assignments_user_id ON assessment_assignments (user_id);
CREATE INDEX ix_assessment_results_id ON assessment_results (id);
CREATE INDEX ix_assessment_results_assessment_id ON assessment_results (assessment_id);
CREATE INDEX ix_assessment_results_submeasure_id ON assessment_results (submeasure_id);
CREATE INDEX ix_assessment_results_measure_id ON assessment_results (measure_id);
CREATE INDEX ix_control_requirements_id ON control_requirements (id);
CREATE INDEX ix_control_requirements_level ON control_requirements (level);
CREATE INDEX ix_control_requirements_submeasure_id ON control_requirements (submeasure_id);
CREATE INDEX ix_control_requirements_control_id ON control_requirements (control_id);
CREATE INDEX idx_control_score_control ON control_score_history (control_id);
CREATE INDEX ix_control_score_history_id ON control_score_history (id);
CREATE INDEX idx_control_score_submeasure ON control_score_history (submeasure_id);
CREATE INDEX idx_control_score_assessment ON control_score_history (assessment_id);
CREATE INDEX ix_control_submeasure_mapping_control_id ON control_submeasure_mapping (control_id);
CREATE INDEX ix_control_submeasure_mapping_submeasure_id ON control_submeasure_mapping (submeasure_id);
CREATE INDEX ix_control_submeasure_mapping_id ON control_submeasure_mapping (id);
CREATE INDEX ix_submeasure_scores_id ON submeasure_scores (id);
CREATE INDEX idx_submeasure_score_compliance ON submeasure_scores (assessment_id, passes_overall);
CREATE INDEX idx_submeasure_score_assessment ON submeasure_scores (assessment_id);