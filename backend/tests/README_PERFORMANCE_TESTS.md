# Performance Testing Guide

This guide explains how to run real performance tests for the ZKS/NIS2 compliance platform to gather metrics for thesis documentation.

## Prerequisites

Before running performance tests, ensure all services are running:

```bash
# Start all services
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Verify services are healthy
docker ps
```

Required services:
- PostgreSQL with pgvector extension
- Redis
- Ollama with llama3:8b model
- Backend API

## Running Performance Tests

### 1. Basic Performance Tests (Mocked)

These tests use mocks and are useful for CI/CD:

```bash
docker exec assessment-api python tests/test_performance_basic.py
```

### 2. Assessment Performance Tests

Tests assessment engine performance with database:

```bash
docker exec assessment-api pytest tests/test_performance_assessment.py -v
```

### 3. Real Metrics Performance Tests

**This is the main test suite for thesis metrics:**

```bash
docker exec assessment-api python tests/test_performance_real_metrics.py
```

This comprehensive test suite measures:
- **Embedding Generation**: Real 768-dimensional vector generation using sentence-transformers
- **LLM Inference**: Actual Ollama/Llama3 response times  
- **Vector Search**: pgvector similarity search performance
- **Document Processing**: End-to-end pipeline timing
- **Redis Cache**: Cache hit rates and latency

## Understanding the Output

The test generates:
1. **Console output** with real-time metrics
2. **JSON file** (`performance_metrics_YYYYMMDD_HHMMSS.json`) with detailed results

### Key Metrics for Thesis

Look for these specific metrics in the output:

```
METRICS FOR THESIS:

Embedding Generation (single doc):
  Average: 145.23ms
  95th percentile: 156.78ms
  99th percentile: 162.34ms

Vector Search (no cache):
  Average: 89.45ms
  95th percentile: 95.12ms
  99th percentile: 98.56ms

LLM Inference (simple_question):
  Response time: 2.34s
  Throughput: ~18.5 tokens/sec
```

## Running Individual Test Suites

You can run specific performance tests:

```bash
# Only embedding performance
docker exec assessment-api python -c "import asyncio; from tests.test_performance_real_metrics import test_real_embedding_performance; asyncio.run(test_real_embedding_performance())"

# Only LLM inference  
docker exec assessment-api python -c "import asyncio; from tests.test_performance_real_metrics import test_real_llm_inference; asyncio.run(test_real_llm_inference())"

# Only vector search
docker exec assessment-api python -c "import asyncio; from tests.test_performance_real_metrics import test_real_vector_search_performance; asyncio.run(test_real_vector_search_performance())"
```

## Performance Tuning Tips

1. **GPU Acceleration**: Ensure NVIDIA GPU is available for Ollama:
   ```bash
   docker exec ollama nvidia-smi
   ```

2. **Redis Performance**: Monitor Redis memory usage:
   ```bash
   docker exec redis redis-cli INFO memory
   ```

3. **PostgreSQL Tuning**: Check pgvector index usage:
   ```sql
   SELECT schemaname, tablename, indexname, idx_scan 
   FROM pg_stat_user_indexes 
   WHERE indexname LIKE '%embedding%';
   ```

## Interpreting Results for Thesis

When documenting performance in your thesis:

1. **Always specify test environment**: Intel i9-14900HX, 32GB RAM, RTX 4060
2. **Note configuration**: Llama3:8b with q4_K_M quantization
3. **Include both average and percentile metrics**
4. **Compare with and without caching** to show optimization impact
5. **Calculate throughput** (operations/second) for scalability analysis

## Troubleshooting

If tests fail:

1. **Ollama not responding**: 
   ```bash
   docker logs ollama
   curl http://localhost:11434/api/tags
   ```

2. **Database connection issues**:
   ```bash
   docker exec assessment-api python -c "from app.core.database import engine; print(engine.url)"
   ```

3. **Redis connection issues**:
   ```bash
   docker exec redis redis-cli PING
   ```

## Generating Performance Graphs

Use the JSON output to create graphs:

```python
import json
import matplotlib.pyplot as plt

# Load results
with open('performance_metrics_20250730_143022.json', 'r') as f:
    data = json.load(f)

# Extract metrics for graphing
# ... create visualizations for thesis
```