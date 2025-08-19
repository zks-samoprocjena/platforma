import { z } from 'zod'

// Croatian validation messages
const croatianMessages = {
  required: 'Ovo polje je obavezno',
  invalidEmail: 'Neispravna email adresa',
  minLength: (min: number) => `Minimalno ${min} znakova`,
  maxLength: (max: number) => `Maksimalno ${max} znakova`,
  invalidScore: 'Ocjena mora biti između 1 i 5',
  invalidSecurityLevel: 'Neispravna razina sigurnosti',
  invalidUrl: 'Neispravna URL adresa',
  future: 'Datum mora biti u budućnosti',
  past: 'Datum mora biti u prošlosti'
}

// Assessment validation schemas
export const createAssessmentSchema = z.object({
  title: z
    .string()
    .min(1, croatianMessages.required)
    .min(3, croatianMessages.minLength(3))
    .max(100, croatianMessages.maxLength(100)),
  description: z
    .string()
    .max(500, croatianMessages.maxLength(500))
    .optional(),
  security_level: z
    .enum(['osnovna', 'srednja', 'napredna'], {
      errorMap: () => ({ message: croatianMessages.invalidSecurityLevel })
    }),
  due_date: z
    .string()
    .datetime()
    .refine(
      (date) => new Date(date) > new Date(), 
      { message: croatianMessages.future }
    )
    .optional(),
  tags: z
    .array(z.string())
    .max(10, 'Maksimalno 10 oznaka')
    .optional()
})

export const updateAssessmentSchema = createAssessmentSchema.partial()

// Assessment answer validation
export const assessmentAnswerSchema = z.object({
  control_id: z.string().uuid('Neispravan ID kontrole'),
  documentation_score: z
    .number()
    .int()
    .min(1, croatianMessages.invalidScore)
    .max(5, croatianMessages.invalidScore)
    .optional(),
  implementation_score: z
    .number()
    .int()
    .min(1, croatianMessages.invalidScore)
    .max(5, croatianMessages.invalidScore)
    .optional(),
  comments: z
    .string()
    .max(1000, croatianMessages.maxLength(1000))
    .optional(),
  evidence_files: z
    .array(z.string())
    .max(5, 'Maksimalno 5 datoteka')
    .optional()
}).refine(
  (data) => data.documentation_score || data.implementation_score || data.comments,
  {
    message: 'Potrebno je unijeti barem jednu ocjenu ili komentar',
    path: ['documentation_score']
  }
)

export const submitAnswersSchema = z.object({
  answers: z
    .array(assessmentAnswerSchema)
    .min(1, 'Potrebno je odgovoriti na barem jednu kontrolu')
})

// User validation schemas
export const userProfileSchema = z.object({
  first_name: z
    .string()
    .min(1, croatianMessages.required)
    .min(2, croatianMessages.minLength(2))
    .max(50, croatianMessages.maxLength(50)),
  last_name: z
    .string()
    .min(1, croatianMessages.required)
    .min(2, croatianMessages.minLength(2))
    .max(50, croatianMessages.maxLength(50)),
  email: z
    .string()
    .min(1, croatianMessages.required)
    .email(croatianMessages.invalidEmail),
  organization: z
    .string()
    .min(1, croatianMessages.required)
    .max(100, croatianMessages.maxLength(100)),
  position: z
    .string()
    .max(100, croatianMessages.maxLength(100))
    .optional(),
  phone: z
    .string()
    .regex(/^[\+]?[0-9\s\-\(\)]{8,15}$/, 'Neispravan broj telefona')
    .optional()
})

// Search and filter validation
export const searchSchema = z.object({
  query: z
    .string()
    .max(100, croatianMessages.maxLength(100))
    .optional(),
  status: z
    .enum(['all', 'draft', 'in_progress', 'review', 'completed', 'abandoned', 'archived'])
    .optional(),
  security_level: z
    .enum(['all', 'osnovna', 'srednja', 'napredna'])
    .optional(),
  sort: z
    .enum(['updated', 'created', 'title', 'status'])
    .optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional(),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
})

// AI interaction validation
export const aiQuestionSchema = z.object({
  question: z
    .string()
    .min(1, croatianMessages.required)
    .min(5, croatianMessages.minLength(5))
    .max(500, croatianMessages.maxLength(500)),
  organization_id: z
    .string()
    .uuid('Neispravan ID organizacije'),
  assessment_id: z
    .string()
    .uuid('Neispravan ID procjene')
    .optional(),
  control_id: z
    .string()
    .uuid('Neispravan ID kontrole')
    .optional(),
  context: z
    .string()
    .max(2000, croatianMessages.maxLength(2000))
    .optional(),
  language: z
    .enum(['hr', 'en'])
    .optional()
})

export const aiSearchSchema = z.object({
  query: z
    .string()
    .min(1, croatianMessages.required)
    .min(3, croatianMessages.minLength(3))
    .max(200, croatianMessages.maxLength(200)),
  filters: z.object({
    document_type: z.string().optional(),
    category: z.string().optional(),
    security_level: z.enum(['osnovna', 'srednja', 'napredna']).optional()
  }).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
})

// Helper functions for validation
export function validateField<T>(schema: z.ZodSchema<T>, value: unknown): {
  success: boolean
  data?: T
  error?: string
} {
  try {
    const data = schema.parse(value)
    return { success: true, data }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: error.errors[0]?.message || 'Neispravna vrijednost'
      }
    }
    return { success: false, error: 'Neočekivana greška validacije' }
  }
}

export function getFieldErrors<T>(schema: z.ZodSchema<T>, value: unknown): Record<string, string> {
  try {
    schema.parse(value)
    return {}
  } catch (error) {
    if (error instanceof z.ZodError) {
      return error.errors.reduce((acc, err) => {
        const path = err.path.join('.')
        acc[path] = err.message
        return acc
      }, {} as Record<string, string>)
    }
    return { general: 'Neočekivana greška validacije' }
  }
}

// Custom validation hooks
export function useFormValidation<T>(schema: z.ZodSchema<T>) {
  return {
    validate: (value: unknown) => validateField(schema, value),
    getErrors: (value: unknown) => getFieldErrors(schema, value),
    isValid: (value: unknown) => {
      try {
        schema.parse(value)
        return true
      } catch {
        return false
      }
    }
  }
}

// Score validation specifically for assessment controls
export function validateScore(score: number | null | undefined, required: boolean = false): string | null {
  if (score === null || score === undefined) {
    return required ? croatianMessages.required : null
  }
  
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return croatianMessages.invalidScore
  }
  
  return null
}

// Croatian-specific validation
export function validateCroatianText(text: string, maxLength: number = 1000): string | null {
  if (!text.trim()) {
    return croatianMessages.required
  }
  
  if (text.length > maxLength) {
    return croatianMessages.maxLength(maxLength)
  }
  
  // Basic text validation - allow Croatian characters and common punctuation
  // More sophisticated validation can be added later if needed
  
  return null
}

export type CreateAssessmentData = z.infer<typeof createAssessmentSchema>
export type UpdateAssessmentData = z.infer<typeof updateAssessmentSchema>
export type AssessmentAnswerData = z.infer<typeof assessmentAnswerSchema>
export type SubmitAnswersData = z.infer<typeof submitAnswersSchema>
export type UserProfileData = z.infer<typeof userProfileSchema>
export type SearchData = z.infer<typeof searchSchema>
export type AIQuestionData = z.infer<typeof aiQuestionSchema>
export type AISearchData = z.infer<typeof aiSearchSchema>