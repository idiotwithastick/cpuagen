#!/usr/bin/env node
/**
 * SOLVE 10K COMMON PROMPTS → TEEP BASINS → D1 INJECTION
 *
 * Strategy:
 *   1. Generate 10,000 common prompts across 50 domains (200 per domain)
 *   2. Call Claude API in batches of 25 Q&A pairs per call (~400 API calls)
 *   3. Compute thermosolve signatures for each Q&A
 *   4. Inject into CPUAGEN D1 database
 *
 * Usage:
 *   ANTHROPIC_KEY=sk-ant-... node scripts/solve_10k_teeps.mjs [--batch-size 25] [--concurrency 5] [--dry-run]
 */

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
if (!ANTHROPIC_KEY) {
  console.error("ERROR: Set ANTHROPIC_KEY env var");
  process.exit(1);
}

const D1_DATABASE_ID = "66c4ee55-8fbe-45d5-9a98-e88328aaf595";
const CF_ACCOUNT_ID = "b621d14f660c227bfec605351679bb86";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const D1_API = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith("--batch-size="))?.split("=")[1] || "25");
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith("--concurrency="))?.split("=")[1] || "5");
const DRY_RUN = process.argv.includes("--dry-run");
const RESUME_FROM = parseInt(process.argv.find(a => a.startsWith("--resume="))?.split("=")[1] || "0");

// ─── 50 DOMAINS × 200 PROMPTS EACH = 10,000 ───

const DOMAINS = [
  { name: "Programming Basics", prefix: "programming", topics: [
    "variables", "data types", "loops", "conditionals", "functions", "arrays",
    "strings", "objects", "classes", "inheritance", "polymorphism", "encapsulation",
    "recursion", "sorting algorithms", "searching algorithms", "linked lists",
    "stacks", "queues", "trees", "graphs", "hash tables", "dynamic programming",
    "big O notation", "debugging", "testing", "version control", "git basics",
    "code reviews", "design patterns", "SOLID principles", "clean code",
    "refactoring", "documentation", "API design", "error handling",
    "exception handling", "memory management", "pointers", "references",
    "type systems", "generics",
  ]},
  { name: "Python", prefix: "python", topics: [
    "list comprehensions", "decorators", "generators", "context managers",
    "async/await", "type hints", "virtual environments", "pip", "pandas",
    "numpy", "matplotlib", "flask", "django", "FastAPI", "SQLAlchemy",
    "pytest", "dataclasses", "f-strings", "walrus operator", "match statement",
    "lambda functions", "map filter reduce", "collections module", "itertools",
    "pathlib", "logging", "argparse", "json handling", "csv processing",
    "web scraping", "regular expressions", "file I/O", "OOP in Python",
    "metaclasses", "descriptors", "slots", "property decorator", "ABC module",
    "multiprocessing", "threading",
  ]},
  { name: "JavaScript", prefix: "javascript", topics: [
    "closures", "promises", "async/await", "arrow functions", "destructuring",
    "spread operator", "template literals", "modules", "classes", "prototypes",
    "event loop", "callbacks", "fetch API", "DOM manipulation", "event handling",
    "localStorage", "sessionStorage", "cookies", "JSON", "error handling",
    "try/catch", "generators", "iterators", "symbols", "proxy", "reflect",
    "WeakMap", "WeakSet", "optional chaining", "nullish coalescing",
    "array methods", "string methods", "date handling", "regex", "Web Workers",
    "Service Workers", "IndexedDB", "WebSocket", "WebRTC", "Canvas API",
  ]},
  { name: "TypeScript", prefix: "typescript", topics: [
    "type annotations", "interfaces", "type aliases", "generics", "enums",
    "union types", "intersection types", "type guards", "type narrowing",
    "mapped types", "conditional types", "template literal types", "utility types",
    "declaration files", "module augmentation", "namespace", "decorators",
    "strict mode", "tsconfig", "type inference", "discriminated unions",
    "index signatures", "readonly", "as const", "satisfies operator",
    "infer keyword", "never type", "unknown vs any", "function overloads",
    "class generics", "abstract classes", "type assertions",
    "branded types", "phantom types", "variance", "covariance", "contravariance",
    "string literal types", "numeric literal types", "tuple types", "rest elements",
  ]},
  { name: "React", prefix: "react", topics: [
    "components", "props", "state", "hooks", "useState", "useEffect",
    "useContext", "useReducer", "useMemo", "useCallback", "useRef",
    "custom hooks", "JSX", "virtual DOM", "reconciliation", "keys",
    "forms", "controlled components", "uncontrolled components", "refs",
    "portals", "error boundaries", "suspense", "lazy loading", "code splitting",
    "context API", "state management", "Redux", "Zustand", "React Router",
    "server components", "server actions", "streaming", "hydration",
    "performance optimization", "memo", "profiler", "concurrent features",
    "transitions", "use hook", "RSC", "client components",
  ]},
  { name: "Next.js", prefix: "nextjs", topics: [
    "app router", "pages router", "file-based routing", "dynamic routes",
    "API routes", "server components", "client components", "middleware",
    "data fetching", "caching", "ISR", "SSR", "SSG", "streaming",
    "layouts", "templates", "loading UI", "error handling", "not-found",
    "parallel routes", "intercepting routes", "route groups", "metadata",
    "image optimization", "font optimization", "script optimization",
    "environment variables", "deployment", "Vercel", "edge runtime",
    "server actions", "form handling", "authentication", "internationalization",
    "testing", "SEO", "sitemap", "robots.txt", "open graph",
    "turbopack", "webpack config",
  ]},
  { name: "CSS & Styling", prefix: "css", topics: [
    "flexbox", "grid", "positioning", "box model", "specificity", "cascade",
    "selectors", "pseudo-classes", "pseudo-elements", "media queries",
    "responsive design", "mobile-first", "animations", "transitions",
    "transforms", "custom properties", "variables", "calc function",
    "clamp function", "container queries", "aspect-ratio", "gap property",
    "subgrid", "nesting", "layers", "color functions", "gradients",
    "filters", "backdrop-filter", "clip-path", "shapes", "columns",
    "writing-mode", "logical properties", "scroll-snap", "scroll-driven animations",
    "Tailwind CSS", "CSS Modules", "styled-components", "emotion", "Sass",
    "BEM methodology",
  ]},
  { name: "HTML & Web Fundamentals", prefix: "html", topics: [
    "semantic HTML", "accessibility", "ARIA", "forms", "input types",
    "validation", "tables", "lists", "links", "images", "video", "audio",
    "canvas", "SVG", "meta tags", "viewport", "favicons", "web components",
    "shadow DOM", "custom elements", "templates", "slots", "dialog element",
    "details/summary", "picture element", "srcset", "loading attribute",
    "prefetch", "preload", "preconnect", "HTTP headers", "CORS",
    "content security policy", "HTTPS", "cookies", "local storage",
    "session storage", "IndexedDB", "Web Workers", "Service Workers",
    "PWA", "manifest.json",
  ]},
  { name: "Node.js", prefix: "nodejs", topics: [
    "event loop", "streams", "buffers", "file system", "path module",
    "http module", "express", "middleware", "routing", "error handling",
    "environment variables", "dotenv", "package.json", "npm", "yarn", "pnpm",
    "modules", "CommonJS", "ES modules", "child processes", "clustering",
    "worker threads", "async patterns", "promises", "EventEmitter",
    "REST API design", "GraphQL", "WebSocket", "authentication", "JWT",
    "bcrypt", "rate limiting", "logging", "monitoring", "testing",
    "supertest", "jest", "debugging", "profiling", "pm2", "Docker",
  ]},
  { name: "Database", prefix: "database", topics: [
    "SQL basics", "SELECT", "JOIN", "GROUP BY", "indexes", "normalization",
    "transactions", "ACID", "PostgreSQL", "MySQL", "SQLite", "MongoDB",
    "Redis", "Elasticsearch", "DynamoDB", "Cassandra", "migrations",
    "ORMs", "Prisma", "Drizzle", "Sequelize", "query optimization",
    "explain plans", "N+1 problem", "connection pooling", "replication",
    "sharding", "partitioning", "backup strategies", "point-in-time recovery",
    "full-text search", "vector databases", "graph databases",
    "time series databases", "data modeling", "ERD design", "schema design",
    "stored procedures", "views", "triggers",
  ]},
  { name: "DevOps & Infrastructure", prefix: "devops", topics: [
    "Docker", "containers", "images", "volumes", "networking", "docker-compose",
    "Kubernetes", "pods", "services", "deployments", "ingress", "helm",
    "CI/CD", "GitHub Actions", "Jenkins", "GitLab CI", "CircleCI",
    "Terraform", "infrastructure as code", "Ansible", "cloud computing",
    "AWS basics", "S3", "EC2", "Lambda", "RDS", "CloudFront",
    "load balancing", "auto scaling", "monitoring", "Prometheus", "Grafana",
    "logging", "ELK stack", "alerting", "incident response",
    "blue-green deployment", "canary deployment", "feature flags",
    "secrets management", "SSL/TLS",
  ]},
  { name: "Git & Version Control", prefix: "git", topics: [
    "init", "clone", "add", "commit", "push", "pull", "fetch",
    "branches", "merge", "rebase", "cherry-pick", "stash", "reset",
    "revert", "log", "diff", "blame", "bisect", "tags", "remote",
    "submodules", "worktrees", "hooks", "gitignore", "gitattributes",
    "merge conflicts", "rebasing strategy", "squash commits",
    "conventional commits", "semantic versioning", "branching strategies",
    "git flow", "trunk-based development", "pull requests", "code review",
    "forking workflow", "monorepo", "sparse checkout", "LFS", "reflog",
  ]},
  { name: "AI & Machine Learning", prefix: "ai", topics: [
    "neural networks", "deep learning", "supervised learning", "unsupervised learning",
    "reinforcement learning", "transformers", "attention mechanism", "GPT",
    "BERT", "fine-tuning", "transfer learning", "embeddings", "RAG",
    "vector databases", "prompt engineering", "chain of thought",
    "few-shot learning", "zero-shot learning", "RLHF", "diffusion models",
    "GANs", "autoencoders", "CNNs", "RNNs", "LSTMs", "gradient descent",
    "backpropagation", "loss functions", "optimization", "regularization",
    "overfitting", "underfitting", "cross-validation", "hyperparameter tuning",
    "feature engineering", "data preprocessing", "model evaluation",
    "confusion matrix", "ROC curve", "tokenization",
  ]},
  { name: "LLM & AI APIs", prefix: "llm", topics: [
    "OpenAI API", "Claude API", "Gemini API", "function calling", "tool use",
    "streaming responses", "token counting", "context window", "temperature",
    "top-p", "system prompts", "few-shot prompting", "chain of thought",
    "structured output", "JSON mode", "vision models", "image generation",
    "text-to-speech", "speech-to-text", "embeddings API", "fine-tuning",
    "batch API", "rate limiting", "error handling", "cost optimization",
    "model comparison", "multimodal inputs", "assistant API",
    "agent frameworks", "LangChain", "LlamaIndex", "Vercel AI SDK",
    "prompt caching", "context caching", "safety filters",
    "content moderation", "guardrails", "evaluation", "benchmarking",
    "semantic search", "hybrid search",
  ]},
  { name: "Security", prefix: "security", topics: [
    "OWASP top 10", "XSS", "CSRF", "SQL injection", "authentication",
    "authorization", "OAuth 2.0", "OpenID Connect", "JWT", "session management",
    "password hashing", "bcrypt", "argon2", "HTTPS", "SSL/TLS",
    "certificates", "CORS", "CSP", "rate limiting", "input validation",
    "output encoding", "sanitization", "encryption", "AES", "RSA",
    "hashing", "HMAC", "API keys", "secrets management", "env variables",
    "security headers", "HSTS", "clickjacking", "SSRF", "directory traversal",
    "file upload security", "dependency scanning", "SAST", "DAST",
    "penetration testing", "vulnerability assessment",
  ]},
  { name: "System Design", prefix: "systemdesign", topics: [
    "scalability", "availability", "consistency", "CAP theorem", "load balancing",
    "caching strategies", "CDN", "database sharding", "microservices",
    "monolith vs microservices", "API gateway", "service mesh", "message queues",
    "event-driven architecture", "CQRS", "event sourcing", "saga pattern",
    "circuit breaker", "rate limiting", "throttling", "pagination",
    "idempotency", "distributed transactions", "consensus algorithms",
    "Raft", "Paxos", "consistent hashing", "bloom filters",
    "URL shortener design", "chat system design", "social media feed",
    "notification system", "file storage system", "search engine design",
    "recommendation engine", "payment system", "real-time analytics",
    "video streaming", "ride sharing",
  ]},
  { name: "Data Structures", prefix: "datastructures", topics: [
    "arrays", "linked lists", "doubly linked lists", "stacks", "queues",
    "deque", "priority queues", "heaps", "binary trees", "BST",
    "AVL trees", "red-black trees", "B-trees", "tries", "segment trees",
    "Fenwick trees", "graphs", "adjacency list", "adjacency matrix",
    "hash tables", "hash maps", "sets", "disjoint sets", "union-find",
    "skip lists", "bloom filters", "LRU cache", "LFU cache",
    "circular buffer", "sparse matrix", "suffix array", "suffix tree",
    "rope data structure", "interval tree", "KD-tree", "R-tree",
    "quadtree", "octree", "persistent data structures", "immutable collections",
  ]},
  { name: "Algorithms", prefix: "algorithms", topics: [
    "bubble sort", "selection sort", "insertion sort", "merge sort",
    "quicksort", "heap sort", "radix sort", "counting sort", "bucket sort",
    "binary search", "linear search", "DFS", "BFS", "Dijkstra",
    "Bellman-Ford", "Floyd-Warshall", "A-star", "topological sort",
    "Kruskal", "Prim", "dynamic programming", "memoization", "tabulation",
    "greedy algorithms", "backtracking", "divide and conquer",
    "sliding window", "two pointers", "fast and slow pointers",
    "recursion", "iteration", "bit manipulation", "string matching",
    "KMP algorithm", "Rabin-Karp", "matrix operations",
    "computational geometry", "number theory", "combinatorics",
  ]},
  { name: "Math for Programming", prefix: "mathprog", topics: [
    "linear algebra", "matrices", "vectors", "eigenvalues", "dot product",
    "cross product", "probability", "statistics", "mean median mode",
    "standard deviation", "normal distribution", "Bayes theorem",
    "combinatorics", "permutations", "combinations", "modular arithmetic",
    "prime numbers", "GCD", "LCM", "logarithms", "exponents",
    "calculus basics", "derivatives", "integrals", "limits",
    "discrete math", "set theory", "graph theory", "Boolean algebra",
    "truth tables", "propositional logic", "predicate logic",
    "proof techniques", "induction", "contradiction", "Big O analysis",
    "recurrence relations", "master theorem", "amortized analysis",
    "number systems", "binary arithmetic",
  ]},
  { name: "Cloud Computing", prefix: "cloud", topics: [
    "IaaS", "PaaS", "SaaS", "serverless", "FaaS", "AWS Lambda",
    "Azure Functions", "Google Cloud Functions", "Cloudflare Workers",
    "S3", "Blob Storage", "Cloud Storage", "EC2", "virtual machines",
    "containers vs VMs", "VPC", "subnets", "security groups", "IAM",
    "roles and policies", "CloudFormation", "ARM templates", "Terraform",
    "multi-cloud", "hybrid cloud", "edge computing", "CDN",
    "auto scaling", "spot instances", "reserved instances", "cost optimization",
    "cloud monitoring", "CloudWatch", "Cloud Logging", "cloud databases",
    "managed services", "Kubernetes on cloud", "cloud networking",
    "DNS management", "domain management",
  ]},
  { name: "Testing", prefix: "testing", topics: [
    "unit testing", "integration testing", "end-to-end testing", "TDD",
    "BDD", "test pyramid", "mocking", "stubbing", "spying", "fixtures",
    "Jest", "Vitest", "Mocha", "Chai", "Cypress", "Playwright",
    "Selenium", "Testing Library", "React Testing Library", "snapshot testing",
    "coverage reports", "mutation testing", "property-based testing",
    "fuzz testing", "load testing", "stress testing", "performance testing",
    "accessibility testing", "visual regression testing", "contract testing",
    "API testing", "Postman", "assertions", "test organization",
    "test isolation", "flaky tests", "test data management",
    "CI test pipelines", "parallel testing", "test environments",
  ]},
  { name: "APIs & HTTP", prefix: "api", topics: [
    "REST", "GraphQL", "gRPC", "WebSocket", "Server-Sent Events",
    "HTTP methods", "status codes", "headers", "content negotiation",
    "MIME types", "URL encoding", "query parameters", "path parameters",
    "request body", "response formats", "pagination", "filtering",
    "sorting", "versioning", "HATEOAS", "OpenAPI", "Swagger",
    "API documentation", "rate limiting", "throttling", "API keys",
    "OAuth", "bearer tokens", "CORS", "preflight requests",
    "caching headers", "ETags", "webhooks", "long polling",
    "API gateway patterns", "circuit breaker", "retry patterns",
    "idempotency keys", "batch operations", "bulk APIs",
  ]},
  { name: "Mobile Development", prefix: "mobile", topics: [
    "React Native", "Flutter", "Swift", "Kotlin", "Expo",
    "navigation", "state management", "AsyncStorage", "SQLite mobile",
    "push notifications", "deep linking", "app lifecycle",
    "gesture handling", "animations", "responsive layouts",
    "platform-specific code", "native modules", "camera access",
    "geolocation", "maps integration", "offline support",
    "app store submission", "code signing", "TestFlight", "beta testing",
    "crash reporting", "analytics", "performance optimization",
    "bundle size", "lazy loading", "image caching", "network handling",
    "background tasks", "widgets", "app clips", "in-app purchases",
    "accessibility on mobile", "dark mode", "localization", "biometric auth",
  ]},
  { name: "Rust", prefix: "rust", topics: [
    "ownership", "borrowing", "lifetimes", "pattern matching", "enums",
    "structs", "traits", "generics", "error handling", "Result type",
    "Option type", "iterators", "closures", "smart pointers", "Box",
    "Rc", "Arc", "RefCell", "Mutex", "channels", "async/await",
    "tokio", "cargo", "modules", "crates", "testing", "documentation",
    "unsafe Rust", "FFI", "macros", "procedural macros", "derive macros",
    "trait objects", "dyn dispatch", "zero-cost abstractions",
    "move semantics", "clone vs copy", "drop trait", "From/Into traits",
    "serde", "web frameworks",
  ]},
  { name: "Go", prefix: "go", topics: [
    "goroutines", "channels", "select statement", "sync package", "WaitGroup",
    "Mutex", "interfaces", "structs", "methods", "embedding", "composition",
    "error handling", "panic/recover", "defer", "slices", "maps",
    "strings", "io package", "http package", "net package", "context",
    "generics", "type constraints", "modules", "packages", "go.mod",
    "testing", "benchmarking", "profiling", "pprof", "race detector",
    "garbage collection", "memory management", "reflection", "encoding/json",
    "templates", "cobra CLI", "gin framework", "standard library",
    "concurrency patterns", "pipeline pattern",
  ]},
  { name: "Linux & Command Line", prefix: "linux", topics: [
    "basic commands", "file permissions", "chmod", "chown", "grep",
    "sed", "awk", "find", "xargs", "pipe", "redirection", "tee",
    "processes", "ps", "top", "htop", "kill", "signals", "cron",
    "systemd", "services", "SSH", "SCP", "rsync", "curl", "wget",
    "tar", "gzip", "zip", "disk usage", "df", "du", "mount",
    "package managers", "apt", "yum", "snap", "shell scripting",
    "bash variables", "conditionals", "loops", "functions",
    "environment variables", "PATH",
  ]},
  { name: "Networking", prefix: "networking", topics: [
    "TCP/IP", "UDP", "HTTP/2", "HTTP/3", "QUIC", "DNS", "DHCP",
    "IP addressing", "subnetting", "NAT", "firewalls", "load balancers",
    "reverse proxy", "forward proxy", "VPN", "TLS handshake",
    "certificate authority", "mTLS", "OSI model", "TCP handshake",
    "socket programming", "WebSocket protocol", "gRPC protocol",
    "REST vs GraphQL", "API gateway", "service mesh", "CDN",
    "edge networking", "BGP", "routing", "switching", "VLAN",
    "network troubleshooting", "traceroute", "ping", "nslookup",
    "Wireshark", "tcpdump", "bandwidth", "latency",
  ]},
  { name: "Software Architecture", prefix: "architecture", topics: [
    "monolith", "microservices", "serverless", "event-driven", "layered",
    "hexagonal", "clean architecture", "DDD", "CQRS", "event sourcing",
    "MVC", "MVVM", "MVP", "repository pattern", "service pattern",
    "factory pattern", "singleton", "observer", "strategy", "decorator",
    "adapter", "facade", "proxy pattern", "builder", "prototype",
    "dependency injection", "IoC container", "middleware pattern",
    "plugin architecture", "modular monolith", "strangler fig pattern",
    "anti-corruption layer", "bounded context", "aggregate root",
    "domain events", "saga pattern", "outbox pattern",
    "API composition", "backend for frontend",
  ]},
  { name: "Performance Optimization", prefix: "performance", topics: [
    "profiling", "benchmarking", "memory leaks", "CPU profiling",
    "bundle size optimization", "tree shaking", "code splitting",
    "lazy loading", "image optimization", "WebP", "AVIF", "compression",
    "gzip", "brotli", "caching strategies", "browser caching", "CDN caching",
    "database query optimization", "indexing strategies", "connection pooling",
    "N+1 queries", "batch operations", "pagination optimization",
    "virtual scrolling", "debouncing", "throttling", "web vitals",
    "LCP", "FID", "CLS", "TTFB", "first contentful paint",
    "render blocking resources", "critical CSS", "preloading",
    "prefetching", "service worker caching", "HTTP/2 server push",
    "async/defer scripts", "font optimization", "layout thrashing",
  ]},
  { name: "Blockchain & Web3", prefix: "blockchain", topics: [
    "blockchain basics", "consensus mechanisms", "proof of work", "proof of stake",
    "smart contracts", "Solidity", "Ethereum", "EVM", "gas", "transactions",
    "wallets", "private keys", "public keys", "digital signatures", "hashing",
    "Merkle trees", "DeFi", "DEX", "AMM", "liquidity pools",
    "NFTs", "ERC-20", "ERC-721", "ERC-1155", "IPFS", "oracles",
    "Chainlink", "bridges", "layer 2", "rollups", "zero knowledge proofs",
    "zk-SNARKs", "zk-STARKs", "DAOs", "governance tokens",
    "flash loans", "yield farming", "staking", "tokenomics",
    "Web3.js", "ethers.js",
  ]},
  { name: "Data Engineering", prefix: "dataeng", topics: [
    "ETL", "ELT", "data pipelines", "Apache Spark", "Apache Kafka",
    "Apache Airflow", "data warehousing", "data lakes", "data lakehouse",
    "Snowflake", "BigQuery", "Redshift", "dbt", "data modeling",
    "star schema", "snowflake schema", "slowly changing dimensions",
    "batch processing", "stream processing", "real-time analytics",
    "data quality", "data governance", "data lineage", "metadata management",
    "schema evolution", "data versioning", "feature stores",
    "vector databases", "time series databases", "column stores",
    "parquet", "avro", "protobuf", "CDC", "change data capture",
    "data catalog", "data mesh", "data contracts",
    "observability", "data monitoring",
  ]},
  { name: "Frontend Architecture", prefix: "frontend", topics: [
    "component design", "atomic design", "design systems", "storybook",
    "monorepo", "micro-frontends", "module federation", "state management",
    "Redux", "Zustand", "Jotai", "Recoil", "MobX", "signals",
    "rendering strategies", "SSR", "SSG", "ISR", "CSR", "streaming SSR",
    "build tools", "webpack", "Vite", "esbuild", "turbopack", "SWC",
    "TypeScript configuration", "linting", "ESLint", "Prettier",
    "code formatting", "import sorting", "path aliases",
    "environment configuration", "feature flags", "A/B testing",
    "error tracking", "Sentry", "analytics", "SEO", "accessibility",
    "internationalization", "theming",
  ]},
  { name: "Backend Patterns", prefix: "backend", topics: [
    "REST best practices", "GraphQL schema design", "authentication patterns",
    "authorization patterns", "RBAC", "ABAC", "multi-tenancy",
    "rate limiting algorithms", "token bucket", "sliding window",
    "database connection pooling", "ORM patterns", "repository pattern",
    "unit of work", "CQRS implementation", "event bus", "message broker",
    "dead letter queue", "retry strategies", "exponential backoff",
    "circuit breaker implementation", "health checks", "graceful shutdown",
    "request validation", "input sanitization", "output encoding",
    "file upload handling", "streaming responses", "SSE implementation",
    "WebSocket management", "background jobs", "job queues",
    "cron scheduling", "distributed locking", "cache invalidation",
    "API versioning strategies", "backward compatibility",
    "database migrations", "blue-green deployments",
  ]},
  { name: "Observability", prefix: "observability", topics: [
    "logging", "structured logging", "log aggregation", "log levels",
    "metrics", "counters", "gauges", "histograms", "summaries",
    "tracing", "distributed tracing", "spans", "trace context",
    "OpenTelemetry", "Prometheus", "Grafana", "Jaeger", "Zipkin",
    "ELK stack", "Elasticsearch", "Logstash", "Kibana", "Fluentd",
    "alerting", "alert fatigue", "SLOs", "SLIs", "SLAs", "error budgets",
    "dashboards", "golden signals", "RED method", "USE method",
    "APM", "synthetic monitoring", "real user monitoring", "uptime monitoring",
    "incident management", "postmortems", "runbooks", "on-call rotation",
    "chaos engineering", "game days",
  ]},
  { name: "Technical Writing", prefix: "techwriting", topics: [
    "README writing", "API documentation", "code comments", "JSDoc",
    "TypeDoc", "docstrings", "architecture decision records", "RFCs",
    "design documents", "runbooks", "incident reports", "postmortems",
    "changelog", "release notes", "migration guides", "tutorials",
    "how-to guides", "reference documentation", "conceptual documentation",
    "Diátaxis framework", "documentation structure", "information architecture",
    "technical blog posts", "conference talks", "developer experience",
    "onboarding documentation", "contribution guides", "style guides",
    "code of conduct", "license files", "security policy",
    "issue templates", "PR templates", "commit messages",
    "semantic versioning", "breaking change communication",
    "deprecation notices", "feature announcements",
  ]},
  { name: "Productivity & Tools", prefix: "productivity", topics: [
    "VS Code", "extensions", "keyboard shortcuts", "snippets", "settings",
    "terminal setup", "shell customization", "zsh", "oh-my-zsh", "starship",
    "tmux", "screen", "aliases", "dotfiles", "Homebrew", "Chocolatey",
    "Postman", "Insomnia", "curl", "httpie", "jq", "yq",
    "Docker Desktop", "Kubernetes tools", "kubectl", "k9s",
    "browser DevTools", "network tab", "performance tab", "Lighthouse",
    "note-taking", "knowledge management", "documentation tools",
    "project management", "Jira", "Linear", "GitHub Projects",
    "time management", "Pomodoro technique", "deep work",
    "code review tools", "pair programming",
  ]},
  { name: "Career & Interviews", prefix: "career", topics: [
    "technical interviews", "system design interviews", "coding challenges",
    "behavioral questions", "STAR method", "resume writing", "portfolio",
    "GitHub profile", "open source contributions", "networking",
    "salary negotiation", "job search strategy", "recruiter outreach",
    "cover letters", "follow-up emails", "whiteboard coding",
    "take-home assignments", "pair programming interviews",
    "culture fit questions", "leadership principles", "conflict resolution",
    "mentoring", "code review feedback", "sprint planning",
    "agile methodology", "scrum", "kanban", "retrospectives",
    "standups", "estimation", "technical debt management",
    "career growth", "staff engineer path", "management track",
    "conference speaking", "blogging", "community building",
    "remote work", "work-life balance",
  ]},
  { name: "Web3D & Graphics", prefix: "graphics", topics: [
    "Three.js", "WebGL", "WebGPU", "shaders", "GLSL", "WGSL",
    "3D transforms", "camera systems", "lighting", "materials",
    "textures", "UV mapping", "mesh geometry", "vertex buffers",
    "scene graph", "animation", "keyframes", "skeletal animation",
    "physics engines", "collision detection", "ray casting",
    "particle systems", "post-processing", "bloom", "shadows",
    "ambient occlusion", "PBR rendering", "HDR", "tone mapping",
    "LOD", "instancing", "frustum culling", "octree spatial indexing",
    "Canvas 2D", "SVG animations", "Lottie", "Rive",
    "CSS 3D transforms", "perspective", "AR/VR basics", "WebXR",
  ]},
  { name: "Functional Programming", prefix: "fp", topics: [
    "pure functions", "immutability", "first-class functions", "higher-order functions",
    "closures", "currying", "partial application", "composition",
    "functor", "monad", "applicative", "monoid", "algebraic data types",
    "pattern matching", "recursion", "tail recursion", "trampolining",
    "lazy evaluation", "memoization", "referential transparency",
    "side effects", "IO monad", "Either type", "Maybe/Option type",
    "pipe/compose", "point-free style", "transducers", "lenses",
    "optics", "category theory basics", "fold/reduce", "unfold",
    "church encoding", "continuation passing", "free monad",
    "effect systems", "algebraic effects", "functional reactive programming",
    "event streams", "observables",
  ]},
  { name: "Regex & Text Processing", prefix: "regex", topics: [
    "character classes", "quantifiers", "anchors", "groups", "backreferences",
    "lookahead", "lookbehind", "greedy vs lazy", "alternation",
    "word boundaries", "escape sequences", "Unicode matching",
    "named groups", "non-capturing groups", "atomic groups",
    "possessive quantifiers", "conditional patterns", "recursive patterns",
    "email validation", "URL parsing", "phone number matching",
    "IP address matching", "date parsing", "CSV parsing",
    "log file parsing", "HTML tag matching", "JSON path extraction",
    "find and replace", "string splitting", "tokenization",
    "text normalization", "whitespace handling", "line endings",
    "encoding detection", "UTF-8", "ASCII", "Base64",
    "string interpolation", "template engines", "Markdown parsing",
  ]},
  { name: "Game Development", prefix: "gamedev", topics: [
    "game loop", "delta time", "fixed timestep", "input handling",
    "collision detection", "physics simulation", "rigid body dynamics",
    "sprite animation", "tilemap", "camera systems", "parallax scrolling",
    "pathfinding", "A-star algorithm", "navmesh", "state machines",
    "behavior trees", "entity component system", "scene management",
    "asset loading", "audio management", "particle effects",
    "shader programming", "lighting systems", "shadow mapping",
    "UI systems", "HUD design", "save/load systems", "serialization",
    "multiplayer networking", "client-server architecture", "lag compensation",
    "game design patterns", "object pooling", "spatial partitioning",
    "level design", "procedural generation", "random number generation",
    "game balancing", "playtesting",
  ]},
  { name: "Thermodynamics & Physics", prefix: "thermodynamics", topics: [
    "entropy", "enthalpy", "free energy", "temperature", "heat transfer",
    "first law", "second law", "third law", "Carnot cycle", "heat engines",
    "refrigeration cycles", "phase transitions", "equation of state",
    "ideal gas law", "van der Waals", "statistical mechanics",
    "Boltzmann distribution", "partition function", "microstate",
    "macrostate", "Maxwell-Boltzmann", "Fermi-Dirac", "Bose-Einstein",
    "information entropy", "Shannon entropy", "Kullback-Leibler divergence",
    "mutual information", "Fisher information", "Riemannian geometry",
    "geodesics", "curvature", "metric tensor", "Christoffel symbols",
    "parallel transport", "covariant derivative", "Ricci curvature",
    "ergodic theory", "Lyapunov exponents", "chaos theory",
    "dissipative systems", "nonequilibrium thermodynamics",
  ]},
  { name: "Cognitive Science & AGI", prefix: "cognition", topics: [
    "consciousness", "qualia", "integrated information theory", "IIT phi",
    "global workspace theory", "attention mechanisms", "working memory",
    "long-term memory", "episodic memory", "semantic memory",
    "procedural memory", "neural correlates", "binding problem",
    "free energy principle", "predictive processing", "Bayesian brain",
    "active inference", "embodied cognition", "situated cognition",
    "distributed cognition", "cognitive architectures", "ACT-R",
    "SOAR", "recursive self-improvement", "AI alignment",
    "instrumental convergence", "orthogonality thesis", "mesa-optimization",
    "reward hacking", "Goodhart's law", "scalable oversight",
    "constitutional AI", "RLHF", "debate", "amplification",
    "cognitive load theory", "dual process theory", "metacognition",
    "theory of mind", "mirror neurons",
  ]},
  { name: "Mathematics Foundations", prefix: "math", topics: [
    "real analysis", "complex analysis", "topology", "abstract algebra",
    "group theory", "ring theory", "field theory", "linear algebra",
    "matrix decomposition", "SVD", "eigendecomposition", "PCA",
    "differential equations", "ODEs", "PDEs", "Fourier analysis",
    "Laplace transform", "Z-transform", "numerical methods",
    "Newton's method", "Runge-Kutta", "finite elements", "optimization",
    "convex optimization", "gradient descent", "conjugate gradient",
    "information geometry", "Fisher metric", "statistical manifolds",
    "Riemannian optimization", "Lie groups", "Lie algebras",
    "category theory", "functors", "natural transformations",
    "measure theory", "probability theory", "stochastic processes",
    "Markov chains", "Brownian motion",
  ]},
  { name: "Philosophy of Computing", prefix: "philosophy", topics: [
    "Turing machine", "Church-Turing thesis", "halting problem",
    "computational complexity", "P vs NP", "NP-completeness",
    "Kolmogorov complexity", "algorithmic information theory",
    "Gödel's incompleteness", "lambda calculus", "combinatory logic",
    "type theory", "Curry-Howard correspondence", "constructive mathematics",
    "intuitionism", "formalism", "platonism", "nominalism",
    "Chinese room argument", "symbol grounding", "intentionality",
    "functionalism", "computationalism", "pancomputationalism",
    "digital physics", "it from bit", "computational universe hypothesis",
    "simulation hypothesis", "mathematical universe hypothesis",
    "philosophical zombies", "hard problem of consciousness",
    "emergence", "downward causation", "supervenience",
    "reductionism", "holism", "systems thinking",
    "cybernetics", "autopoiesis", "enactivism",
  ]},
  { name: "Writing Code Prompts", prefix: "codeprompts", topics: [
    "write a function that", "implement a class for", "create an API endpoint",
    "build a React component", "design a database schema", "write unit tests for",
    "refactor this code", "optimize this algorithm", "debug this error",
    "explain this code", "convert this code from X to Y", "add error handling to",
    "write a CLI tool", "create a REST API", "build a GraphQL schema",
    "implement authentication", "add pagination", "create a search feature",
    "build a form with validation", "implement a cache", "write a middleware",
    "create a webhook handler", "build a notification system",
    "implement rate limiting", "write a file parser", "build a state machine",
    "create a plugin system", "implement undo/redo", "build a task queue",
    "write a migration script", "create a monitoring dashboard",
    "implement feature flags", "build a deployment pipeline",
    "write documentation", "create a changelog generator",
    "build a code generator", "implement a template engine",
    "write a data validator", "build an event system",
  ]},
  { name: "Common Error Messages", prefix: "errors", topics: [
    "TypeError: Cannot read properties of undefined",
    "ReferenceError: is not defined", "SyntaxError: Unexpected token",
    "CORS error", "404 Not Found", "500 Internal Server Error",
    "ECONNREFUSED", "EADDRINUSE", "ENOMEM", "EACCES permission denied",
    "Module not found", "Cannot find module", "Unhandled promise rejection",
    "Maximum call stack exceeded", "out of memory", "heap out of memory",
    "segmentation fault", "deadlock detected", "connection timeout",
    "SSL certificate error", "authentication failed", "token expired",
    "rate limit exceeded", "quota exceeded", "disk space full",
    "port already in use", "dependency conflict", "version mismatch",
    "build failed", "compilation error", "type error in TypeScript",
    "ESLint error", "Prettier conflict", "git merge conflict",
    "Docker build failed", "Kubernetes pod crash", "OOM killed",
    "npm ERESOLVE", "yarn berry PnP error", "webpack config error",
    "Next.js hydration mismatch",
  ]},
  { name: "Conversational & General", prefix: "general", topics: [
    "explain like I'm 5", "what is the difference between",
    "how does X work", "why should I use X over Y", "best practices for",
    "common mistakes in", "pros and cons of", "when to use X",
    "how to learn X", "roadmap for becoming a X developer",
    "resources for learning X", "books about X", "courses for X",
    "X vs Y comparison", "is X dead in 2026", "future of X",
    "alternatives to X", "X for beginners", "advanced X concepts",
    "X interview questions", "X cheat sheet", "X quick reference",
    "X design patterns", "X anti-patterns", "X migration guide",
    "upgrading from X to Y", "X performance tips", "X security checklist",
    "X deployment guide", "X monitoring setup", "X troubleshooting",
    "setting up X from scratch", "X project structure",
    "X configuration options", "X plugins and extensions",
    "X community and ecosystem", "contributing to X",
    "X changelog highlights", "X breaking changes",
  ]},
  { name: "Business & Startup", prefix: "business", topics: [
    "MVP development", "product-market fit", "user research",
    "competitive analysis", "pricing strategies", "freemium model",
    "SaaS metrics", "MRR", "ARR", "churn rate", "LTV", "CAC",
    "A/B testing", "conversion optimization", "landing pages",
    "email marketing", "content marketing", "SEO strategy",
    "social media marketing", "growth hacking", "viral loops",
    "referral programs", "onboarding flows", "user retention",
    "customer support", "feedback loops", "feature prioritization",
    "product roadmap", "sprint planning", "OKRs", "KPIs",
    "investor pitch", "pitch deck", "fundraising", "term sheets",
    "equity", "vesting", "cap table", "incorporation",
    "legal considerations", "privacy policy",
  ]},
  { name: "Data Science", prefix: "datascience", topics: [
    "exploratory data analysis", "data cleaning", "missing values",
    "outlier detection", "feature scaling", "normalization",
    "standardization", "one-hot encoding", "label encoding",
    "feature selection", "dimensionality reduction", "PCA", "t-SNE",
    "UMAP", "clustering", "K-means", "DBSCAN", "hierarchical clustering",
    "classification", "logistic regression", "decision trees",
    "random forests", "gradient boosting", "XGBoost", "LightGBM",
    "regression analysis", "linear regression", "polynomial regression",
    "time series analysis", "ARIMA", "seasonal decomposition",
    "A/B testing statistics", "hypothesis testing", "p-values",
    "confidence intervals", "effect size", "power analysis",
    "Jupyter notebooks", "pandas profiling", "visualization best practices",
  ]},
  { name: "Embedded & IoT", prefix: "embedded", topics: [
    "Arduino", "Raspberry Pi", "ESP32", "microcontrollers",
    "GPIO", "PWM", "ADC", "DAC", "I2C", "SPI", "UART",
    "interrupts", "timers", "watchdog", "bootloader", "firmware",
    "RTOS", "FreeRTOS", "task scheduling", "memory management",
    "power management", "sleep modes", "battery optimization",
    "sensor integration", "actuator control", "motor drivers",
    "wireless communication", "WiFi", "Bluetooth", "BLE", "LoRa",
    "MQTT", "CoAP", "HTTP on embedded", "OTA updates",
    "debugging embedded", "JTAG", "logic analyzer", "oscilloscope",
    "PCB design basics", "schematic reading",
    "embedded C", "embedded Rust",
  ]},
];

// ─── Prompt Generation ───

function generatePrompts() {
  const prompts = [];
  const questionTemplates = [
    (topic, domain) => `What is ${topic}?`,
    (topic, domain) => `How do I use ${topic} in ${domain}?`,
    (topic, domain) => `Explain ${topic} with a practical example`,
    (topic, domain) => `What are best practices for ${topic}?`,
    (topic, domain) => `Common mistakes with ${topic} and how to avoid them`,
    (topic, domain) => `${topic} vs alternatives — when to use what?`,
    (topic, domain) => `How does ${topic} work under the hood?`,
    (topic, domain) => `Give me a quick tutorial on ${topic}`,
    (topic, domain) => `What are the key concepts of ${topic} I should know?`,
    (topic, domain) => `Troubleshooting ${topic}: common issues and fixes`,
  ];

  // Deduplicate: use a Set to avoid exact duplicate questions
  const seen = new Set();
  for (const domain of DOMAINS) {
    for (let ti = 0; ti < domain.topics.length; ti++) {
      const topic = domain.topics[ti];
      // Generate multiple variants per topic (up to 5 to reach ~10K)
      const numVariants = Math.min(5, questionTemplates.length);
      for (let vi = 0; vi < numVariants; vi++) {
        const templateIdx = (ti + vi) % questionTemplates.length;
        const question = questionTemplates[templateIdx](topic, domain.name);
        if (seen.has(question)) continue;
        seen.add(question);
        prompts.push({
          question,
          domain: domain.name,
          topic,
          prefix: domain.prefix,
        });
      }
    }
  }
  return prompts;
}

// ─── Thermosolve Signature (matches enforcement.ts logic) ───

function computeSignature(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const n = words.length;
  const unique = new Set(words.map(w => w.toLowerCase()));

  // Shannon entropy
  const freq = {};
  for (const w of words) {
    const lw = w.toLowerCase();
    freq[lw] = (freq[lw] || 0) + 1;
  }
  let S = 0;
  for (const f of Object.values(freq)) {
    const p = f / n;
    if (p > 0) S -= p * Math.log2(p);
  }

  const phi = unique.size / Math.max(n, 1);
  const dS = S > 0 ? -Math.abs(S - Math.log2(unique.size)) : 0;
  const I_truth = Math.min(1, S / Math.max(Math.log2(n), 1));
  const naturality = Math.min(1, 0.2 + phi * 0.8);
  const beta_T = 1.0;
  const psi_coherence = Math.min(1, 0.1 + phi * 0.5 + I_truth * 0.4);
  const synergy = Math.min(1, 0.5 + phi * 0.3 + I_truth * 0.2);

  return { n, S: +S.toFixed(4), dS: +dS.toFixed(4), phi: +phi.toFixed(4),
    I_truth: +I_truth.toFixed(4), naturality: +naturality.toFixed(4),
    beta_T, psi_coherence: +psi_coherence.toFixed(4), synergy: +synergy.toFixed(4) };
}

function fnv1aHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ─── Claude API Batch Caller ───

async function callClaude(prompt, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          messages: [{ role: "user", content: prompt }],
          system: "You are a concise technical assistant. Give direct, accurate answers in 2-4 sentences. No preamble.",
        }),
      });

      if (res.status === 429) {
        // Rate limited — back off
        const wait = Math.min(60000, 2000 * Math.pow(2, attempt));
        console.log(`  Rate limited, waiting ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`API ${res.status}: ${err.slice(0, 200)}`);
      }

      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      return text;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

// Process a batch of prompts concurrently
async function processBatch(promptBatch, batchIdx, totalBatches) {
  const results = [];
  const tasks = promptBatch.map(async (p, i) => {
    try {
      const answer = await callClaude(p.question);
      const combined = `Q: ${p.question}\nA: ${answer}`;
      const sig = computeSignature(combined);
      const inputHash = fnv1aHash(p.question.toLowerCase());
      const outputHash = fnv1aHash(answer.toLowerCase().slice(0, 200));
      const id = `TEEP-SOLVE-${p.prefix}-${inputHash.slice(0, 6)}`;

      results.push({
        id,
        question: p.question,
        answer,
        domain: p.domain,
        topic: p.topic,
        signature: sig,
        inputHash,
        outputHash,
      });
    } catch (err) {
      console.error(`  ERR [${p.domain}/${p.topic}]: ${err.message}`);
    }
  });

  await Promise.all(tasks);
  return results;
}

// ─── D1 Injection ───

async function injectToD1(teeps) {
  if (!CF_API_TOKEN) {
    console.log("No CF_API_TOKEN — skipping D1 injection (results saved to file only)");
    return 0;
  }

  let injected = 0;
  const batchSize = 20;

  for (let i = 0; i < teeps.length; i += batchSize) {
    const batch = teeps.slice(i, i + batchSize);

    for (const t of batch) {
      try {
        const sql = `INSERT OR IGNORE INTO teeps (id, content, signature_json, timestamp, hit_count, category)
          VALUES (?, ?, ?, ?, 0, ?)`;
        const params = [
          t.id,
          `Q: ${t.question}\nA: ${t.answer}`,
          JSON.stringify(t.signature),
          Date.now().toString(),
          t.domain,
        ];

        const res = await fetch(D1_API, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CF_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sql, params }),
        });

        if (res.ok) injected++;
      } catch (err) {
        // continue
      }
    }

    // Also inject basin index entries
    for (const t of batch) {
      try {
        const sql = `INSERT OR IGNORE INTO basin_index (input_hash, output_hash, teep_id) VALUES (?, ?, ?)`;
        const params = [t.inputHash, t.outputHash, t.id];

        await fetch(D1_API, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CF_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sql, params }),
        });
      } catch {
        // continue
      }
    }

    if ((i + batchSize) % 200 === 0) {
      console.log(`  D1 injection: ${Math.min(i + batchSize, teeps.length)}/${teeps.length}`);
    }
  }
  return injected;
}

// ─── Main ───

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  CPUAGEN 10K TEEP Pre-Solver                             ║");
  console.log("║  50 domains × ~200 topics = 10,000 solved basins          ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");

  // 1. Generate prompts
  const allPrompts = generatePrompts();
  console.log(`\nGenerated ${allPrompts.length} prompts across ${DOMAINS.length} domains`);

  if (DRY_RUN) {
    console.log("\n--dry-run: showing first 10 prompts:");
    for (const p of allPrompts.slice(0, 10)) {
      console.log(`  [${p.domain}] ${p.question}`);
    }
    console.log(`\nWould make ~${Math.ceil(allPrompts.length / CONCURRENCY)} concurrent batches of ${CONCURRENCY}`);
    console.log(`Estimated cost: ~$${(allPrompts.length * 0.001).toFixed(2)} (Haiku @ ~$0.001/call)`);
    return;
  }

  // Resume support
  const startIdx = RESUME_FROM;
  const remaining = allPrompts.slice(startIdx);
  console.log(`\nSolving ${remaining.length} prompts (starting at ${startIdx})...`);
  console.log(`Concurrency: ${CONCURRENCY} | Model: claude-haiku-4-5-20251001\n`);

  const allResults = [];
  const fs = await import("fs");

  // Process in concurrent batches
  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY);
    const batchNum = Math.floor(i / CONCURRENCY) + 1;
    const totalBatches = Math.ceil(remaining.length / CONCURRENCY);

    const results = await processBatch(batch, batchNum, totalBatches);
    allResults.push(...results);

    // Progress
    const done = Math.min(i + CONCURRENCY, remaining.length);
    const rate = (allResults.length / ((Date.now() - startTime) / 1000)).toFixed(1);
    console.log(`  Progress: ${startIdx + done}/${allPrompts.length} (${allResults.length} solved, ${rate}/sec)`);

    // Save checkpoint every 500
    if (allResults.length % 500 < CONCURRENCY) {
      const checkpoint = `data/solved_teeps_checkpoint_${allResults.length}.json`;
      fs.writeFileSync(checkpoint, JSON.stringify(allResults, null, 2));
      console.log(`  💾 Checkpoint: ${checkpoint}`);
    }

    // Small delay to stay under rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  // 3. Save final results
  const outPath = "data/solved_10k_teeps.json";
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2));
  console.log(`\n✅ Saved ${allResults.length} solved TEEPs to ${outPath}`);

  // 4. Inject into D1
  console.log("\nInjecting into D1...");
  const injected = await injectToD1(allResults);
  console.log(`✅ D1 injection complete: ${injected} TEEPs, ${allResults.length} basins`);

  // Stats
  const domains = {};
  for (const r of allResults) {
    domains[r.domain] = (domains[r.domain] || 0) + 1;
  }
  console.log("\nDomain breakdown:");
  for (const [d, c] of Object.entries(domains).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${d}: ${c}`);
  }
}

const startTime = Date.now();
main().then(() => {
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\nTotal time: ${elapsed} minutes`);
}).catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
