#!/bin/bash
# 安全发送 JSX 到 AE。用法: ./run_jsx.sh <script.jsx> [超时秒数] [AE应用名]
#
# 解决三类常见故障（2026-07-30 实测全部踩过）：
#   1. 语法/保留字错误 → AE 弹模态框阻塞界面   解法: 发送前 preflight 预检
#   2. 脚本跑太久 → AppleEvent 超时，但脚本仍在 AE 里跑，
#      此时再发任何脚本都会撞 "a second script while another was running" 弹窗
#      解法: 本地锁文件，发送前检查，超时不清锁
#   3. 忘记设超时 → 默认 2 分钟就放弃    解法: 显式 with timeout
#
# 铁律：单个 JSX 的运行时间应控制在 30 秒内。更长的活拆成多批（见 SKILL.md）。
set -uo pipefail
JSX="${1:?用法: ./run_jsx.sh <script.jsx> [超时秒] [AE应用名]}"
TMO="${2:-120}"
APP="${3:-Adobe After Effects 2026}"
DIR="$(cd "$(dirname "$0")" && pwd)"
LOCK="$DIR/.ae_running.lock"

# ── 1. 预检：语法 + ES3 保留字 ───────────────────────────────
python3 "$DIR/preflight.py" "$JSX" || exit 1

# ── 2. 锁检查：上一个脚本是否还在 AE 里跑 ────────────────────
if [ -f "$LOCK" ]; then
  AGE=$(( $(date +%s) - $(stat -f %m "$LOCK" 2>/dev/null || echo 0) ))
  echo "✗ 上一个脚本可能仍在 AE 中运行（锁已存在 ${AGE} 秒）"
  echo "  上一个脚本: $(cat "$LOCK" 2>/dev/null)"
  echo "  处理方式二选一："
  echo "    a) 在 AE 窗口按 Esc 中止脚本，然后 rm '$LOCK'"
  echo "    b) 确认它已跑完的话直接 rm '$LOCK'"
  echo "  （现在不发送，避免触发 AE 的第二脚本弹窗）"
  exit 2
fi

# ── 3. 发送 ─────────────────────────────────────────────────
echo "$(basename "$JSX") @ $(date '+%H:%M:%S')" > "$LOCK"
set +e
osascript -e "set jsxPath to \"$JSX\"
set jsxCode to read POSIX file jsxPath as «class utf8»
with timeout of $TMO seconds
	tell application \"$APP\"
		DoScript jsxCode
	end tell
end timeout" >/dev/null 2>"$DIR/.last_osascript_err"
RC=$?
set -e

if [ $RC -ne 0 ]; then
  if grep -q "timed out" "$DIR/.last_osascript_err" 2>/dev/null; then
    echo "⚠ AppleEvent 在 ${TMO}s 后超时，但脚本很可能仍在 AE 里运行。"
    echo "  锁文件保留，下次发送会被拦住。等它跑完或按 Esc 中止后删除："
    echo "    rm '$LOCK'"
    exit 3
  fi
  echo "✗ osascript 失败:"; cat "$DIR/.last_osascript_err"
  rm -f "$LOCK"
  exit 1
fi

rm -f "$LOCK"
echo "✓ 执行完成"
