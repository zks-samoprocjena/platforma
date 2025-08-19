# AI Assessment Frontend

Croatian-first frontend application for ZKS/NIS2 compliance self-assessment using Next.js 14 with Croatian and English internationalization.

## Features

- **Croatian/English i18n**: Primary Croatian interface with English fallback
- **Next.js 14 App Router**: Modern React with server-side rendering
- **Authentication**: JWT-based authentication with next-auth
- **API Integration**: Full integration with 23 backend endpoints
- **Croatian Typography**: Optimized for Croatian diacritic characters
- **Responsive Design**: Mobile-first design with Tailwind CSS + DaisyUI
- **State Management**: React Query for API state, Zustand for UI state
- **Type Safety**: Full TypeScript implementation
- **Testing**: Jest + React Testing Library with 90%+ coverage

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Backend API running on port 8000

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env.local
```

3. Configure environment variables:
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here
NEXT_PUBLIC_API_URL=http://localhost:8000
BACKEND_URL=http://localhost:8000
```

### Development

```bash
# Start development server
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint

# Format code
npm run format
```

## Architecture

### Technology Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS + DaisyUI
- **Internationalization**: next-intl
- **Authentication**: next-auth
- **API Client**: Axios with React Query
- **State Management**: Zustand
- **Testing**: Jest + React Testing Library
- **Charts**: Chart.js + react-chartjs-2

### Project Structure

```
frontend/
├── app/                    # Next.js App Router
│   ├── [locale]/          # Internationalized routes
│   │   ├── page.tsx       # Home page
│   │   └── layout.tsx     # Locale layout
│   ├── api/               # API routes
│   └── globals.css        # Global styles
├── components/            # React components
├── hooks/                 # Custom React hooks
│   └── api/              # API-specific hooks
├── lib/                  # Utility libraries
├── providers/            # React context providers
├── stores/               # Zustand stores
├── types/                # TypeScript type definitions
├── messages/             # Translation files
│   ├── hr.json          # Croatian translations
│   └── en.json          # English translations
└── __tests__/           # Test files
```

### Croatian Language Support

- **Primary Language**: Croatian (hr) with comprehensive compliance terminology
- **Diacritic Support**: Full support for č, ć, đ, š, ž characters
- **Cultural Appropriateness**: UI patterns adapted for Croatian business practices
- **Compliance Terms**: Accurate translation of ZKS/NIS2 terminology

### API Integration

Integrates with 23 backend endpoints across 3 categories:

**Assessment APIs (15 endpoints)**:
- CRUD operations for assessments
- Real-time progress tracking
- Batch answer submission
- Results and analytics

**AI/RAG APIs (8 endpoints)**:
- Croatian Q&A assistance
- Document search
- Control-specific guidance
- Improvement recommendations

**Compliance APIs (8 endpoints)**:
- Measure and control data
- Compliance statistics
- Reference information

## Development Guidelines

### Code Style

- Use TypeScript for all new code
- Follow Croatian-first naming conventions
- Implement proper error handling with Croatian messages
- Write tests for all new components and functions
- Use Tailwind CSS for styling

### Croatian Language Guidelines

1. **Primary Interface**: All user-facing text should be in Croatian
2. **Diacritic Preservation**: Maintain Croatian characters in all contexts
3. **Compliance Terminology**: Use standardized Croatian cybersecurity terms
4. **Cultural Adaptation**: Follow Croatian business practices and conventions

### Testing

- Unit tests for components, hooks, and utilities
- Integration tests for API interactions
- Croatian language validation in tests
- Minimum 90% test coverage

### Performance

- Code splitting for route-based optimization
- Lazy loading for large components
- React Query caching for API responses
- Optimistic updates for better UX

## Deployment

### Docker

```bash
# Build container
docker build -t ai-assessment-frontend .

# Run container
docker run -p 3000:3000 ai-assessment-frontend
```

### Production Build

```bash
# Create optimized production build
npm run build

# Start production server
npm start
```

## Contributing

1. Follow Croatian-first development principles
2. Write comprehensive tests
3. Use conventional commit messages
4. Ensure Croatian language accuracy
5. Maintain TypeScript strict mode compliance

## License

Private project for ZKS/NIS2 compliance assessment.