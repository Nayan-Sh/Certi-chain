# gunicorn.conf.py — Production config for CertiChain AI Service
# Run: gunicorn -c gunicorn.conf.py app:app

import os

# Server socket
bind = os.getenv("AI_SERVICE_BIND", "0.0.0.0:5001")
backlog = 2048

# Worker processes
workers = int(os.getenv("AI_SERVICE_WORKERS", "2"))
worker_class = "sync"
worker_connections = 1000
timeout = 120
keepalive = 5

# Restart workers after this many requests (prevents memory leaks)
max_requests = 1000
max_requests_jitter = 50

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = "certichain-ai-service"

# Daemon mode (set to False for systemd/process managers)
daemon = False

# Preload app for memory efficiency
preload_app = True

# Worker recycling
graceful_timeout = 30

# Security
limit_request_fields = 100
limit_request_field_size = 8190
limit_request_line = 4094

# SSL (uncomment if using HTTPS directly)
# keyfile = "/path/to/key.pem"
# certfile = "/path/to/cert.pem"