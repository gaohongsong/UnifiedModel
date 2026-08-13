#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_ADDR="${API_ADDR:-${UMODEL_API_ADDR:-:8080}}"
API_URL="${API_URL:-${UMODEL_API_URL:-http://localhost:8080}}"
WEB_PORT="${WEB_PORT:-${UMODEL_WEB_PORT:-5173}}"
PID_DIR="${PID_DIR:-${ROOT_DIR}/.run}"
FORCE="${FORCE:-0}"
DRY_RUN="${DRY_RUN:-0}"
STOP_MODE="${STOP_MODE:-all}"

case "${PID_DIR}" in
  /*) ;;
  *) PID_DIR="${ROOT_DIR}/${PID_DIR}" ;;
esac

port_from_endpoint() {
  local endpoint="${1:-}"
  endpoint="${endpoint#http://}"
  endpoint="${endpoint#https://}"
  endpoint="${endpoint%%/*}"

  if [[ "${endpoint}" =~ :([0-9]+)$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  if [[ "${endpoint}" =~ ^[0-9]+$ ]]; then
    echo "${endpoint}"
    return
  fi
}

pid_cwd() {
  local pid="$1"
  lsof -a -p "${pid}" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1
}

is_in_repo() {
  local cwd="$1"
  [[ "${cwd}" == "${ROOT_DIR}" || "${cwd}" == "${ROOT_DIR}/"* ]]
}

matches_expected_process() {
  local kind="$1"
  local cmd="$2"
  local cwd="$3"

  if [[ "${FORCE}" == "1" ]]; then
    return 0
  fi

  case "${kind}" in
    api)
      [[ -z "${cmd}" ]] && is_in_repo "${cwd}" && return 0
      [[ "${cmd}" == *"umodel-server"* ]] && is_in_repo "${cwd}"
      ;;
    dev-api)
      [[ -z "${cmd}" ]] && is_in_repo "${cwd}" && return 0
      [[ "${cmd}" == *"umodel-server"* && "${cmd}" != *"--ui-dir"* ]] && is_in_repo "${cwd}"
      ;;
    web)
      [[ -z "${cmd}" ]] && is_in_repo "${cwd}" && return 0
      [[ "${cmd}" == *"vite"* || "${cmd}" == *"node"* ]] && is_in_repo "${cwd}"
      ;;
    deploy)
      [[ -z "${cmd}" ]] && is_in_repo "${cwd}" && return 0
      [[ "${cmd}" == *"umodel-server"* && "${cmd}" == *"--ui-dir"* ]] && is_in_repo "${cwd}"
      ;;
    *)
      return 1
      ;;
  esac
}

stop_pid_file() {
  local label="$1"
  local pid_file="$2"

  if [[ ! -f "${pid_file}" ]]; then
    echo "No ${label} pid file at ${pid_file}."
    return
  fi

  local pid
  pid="$(cat "${pid_file}" 2>/dev/null || true)"
  if [[ -z "${pid}" ]]; then
    echo "Skipping ${label}; pid file is empty."
    return
  fi

  if ! kill -0 "${pid}" >/dev/null 2>&1; then
    echo "${label} pid ${pid} is not running."
    if [[ "${DRY_RUN}" != "1" ]]; then
      rm -f "${pid_file}"
    fi
    return
  fi

  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "Would stop ${label} pid ${pid} from ${pid_file}."
  else
    echo "Stopping ${label} pid ${pid} from ${pid_file}."
    kill "${pid}" >/dev/null 2>&1 || true
    rm -f "${pid_file}"
  fi
}

ensure_port_pid_stopped() {
  local kind="$1"
  local port="$2"
  local pid="$3"

  for _ in {1..20}; do
    if ! lsof -nP -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null | grep -qx "${pid}"; then
      return
    fi
    sleep 0.1
  done

  if [[ "${DRY_RUN}" == "1" ]]; then
    return
  fi

  echo "Force stopping ${kind} pid ${pid} on port ${port}."
  kill -KILL "${pid}" >/dev/null 2>&1 || true
}

stop_port() {
  local kind="$1"
  local port="$2"

  if [[ -z "${port}" ]]; then
    echo "Skipping ${kind}; no port was resolved."
    return
  fi

  local pids
  pids="$(lsof -nP -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null | sort -u || true)"
  if [[ -z "${pids}" ]]; then
    echo "No ${kind} process is listening on port ${port}."
    return
  fi

  local pid cmd cwd
  while IFS= read -r pid; do
    [[ -z "${pid}" ]] && continue
    cmd="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
    cwd="$(pid_cwd "${pid}")"

    if matches_expected_process "${kind}" "${cmd}" "${cwd}"; then
      if [[ "${DRY_RUN}" == "1" ]]; then
        echo "Would stop ${kind} pid ${pid} on port ${port}: ${cmd}"
      else
        echo "Stopping ${kind} pid ${pid} on port ${port}: ${cmd}"
        kill "${pid}" >/dev/null 2>&1 || true
        ensure_port_pid_stopped "${kind}" "${port}" "${pid}"
      fi
    else
      echo "Skipping pid ${pid} on port ${port}; it does not look like this repo's ${kind} process."
      echo "  cwd: ${cwd:-unknown}"
      echo "  cmd: ${cmd:-unknown}"
      echo "  Use FORCE=1 make stop-all to stop listeners on the configured ports anyway."
    fi
  done <<< "${pids}"
}

API_PORT="${API_PORT:-$(port_from_endpoint "${API_ADDR}")}"
if [[ -z "${API_PORT}" ]]; then
  API_PORT="$(port_from_endpoint "${API_URL}")"
fi

case "${STOP_MODE}" in
  dev)
    stop_pid_file "dev api" "${PID_DIR}/openumodel-dev-api.pid"
    stop_pid_file "dev web" "${PID_DIR}/openumodel-dev-web.pid"
    stop_port dev-api "${API_PORT}"
    stop_port web "${WEB_PORT}"
    ;;
  deploy)
    stop_pid_file "deploy" "${PID_DIR}/openumodel-deploy.pid"
    stop_port deploy "${API_PORT}"
    ;;
  all)
    stop_pid_file "dev api" "${PID_DIR}/openumodel-dev-api.pid"
    stop_pid_file "dev web" "${PID_DIR}/openumodel-dev-web.pid"
    stop_pid_file "deploy" "${PID_DIR}/openumodel-deploy.pid"
    stop_port api "${API_PORT}"
    stop_port web "${WEB_PORT}"
    ;;
  *)
    echo "Unknown STOP_MODE=${STOP_MODE}; expected dev, deploy, or all." >&2
    exit 1
    ;;
esac

if [[ "${DRY_RUN}" != "1" ]]; then
  case "${STOP_MODE}" in
    dev)
      rm -f "${PID_DIR}/openumodel-dev-api.pid" "${PID_DIR}/openumodel-dev-web.pid"
      ;;
    deploy)
      rm -f "${PID_DIR}/openumodel-deploy.pid"
      ;;
    all)
      rm -f \
        "${PID_DIR}/openumodel-dev-api.pid" \
        "${PID_DIR}/openumodel-dev-web.pid" \
        "${PID_DIR}/openumodel-deploy.pid"
      ;;
  esac
fi
