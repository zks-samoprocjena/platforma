# AI-Assisted Compliance Assessment Platform

A multi-tenant compliance assessment platform for ZKS/NIS2 (Croatian cybersecurity regulations) that visualizes legal obligations, guides users through questionnaires, and generates AI-powered recommendations.

## Features

- 📊 **Compliance Assessment**: Comprehensive questionnaire system for ZKS/NIS2 compliance
- 🤖 **AI-Powered Recommendations**: Intelligent suggestions based on assessment results
- 📈 **Multi-Level Security**: Support for three security levels (Osnovna, Srednja, Napredna)
- 🏢 **Multi-Tenant Architecture**: Secure tenant isolation with role-based access control
- 📄 **Document Generation**: Automated PDF reports and compliance documentation
- 🔍 **Semantic Search**: Vector-based search through compliance documentation
- 🌐 **Internationalization**: Full support for Croatian and English languages

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy 2.0, PostgreSQL with pgvector
- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **AI/ML**: Ollama (Llama 3), OpenAI API support, SRoBERTa embeddings
- **Authentication**: Keycloak (OpenID Connect)
- **Infrastructure**: Docker, Redis, nginx

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- Python 3.11+ (for local development)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/compliance-assessment-platform.git
cd compliance-assessment-platform
```

2. Copy environment templates:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. Configure your environment variables in the `.env` files

4. Initialize the database:
```bash
# Option A: Using provided schema (recommended for fresh install)
docker exec -i postgres psql -U postgres < database/init_db.sql

# Option B: Generate migrations from models
cd backend
alembic init migrations
alembic revision --autogenerate -m "Initial schema"
alembic upgrade head
```

5. Start the development environment:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

6. Access the application:
- Frontend: http://localhost:3000
- API Documentation: http://localhost:8000/docs
- Keycloak Admin: http://localhost:8080

## Development

### Backend Development

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
# Backend tests
docker exec assessment-api pytest --cov=app --cov-report=term-missing

# Frontend tests
docker exec gateway npm test -- --coverage
```

## Database Schema

The project includes a complete PostgreSQL schema with:
- Pre-generated schema file in `/database/schema.sql`
- Database initialization script in `/database/init_db.sql`
- Support for UUID primary keys and vector embeddings
- Multi-tenant architecture with organization-based isolation

To set up the database:
1. Use the provided schema for a fresh installation
2. Or generate migrations from SQLAlchemy models using Alembic

## API Documentation

The API documentation is automatically generated and available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues and questions, please use the [GitHub Issues](https://github.com/yourusername/compliance-assessment-platform/issues) page.

## Acknowledgments

- Croatian Agency for Cybersecurity (ZISS) for ZKS/NIS2 compliance framework
- Open source community for the amazing tools and libraries
