#!/bin/bash

# AI_WEB 服务管理脚本
# 位置: /opt/idapps/ai_web/ai_web_service.sh
# 使用方法: ./ai_web_service.sh {start|stop|restart|status}

SERVICE_NAME="ai_web_api"
PROJECT_DIR="/opt/idapps/ai_web"
API_DIR="$PROJECT_DIR/apps/api"
LOG_FILE="$PROJECT_DIR/api.log"
LOG_ARCHIVE_DIR="$PROJECT_DIR/logs"
PID_FILE="$PROJECT_DIR/ai_web.pid"
LOCK_FILE="$PROJECT_DIR/ai_web_service.lock"
NODE_EXEC="node"
NPM_EXEC="npm"
SERVICE_RUN_USER="${SERVICE_RUN_USER:-ubuntu}"
CURRENT_USER="$(id -un)"

# 加载环境变量
ENV_FILE="$API_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi
export PORT=${PORT:-3000}
export NODE_ENV=${NODE_ENV:-production}

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error_tail() {
    if [ -f "$LOG_FILE" ]; then
        log "${YELLOW}最近 20 行日志如下:${NC}"
        tail -n 20 "$LOG_FILE"
    else
        log "${YELLOW}日志文件不存在: $LOG_FILE${NC}"
    fi
}

acquire_lock() {
    exec 200>"$LOCK_FILE"
    flock -n 200 || { log "${RED}已有服务管理脚本在运行，请稍后再试${NC}"; exit 1; }
}

release_lock() {
    flock -u 200 2>/dev/null || true
    exec 200>&- 2>/dev/null || true
}

run_as_service_user() {
    local command="$1"
    
    if [ "$CURRENT_USER" = "$SERVICE_RUN_USER" ]; then
        env -i HOME="/home/$SERVICE_RUN_USER" PATH="$PATH" PORT="$PORT" NODE_ENV="$NODE_ENV" bash -c "$command"
        return $?
    fi

    if [ "$EUID" -eq 0 ]; then
        if command -v runuser > /dev/null 2>&1; then
            runuser -u "$SERVICE_RUN_USER" -- env -i HOME="/home/$SERVICE_RUN_USER" PATH="$PATH" PORT="$PORT" NODE_ENV="$NODE_ENV" bash -c "$command"
            return $?
        fi
        if command -v sudo > /dev/null 2>&1; then
            sudo -u "$SERVICE_RUN_USER" -H env -i HOME="/home/$SERVICE_RUN_USER" PATH="$PATH" PORT="$PORT" NODE_ENV="$NODE_ENV" bash -c "$command"
            return $?
        fi
        log "${RED}未找到 runuser 或 sudo，无法切换到 $SERVICE_RUN_USER。${NC}"
        return 1
    fi

    log "${RED}当前用户 $CURRENT_USER 无法切换到 $SERVICE_RUN_USER，请直接使用 $SERVICE_RUN_USER 或 root 用户执行。${NC}"
    return 1
}

ensure_service_user() {
    if ! id "$SERVICE_RUN_USER" > /dev/null 2>&1; then
        log "${RED}运行用户不存在: $SERVICE_RUN_USER${NC}"
        return 1
    fi
    return 0
}

ensure_runtime_file() {
    local file_path="$1"

    if [ -e "$file_path" ] && [ ! -w "$file_path" ]; then
        rm -f "$file_path" 2>/dev/null || true
    fi

    if [ ! -e "$file_path" ]; then
        : > "$file_path"
    fi

    if [ "$EUID" -eq 0 ]; then
        chown "$SERVICE_RUN_USER:$SERVICE_RUN_USER" "$file_path" 2>/dev/null || true
    fi
}

rotate_log_file() {
    if [ ! -f "$LOG_FILE" ] || [ ! -s "$LOG_FILE" ]; then
        return 0
    fi

    mkdir -p "$LOG_ARCHIVE_DIR"
    local archive_file="$LOG_ARCHIVE_DIR/api_$(date '+%Y%m%d_%H%M%S').log"
    mv "$LOG_FILE" "$archive_file"

    if [ "$EUID" -eq 0 ]; then
        chown "$SERVICE_RUN_USER:$SERVICE_RUN_USER" "$archive_file" 2>/dev/null || true
        chown "$SERVICE_RUN_USER:$SERVICE_RUN_USER" "$LOG_ARCHIVE_DIR" 2>/dev/null || true
    fi

    log "${BLUE}已归档旧日志: $archive_file${NC}"
}

rotate_log_if_large() {
    local max_size=$((100 * 1024 * 1024))  # 100MB
    if [ -f "$LOG_FILE" ] && [ $(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0) -gt $max_size ]; then
        rotate_log_file
    fi
}

write_pid_file() {
    local pid="$1"
    rm -f "$PID_FILE" 2>/dev/null || true
    printf "%s\n" "$pid" > "$PID_FILE"
    if [ "$EUID" -eq 0 ]; then
        chown "$SERVICE_RUN_USER:$SERVICE_RUN_USER" "$PID_FILE" 2>/dev/null || true
    fi
}

find_service_pid() {
    pgrep -f "node dist/server.js" | head -1
}

find_service_user() {
    local pid="$1"
    ps -o user= -p "$pid" 2>/dev/null | awk '{print $1}'
}

# 检查服务是否正在运行
is_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$PID_FILE" 2>/dev/null || true
        fi
    fi

    local detected_pid=$(find_service_pid)
    if [ -n "$detected_pid" ] && ps -p "$detected_pid" > /dev/null 2>&1; then
        write_pid_file "$detected_pid"
        log "${YELLOW}检测到运行中的服务进程，已补写 PID 文件: $PID_FILE，PID: $detected_pid${NC}"
        return 0
    fi

    return 1
}

# 确保 dist/ 中包含非 TypeScript 构建产物（PSD、Python 脚本等）
ensure_dist_assets() {
    local dist_dir="$API_DIR/dist"
    local src_image="$API_DIR/image"
    local src_scripts="$API_DIR/src/scripts"

    # 复制 image/（PSD 模板、字体文件）
    if [ -d "$src_image" ] && [ ! -d "$dist_dir/image" ]; then
        cp -r "$src_image" "$dist_dir/image"
        log "${BLUE}已复制 image/ 到 dist/${NC}"
    fi

    # 复制 Python 脚本
    if [ -f "$src_scripts/gen_birthday_card.py" ] && [ ! -f "$dist_dir/scripts/gen_birthday_card.py" ]; then
        cp "$src_scripts/gen_birthday_card.py" "$dist_dir/scripts/"
        log "${BLUE}已复制 gen_birthday_card.py 到 dist/scripts/${NC}"
    fi
}

need_rebuild() {
    [ ! -f "$API_DIR/dist/server.js" ] && return 0
    local latest_src=$(find "$API_DIR/src" -type f -exec stat -c %Y {} + 2>/dev/null | sort -nr | head -1)
    local dist_time=$(stat -c %Y "$API_DIR/dist/server.js" 2>/dev/null || echo 0)
    [ -z "$latest_src" ] && return 1
    [ "$latest_src" -gt "$dist_time" ]
}

# 启动服务
start_service() {
    acquire_lock
    ensure_service_user || return 1

    if is_running; then
        local running_pid=$(cat "$PID_FILE")
        local running_user=$(find_service_user "$running_pid")
        log "${YELLOW}$SERVICE_NAME 服务已经在运行中 (PID: $running_pid, USER: ${running_user:-unknown})${NC}"
        if [ -n "$running_user" ] && [ "$running_user" != "$SERVICE_RUN_USER" ]; then
            log "${YELLOW}当前进程不是由 $SERVICE_RUN_USER 运行，如需切换，请先停止后再启动。${NC}"
        fi
        return 0
    fi

    log "${BLUE}正在启动 $SERVICE_NAME 服务...${NC}"

    # 端口检查
    if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
        log "${RED}端口 $PORT 已被占用，无法启动${NC}"
        return 1
    fi

    rotate_log_if_large
    ensure_runtime_file "$LOG_FILE"

    # 检查依赖
    if [ ! -d "$API_DIR/node_modules" ] || [ "$API_DIR/package.json" -nt "$API_DIR/node_modules" ]; then
        log "${YELLOW}正在安装依赖包（含构建期依赖）...${NC}"
        run_as_service_user "cd '$API_DIR' && '$NPM_EXEC' install --include=dev"
        if [ $? -ne 0 ]; then
            log "${RED}依赖安装失败${NC}"
            return 1
        fi
    fi

    # 检查是否需要构建
    if need_rebuild; then
        log "${YELLOW}检测到源码更新或产物缺失，开始构建项目...${NC}"
        run_as_service_user "cd '$API_DIR' && '$NPM_EXEC' run build"
        if [ $? -ne 0 ]; then
            log "${RED}构建失败${NC}"
            return 1
        fi
    else
        log "${BLUE}构建产物 dist/server.js 已是最新，跳过构建步骤${NC}"
    fi

    # 确保非 TS 构建产物存在（PSD、Python 脚本等，rsync --delete 可能已清除）
    ensure_dist_assets

    if [ ! -f "$API_DIR/dist/server.js" ]; then
        log "${RED}构建完成后仍未找到 dist/server.js${NC}"
        return 1
    fi

    # 启动服务
    log "${BLUE}启动服务进程，运行用户: $SERVICE_RUN_USER，工作目录: $API_DIR，启动命令: $NODE_EXEC dist/server.js${NC}"

    # 释放脚本锁，避免后台子进程继承锁文件描述符后阻塞 stop/restart。
    release_lock

    local launcher_pid=""
    local launch_exit=0
    if [ "$CURRENT_USER" = "$SERVICE_RUN_USER" ]; then
        (
            cd "$API_DIR" || exit 1
            exec env -i \
                HOME="/home/$SERVICE_RUN_USER" \
                PATH="$PATH" \
                PORT="$PORT" \
                NODE_ENV="$NODE_ENV" \
                setsid -f "$NODE_EXEC" dist/server.js >> "$LOG_FILE" 2>&1 < /dev/null
        )
        launch_exit=$?
    else
        run_as_service_user "cd '$API_DIR' && exec env -i HOME='/home/$SERVICE_RUN_USER' PATH='$PATH' PORT='$PORT' NODE_ENV='$NODE_ENV' setsid -f '$NODE_EXEC' dist/server.js >> '$LOG_FILE' 2>&1 < /dev/null"
        launch_exit=$?
    fi

    if [ $launch_exit -ne 0 ]; then
        log "${RED}启动命令提交失败${NC}"
        return 1
    fi
    log "${BLUE}启动命令已提交，等待服务进程就绪${NC}"

    local waited=0
    local pid=""
    while [ $waited -lt 5 ] && [ -z "$pid" ]; do
        sleep 1
        pid=$(find_service_pid)
        waited=$((waited + 1))
    done

    if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
        write_pid_file "$pid"
        local running_user=$(find_service_user "$pid")
        log "${BLUE}已写入 PID 文件: $PID_FILE，PID: $pid${NC}"
        log "${GREEN}$SERVICE_NAME 服务启动成功! (PID: $pid, USER: ${running_user:-unknown})${NC}"
        log "${BLUE}监听端口: $PORT${NC}"
        log "${BLUE}日志文件: $LOG_FILE${NC}"
        return 0
    else
        log "${RED}$SERVICE_NAME 服务启动失败${NC}"
        log_error_tail
        rm -f "$PID_FILE"
        return 1
    fi
}

# 强制清理所有服务进程：PID 文件 + pgrep 全量 + 端口占用（三重兜底）
kill_all_service_procs() {
    local signal="${1:-TERM}"
    local killed=0

    # 1) PID 文件
    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
            kill "-$signal" "$pid" 2>/dev/null && killed=1
        fi
    fi

    # 2) pgrep 全量（不用 head -1，确保多进程全杀）
    local pids
    pids=$(pgrep -f "node dist/server.js" 2>/dev/null)
    for pid in $pids; do
        kill "-$signal" "$pid" 2>/dev/null && killed=1
    done

    # 3) 端口占用兜底（fuser 优先，ss 退化）
    if command -v fuser > /dev/null 2>&1; then
        fuser -k "-$signal" "${PORT}/tcp" 2>/dev/null && killed=1
    else
        local port_pid
        port_pid=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
        if [ -n "$port_pid" ] && ps -p "$port_pid" > /dev/null 2>&1; then
            kill "-$signal" "$port_pid" 2>/dev/null && killed=1
        fi
    fi

    return $killed
}

# 等待所有服务进程退出（超时返回 1）
wait_service_gone() {
    local timeout="${1:-12}"
    local waited=0
    while [ $waited -lt $timeout ]; do
        local remaining
        remaining=$(pgrep -f "node dist/server.js" 2>/dev/null)
        [ -z "$remaining" ] && return 0
        sleep 1
        waited=$((waited + 1))
    done
    return 1
}

# 停止服务（三重清理：SIGTERM → 等待 → SIGKILL 兜底）
stop_service() {
    acquire_lock

    # 先做一次兜底清理（僵尸进程可能逃逸 is_running 检测）
    kill_all_service_procs TERM 2>/dev/null || true
    sleep 1
    kill_all_service_procs KILL 2>/dev/null || true
    rm -f "$PID_FILE" 2>/dev/null || true

    if ! is_running; then
        log "${YELLOW}$SERVICE_NAME 服务未运行${NC}"
        release_lock
        return 0
    fi

    log "${BLUE}正在停止 $SERVICE_NAME 服务...${NC}"

    # 1) SIGTERM 优雅停止所有相关进程
    kill_all_service_procs TERM
    if wait_service_gone 10; then
        rm -f "$PID_FILE" 2>/dev/null || true
        log "${GREEN}服务已成功停止${NC}"
        release_lock
        return 0
    fi

    # 2) SIGKILL 强制兜底
    log "${YELLOW}优雅停止超时，强制停止所有残留进程...${NC}"
    kill_all_service_procs KILL
    sleep 2

    if wait_service_gone 5; then
        rm -f "$PID_FILE" 2>/dev/null || true
        log "${GREEN}服务已强制停止${NC}"
        release_lock
        return 0
    fi

    log "${RED}无法停止服务——仍有残留进程，请手动检查${NC}"
    pgrep -af "node dist/server.js" 2>/dev/null || true
    ss -tlnp 2>/dev/null | grep ":${PORT} " || true
    return 1
}

# 前台启动（供 systemd Type=simple 使用）
# 执行与 start_service 相同的前置检查，但用 exec node 替代 setsid -f，
# 让 systemd 直接管理 node 进程生命周期（cgroup 级别强杀）。
start_fg_service() {
    acquire_lock
    ensure_service_user || { release_lock; return 1; }

    if is_running; then
        log "${RED}$SERVICE_NAME 服务已经在运行中${NC}"
        release_lock
        return 1
    fi

    log "${BLUE}正在启动 $SERVICE_NAME 服务（前台模式，由 systemd 管理）...${NC}"

    # 端口检查
    if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
        log "${RED}端口 $PORT 已被占用，无法启动${NC}"
        release_lock
        return 1
    fi

    rotate_log_if_large
    ensure_runtime_file "$LOG_FILE"

    # 依赖
    if [ ! -d "$API_DIR/node_modules" ] || [ "$API_DIR/package.json" -nt "$API_DIR/node_modules" ]; then
        log "${YELLOW}正在安装依赖包（含构建期依赖）...${NC}"
        run_as_service_user "cd '$API_DIR' && '$NPM_EXEC' install --include=dev" || { release_lock; return 1; }
    fi

    # 构建
    if need_rebuild; then
        log "${YELLOW}检测到源码更新或产物缺失，开始构建项目...${NC}"
        run_as_service_user "cd '$API_DIR' && '$NPM_EXEC' run build" || { release_lock; return 1; }
    else
        log "${BLUE}构建产物 dist/server.js 已是最新，跳过构建步骤${NC}"
    fi

    ensure_dist_assets

    if [ ! -f "$API_DIR/dist/server.js" ]; then
        log "${RED}构建完成后仍未找到 dist/server.js${NC}"
        release_lock
        return 1
    fi

    log "${BLUE}启动服务进程（前台），运行用户: $SERVICE_RUN_USER，工作目录: $API_DIR${NC}"

    # 释放脚本锁后 exec（锁不能由 node 进程继承，否则阻塞 stop）
    release_lock

    cd "$API_DIR" || exit 1
    exec env -i \
        HOME="/home/$SERVICE_RUN_USER" \
        PATH="$PATH" \
        PORT="$PORT" \
        NODE_ENV="$NODE_ENV" \
        "$NODE_EXEC" dist/server.js >> "$LOG_FILE" 2>&1
}

# 重启服务
restart_service() {
    log "${BLUE}重启 $SERVICE_NAME 服务...${NC}"
    stop_service
    if [ $? -eq 0 ]; then
        sleep 2
        start_service
        return $?
    else
        return 1
    fi
}

# 查看服务状态
status_service() {
    if is_running; then
        local pid=$(cat "$PID_FILE")
        local process_user=$(find_service_user "$pid")
        log "${GREEN}$SERVICE_NAME 服务正在运行 (PID: $pid, USER: ${process_user:-unknown})${NC}"
        echo "配置运行用户: $SERVICE_RUN_USER"
        echo "监听端口: $PORT"
        echo "运行时长: $(ps -p "$pid" -o etime= | xargs)"

        # 显示进程信息
        echo "进程信息:"
        ps -p "$pid" -o pid,ppid,user,group,%cpu,%mem,cmd

        # 显示日志文件大小
        if [ -f "$LOG_FILE" ]; then
            echo "日志文件大小: $(du -h "$LOG_FILE" | cut -f1)"
        fi
        
        return 0
    else
        log "${RED}$SERVICE_NAME 服务未运行${NC}"
        return 1
    fi
}

case "$1" in
    start)
        start_service
        ;;
    start-fg)
        start_fg_service
        ;;
    stop)
        stop_service
        ;;
    restart)
        restart_service
        ;;
    status)
        status_service
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|start-fg}"
        exit 1
esac
