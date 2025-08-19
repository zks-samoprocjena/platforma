'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { 
  HelpCircle, 
  Search, 
  Book, 
  FileText, 
  Video, 
  MessageCircle,
  Phone,
  Mail,
  ExternalLink,
  Download,
  ChevronDown,
  ChevronRight,
  Shield,
  BarChart3,
  Users,
  Settings,
  AlertTriangle,
  CheckCircle,
  Clock,
  Globe,
  Building2
} from 'lucide-react'
import Link from 'next/link'

interface FAQItem {
  id: string
  question: string
  answer: string
  category: 'general' | 'assessment' | 'compliance' | 'technical' | 'account'
  priority: 'high' | 'medium' | 'low'
}

interface GuideSection {
  id: string
  title: string
  description: string
  icon: typeof Book
  items: {
    id: string
    title: string
    description: string
    type: 'video' | 'pdf' | 'article'
    duration?: string
    url: string
  }[]
}

export function HelpClient() {
  const t = useTranslations()
  const tHelp = useTranslations('Help')
  
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null)

  // FAQ data using translations
  const faqItems: FAQItem[] = [
    {
      id: 'faq-1',
      question: tHelp('faq.items.zks_nis2.question'),
      answer: tHelp('faq.items.zks_nis2.answer'),
      category: 'compliance',
      priority: 'high'
    },
    {
      id: 'faq-2',
      question: tHelp('faq.items.create_assessment.question'),
      answer: tHelp('faq.items.create_assessment.answer'),
      category: 'assessment',
      priority: 'high'
    },
    {
      id: 'faq-3',
      question: tHelp('faq.items.security_levels.question'),
      answer: tHelp('faq.items.security_levels.answer'),
      category: 'assessment',
      priority: 'high'
    },
    {
      id: 'faq-4',
      question: tHelp('faq.items.scoring.question'),
      answer: tHelp('faq.items.scoring.answer'),
      category: 'assessment',
      priority: 'medium'
    },
    {
      id: 'faq-5',
      question: tHelp('faq.items.duration.question'),
      answer: tHelp('faq.items.duration.answer'),
      category: 'general',
      priority: 'medium'
    },
    {
      id: 'faq-6',
      question: tHelp('faq.items.export.question'),
      answer: tHelp('faq.items.export.answer'),
      category: 'technical',
      priority: 'medium'
    },
    {
      id: 'faq-7',
      question: tHelp('faq.items.account_settings.question'),
      answer: tHelp('faq.items.account_settings.answer'),
      category: 'account',
      priority: 'low'
    },
    {
      id: 'faq-8',
      question: tHelp('faq.items.gdpr_compliance.question'),
      answer: tHelp('faq.items.gdpr_compliance.answer'),
      category: 'compliance',
      priority: 'medium'
    }
  ]

  // Guide sections using translations
  const guidesSections: GuideSection[] = [
    {
      id: 'getting-started',
      title: tHelp('guides.sections.gettingStarted.title'),
      description: tHelp('guides.sections.gettingStarted.description'),
      icon: Book,
      items: [
        {
          id: 'intro-video',
          title: tHelp('guides.sections.gettingStarted.items.introVideo.title'),
          description: tHelp('guides.sections.gettingStarted.items.introVideo.description'),
          type: 'video',
          duration: '8 min',
          url: '#'
        },
        {
          id: 'first-assessment',
          title: tHelp('guides.sections.gettingStarted.items.firstAssessment.title'),
          description: tHelp('guides.sections.gettingStarted.items.firstAssessment.description'),
          type: 'article',
          url: '#'
        },
        {
          id: 'user-guide',
          title: tHelp('guides.sections.gettingStarted.items.userGuide.title'),
          description: tHelp('guides.sections.gettingStarted.items.userGuide.description'),
          type: 'pdf',
          url: '#'
        }
      ]
    },
    {
      id: 'compliance',
      title: tHelp('guides.sections.compliance.title'),
      description: tHelp('guides.sections.compliance.description'),
      icon: Shield,
      items: [
        {
          id: 'zks-overview',
          title: tHelp('guides.sections.compliance.items.zksOverview.title'),
          description: tHelp('guides.sections.compliance.items.zksOverview.description'),
          type: 'pdf',
          url: '#'
        },
        {
          id: 'nis2-guide',
          title: tHelp('guides.sections.compliance.items.nis2Guide.title'),
          description: tHelp('guides.sections.compliance.items.nis2Guide.description'),
          type: 'article',
          url: '#'
        },
        {
          id: 'sector-requirements',
          title: tHelp('guides.sections.compliance.items.sectorRequirements.title'),
          description: tHelp('guides.sections.compliance.items.sectorRequirements.description'),
          type: 'pdf',
          url: '#'
        }
      ]
    },
    {
      id: 'assessment',
      title: tHelp('guides.sections.assessment.title'),
      description: tHelp('guides.sections.assessment.description'),
      icon: BarChart3,
      items: [
        {
          id: 'assessment-methodology',
          title: tHelp('guides.sections.assessment.items.methodology.title'),
          description: tHelp('guides.sections.assessment.items.methodology.description'),
          type: 'video',
          duration: '12 min',
          url: '#'
        },
        {
          id: 'evidence-collection',
          title: tHelp('guides.sections.assessment.items.evidenceCollection.title'),
          description: tHelp('guides.sections.assessment.items.evidenceCollection.description'),
          type: 'article',
          url: '#'
        },
        {
          id: 'collaboration',
          title: tHelp('guides.sections.assessment.items.collaboration.title'),
          description: tHelp('guides.sections.assessment.items.collaboration.description'),
          type: 'article',
          url: '#'
        }
      ]
    }
  ]

  const categories = [
    { id: 'all', label: tHelp('faq.categories.all'), icon: HelpCircle },
    { id: 'general', label: tHelp('faq.categories.general'), icon: Globe },
    { id: 'assessment', label: tHelp('faq.categories.assessment'), icon: BarChart3 },
    { id: 'compliance', label: tHelp('faq.categories.compliance'), icon: Shield },
    { id: 'technical', label: tHelp('faq.categories.technical'), icon: Settings },
    { id: 'account', label: tHelp('faq.categories.account'), icon: Users }
  ]

  // Filter FAQ items based on search and category
  const filteredFAQs = faqItems.filter(item => {
    const matchesSearch = !searchQuery || 
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory
    
    return matchesSearch && matchesCategory
  })

  const toggleFAQ = (id: string) => {
    setExpandedFAQ(expandedFAQ === id ? null : id)
  }

  const getCategoryIcon = (category: string) => {
    const categoryData = categories.find(c => c.id === category)
    return categoryData?.icon || HelpCircle
  }

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">
            {tHelp('header.title')}
          </h1>
          <p className="text-lg text-base-content/70">
            {tHelp('header.subtitle')}
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="assessment-card p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center mb-4">
              <Video className="h-8 w-8 text-primary mr-3" />
              <h3 className="text-lg font-semibold">{tHelp('quickActions.videoGuides.title')}</h3>
            </div>
            <p className="text-base-content/70 mb-4">
              {tHelp('quickActions.videoGuides.description')}
            </p>
            <div className="flex items-center text-primary font-medium">
              <span>{tHelp('quickActions.videoGuides.button')}</span>
              <ExternalLink className="h-4 w-4 ml-2" />
            </div>
          </div>

          <div className="assessment-card p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center mb-4">
              <MessageCircle className="h-8 w-8 text-primary mr-3" />
              <h3 className="text-lg font-semibold">{tHelp('quickActions.contactSupport.title')}</h3>
            </div>
            <p className="text-base-content/70 mb-4">
              {tHelp('quickActions.contactSupport.description')}
            </p>
            <div className="flex items-center text-primary font-medium">
              <span>{tHelp('quickActions.contactSupport.button')}</span>
              <ExternalLink className="h-4 w-4 ml-2" />
            </div>
          </div>

          <div className="assessment-card p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center mb-4">
              <Download className="h-8 w-8 text-primary mr-3" />
              <h3 className="text-lg font-semibold">{tHelp('quickActions.documentation.title')}</h3>
            </div>
            <p className="text-base-content/70 mb-4">
              {tHelp('quickActions.documentation.description')}
            </p>
            <div className="flex items-center text-primary font-medium">
              <span>{tHelp('quickActions.documentation.button')}</span>
              <Download className="h-4 w-4 ml-2" />
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - FAQ */}
          <div className="lg:col-span-2">
            {/* FAQ Section */}
            <div className="assessment-card mb-8">
              <div className="flex items-center mb-6">
                <HelpCircle className="h-6 w-6 text-primary mr-3" />
                <h2 className="text-2xl font-semibold">{tHelp('faq.title')}</h2>
              </div>

              {/* Search and Filter */}
              <div className="mb-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-base-content/50" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="form-input pl-10 w-full"
                      placeholder={tHelp('faq.search.placeholder')}
                    />
                  </div>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="select select-bordered"
                  >
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* FAQ Items */}
              <div className="space-y-4">
                {filteredFAQs.length === 0 ? (
                  <div className="text-center py-8">
                    <HelpCircle className="h-16 w-16 text-base-content/30 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-base-content/70 mb-2">
                      {tHelp('faq.noResults.title')}
                    </h3>
                    <p className="text-base-content/50">
                      {tHelp('faq.noResults.message')}
                    </p>
                  </div>
                ) : (
                  filteredFAQs.map((faq) => {
                    const CategoryIcon = getCategoryIcon(faq.category)
                    const isExpanded = expandedFAQ === faq.id
                    
                    return (
                      <div
                        key={faq.id}
                        className="border border-base-300 rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() => toggleFAQ(faq.id)}
                          className="w-full p-4 text-left hover:bg-base-100 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center flex-1">
                              <CategoryIcon className="h-5 w-5 text-primary mr-3 flex-shrink-0" />
                              <span className="font-medium text-base-content">
                                {faq.question}
                              </span>
                              {faq.priority === 'high' && (
                                <span className="badge badge-warning badge-sm ml-2">{tHelp('faq.priority.high')}</span>
                              )}
                            </div>
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-base-content/50" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-base-content/50" />
                            )}
                          </div>
                        </button>
                        
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-0">
                            <div className="pl-8 text-base-content/80">
                              {faq.answer}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Guides and Contact */}
          <div className="lg:col-span-1 space-y-6">
            {/* Guide Sections */}
            <div className="assessment-card">
              <div className="flex items-center mb-6">
                <Book className="h-6 w-6 text-primary mr-3" />
                <h2 className="text-xl font-semibold">{tHelp('guides.title')}</h2>
              </div>

              <div className="space-y-6">
                {guidesSections.map((section) => {
                  const SectionIcon = section.icon
                  
                  return (
                    <div key={section.id}>
                      <div className="flex items-center mb-3">
                        <SectionIcon className="h-5 w-5 text-primary mr-2" />
                        <h3 className="font-medium text-base-content">{section.title}</h3>
                      </div>
                      <p className="text-sm text-base-content/70 mb-3">
                        {section.description}
                      </p>
                      
                      <div className="space-y-2">
                        {section.items.map((item) => (
                          <Link
                            key={item.id}
                            href={item.url}
                            className="block p-3 bg-base-100 rounded-lg hover:bg-base-200 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                {item.type === 'video' && <Video className="h-4 w-4 text-success mr-2" />}
                                {item.type === 'pdf' && <FileText className="h-4 w-4 text-error mr-2" />}
                                {item.type === 'article' && <Book className="h-4 w-4 text-info mr-2" />}
                                <div>
                                  <div className="text-sm font-medium text-base-content">
                                    {item.title}
                                  </div>
                                  <div className="text-xs text-base-content/60">
                                    {item.description}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center text-xs text-base-content/50">
                                {item.duration && <span>{item.duration}</span>}
                                <ExternalLink className="h-3 w-3 ml-1" />
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Contact Support */}
            <div className="assessment-card">
              <div className="flex items-center mb-6">
                <MessageCircle className="h-6 w-6 text-primary mr-3" />
                <h2 className="text-xl font-semibold">{tHelp('support.title')}</h2>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-base-content/70">
                  {tHelp('support.description')}
                </p>

                <div className="space-y-3">
                  <div className="flex items-center p-3 bg-base-100 rounded-lg">
                    <Mail className="h-5 w-5 text-primary mr-3" />
                    <div>
                      <div className="text-sm font-medium">{tHelp('support.email.title')}</div>
                      <div className="text-xs text-base-content/70">{tHelp('support.email.address')}</div>
                    </div>
                  </div>

                  <div className="flex items-center p-3 bg-base-100 rounded-lg">
                    <Phone className="h-5 w-5 text-primary mr-3" />
                    <div>
                      <div className="text-sm font-medium">{tHelp('support.phone.title')}</div>
                      <div className="text-xs text-base-content/70">{tHelp('support.phone.number')}</div>
                    </div>
                  </div>

                  <div className="flex items-center p-3 bg-base-100 rounded-lg">
                    <Clock className="h-5 w-5 text-primary mr-3" />
                    <div>
                      <div className="text-sm font-medium">{tHelp('support.hours.title')}</div>
                      <div className="text-xs text-base-content/70">{tHelp('support.hours.time')}</div>
                    </div>
                  </div>
                </div>

                <button className="btn btn-primary w-full">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  {tHelp('support.button')}
                </button>
              </div>
            </div>

            {/* Status */}
            <div className="assessment-card">
              <div className="flex items-center mb-4">
                <AlertTriangle className="h-5 w-5 text-success mr-2" />
                <h3 className="font-medium">{tHelp('status.title')}</h3>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-base-content/70">{tHelp('status.allServices')}</span>
                <div className="flex items-center">
                  <div className="h-2 w-2 bg-success rounded-full mr-2"></div>
                  <span className="text-xs text-success">{tHelp('status.online')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  )
}