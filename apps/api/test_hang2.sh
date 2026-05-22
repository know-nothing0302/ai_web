#!/bin/bash
API_DIR="/opt/idapps/ai_web/apps/api"
LOG_FILE="/opt/idapps/ai_web/api.log"
NODE_EXEC="node"
SERVICE_RUN_USER="ubuntu"
CURRENT_USER="ubuntu"
PORT="3000"
NODE_ENV="production"

run_as_service_user() {
    local command="$1"
    env -i HOME="/home/$SERVICE_RUN_USER" PATH="$PATH" PORT="$PORT" NODE_ENV="$NODE_ENV" bash -c "$command"
}

start_cmd="cd '$API_DIR' && nohup setsid $NODE_EXEC dist/server.js >> '$LOG_FILE' 2>&1 < /dev/null & echo \$!"
launcher_pid=$(run_as_service_user "$start_cmd")
echo "PID: $launcher_pid"
