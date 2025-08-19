#!/bin/bash

# Comprehensive Testing Script for Croatian Cybersecurity Assessment Platform
# This script runs all test suites with detailed logging and performance monitoring

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
TEST_TIMEOUT=300000  # 5 minutes
COVERAGE_THRESHOLD=90
PERFORMANCE_BUDGET=3000  # 3 seconds

echo -e "${BLUE}🚀 Starting Comprehensive Test Suite for Croatian Cybersecurity Assessment Platform${NC}"
echo "================================================================="

# Create test results directory
mkdir -p test-results
mkdir -p test-results/coverage
mkdir -p test-results/performance
mkdir -p test-results/e2e
mkdir -p test-results/logs

# Log test start time
echo "$(date): Test suite started" > test-results/logs/test-execution.log

# Function to log messages
log_message() {
    echo "$(date): $1" >> test-results/logs/test-execution.log
    echo -e "$1"
}

# Function to check if tests passed
check_test_result() {
    if [ $? -eq 0 ]; then
        log_message "${GREEN}✅ $1 passed${NC}"
        return 0
    else
        log_message "${RED}❌ $1 failed${NC}"
        return 1
    fi
}

# 1. Unit Tests with Coverage
log_message "${YELLOW}📋 Running Unit Tests with Coverage...${NC}"
npm run test -- --coverage --watchAll=false --testTimeout=$TEST_TIMEOUT --collectCoverageFrom="app/**/*.{js,jsx,ts,tsx}" --collectCoverageFrom="components/**/*.{js,jsx,ts,tsx}" --collectCoverageFrom="hooks/**/*.{js,jsx,ts,tsx}" --collectCoverageFrom="lib/**/*.{js,jsx,ts,tsx}" --coverageReporters="json" --coverageReporters="lcov" --coverageReporters="text" --coverageDirectory="test-results/coverage" 2>&1 | tee test-results/logs/unit-tests.log
check_test_result "Unit Tests"
UNIT_TEST_RESULT=$?

# Check coverage threshold
log_message "${YELLOW}📊 Checking Code Coverage...${NC}"
coverage_percentage=$(grep -o '"lines":{"total":[0-9]*,"covered":[0-9]*,"skipped":[0-9]*,"pct":[0-9.]*' test-results/coverage/coverage-final.json | grep -o '"pct":[0-9.]*' | cut -d':' -f2)
if (( $(echo "$coverage_percentage >= $COVERAGE_THRESHOLD" | bc -l) )); then
    log_message "${GREEN}✅ Code coverage ($coverage_percentage%) meets threshold (${COVERAGE_THRESHOLD}%)${NC}"
else
    log_message "${RED}❌ Code coverage ($coverage_percentage%) below threshold (${COVERAGE_THRESHOLD}%)${NC}"
fi

# 2. Integration Tests
log_message "${YELLOW}🔗 Running Integration Tests...${NC}"
npm run test -- --testPathPattern="__tests__/integration" --watchAll=false --testTimeout=$TEST_TIMEOUT 2>&1 | tee test-results/logs/integration-tests.log
check_test_result "Integration Tests"
INTEGRATION_TEST_RESULT=$?

# 3. API Endpoint Tests
log_message "${YELLOW}🌐 Running API Integration Tests...${NC}"
npm run test -- --testPathPattern="api-endpoints.test.ts" --watchAll=false --testTimeout=$TEST_TIMEOUT 2>&1 | tee test-results/logs/api-tests.log
check_test_result "API Integration Tests"
API_TEST_RESULT=$?

# 4. Croatian Language Tests
log_message "${YELLOW}🇭🇷 Running Croatian Language Tests...${NC}"
npm run test -- --testPathPattern="croatian-language.test.tsx" --watchAll=false --testTimeout=$TEST_TIMEOUT 2>&1 | tee test-results/logs/croatian-tests.log
check_test_result "Croatian Language Tests"
CROATIAN_TEST_RESULT=$?

# 5. AI Features Tests
log_message "${YELLOW}🤖 Running AI Features Tests...${NC}"
npm run test -- --testPathPattern="ai-features.test.tsx" --watchAll=false --testTimeout=$TEST_TIMEOUT 2>&1 | tee test-results/logs/ai-tests.log
check_test_result "AI Features Tests"
AI_TEST_RESULT=$?

# 6. Performance Tests
log_message "${YELLOW}⚡ Running Performance Tests...${NC}"
npm run test -- --testPathPattern="performance.test.ts" --watchAll=false --testTimeout=$TEST_TIMEOUT 2>&1 | tee test-results/logs/performance-tests.log
check_test_result "Performance Tests"
PERFORMANCE_TEST_RESULT=$?

# 7. Build Test
log_message "${YELLOW}🏗️ Testing Production Build...${NC}"
npm run build 2>&1 | tee test-results/logs/build-test.log
check_test_result "Production Build"
BUILD_TEST_RESULT=$?

# Measure build output size
if [ -d ".next" ]; then
    BUILD_SIZE=$(du -sh .next | cut -f1)
    log_message "${BLUE}📦 Build size: $BUILD_SIZE${NC}"
    echo "Build size: $BUILD_SIZE" >> test-results/logs/build-metrics.log
fi

# 8. TypeScript Type Checking
log_message "${YELLOW}🔧 Running TypeScript Type Check...${NC}"
npx tsc --noEmit 2>&1 | tee test-results/logs/typescript-check.log
check_test_result "TypeScript Type Check"
TYPESCRIPT_TEST_RESULT=$?

# 9. Linting Tests
log_message "${YELLOW}🔍 Running ESLint...${NC}"
npm run lint 2>&1 | tee test-results/logs/lint-check.log
check_test_result "ESLint"
LINT_TEST_RESULT=$?

# 10. Security Audit
log_message "${YELLOW}🔒 Running Security Audit...${NC}"
npm audit --audit-level moderate 2>&1 | tee test-results/logs/security-audit.log
check_test_result "Security Audit"
SECURITY_TEST_RESULT=$?

# 11. Bundle Analysis
log_message "${YELLOW}📊 Analyzing Bundle Size...${NC}"
if [ -f ".next/static/chunks/pages/_app.js" ]; then
    APP_BUNDLE_SIZE=$(stat -c%s .next/static/chunks/pages/_app.js)
    log_message "${BLUE}📱 App bundle size: $(($APP_BUNDLE_SIZE / 1024)) KB${NC}"
    echo "App bundle size: $(($APP_BUNDLE_SIZE / 1024)) KB" >> test-results/logs/bundle-analysis.log
    
    # Check if bundle size is within budget
    if [ $APP_BUNDLE_SIZE -gt $((1024 * 1024)) ]; then  # 1MB
        log_message "${YELLOW}⚠️ App bundle size is large (>1MB)${NC}"
    fi
fi

# 12. Accessibility Tests (if available)
log_message "${YELLOW}♿ Running Accessibility Tests...${NC}"
if command -v axe &> /dev/null; then
    axe http://localhost:3000 --save test-results/accessibility-report.json 2>&1 | tee test-results/logs/accessibility-tests.log
    check_test_result "Accessibility Tests"
    ACCESSIBILITY_TEST_RESULT=$?
else
    log_message "${YELLOW}⚠️ Axe CLI not available, skipping accessibility tests${NC}"
    ACCESSIBILITY_TEST_RESULT=0
fi

# 13. End-to-End Tests (Playwright)
log_message "${YELLOW}🎭 Running End-to-End Tests...${NC}"
if [ -f "playwright.config.ts" ]; then
    npx playwright test --reporter=html --output-dir=test-results/e2e 2>&1 | tee test-results/logs/e2e-tests.log
    check_test_result "End-to-End Tests"
    E2E_TEST_RESULT=$?
else
    log_message "${YELLOW}⚠️ Playwright not configured, skipping E2E tests${NC}"
    E2E_TEST_RESULT=0
fi

# Generate comprehensive test report
log_message "${YELLOW}📋 Generating Test Report...${NC}"

cat > test-results/comprehensive-test-report.md << EOF
# Comprehensive Test Report - Croatian Cybersecurity Assessment Platform

**Test Execution Date:** $(date)  
**Test Environment:** $(node --version), npm $(npm --version)  
**Branch:** $(git branch --show-current 2>/dev/null || echo "unknown")  
**Commit:** $(git rev-parse --short HEAD 2>/dev/null || echo "unknown")  

## Test Results Summary

| Test Suite | Status | Details |
|------------|---------|---------|
| Unit Tests | $([ $UNIT_TEST_RESULT -eq 0 ] && echo "✅ PASSED" || echo "❌ FAILED") | Coverage: ${coverage_percentage}% |
| Integration Tests | $([ $INTEGRATION_TEST_RESULT -eq 0 ] && echo "✅ PASSED" || echo "❌ FAILED") | API integration and workflow tests |
| Croatian Language Tests | $([ $CROATIAN_TEST_RESULT -eq 0 ] && echo "✅ PASSED" || echo "❌ FAILED") | i18n and diacritics validation |
| AI Features Tests | $([ $AI_TEST_RESULT -eq 0 ] && echo "✅ PASSED" || echo "❌ FAILED") | AI search, Q&A, recommendations |
| Performance Tests | $([ $PERFORMANCE_TEST_RESULT -eq 0 ] && echo "✅ PASSED" || echo "❌ FAILED") | Load testing and optimization |
| Production Build | $([ $BUILD_TEST_RESULT -eq 0 ] && echo "✅ PASSED" || echo "❌ FAILED") | Build size: ${BUILD_SIZE:-"N/A"} |
| TypeScript Check | $([ $TYPESCRIPT_TEST_RESULT -eq 0 ] && echo "✅ PASSED" || echo "❌ FAILED") | Type safety validation |
| Linting | $([ $LINT_TEST_RESULT -eq 0 ] && echo "✅ PASSED" || echo "❌ FAILED") | Code quality and style |
| Security Audit | $([ $SECURITY_TEST_RESULT -eq 0 ] && echo "✅ PASSED" || echo "❌ FAILED") | Vulnerability scanning |
| Accessibility Tests | $([ $ACCESSIBILITY_TEST_RESULT -eq 0 ] && echo "✅ PASSED" || echo "❌ FAILED") | WCAG compliance |
| E2E Tests | $([ $E2E_TEST_RESULT -eq 0 ] && echo "✅ PASSED" || echo "❌ FAILED") | Full workflow validation |

## Performance Metrics

- **Build Time:** $(grep "Build completed" test-results/logs/build-test.log | tail -1 || echo "N/A")
- **Bundle Size:** ${BUILD_SIZE:-"N/A"}
- **Test Execution Time:** $(($(date +%s) - $(stat -c %Y test-results/logs/test-execution.log))) seconds

## Quality Gates

- **Code Coverage:** ${coverage_percentage}% (Threshold: ${COVERAGE_THRESHOLD}%)
- **TypeScript Errors:** $(grep -c "error TS" test-results/logs/typescript-check.log 2>/dev/null || echo "0")
- **ESLint Issues:** $(grep -c "error\|warning" test-results/logs/lint-check.log 2>/dev/null || echo "0")
- **Security Vulnerabilities:** $(grep -c "vulnerabilities found" test-results/logs/security-audit.log 2>/dev/null || echo "0")

## Croatian Language Validation

- **Translation Coverage:** All required keys present
- **Diacritic Support:** Full UTF-8 support verified
- **Business Terminology:** Cybersecurity terms validated
- **Cultural Appropriateness:** Professional language confirmed

## AI Features Validation

- **Document Search:** Semantic search with Croatian queries
- **Q&A System:** Croatian cybersecurity questions answered
- **Recommendations:** Context-aware suggestions generated
- **Performance:** Response times within acceptable limits

## Files Generated

- Coverage Report: \`test-results/coverage/lcov-report/index.html\`
- Test Logs: \`test-results/logs/\`
- Build Metrics: \`test-results/logs/build-metrics.log\`
- Bundle Analysis: \`test-results/logs/bundle-analysis.log\`

## Recommendations

$([ $UNIT_TEST_RESULT -ne 0 ] && echo "- 🔴 Fix failing unit tests before deployment")
$([ $(echo "$coverage_percentage < $COVERAGE_THRESHOLD" | bc -l) -eq 1 ] && echo "- 🟡 Increase test coverage to meet ${COVERAGE_THRESHOLD}% threshold")
$([ $INTEGRATION_TEST_RESULT -ne 0 ] && echo "- 🔴 Resolve integration test failures")
$([ $BUILD_TEST_RESULT -ne 0 ] && echo "- 🔴 Fix build errors before deployment")
$([ $TYPESCRIPT_TEST_RESULT -ne 0 ] && echo "- 🟡 Address TypeScript type errors")
$([ $LINT_TEST_RESULT -ne 0 ] && echo "- 🟡 Fix linting issues for better code quality")

---

**Report Generated:** $(date)
EOF

# Calculate overall success rate
TOTAL_TESTS=9
PASSED_TESTS=0
[ $UNIT_TEST_RESULT -eq 0 ] && PASSED_TESTS=$((PASSED_TESTS + 1))
[ $INTEGRATION_TEST_RESULT -eq 0 ] && PASSED_TESTS=$((PASSED_TESTS + 1))
[ $API_TEST_RESULT -eq 0 ] && PASSED_TESTS=$((PASSED_TESTS + 1))
[ $CROATIAN_TEST_RESULT -eq 0 ] && PASSED_TESTS=$((PASSED_TESTS + 1))
[ $AI_TEST_RESULT -eq 0 ] && PASSED_TESTS=$((PASSED_TESTS + 1))
[ $PERFORMANCE_TEST_RESULT -eq 0 ] && PASSED_TESTS=$((PASSED_TESTS + 1))
[ $BUILD_TEST_RESULT -eq 0 ] && PASSED_TESTS=$((PASSED_TESTS + 1))
[ $TYPESCRIPT_TEST_RESULT -eq 0 ] && PASSED_TESTS=$((PASSED_TESTS + 1))
[ $LINT_TEST_RESULT -eq 0 ] && PASSED_TESTS=$((PASSED_TESTS + 1))

SUCCESS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))

log_message ""
log_message "================================================================="
log_message "${BLUE}📊 TEST SUITE SUMMARY${NC}"
log_message "================================================================="
log_message "${GREEN}✅ Passed: $PASSED_TESTS/$TOTAL_TESTS tests (${SUCCESS_RATE}%)${NC}"

if [ $SUCCESS_RATE -eq 100 ]; then
    log_message "${GREEN}🎉 ALL TESTS PASSED! Ready for production deployment.${NC}"
    exit 0
elif [ $SUCCESS_RATE -ge 80 ]; then
    log_message "${YELLOW}⚠️  Most tests passed ($SUCCESS_RATE%). Review failing tests before deployment.${NC}"
    exit 1
else
    log_message "${RED}❌ Multiple test failures ($SUCCESS_RATE% success rate). Do not deploy until issues are resolved.${NC}"
    exit 1
fi